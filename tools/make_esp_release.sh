#!/usr/bin/env bash
# Builds the ESP32 LED board's firmware for the in-app updater:
#   dist/glow-esp32-<version>.bin
# The sketch lives in the Arduino project (default below, or set GLOW_ESP_SKETCH). Needs arduino-cli
# (the one bundled with the Arduino IDE is found on Windows) and the esp32:esp32 core.
# Then publish it: bash tools/make_esp_release.sh --publish   (creates release esp-v<version>)
set -euo pipefail
cd "$(dirname "$0")/.."

sketch="${GLOW_ESP_SKETCH:-/f/too many gigabytes/Projects/ESP32 Glow/main}"
cli="${ARDUINO_CLI:-$(command -v arduino-cli || echo '/c/Program Files/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe')}"
version=$(sed -n 's/^#define FW_VERSION *"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/p' "$sketch/main.ino")
[ -n "$version" ] || { echo "FW_VERSION not found in $sketch/main.ino" >&2; exit 1; }

out=$(mktemp -d)
"$cli" compile --fqbn esp32:esp32:esp32 --output-dir "$out" "$sketch"
mkdir -p dist
bin="dist/glow-esp32-$version.bin"
cp "$out/main.ino.bin" "$bin"   # the app image; not the merged or bootloader files
echo "Built $bin ($(du -h "$bin" | cut -f1))"

if [ "${1:-}" = "--publish" ]; then
    gh release create "esp-v$version" "$bin" --title "ESP32 firmware $version" \
        --notes "Firmware for the ESP32 LED board. Glow offers it in the board's Firmware dialog."
    # versions.json is what Glow reads to find updates (no GitHub API rate limit): point it at this release
    python - "$version" <<'PY'
import json, sys
p = "versions.json"
d = json.load(open(p))
d["esp"] = sys.argv[1]
open(p, "w").write(json.dumps(d, indent=2) + "\n")
PY
    git add versions.json
    git commit -q -m "versions.json: ESP32 firmware $version" && git push -q origin HEAD:main
else
    echo "Next: gh release create esp-v$version $bin   (or run this script with --publish)"
fi
