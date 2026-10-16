# ESP32 LED board: firmware updates over Wi-Fi

LEDs: two WS2812B pixels chained on GPIO4 (data out of the first into the second), full colour; set with
`-DLED_PIN=.. -DLED_COUNT=..`.

The ESP32 board (sketch: `Projects/ESP32 Glow/main`) updates itself over the same Wi-Fi link Glow
controls it with, from this repo's GitHub Releases, like the Bluetooth board (`FIRMWARE_UPDATES.md`).

## Publishing a firmware release

1. Bump `FW_VERSION` in the sketch and upload it over USB once (or use the updater).
2. `bash tools/make_esp_release.sh --publish` builds `dist/glow-esp32-<version>.bin` (the Arduino
   build's app image) and creates release `esp-v<version>` with it attached.

Glow looks for the newest `glow-esp32-<x.y.z>.bin` in releases tagged `esp-v…`; app (`app-v`),
desktop and Bluetooth firmware (`fw-v`) releases live side by side.

## Updating a board

Connect to the board, then **Firmware** under the LED preview (a dot shows when there is a newer
one; it is also checked when you connect). **Update** downloads the image, sends it, and the board
restarts into it; Glow reconnects by itself and confirms the new version. Keep Glow open.
An interrupted update changes nothing: the running firmware stays until a whole, valid image has
arrived (the board drops a transfer that stalls for 15 s). The board needs firmware 1.2.0 or
newer once over USB to have the updater.

## How it works

| Step | App → board | Board → app |
|---|---|---|
| Version | `info\` | `INFO,<id>,<name>,<version>,<state>,<ssid>,<ip>\` |
| Start | `ota=<size>\` | `OTA,READY\` (or `ERR,OTA,<why>\`) |
| Data | the image, raw, on the same connection | |
| Finish | | `OTA,DONE\`, then the board restarts |

## Board settings

The board keeps the app's per-board settings (name, fade time, separate LEDs, candle and rainbow
options) as one JSON object in its EEPROM: `settings\` answers `SETTINGS,{...}\`, and
`settings={...}\` stores a new one (`OK,settings\`). Glow reads them when it connects and writes
changes back. Reset device clears them with the Wi-Fi.

## Internet access (cloud MQTT)

Firmware 1.4.0 can be reached from anywhere through an MQTT broker, with no account and no payment:
**Settings > Internet access** picks a free public broker (`broker.emqx.io` or `broker.hivemq.com`), or
your own. Glow makes a random key and gives it, with the broker, to each board when it reaches it on
its own Wi-Fi; a Glow without it takes the board's. Glow tries the local network first (instant at
home) and falls back to the broker.

Everything through the broker is end-to-end encrypted, so a public broker only sees noise. Messages are
AES-128-GCM sealed (`iv(12) | ciphertext | tag(16)`) under the key; the topics (`g/<base>/c` commands,
`/o` replies, `/s` presence) derive from SHA-256(key | board id). A command's plaintext starts with the
sender's clock (8 bytes, ms): the board (NTP time) refuses any more than a minute off, and any iv it saw
lately, so recorded messages can't be replayed. Wi-Fi changes, Reset and firmware updates only work on the
local network (`ERR,local only` through the broker). `cloud\` reads and `cloud={...}\` writes the settings
(`{"host","port","wsPort","tls","user","pass","key"}`; `{}` turns it off), local only. A public broker has no
uptime promise; Glow's own-broker option takes any MQTT 3.1.1 broker with TLS and WebSocket.
