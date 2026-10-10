#!/usr/bin/env bash
# Builds the signed release APK and names it for the in-app updater:
#   dist/wififan-app-<version>.apk
# Needs keystore.properties in the project root (see docs/APP_UPDATES.md).
# Usually the GitHub Actions workflow does this; this is the by-hand fallback.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(sed -n 's/^val appVersion = "\(.*\)"\r\?$/\1/p' app/build.gradle.kts)
if [ -z "$version" ]; then
    echo "Couldn't read appVersion from app/build.gradle.kts" >&2
    exit 1
fi
if [ ! -f keystore.properties ] && [ -z "${WIFIFAN_KEYSTORE_FILE:-}" ]; then
    echo "keystore.properties is missing, so the APK can't be signed (see docs/APP_UPDATES.md)" >&2
    exit 1
fi

# Gradle needs a JDK; fall back to the one bundled with Android Studio on Windows.
studio_jbr="/c/Program Files/Android/Android Studio/jbr"
if [ -z "${JAVA_HOME:-}" ] && [ -d "$studio_jbr" ]; then
    export JAVA_HOME="$studio_jbr"
fi

apk=app/build/outputs/apk/release/app-release.apk
rm -f "$apk"
bash ./gradlew --console=plain assembleRelease
if [ ! -f "$apk" ]; then
    echo "No signed APK was built; check keystore.properties" >&2
    exit 1
fi

mkdir -p dist
out="dist/wififan-app-$version.apk"
cp "$apk" "$out"

# Show who signed it: must be the same key as every earlier release.
sdk="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' local.properties 2>/dev/null | sed 's/\\:/:/; s/\\\\/\//g; s/\r$//')}"
apksigner=$(ls "$sdk"/build-tools/*/apksigner "$sdk"/build-tools/*/apksigner.bat 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$apksigner" ]; then
    "$apksigner" verify --print-certs "$out" 2>/dev/null | grep -E "certificate (DN|SHA-256)" || true
fi

echo
echo "Built $out ($(du -h "$out" | cut -f1))"
echo "Next: on GitHub, Releases -> Draft a new release, tag app-v$version, attach $out, publish."
