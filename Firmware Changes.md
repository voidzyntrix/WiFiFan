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





