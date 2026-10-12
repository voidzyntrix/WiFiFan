# WiFiFan LED board - serial protocol (firmware 1.6.1)

Transport: USART1 8N1 (via the Bluetooth module). Baud rate is auto-detected
(9600 / 19200 / 38400 / 57600 / 115200); the LEDs flash blue when the board
switches rate, and the first command after a switch may be lost.

- Every command is plain text ending with `\` (also accepted: CR, LF, or a
  50 ms pause). Max 63 characters. Case-insensitive; spaces around numbers are allowed.
- Only `ver` and `ota` reply. Replies end with `\`.
- A command that is not understood gives a short white flash on both LEDs.
- The board has two chained WS2812s: LED1 (first on the data line) and LED2.

## Version gating

| Send   | Reply           |
|--------|-----------------|
| `ver\` | `VER,1.6.1\`    |

Everything in "New in 1.6.0" below needs `VER` >= 1.6.0. Older firmware does
not know those commands (it answers them with a white flash or a wrong colour),
so the app must only send them after reading a version >= 1.6.0.
The 4th `candle` parameter (S, candle style) needs `VER` >= 1.6.1; 1.6.0
ignores it (it reads `candle=V/M/H/S` as `candle=V/M/H`, i.e. two candles).

## Linked vs Separate (`split`)

| Send        | Mode |
|-------------|------|
| `split=0\`  | **Linked** (default after every power-up/reset). Both LEDs always show the same thing. Old apps that know nothing about two LEDs therefore light both. |
| `split=1\`  | **Separate**. Effects use their two-LED variants (table below). |

`split` is not saved; the board always boots Linked. Changing it while an
effect runs restarts that effect so it fades smoothly into the new layout; a
running rainbow keeps cycling and LED2 glides to its new hue. Switching to
Linked while showing solid colours fades LED2 to LED1's colour.

All the "classic" commands (colours, `off`, `rain`, `candle`, effects,
picker messages) drive **both** LEDs, in either mode.

| Mode / command            | Linked (`split=0`)            | Separate (`split=1`) |
|---------------------------|-------------------------------|----------------------|
| `h=`, `l=`, `off`, picker | both LEDs fade to the colour  | same                 |
| `rain...`                 | both LEDs, same hue           | LED2 is 180 deg further round the wheel |
| `candle...`               | both LEDs flicker identically | S=0 (default, 1.6.1): **one flame** over both LEDs, LED1 = core, LED2 = tip (see below). S=1: two candles, each LED flickers on its own (own random state and breathing phase, same parameters; this was the only Separate behaviour in 1.6.0) |
| `breathe`                 | both breathe LED1's colour together | each LED breathes its own last colour; LED2 in opposite phase (one bright while the other is dim) |
| `ocean`                   | identical                     | LED2 runs 3.5 s behind LED1 (half a hue drift) |
| `aurora`                  | identical                     | LED2 runs 9 s behind LED1 (half a wave) |
| `party`                   | one random colour sequence    | each LED picks its own random colours; LED2 jumps halfway between LED1's jumps |
| `chase`                   | both pulse together 0 -> full -> 0 (2.4 s period) | the colour swings LED1 -> LED2 -> LED1, smooth crossfade, 1.2 s per swing |
| `h1=`, `h2=`, `l1=`, `l2=`, `hh=` | address the single LED (still work) | address the single LED |

## Commands

Ranges: H = hue in degrees 0-360, S/V = saturation/brightness 0-100 (%),
R/G/B = 0-255. Colour changes fade over the `fade=` time (HSV fade: the hue
goes the short way round the wheel).

### Colour (both LEDs)

| Command | Meaning | Example |
|---------|---------|---------|
| `h=H/S/V` | both LEDs to this HSV colour | `h=300/100/50\` |
| `l=R/G/B` | both LEDs to this RGB colour (ends on exactly this RGB) | `l=255/0/128\` |
| `off` | both LEDs off (any message containing `off`) | `off\` |
| picker formats | `#rrggbb`, `#aarrggbb`, `R,G,B[,BR]`, `r255g0b128`, one Android colour integer (`-65536`), or 3-4 raw bytes R,G,B[,BR] (BR <= 100: percent, else 0-255) | `#ff8000\` |

Any colour command ends rainbow / candle / effects.

### Per-LED colour (new in 1.6.0)

| Command | Meaning | Example |
|---------|---------|---------|
| `h1=H/S/V` | LED1 only, HSV | `h1=0/100/100\` |
| `h2=H/S/V` | LED2 only, HSV | `h2=240/100/60\` |
| `l1=R/G/B` | LED1 only, RGB | `l1=255/0/0\` |
| `l2=R/G/B` | LED2 only, RGB | `l2=0/0/255\` |
| `hh=H1/S1/V1/H2/S2/V2` | both LEDs, different colours, one command | `hh=0/100/100/240/100/60\` |

Rule: a per-LED command ends any running rainbow/candle/effect for the whole
board (the board goes to "solid"); the LED that was not addressed keeps the
colour it was showing at that moment. Each LED fades independently over the
`fade=` time. These commands work in Linked mode too (they address the single
LED), but the app is expected to send them only in Separate mode.

Streaming (music / visualizer / screen sync, 18-36 fps): send `hh=...` per
frame. Each command starts a new fade from the colour currently shown, so set a
short fade first, e.g. `fade=0\` (instant) or `fade=40\`. At 115200 baud a
full `hh=360/100/100/360/100/100\` (27 bytes) takes ~2.3 ms.

### Modes and effects (both LEDs; two-LED variants when Separate)

| Command | Meaning | Example |
|---------|---------|---------|
| `rain` | rainbow at full saturation, last brightness | `rain\` |
| `rain=S/V` | rainbow with S/V; while it runs only adjusts S/V | `rain=100/40\` |
| `rain=S/V/T` | ... taking T seconds (2-120) per trip round the wheel | `rain=100/40/20\` |
| `candle` | candle flame, last brightness, lively | `candle\` |
| `candle=V` | candle at brightness V | `candle=60\` |
| `candle=V/M` | M=1 smooth/slow, M=0 lively flicker | `candle=60/1\` |
| `candle=V/M/H` | ... flame hue H degrees (0-60, default 19) | `candle=60/0/25\` |
| `candle=V/M/H/S` (1.6.1) | ... S = Separate-mode style: 0 one flame (default), 1 two candles | `candle=60/1/19/0\` |
| `breathe[=V]` | the last colour slowly fades up and down (4 s) | `breathe=80\` |
| `ocean[=V]` | drifting blues and teals | `ocean\` |
| `party[=V]` | smooth jumps between random colours (1.5 s) | `party=100\` |
| `aurora[=V]` | slow green-violet waves | `aurora=70\` |
| `chase[=V]` (new) | the last colour bounces between the two LEDs (Linked: both pulse) | `chase=100\` |

All shorter `candle` forms use S=0 (one flame). Linked mode ignores S.

One flame (Separate, S=0): both LEDs share the breathing and the gusts
(random dips). LED1 is the core: ~5 deg yellower than H, slightly less
saturated, full brightness. LED2 is the tip: ~5 deg redder, more saturated,
~70 % brightness, its own small fast flicker, and it follows each gust 50 ms
(lively) / 80 ms (smooth) late. A slow random sway (+-0.25) moves light
between them (the core gets brighter as the tip dims, and back); gusts nudge
it. Smooth (M=1) keeps rare shallow gusts, a slower sway and a very gentle
tip flicker. The core/tip difference eases in over ~1 s after `candle=` or
`split=1`.

Without `=V` an effect uses the last brightness. Rainbow, candle, chase and the
other effects all replace each other. `breathe` and `chase` use the colour last
chosen with a colour command (`chase`: LED1's colour; `breathe` when Separate:
each LED's own).

### Settings and system

| Command | Meaning | Example |
|---------|---------|---------|
| `fade=MS` | colour fade time 0-5000 ms (default 1500; not saved) | `fade=300\` |
| `split=0` / `split=1` | Linked / Separate (see above; not saved) | `split=1\` |
| `ver` | reply `VER,<version>\` | `ver\` |
| `ota` | reply `OTA\`, then restart into the Bluetooth bootloader for a firmware update | `ota\` |

## Typical app sequences

- Connect: `ver\` -> `VER,1.6.1\` -> two-LED UI enabled (and the candle style).
- Two solid colours: `split=1\` then `hh=0/100/100/240/100/100\` (or `h1=` / `h2=`).
- One-flame candle: `split=1\` then `candle=60/1/19/0\` (two candles: `candle=60/1/19/1\`).
- Two-LED rainbow: `split=1\` then `rain=100/60/15\`.
- Back to one look on both: `split=0\` (or just keep sending classic commands).
- Music sync: `split=1\`, `fade=0\`, then `hh=...\` every 30-50 ms.
