# WiFiFan LED board - serial protocol (firmware 2.1.6)

Transport: USART1 8N1 (via the Bluetooth module). Baud rate is auto-detected
(9600 / 19200 / 38400 / 57600 / 115200); the LEDs flash blue when the board
switches rate, and the first command after a switch may be lost.

- Every command is plain text ending with `\` (also accepted: CR, LF, or a
  50 ms pause). Max 63 characters. Case-insensitive; spaces around numbers are allowed.
- Only `ver`, `leds` and `ota` reply. Replies end with `\`.
- A command that is not understood gives a short white flash.
- The board drives a **ring of 24 chained WS2812s** on PB3. Every pixel has its own
  colour and fade. The two-LED commands address the halves: **LED1 = pixels 0-11**,
  **LED2 = pixels 12-23**.

Full ring behaviour and how the app should use it: see [RING-MODES.md](RING-MODES.md).

## Version gating

| Send    | Reply                        |
|---------|------------------------------|
| `ver\`  | `VER,2.1.2\`                 |
| `leds\` | `LEDS,24,2\` (1.10.0+)       |

Older firmware does not know the newer commands and answers them with a white
flash, so the app must check `VER` first:

| Feature | Needs `VER` |
|---------|-------------|
| `h=`, `l=`, `off`, colour picker | any |
| `h1=`, `h2=`, `hh=`, `split=` | 1.6.0 |
| `candle=V/M/H/S` (S accepted) | 1.6.1 |
| `sleep=M` | 1.7.0 |
| `alert=C/S/M` | 1.8.0 |
| `leds\` | 1.10.0 |
| Per-pixel candle, breathe wave, wheel rainbow, `spin=` | 2.0.0 |
| `p=` and `pal=` (single pixels, whole palette) | **2.1.0** |

## Linked vs Separate (`split`)

| Send        | Mode |
|-------------|------|
| `split=0\`  | **Linked** (default after every power-up/reset). Every pixel shows the same. |
| `split=1\`  | **Separate**. Every pixel is individual (candle flames, breathing wave). |

`split` is not saved; the board always boots Linked.

## Commands

Ranges: H = hue in degrees 0-360, S/V = saturation/brightness 0-100 (%),
R/G/B = 0-255. Colour changes fade over the `fade=` time (HSV fade: the hue
goes the short way round the wheel).

### Colour

| Command | Meaning | Example |
|---------|---------|---------|
| `h=H/S/V` | whole ring to this HSV colour | `h=300/100/50\` |
| `l=R/G/B` | whole ring to this RGB colour (ends on exactly this RGB) | `l=255/0/128\` |
| `off` | ring off (any message containing `off`) | `off\` |
| picker formats | `#rrggbb`, `#aarrggbb`, `R,G,B[,BR]`, `r255g0b128`, one Android colour integer (`-65536`), or 3-4 raw bytes R,G,B[,BR] | `#ff8000\` |

Any colour command ends rainbow / candle / breathe / spin, except a brightness-only `h=` while spinning (2.1.2). `p=` and `pal=` are colour
commands too: they fade over `fade=` and are not saved. `pal=` may be up to ~300
characters: the board accepts messages up to 320 characters.

### Halves (the two LEDs)

| Command | Meaning | Example |
|---------|---------|---------|
| `p=I/H/S/V` (2.1.0) | one pixel I (0-23) to HSV; the others keep their colour | `p=7/30/95/80\` |
| `pal=H/S/V,H/S/V,...` (2.1.0) | pixel k = entry k, up to 24 entries; shorter lists leave the rest alone | `pal=270/100/100,0/0/0\` |
| `h1=H/S/V` | LED1 (pixels 0-11) only, HSV | `h1=0/100/100\` |
| `h2=H/S/V` | LED2 (pixels 12-23) only, HSV | `h2=240/100/60\` |
| `l1=R/G/B` | LED1 only, RGB | `l1=255/0/0\` |
| `l2=R/G/B` | LED2 only, RGB | `l2=0/0/255\` |
| `hh=H1/S1/V1/H2/S2/V2` | both halves, different colours, one command | `hh=0/100/100/240/100/60\` |

A half command ends any running effect; the other half keeps the colour it
was showing. Each pixel fades over the `fade=` time.

Streaming (music / visualizer / screen sync): send `hh=...` per frame, with
`fade=0\` or `fade=40\` set first. A full `hh=360/100/100/360/100/100\` takes
~2.3 ms at 115200 baud. Music's one-LED-per-beat mode (app setting) streams the
lit pixel and its fading trail as a few short `p=I/H/S/V\` lines per frame instead.

### Effects

| Command | Meaning | Example |
|---------|---------|---------|
| `rain` | wheel of colour round the ring, at full saturation, last brightness | `rain\` |
| `rain=S/V` | ... with S/V; while it runs only adjusts S/V | `rain=100/40\` |
| `rain=S/V/T` | ... taking T seconds (2-120) per turn of the wheel | `rain=100/40/20\` |
| `candle` | candle, last brightness | `candle\` |
| `candle=V` | candle at brightness V | `candle=60\` |
| `candle=V/M` | M=1 smooth/slow, M=0 lively | `candle=60/1\` |
| `candle=V/M/H` | ... flame hue H degrees (0-60, default 19) | `candle=60/0/25\` |
| `candle=V/M/H/S` | S accepted and ignored (every flame is individual) | `candle=60/1/19/0\` |
| `breathe[=V]` | the last colour slowly fades up and down (4 s) | `breathe=80\` |
| `spin=H/S/V/T` | **spinner**: a flat arc of 8 pixels chasing round the ring in this colour, one turn every T seconds (1-60) | `spin=200/100/100/2\` |
| `spin=H/S/V/T/F` (2.1.11) | ... with a falloff: F% of the ring's length fades out behind the arc in an even, every-step-dimmer fade, so its light looks like it blooms into the LEDs behind it (0-100, 0 = off; 2.1.15 measures F against the whole ring — through 2.1.14 it was % of the arc's length; 2.1.10 and older ignore F) | `spin=200/100/100/2/25\` |
| `spin=H/S/V/T/F/W` (2.1.12) | ... with W 1 the falloff also fades into the LEDs ahead of the head (W 0/1, default 0 = behind only; 2.1.11 and older ignore W) | `spin=200/100/100/2/25/1\` |
| `spin=H/S/V/T/F/W/L` (2.1.13) | ... with L the arc's length in pixels (1-12, default 8); a `spin=` sent while it turns keeps the head where it was and only re-learns the settings | `spin=200/100/100/2/25/1/8\` |
| `spin=H/S/V/T/F/W/L/P` (2.1.16) | ... with P the leak's strength (0-100, default 100): the whole ramp burns at that share of the arc's brightness, so 30 is a dim shadow leak and 100 starts right at the arc's own brightness | `spin=200/100/100/2/25/1/8/100\` |

`spin=` draws a flat arc in one colour, chasing round the ring; the arc's head
keeps a crisp edge, and with a falloff (F, the radius) the LEDs just behind the arc fade
from the colour to black instead of cutting off, with W 1 the LEDs just ahead of the head
do the same. The arc is 8 pixels unless L says otherwise, the falloff is a share of the
whole ring, and P sets how bright the leak burns along its whole reach.
A `spin=` sent while it turns updates any of the numbers without restarting the turn
(2.1.13); a brightness change (`h=` with the same hue and saturation, 2.1.2) keeps it
turning. Any other colour command, and every other command
(candle, breathe, rain, `p=`, `pal=`, halves), ends it, as before.

### Settings and system

| Command | Meaning | Example |
|---------|---------|---------|
| `fade=MS` | colour fade time 0-5000 ms (default 1500; not saved) | `fade=300\` |
| `split=0` / `split=1` | Linked / Separate (see above; not saved) | `split=1\` |
| `alert=C/S/M` | blink alert (1.8.0): C 1 red / 2 green, two short blinks every S seconds (5-3600) for M minutes (0 = no end), shown over the running mode. A repeat of the same C only refreshes it. The alert ends by itself when no byte arrives for 150 s; `alert=0` cancels (not saved) | `alert=1/60/0\` |
| `sleep=M` | sleep timer (1.7.0): whatever shows fades smoothly to off over M minutes (1-240); `sleep=0` cancels (not saved) | `sleep=30\` |
| `ver` | reply `VER,<version>\` | `ver\` |
| `leds` | reply `LEDS,<pixels>,<leds>\` (1.10.0+): `LEDS,24,2\` | `leds\` |
| `ota` | reply `OTA\`, then restart into the Bluetooth bootloader for a firmware update | `ota\` |

## Removed in 2.0.0

`ocean`, `party`, `aurora` and `chase` are gone. The app no longer sends them.
A message with these words now gets the white "not understood" flash.

## Typical app sequences

- Connect: `ver\` -> `VER,2.0.0\`, then `leds\` -> `LEDS,24,2\`.
- Two solid colours: `split=1\` then `hh=0/100/100/240/100/100\`.
- Individual candles: `split=1\` then `candle=60/1/19\`.
- Wheel rainbow: `rain=100/60/15\`.
- Loading spinner: `spin=200/100/100/2\`.
- Back to one look on the whole ring: `split=0\`.
