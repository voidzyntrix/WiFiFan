# ESP32 LED board: firmware updates over Wi-Fi

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
