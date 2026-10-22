# Ring modes (firmware 2.0.0)

The board drives a ring of **24 WS2812s**. Every pixel is individual. For
compatibility the app still thinks in two LEDs:

| Name | Pixels | Used by |
|------|--------|---------|
| LED1 | 0-11 | `h1=`, `l1=`, the first half of `hh=` |
| LED2 | 12-23 | `h2=`, `l2=`, the second half of `hh=` |
| whole ring | 0-23 | `h=`, `l=`, `off`, the picker, `rain`, `candle`, `breathe`, `spin` |

`split=0` (Linked) makes every pixel show the same. `split=1` (Separate) makes
every pixel individual.

## What each mode does now

| Mode | Command | Linked (`split=0`) | Separate (`split=1`) |
|------|---------|--------------------|----------------------|
| Solid | `h=`, `l=`, `off` | whole ring one colour | same |
| Two halves | `hh=`, `h1=`, `h2=` | LED1 colour on pixels 0-11, LED2 on 12-23 | same |
| Rainbow | `rain=S/V/T` | a wheel of colour round the ring, turning | same |
| Candle | `candle=V/M/H` | every pixel shares one flicker | every pixel is its own flame |
| Breathe | `breathe=V` | whole ring breathes together | a wave runs round the ring |
| Spinner | `spin=H/S/V/T` | a bright tail chases round the ring | same |

**Rainbow** always spreads the hues round the ring (each pixel 15 degrees further
on than the last). `split` makes no difference.

**Spinner** is the new loading indicator. A tail of 8 pixels, brightest at the
head, travels round the ring in the chosen colour, one turn every `T` seconds
(1-60). Any colour command stops it.

**Removed:** `ocean`, `party`, `aurora` and `chase`. The app must not send them.

**Candle style (`S`)** is accepted but ignored: every flame is individual now, so the
app's "one flame / two candles" choice no longer does anything.

## Command reference (the app's side)

| Want | Send |
|------|------|
| Whole ring, one colour | `h=H/S/V\` |
| Two colours, one per half | `hh=H1/S1/V1/H2/S2/V2\` (or `h1=`, `h2=` separately) |
| Individual pixels, Separate | `split=1\` |
| Wheel rainbow, S/V, seconds per turn | `rain=S/V/T\` (T 2-120) |
| Candle, brightness, smooth, hue | `candle=V/M/H\` (M 0 lively, 1 smooth) |
| Breathe | `breathe=V\` |
| Spinner, hue/sat/val, seconds per turn | `spin=H/S/V/T\` (T 1-60) |
| Fade time | `fade=MS\` |
| Decay time (streaming) | `decay=MS\` (2.1.17) |

Streaming (music, visualizer, screen sync) keeps using `hh=` per frame with
`fade=0\` or `fade=40\`. Music and Visualizer can also light one LED per beat
("one LED per beat" in the app): each beat lands on the next pixel. The board
runs the trail itself (2.1.17): the app sends `decay=MS\` once, then a single
`p=I/H/S/V\` per frame, and every pixel the beat left behind fades to black
by itself (staying black until the beat writes it again). Screen sync keeps
its two halves.

## Reading the ring from the app

- `ver\` returns `VER,2.0.0\`. Gate the new modes on it: **2.0.0** for the spinner,
  the per-pixel candle and breathe, and the wheel rainbow.
- `leds\` returns `LEDS,24,2\` (1.10.0+). Use it for the layout: 24 dots, LED1 =
  first 12 dots, LED2 = last 12 dots.
- Boards older than 2.0.0 still work with the commands they know. They don't have
  the spinner, so hide that mode for them.

## App work this needs

- Add **Spinner** to the mode list, with hue, saturation, brightness and seconds-per-turn
  controls. It sends `spin=H/S/V/T\`.
- Drop **Ocean, Party, Aurora and Chase** from the effects list. Scenes that used them
  already fall back to Solid (`keepMode`), so they stay safe.
- Hide the **candle style** toggle. Every flame is individual now.
- Draw the 24-dot ring in the LED preview, with LED1 and LED2 as halves, instead of
  two circles.
- Keep `hh=` for the halves, and `h=` for the whole ring.

## Power

24 pixels at full white can draw more than 1 A. Check the supply before running
the ring at full brightness, and consider a brightness cap in the app.
