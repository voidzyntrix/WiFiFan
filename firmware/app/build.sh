#!/usr/bin/env bash
# Build the app firmware without MounRiver and make wififan-fw-<ver>.bin.
#
#   bash build.sh [out dir]          (default: build/)
#
# CROSS  toolchain prefix. Default: WCH's riscv-none-embed- (MounRiver) if
#        found, else riscv-none-elf- (xPack, used by CI).
# With a non-WCH GCC, -march=rv32imac_zicsr replaces WCH's rv32imacxw and
# the WCH-only "WCH-Interrupt-fast" attribute is compiled as "machine"
# (only NMI/HardFault use it; the app runs with no interrupts).
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-build}"
WCH_TC="/c/MounRiver/MounRiver_Studio2/resources/app/resources/win32/components/WCH/Toolchain/RISC-V Embedded GCC/bin"
if [ -z "${CROSS:-}" ]; then
  if [ -x "$WCH_TC/riscv-none-embed-gcc.exe" ]; then CROSS="$WCH_TC/riscv-none-embed-"
  else CROSS="riscv-none-elf-"; fi
fi
CC="${CROSS}gcc"
case "$CROSS" in
  *riscv-none-embed-) ARCH="-march=rv32imacxw"; WCH=1 ;;
  *)                  ARCH="-march=rv32imac_zicsr"; WCH=0 ;;
esac
ARCH="$ARCH -mabi=ilp32 -msmall-data-limit=8 -msave-restore"
CFLAGS="$ARCH -Os -fmessage-length=0 -fsigned-char -ffunction-sections -fdata-sections -fno-common -Wunused -Wuninitialized -g -std=gnu99"
INC=(-IDebug -ICore -IUser -IPeripheral/inc)

rm -rf "$OUT"; mkdir -p "$OUT/src"
objs=()
for f in User/*.c Core/*.c Debug/*.c Peripheral/src/*.c; do
  src="$f"
  if [ $WCH = 0 ] && grep -q 'WCH-Interrupt-fast' "$f"; then
    src="$OUT/src/$(basename "$f")"
    sed 's/"WCH-Interrupt-fast"/"machine"/g' "$f" > "$src"
  fi
  extra=""
  case "$f" in User/main.c) extra="-Wall -Wextra -Wno-unused-parameter -Werror" ;; esac
  o="$OUT/$(basename "${f%.c}").o"
  "$CC" $CFLAGS $extra -I"$(dirname "$f")" "${INC[@]}" -c -o "$o" "$src"
  objs+=("$o")
done
"$CC" $ARCH -g -x assembler-with-cpp -IStartup -c -o "$OUT/startup.o" Startup/startup_ch32v20x_D6.S
objs+=("$OUT/startup.o")
"$CC" $ARCH -T Ld/Link.ld -nostartfiles -Wl,--gc-sections -Wl,-Map,"$OUT/app.map" \
  --specs=nano.specs --specs=nosys.specs -o "$OUT/app.elf" "${objs[@]}"
"${CROSS}size" "$OUT/app.elf"

VER=$(sed -n 's/^#define FW_VERSION *"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/p' User/main.c)
[ -n "$VER" ] || { echo "FW_VERSION not found" >&2; exit 1; }
BIN="$OUT/wififan-fw-$VER.bin"
"${CROSS}objcopy" -O binary "$OUT/app.elf" "$BIN"
# Same check as tools/make_fw_release.sh: vector table word 1 = link base.
PY=python3; "$PY" -c "" 2>/dev/null || PY=python
"$PY" - "$BIN" <<'PYEOF'
import struct, sys, zlib
path = sys.argv[1]
data = open(path, "rb").read()
base = struct.unpack("<I", data[4:8])[0]
if base != 0x2000:
    sys.exit(f"{path}: linked at 0x{base:x}, expected 0x2000 - check Ld/Link.ld")
if len(data) > 56 * 1024:
    sys.exit(f"{path}: {len(data)} bytes, more than the 56 KB app slot")
print(f"{path}: {len(data)} bytes, crc32 {zlib.crc32(data):08x}, linked at 0x2000 - OK")
PYEOF
echo "$BIN"
