# WiFiFan firmware (CH32V203C8U6)

- `app/` - main firmware (USART commands, two chained WS2812 LEDs on PB3). Version: `FW_VERSION` in `app/User/main.c`.
  Command reference: [PROTOCOL.md](PROTOCOL.md).
- `bootloader/` - Bluetooth OTA bootloader. Do not change its behaviour casually: installed boards depend on it.

Both are MounRiver Studio projects: open the folder (`.project`/`.wvproj`) in MounRiver and build.

## Memory layout

| Flash range       | Contents                    |
|-------------------|-----------------------------|
| 0x0000 - 0x1FFF   | bootloader (8 KB)           |
| 0x2000 - ...      | app (max 56 KB, `app/Ld/Link.ld`) |

Never use "Erase All" when flashing the app - it wipes the bootloader.

## Building without MounRiver

    bash app/build.sh [outdir]

Uses MounRiver's WCH GCC if installed, otherwise `riscv-none-elf-gcc` (xPack) from PATH;
override with `CROSS=<prefix>`. It produces `outdir/wififan-fw-<ver>.bin` and checks
that it is linked at 0x2000 and fits the slot. `app/tools/make_fw_release.sh` does the
same from a MounRiver build.

## Releases

1. Bump `FW_VERSION` in `app/User/main.c`, merge to `main`.
2. Push tag `fw-v<ver>` (e.g. `fw-v1.5.0`).
3. `.github/workflows/fw-release.yml` builds the app, checks the version matches the tag,
   and attaches `wififan-fw-<ver>.bin` to the GitHub release. The WiFiFan app finds the
   update there by that exact asset name.
