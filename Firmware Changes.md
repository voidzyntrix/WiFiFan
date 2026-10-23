# Firmware changes the app now leans on

The app (Glow for Android / Windows 2.13.56 and up) already speaks the ring: it drives the
24-pixel layout, sends `spin=H/S/V/T`, uses `rain=S/V/T` and knows `LEDS,<pixels>,<leds>`.
Everything here is in the firmware folder's own protocol docs (`firmware/PROTOCOL.md`,
`firmware/RING-MODES.md`, `firmware/LED-COUNT.md`) **except one thing**: individual pixel
colours. That needs two new commands, described below so the next firmware release can add
them. The app enables them as soon as it sees **firmware 2.1.0 or newer** (`VER,2.1.0\` or
higher) — on 2.0.0 boards it falls back to the two halves and never sends `p=`/`pal=`.

## New commands (the only gap)

| Command | What it does | Example |
|---------|--------------|---------|
| `p=I/H/S/V\` | Set ring pixel `I` (0-based, the order the `LEDS` reply reports) to hue 0–359, saturation and value 0–100 | `p=7/30/95/80\` |
| `pal=H/S/V,H/S/V,…\` | Set the whole ring in one go: entry 0 = pixel 0, entry 1 = pixel 1, … exactly `<pixels>` entries | `pal=270/100/100,270/100/100,0/0/0,…\` |

Both follow the house rules (see `firmware/PROTOCOL.md`):

- They are **colour commands**: they end any running rainbow / candle / breathe / spinner,
  they obey the current `fade=` time, and they are not saved (a reboot returns the saved state's colours).
- The comma-separated `pal=` list must match the pixel count from `LEDS,<pixels>,<leds>`;
  shorter lists leave the remaining pixels untouched so `pal=` can stay cheap during animations.
- Replies are not needed; unrecognized commands currently cause a short white flash per the
  protocol doc — that is the reason the app gates both commands on firmware 2.1.0.

With these, the Colour tab's Individual mode can paint a single tapped dot while the other dots
keep theirs (`p=`), and brightness / layout changes repaint the whole ring in one write (`pal=`).

## What the app does meanwhile (2.0.0 boards)

- The preview and the colour tab always work per pixel: the app keeps a 24-entry palette and a
  tapped dot is the only one its edit touches.
- The board itself can't hold 24 colours until 2.1.0, so the app mirrors each edit into the half
  the chosen pixel sits in (pixels 0–11 → LED1 = `h1=`-style, pixels 12–23 → LED2) and keeps
  sending the ordinary two-LED commands (`hh=` and friends). The ring therefore renders the
  chosen pixel's colour across its half until the per-pixel firmware is flashed — the app never
  sends a command a board can't understand.
- Scenes, syncs and the rest of the two-LED command set work unchanged — `hh=` covers them
  (the halves are enough there; see `firmware/RING-MODES.md`).

## Firmware-side work, in one list

1. Add per-pixel colour memory (a palette of `<pixels>` entries from the `LEDS` reply).
2. Parse `p=` and `pal=` like the other colour commands (HSV → the pixel, fade applied,
   ends effects, not saved).
3. Version the firmware that ships them **2.1.0** (or later) so the app's `VER` check turns
   per-pixel sending on. If a different version number ends up shipping them, update this file
   and the `perPixel` gate in `web/src/devices/glow/modes.ts` / `capsOf` (`scenes.ts`) together.

Everything else the app now uses is already live in firmware 2.0.0 / 1.10.0: the spinner,
the wheel rainbow's `T`, per-pixel candle and breathe wave, the `candle=` style parameter being
ignored, and the `leds` reply that tells the app how many pixels and LEDs it drives.


## 2.1.7 - serial bytes are queued by an interrupt (the "not understood" white flash while animating)

What 2.1.6 (and older) did: the main loop polled USART1 for one byte per pass, and writing one
LED frame kept that loop silent for about 700 us on every 10 ms tick whenever an animation or a
fade was rendering (breathe, candle, spinner, rainbow - and every colour command fades in over
1.5 s first, so even plain mode changes render frames). Bytes arriving in those windows were
silently lost: the overrun flag was cleared by the read and never counted. A line arrived with
holes, so the board white-flashed "not understood" (seen most leaving candle for solid), or
worse, parsed a mangled cousin of the command and ended in a different mode than the one asked.

What 2.1.7 changes: `USART1_IRQHandler` copies every received byte into a 128-byte ring buffer
and the main loop drains it - same line assembler, same commands, same parser. The framing
flags (FE/NE/ORE) are counted in the IRQ, so the auto-baud detection still sees them and works
unchanged. `FW_VERSION` bumps to 2.1.7; the app needs no change and keeps its `spinLive` /
`spinBri` / per-pixel caps as they are.

## 2.1.8 - WS2812 high pulses go out with interrupts masked (stray LEDs flashing during sync)

What 2.1.7 left behind: with receive now interrupt-driven, a UART byte arriving while a LED
frame was bit-banged let `USART1_IRQHandler` preempt `ws_send_byte` mid-bit. The interrupt
stretched the bit's high pulse, and a WS2812 reads pulse width: a stretched ~0.3 us "0" crossed
the "1" threshold, so one colour channel of one pixel took the wrong bit. One frame has 24 bits
per pixel x 24 pixels, and the sync modes (screen / music / visualizer) re-render a frame every
10 ms while streaming colour commands - so now and then a single LED flashed a stray colour for
one refresh. Solid modes rarely had bytes arriving, which is why it showed up mostly in syncs.

What 2.1.8 changes: each bit's high pulse is emitted with interrupts globally masked
(`__disable_irq()` before `WS_HIGH()`, `__enable_irq()` right after `WS_LOW()`). The deferring
interrupt then runs inside that bit's low half, where a stretch is harmless - the latch
threshold is ~50 us of continuous low, far above a 1.5 us gapped bit. Pulse width stays exact
and phase doesn't matter; the extra interrupt latency is one high pulse (max ~0.7 us) against
the 87 us byte time, so the 2.1.7 RX queue still loses no byte and auto-baud keeps working.
The high-pulse mask adds ~10 cycles per bit (~80 us per ~0.75 ms frame), swallowed by the 10 ms
frame cadence. `FW_VERSION` bumps to 2.1.8; the app needs no change.

## 2.1.9 - LED frames are generated in hardware (the interrupt-stretch game is over)

What 2.1.8 left behind: masking the high pulse moved the UART interrupt into the bit's low half,
where it stretched that bit's PERIOD (the ISR cannot finish inside the remaining ~0.5-0.95 us).
A WS2812B decodes by high-pulse width and shrugs at 2.5 us periods, but clones that decode by
duty cycle do not: a "1" bit is ~56 % duty at the nominal 1.25 us period, ~32 % once the period
stretches to ~2.2 us - which reads as a "0", i.e. that byte's value drops and the pixel DIMS.
Streaming modes hit this too: with bytes arriving almost continuously, nearly every frame had
the ISR land in some bit's low. So the why-it-shows-in-sync story repeated itself, only as
random brightness dips on individual LEDs instead of stray colour flashes.

What 2.1.9 changes: the LED waveform is generated in hardware - `WS_USE_DMA` is switched from 0
to 1 (a complete driver that had been in the source, inactive, all along). TIM2 runs PWM on the
remapped PB3 output and its update event paces DMA1 channel 2, which loads each bit's compare
value (T0H/T1H or the latch gap's low) exactly one period ahead - the same dummy-first-slot
accounting as before. PWM reload happens in hardware; no interrupt can stretch any pulse, ever,
so both the 2.1.7 colour flips and the 2.1.8 brightness dips are structurally gone. The USART
RX interrupt now runs whenever it likes during a frame (it only fills the byte queue) and can
no longer lose a byte either - the serial path keeps every 2.1.x behaviour. `ws_write` still
blocks the main loop for the frame (~0.75 ms, unchanged) and the DMA inits per frame, which is
redone every call anyway at the 10 ms frame cadence. The polled driver stays in the source
(`WS_USE_DMA 0`) as the one-line fallback if this board shows a silicon quirk in the DMA path.
`FW_VERSION` bumps to 2.1.9; the app needs no change.

## 2.1.10 - the spinner is a comet, not a one-bit arc (every pixel's brightness glides)

What 2.1.9 (and every spinner before it) drew: `spin_frame` split the ring into two groups -
the 8 pixels inside the arc showed the colour at full brightness, everything else showed
nothing. The arc was placed at a sub-pixel position, but that only smoothed the two edge
crossings: seen from outside, each LED turned OFF to ON in one step as the head passed and ON
to OFF 8 pixels later - a one-bit state machine per LED, and the reason the spinner never
looked smooth.

What 2.1.10 changes: the arc is a comet. Each pixel's brightness is a continuous function of
its signed distance from the head: it ramps 0 to full over the pixel in FRONT of the head
(`SPIN_FP` sub-pixels), holds full exactly as the head passes, and fades evenly to zero over
the 7 pixels behind. Total comet length stays 8 pixels (1 + 7), as the docs describe. Since
the head moves in sub-pixel steps and the profile is continuous, every pixel's value glides
through the pass there and back - no LED ever steps between two levels, at any turn speed.
The trailing `fade = SPIN_TAIL * SPIN_FP - SPIN_FP` windows both edges so the whole 8 pixels
are a shape, not a rectangle.

Unchanged: the command (`spin=H/S/V/T`), the arc length, `spin_c` and the 2.1.2
brightness-only `h=` live recolour (the comet multiplies `spin_c.v` by the pixel's weight, so
a live brightness change scales the whole comet). The app's ring preview (`simulate.ts`,
MODE.SPIN) now renders the same comet profile, in pixel units. `FW_VERSION` bumps to 2.1.10;
no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.11 - back to the flat arc, with an adjustable falloff behind it (spin=H/S/V/T/F)

What 2.1.10 tried: making the arc itself a comet - brighten in over the pixel ahead, fade
evenly off over the 7 behind. Not the ask: the arc is meant to STAY the arc (crisp head,
every pixel inside on), and the smoothing belongs at the end of the light, not along the
whole strip.

What 2.1.11 does: `spin_frame` is reverted to the original flat arc (`d < arc` full, the rest
off, crisp head), and a falloff hangs behind it: the next `spin_falloff` sub-pixels fade
smoothly from the colour to black, so the arc's light reads as blooming and leaking into the
pixels behind instead of cutting off. The fade is quadratic - full brightness right at the
arc's end, easing slower and slower to black - which is how light leaks look. The length is a
new optional 5th number on `spin=H/S/V/T/F`: F as a PERCENT OF THE ARC'S LENGTH (0-100, so
25 = 2 pixels on the 8-pixel arc), 0 = the plain flat arc, which is also the default with the
plain 4-number form. `spin_parse` accepts both forms and the old constraint checks; F is
within parse range 360, so 2.1.10 and older hardware accept the 5-number form and ignore it,
exactly like the other extended forms (`candle=`'s style arg) before it.

The app drives it: the Spinner tab gains a Falloff slider (0-100%, default 25), sent as the
5th number on every `spin=` (turn-length and brightness changes re-send like before, the
preview and scenes carry it too). `FW_VERSION` bumps to 2.1.11; no version gate moves
(2.2.0 stays reserved for `imp=`).

## 2.1.12 - the falloff can bloom ahead of the head too (spin=H/S/V/T/F/W)

Follow-up on 2.1.11: the falloff was behind the arc only - the head's leading edge still cut
off hard. Now the same leak can mirror across the head: `spin_frame` grows a third zone for
the `spin_falloff_front` case, where the LEDs just ahead of the head are the mirror of the
ones behind it (a = span - d sub-pixels ahead, the same quadratic easing from full colour at
the head to black over spin_falloff). The zones cannot overlap - with falloff at its 100%-of-
arc maximum the three regions together span exactly half the ring (arc 8 px + 8 px behind +
8 px ahead on the 24-pixel ring), so at worst they meet.

The command grows a 6th, optional number: `spin=H/S/V/T/F/W`, W 0/1, 0 = behind only (the
2.1.11 default). `spin_parse` now tries 6, 5 and then 4 numbers; older hardware accepts the
numbers it does not know and ignores them (2.1.11 ignores W, 2.1.10 and older ignore F and
W), so the app can always send the full 6-number form.

The app gets the matching control: a Front + back switch on the Spinner tab (default on,
per the ask - the falloff should light both edges), sent as W on every `spin=`, re-sent live
while the spinner runs, carried by scenes, and the ring preview renders the mirrored leak.
`FW_VERSION` bumps to 2.1.12; no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.13 - the arc's length is a setting, and spin= stops restarting the turn

Two follow-ups to the falloff pair:

- The arc no longer has to be the fixed 8 pixels: `spin=` grows a 7th optional number,
  `spin=H/S/V/T/F/W/L`, with L the arc's length in pixels, 1-12 (half the 24-pixel ring;
  default 8). The falloff stays a % of the ARC's own length, so it scales with L. To keep
  the behind and ahead leaks from running into each other when the arc is long, the
  effective falloff is clamped at (ring - arc) / 2 when the arc is set - with a long arc the
  slider's % then leaks a little less far than it promises; at the default length nothing is
  clamped. At maximum arc the falloff drops to zero: a 12-pixel arc alone fills the half.
- The spinner used to restart from the head whenever the app re-sent `spin=` - every slider
  move (falloff, front + back, turn length) jumped the arc back to its start; brightness
  already lived through the `h=` path (2.1.2). Now `led_spin` captures the old phase before
  ending the modes and, when the spinner was already turning, rescales it to the new turn
  length (old position as a share of the turn, times the new period): the head keeps its
  place on the ring and only the speed changes. On a resting ring the first `spin=` still
  starts from the head, as before.

The app gains a Length slider (1-12 px, default 8) after the speed one on the Spinner tab,
sent as L on every `spin=`; falloff, front, length and speed changes all apply live
(2.1.13+ boards keep the position; older boards restart as they always did - they ignore
the numbers they do not know). `FW_VERSION` bumps to 2.1.13; no version gate moves
(2.2.0 stays reserved for `imp=`).

## 2.1.14 - the falloff fades evenly, so you can actually see it fade

The 2.1.11 falloff used a quadratic shape, (1 - x) squared from the arc's end to black:
"how light leaks". In practice the eye never saw it: the quadratic puts most of its drop in
the first pixel or two of the zone, and the board's output gamma then pushes those mid
values down toward black - a 2-pixel falloff rendered as full colour, then roughly one
half-lit pixel, then nothing. "Can't even tell if it's fading away or not."

Now the fade is even (linear): value = (1 - x) * colour. At the default 25% that is full,
about 3/4, about half strength, faint, off - every pixel in the leak's length is a clearly
visible step dimmer than the last, while the sub-pixel sampling keeps the edge sweeping
smooth as it turns. Both leaks (behind the arc and ahead of the head) share the same even
shape. No command change: `spin=H/S/V/T/F/W/L` stands, only the pixels' brightness along
the leak changed. The app's Falloff default moves 25 to 50 for a first impression worth
seeing ("% of the arc's length" is unchanged).

`FW_VERSION` bumps to 2.1.14; no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.15 - the falloff measures a share of the whole ring

"Still too subtle": F as a % of the ARC capped the leak at the arc's own length (8 px on
the default arc - only 25% strength's 2 px of fade before that cap ever mattered). Now F is
a % of the RING's length: 25% = about 6 LEDs of leak regardless of the arc, 50% = 12, and
the clip of the share against (ring - arc) / 2 stays, so with both leaks on and the arc at
8 pixels the whole ring can wash into the colour at 100% but nothing ever overlaps.
`led_spin` just multiplies by the span instead of the arc; the effective-falloff clamp is
untouched. No app protocol change - the app's slider means the same 0-100, its default goes
back to 25 (which now reaches further than 25 previously did).

`FW_VERSION` bumps to 2.1.15; no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.16 - the leak splits into radius and strength (spin=H/S/V/T/F/W/L/P)

The app's insight, and the right one: "how far the glow reaches" (radius) and "how brightly
it burns" (strength) are two different dials, and one number can't carry both. The command
grows an 8th optional number, P: the leak's brightness as a percent (0-100, default 100).
The shape stays the even 1-to-0 ramp of 2.1.14; P scales the whole ramp, so the pixel right
at the arc's edge now shows P% of the arc's brightness - 100 is the continuous full bleed
the earlier firmware drew (no boundary step), 30 a clear dim shadow of a leak, 0 the same
as no falloff at all. In the frame both leaks multiply by `spin_strength` (0-1024 fixed
point; the arc itself is untouched, since the leak's brightness belongs to the leak).

The app accordingly splits its Falloff slider into a Falloff radius (0-12 px, default 6,
sent as F = radius share of the 24-px ring - backward compatible with their stored 25%)
and a Falloff strength (0-100, default 100, sent as P). The wheel fix belongs to the app
release notes (scroll-on-slider is prevented natively now; the pixel-grained sliders step
their own unit per notch).

`FW_VERSION` bumps to 2.1.16; no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.17 - the board fades the per-LED music trail by itself (decay=MS)

The app's one-LED-per-beat Music walked the ring live, but the trail behind it was
the app's job: every frame it re-sent each still-lit pixel at its shrinking
brightness. When the Bluetooth link backed up (connection interval stretching,
a busy palette write in the way), those trail updates were the frames that got
dropped - so LEDs stuck on until a beat came back round to them. The moment the
kill was the decay living on the wrong side of the link.

So now the board owns it: `decay=MS` (0-5000, not saved) arms a per-pixel decay
envelope. While it is armed, every `p=` write restarts that pixel's countdown -
a pixel the beat is sitting on keeps getting re-armed, and everything it left
behind fades linearly to black over MS with no help from the phone. The output
side goes to black exactly (the settled RGB is scaled at write time, so a pixel
never flashes back), and once its time is out the pixel holds black until the
next write.

`decay=0` stops the discharge: pixels keep whatever colour they were showing
(the app uses this when Music stops, instead of leaving them under an envelope
while the normal mode writes arrive). Every other colour command - `h=`, `h1=/
h2=`, `l=`, `off`, the picker, `pal=` - touches pixels under `fade_led`, which
now clears each pixel's decay: a fresh colour is its own, no envelope over it.
And the four effects (`rain`, `candle=`, `breathe`, `spin=`) call a new
`decay_stop()` at entry, so none of them lay their colours over a pixel that is
still counting down. Nothing saved anywhere: a reboot boots with decay off.
The app sends one `p=` per frame in that mode now (a handful of characters
instead of the whole ring) and applies the same setting to Visualizer.

`FW_VERSION` bumps to 2.1.17; no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.18 - the decay ends in black (2.1.17's ran backwards)

The trail looked wrong: LEDs seemed to get brighter, not fade. The envelope itself
was right (each pixel's output drops toward black over decay_ms) - the ending was
not. When a pixel's countdown ran out, 2.1.17 cleared its decay mark and nothing
else: the pixel's stored colour stayed in place, and the output redraws never stop
during a stream (the beat's own LED is re-written every frame), so the next redraw
took the pixel off its stored colour again - a jump back to full brightness the
moment its fade reached black. In motion every pixel went bright, faded down,
snapped bright again and stayed lit until its beat came round: the ring looked
brighter everywhere the beat had been.

Now expiry blackens the pixel's own state: shown value 0, target RGB 0, no fade -
every later redraw shows black, as if nothing had ever written it. The next `p=`
write takes it the normal way (a quick fade in, which reads as the beat landing).
`decay=0` behaviour is unchanged; nothing else is touched. The app treats `decay=`
as a 2.1.18 word now (a 2.1.17 board keeps the app-streamed trail, which never had
the bug) and gained a Beat trail decay slider for Music and Visualizer.

`FW_VERSION` bumps to 2.1.18; no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.19 - the fade's math overflowed (the flicker was arithmetic, not timing)

2.1.18 still flickered, and looking again at the envelope with real numbers found
the culprit - not the app, not the beat detection, not the streaming: one line of
arithmetic. The fade steps each pixel down by k = left * 256 / decay_ms, where
left and decay_ms are counted in raw CPU ticks (72000 a millisecond). For a
700 ms decay that multiply is 12.9 billion - over three times what the 32-bit
value can hold - so it wrapped, and k came out small and jumping: for every
pixel the first ~470 ms of a 700 ms fade was a jumble of wrong brightnesses (the
just-hit dot started near-black), and only the last ~233 ms drew a proper fade -
the span below which left * 256 still fits. Every decay= release so far has
shown exactly this: flashes in brightness, flicker, no clean fade to black.

The multiply now runs in 64 bits, so k is exact from full brightness down to
black at any decay time (1-5000 ms). Nothing else moves: expiry stays blackened
(2.1.18), decay=0 holds, the effects still clear their pixels. With a correct
envelope the one-LED-per-beat trail finally runs as designed: the dot rises
with its beat, then walks linearly down to black. The app asks for 2.1.19
before it hands the trail to the board - an older one keeps the app-streamed
trail, which never had the arithmetic bug.

`FW_VERSION` bumps to 2.1.19; no version gate moves (2.2.0 stays reserved for `imp=`).

## 2.1.20 - the last blink: the expiring frame drew the dot at full once

With the arithmetic honest (2.1.19) the trail finally swept cleanly - and one
fixed flicker became visible: as a dot reached the very end of its trail it
blinked once at full brightness and then went to black. The cause was in the
countdown's expiry branch, and had been since 2.1.17: the branch blackens the
pixel's memory (shown, the settled colour, the countdown) but never touched the
frame being sent - `px` had been copied from the settled colour *before* the
branch ran, and the envelope only ever scaled `px`, so the expiry frame sent
the raw full-brightness colour. The next redraw only happens with the next
beat's write, so every dying dot read: near zero, one full-brightness frame,
zero. 2.1.17 let the bright frame stick (the bounce-back), 2.1.18 fixed the
memory but still drew the frame - only after the 64-bit fix was this the one
glitch left, and now it is gone: the expiry frame draws black too.

Also each pixel now carries the trail time it armed with (2.1.20). The
envelope used to divide by the *current* `decay=`, so dragging the trail
slider down mid-stream left running dots above the new duration - the scale
branch was skipped and they jumped to full. A countdown's length now belongs
to the write that started it; the slider only shapes future dots.

`FW_VERSION` bumps to 2.1.20; the app asks for 2.1.20 before it sends `decay=`
(a 2.1.19 board keeps its in-app streamed trail until it updates).

## 2.1.21 - a beat flashes the whole ring from one command (h=/l= re-arm decay=)

The audio modes' beat carried by a single pixel always told half the story: the
board could only start a countdown per `p=` write, so the app had to choose
between one LED per beat or a stream of whole-ring frames - and N one-pixel
writes per beat (24 commands, each awaiting its link) spread the flash over the
link's own pace: a sweep, not a hit.

Now a full-ring colour write arms the countdown on the pixels it covered, the
same way a `p=` arms the one it wrote: while `decay=` is armed, `h=` and `l=`
re-arm every pixel to fade to black over the decay time. The app's Music and
Visualizer modes send one `h=` per real beat - the whole ring takes the beat's
colour at the same moment, and the board fades the flash itself. `decay=0`
still holds pixels as before, and nothing changes for boards the app isn't
streaming beats to: without `decay=`, `h=`/`l=` behave exactly as before.

`FW_VERSION` bumps to 2.1.21; the app flashes the ring only on 2.1.21 - on
2.1.20 a beat still lands on its one pixel like any fast note.

## 2.1.22 - the one-command whole-ring flash is gone again

2.1.21 armed the decay countdown from `h=`/`l=` writes so the app's Music and
Visualizer modes could flash the entire ring with one command per beat. The
app moved away from that visual (a beat carries its LED again, like any fast
note), and the re-arm has no caller left: it is taken back out. `decay=` keeps
its 2.1.17 contract exactly, a `p=` write re-arms the one pixel it wrote, and
a full-ring `h=`/`l=` holds its colour as before. Boards that took 2.1.21
behave no differently from the app either way.

## 2.1.23 - the whole-ring beat flash is back, and this time it is a setting

2.1.21 had it, 2.1.22 took it out, and it goes back in with the same three
lines: an `h=`/`l=` write re-arms the decay countdown on every pixel it
covered, so the app's Music and Visualizer modes flash the entire ring with
one command per beat and let the board do the fading. The difference is on the
app's side: the whole-ring flash is no longer forced on every board that
streams per-LED beats - it is a switch (firmware 2.1.23 appears in the app as
its own capability). Turned off, a beat behaves exactly as in 2.1.22; turned
on, a real beat singles out the whole ring once, then the beats trail as
usual.

`FW_VERSION` bumps to 2.1.22.





