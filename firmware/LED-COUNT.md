# Reading the LED count from the board

Firmware **1.10.0** tells the app how many LEDs it has. The board has a ring of
24 WS2812s on the data line (PB3). The firmware shows them as two logical LEDs,
which is what the app's commands have always targeted:

- **LED1** = the first 12 pixels of the ring.
- **LED2** = the last 12 pixels.
- **Linked** (`split=0`, the default) lights the whole ring one colour.
- **Separate** (`split=1`) lights LED1 and LED2 with their own colours.

## The command

Send `leds\` over the same UART link as the other commands. The board replies:

```
LEDS,24,2\
```

- `LEDS,<pixels>,<leds>`
- `<pixels>` is the physical WS2812 count on the ring (24).
- `<leds>` is the number of logical LEDs the app drives (2). This is the number
  the app should use for its two-LED logic.

## Reading it in the app

1. After the board connects, read `ver\`. It replies `VER,<x.y.z>\`, as it does now.
2. If the version is **1.10.0 or newer**, send `leds\` and parse the reply.
   Store the result per board, keyed by the Bluetooth MAC address, next to the
   firmware version (the way `SettingsStore` keeps firmware versions).
3. Drive the existing two-LED model from `<leds>`. Use `<leds> >= 2` where the
   app currently checks "two LEDs" (`LedLink.twoLeds`). Keep the existing
   `fwAtLeast("1.6.0")` gate for `hh=`.
4. Use `<pixels> / <leds>` (12) only for display, such as drawing the ring or the
   LED preview. Don't use it to send colours: the board maps LED1 and LED2 onto
   the ring itself.

## Fallbacks

- **Firmware older than 1.10.0** doesn't answer `leds\`. Treat it as **2 LEDs**
  with no pixel count (the same behaviour the app has now). The same applies if
  the reply doesn't arrive within about 2 seconds, or doesn't parse.
- **Firmware 1.9.0** already drives the ring, but it can't report the count.
  Treat it like older firmware; the user needs 1.10.0 to see the count.
- Never block a command on this reply. The app can keep working while it waits.

## Testing

- Connect to a 1.10.0 board: the reply should be `LEDS,24,2`.
- Connect to a 1.9.0 board: no reply, and the app should act as before.
- Send `leds\` on a board with the old firmware: nothing comes back, so the
  fallback should kick in after the timeout.
