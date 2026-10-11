#!/usr/bin/env bash
# Make the firmware file for an over-the-air (Bluetooth) update.
#
#   1. bump FW_VERSION in User/main.c and build the project in MounRiver
#   2. run:  bash tools/make_fw_release.sh
#   3. on GitHub create a release (tag e.g. fw-v1.0.1) and attach the
#      printed wififan-fw-<version>.bin - the WiFiFan app finds it there.
#
# The image must be linked at 0x2000 (behind the OTA bootloader); the script
# refuses anything else, as the bootloader would.
set -euo pipefail

cd "$(dirname "$0")/.."
TC="/c/MounRiver/MounRiver_Studio2/resources/app/resources/win32/components/WCH/Toolchain/RISC-V Embedded GCC/bin"
ELF="${ELF:-obj/CH32V203C8U.elf}"

VER=$(sed -n 's/^#define FW_VERSION *"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/p' User/main.c)
[ -n "$VER" ] || { echo "FW_VERSION not found in User/main.c" >&2; exit 1; }
[ -f "$ELF" ] || { echo "$ELF missing - build the project in MounRiver first" >&2; exit 1; }
[ "$ELF" -nt User/main.c ] || { echo "$ELF is older than User/main.c - rebuild first" >&2; exit 1; }

OUT="wififan-fw-$VER.bin"
"$TC/riscv-none-embed-objcopy.exe" -O binary "$ELF" "$OUT"

python - "$OUT" <<'EOF' || { rm -f "$OUT"; exit 1; }
import struct, sys, zlib
path = sys.argv[1]
data = open(path, "rb").read()
base = struct.unpack("<I", data[4:8])[0]
if base != 0x2000:
    sys.exit(f"{path}: linked at 0x{base:x}, expected 0x2000 - check Ld/Link.ld")
if len(data) > 56 * 1024:
    sys.exit(f"{path}: {len(data)} bytes, more than the 56 KB app slot")
print(f"{path}: {len(data)} bytes, crc32 {zlib.crc32(data):08x}, linked at 0x2000 - OK")
EOF
