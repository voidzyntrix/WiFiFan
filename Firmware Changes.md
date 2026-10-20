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
