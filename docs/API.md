# Glow WebSocket API

Glow for Windows (desktop only) can be driven from scripts. It listens on
`ws://127.0.0.1:8765` (this computer only; the port is `apiPort` in the app's settings and the
whole API can be switched off in **Settings → API**).

There are no keys and no login. Two things keep it safe:

- it only listens on `127.0.0.1`;
- a connection that carries an `Origin` header is refused, so a web page in your browser can't
  drive the LED. Scripts, `websocat`, Node, Python and the like don't send one and connect fine.

Commands act on the board Glow is connected to, and they take priority over the app: a running
Music / Visualizer / Screen sync is stopped first.

## Messages

Each message is one JSON object with a `cmd`. Add an optional `"id"` and it comes back on the answer.
Answers are `{"ok":true}` or `{"ok":false,"error":"…"}`.

### Colours

Wherever a colour is wanted, give one of:

| Form | Example |
|------|---------|
| HSV (degrees, percent, percent; `s` and `v` default to 100) | `{"h":300,"s":100,"v":50}` |
| RGB (0-255) | `{"r":255,"g":128,"b":0}` |
| Hex | `{"hex":"#ff8000"}` or `{"color":"#ff8000"}` |

The fields can sit in the message itself or under `"color":{…}`.

### Commands

| `cmd` | Fields | What it does |
|-------|--------|--------------|
| `status` | | The state (see below). Every new client gets it at once. |
| `on` | | The ring back on in its last colour (full brightness if that was black). |
| `off` | | The ring off. |
| `color` | a colour | The whole ring. RGB is exact (`l=`), HSV uses `h=`. |
| `brightness` | `value` 0-100 | Keeps the colour, changes its brightness. |
| `led` | `index`, a colour | One pixel (0-23); the others keep theirs. Firmware 2.1.0+. |
| `leds` | `colors`: list of colours | Pixel 0, 1, 2…; a shorter list leaves the rest alone. Firmware 2.1.0+. |
| `half` | `half` 1 or 2, a colour | Pixels 0-11 (1) or 12-23 (2). Firmware 1.6.0+. |
| `pulse` | `ms` 0-5000, a colour, optional `index` | Lights a pixel (or, without `index`, the whole ring) and fades it to black by itself over `ms`, like Music's beats. Pixel: firmware 2.1.20+, whole ring: 2.1.23+. Any other colour command goes back to colours that hold. |
| `fade` | `ms` 0-5000 | The colour fade time. |
| `raw` | `line` | Any firmware command from `firmware/PROTOCOL.md` (without the trailing `\`). |

### Status

```json
{"event":"status","version":"2.14.0","connected":true,
 "device":{"id":"…","name":"Desk ring","firmware":"2.1.23","pixels":24},
 "color":{"h":300,"s":100,"v":50},"sync":"NONE","headless":false}
```

It is sent to all clients whenever the board connects or drops, or a sync starts or stops.
`color` is the last colour set through the API (`null` until then).

### Examples

```json
{"cmd":"color","hex":"#ff8000"}
{"cmd":"led","index":7,"h":120,"s":100,"v":80,"id":1}
{"cmd":"leds","colors":["#ff0000","#00ff00","#0000ff"]}
{"cmd":"pulse","index":7,"hex":"#ffffff","ms":700}
{"cmd":"off"}
```

```python
import asyncio, json, websockets
async def main():
    async with websockets.connect("ws://127.0.0.1:8765") as ws:
        await ws.send(json.dumps({"cmd": "color", "r": 255, "g": 0, "b": 128}))
        print(await ws.recv(), await ws.recv())   # the status, then the answer
asyncio.run(main())
```

## Headless mode

**Settings → API → Headless mode** hides the window and stops the app from drawing at all (nothing
of the UI is mounted: no canvas, no animations, no GPU use to speak of). Only the WebSocket server
and the board link keep running. Glow sits in the tray, reconnects to the last board by itself (and
again after a drop), and **Show Glow** in the tray menu (or starting Glow again) brings the window
back and leaves headless mode.

Connect the board once with the window before turning headless on; there is no screen to pick one.
