# Firmware updates over Bluetooth

The app can update the fan board's firmware (CH32V203C8U6) over the same
Bluetooth link it uses for control. New firmware is picked up from this repo's
GitHub Releases.

## Publishing a firmware release

1. In the firmware project, bump `FW_VERSION` in `User/main.c` (e.g. `"1.0.1"`) and
   build it in MounRiver Studio.
2. Run `bash tools/make_fw_release.sh` in the firmware project. It writes
   `wififan-fw-1.0.1.bin` and checks it is built for the bootloader layout.
3. On GitHub: **Releases → Draft a new release**, tag `fw-v1.0.1`, attach
   `wififan-fw-1.0.1.bin`, publish (not as a draft or pre-release).

The app looks at the newest `wififan-fw-<x.y.z>.bin` across all releases, so app
releases (APKs) and firmware releases can live side by side.

## Updating a board

App → **Settings → Firmware → Check for updates → Update to vX**. Keep the app
open; at 9600 baud the current ~6.5 KB firmware should take roughly 20-30 s
(estimate). The board's LED shows the state: blue while waiting in update mode,
blinking cyan/blue while receiving, green when done, red on an error.

If the update is interrupted once sending has started (app closed, out of range,
power lost), the old firmware is already invalidated, so the board stays in
update mode (blue LED). Connect and run the update again; it starts over and
finishes normally. Interrupted before that, the board returns to the old
firmware by itself after 2 minutes (or straight away after a power cycle).

**Safe mode:** if a new firmware boots but misbehaves, press the board's reset
button three times quickly. It stays in update mode, so the app can flash a
working version. With no update for 2 minutes it starts the existing firmware.

## One-time board setup (cable)

The board needs the OTA bootloader in its first 8 KB of flash; the firmware lives
behind it at `0x2000`.

1. Flash the `CH32V203C8U_Bootloader` project with the WCH-Link.
2. Flash the firmware project (its linker script already starts at `0x2000`).
   Its download setting must not erase the whole chip ("Erase All" off), or the
   bootloader is wiped.

## How it works

| Step | App → board | Board → app |
|---|---|---|
| Version | `ver\` | `VER,1.0.0\` |
| Enter update mode | `ota\` | `OTA\`, restart, then `BOOT,<bl ver>,<baud>,<max size>\` |
| Start | frame `START {size, crc32}` | `OK,START\` (old firmware invalidated) |
| Data | frame `DATA {seq, 256 bytes}` per block | `OK,<seq>\` |
| Finish | frame `END` | `DONE\`, restart into the new firmware |
| Confirm | `ver\` | `VER,<new version>\` |

Frames are `A5 5A | cmd | len (u16) | payload | crc32` (little-endian, CRC-32 as
`java.util.zip.CRC32` over cmd..payload). Garbled frames are answered with
`ERR,FRAME` and resent; a lost reply is retried. The bootloader writes the first
256 bytes of the image last, only after the CRC of the whole image matched, so a
half-written firmware never looks valid. Board side: `CH32V203C8U_Bootloader/User/main.c`;
app side: `ota/OtaManager.kt`.
