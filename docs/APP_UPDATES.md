# App updates from GitHub

The app can update itself from this repo's GitHub Releases, the same way it finds
board firmware. A release with an asset named `wififan-app-<x.y.z>.apk` is offered
in **Settings → App** when its version is newer than the installed one.

Android only installs an update if:

- it is signed with the **same key** as the installed app, and
- its `versionCode` is **higher**. The build sets it from `appVersion` in
  `app/build.gradle.kts` (1.2.3 → 10203), so bumping `appVersion` is enough.

## One-time setup

### 1. The signing key

The APKs committed under `app/release/` are signed with your own key
(`CN=Ayan Aftab`, made with Android Studio's *Generate Signed APK*). Keep using
that `.jks` file: Android Studio's *Build → Generate Signed App Bundle or APK*
dialog shows its path. If it's lost, make a new one in that same dialog. Phones
then need one uninstall and reinstall to switch keys.

**Back the `.jks` file and its passwords up somewhere safe.** If they're lost, no
phone can be updated again without uninstalling first.

### 2. Local builds: `keystore.properties`

Create `keystore.properties` in the project root. It is in `.gitignore`, never
commit it. Use forward slashes in the path:

```properties
storeFile=C:/Users/Ayan/keys/wififan.jks
storePassword=your-store-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

With it, `assembleRelease` (and Android Studio's release build) signs the APK
automatically. Without it, release builds come out unsigned.

### 3. GitHub Actions: repository secrets

On GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
Add four secrets:

| Secret | Value |
|---|---|
| `WIFIFAN_KEYSTORE_BASE64` | the `.jks` file as base64 (see below) |
| `WIFIFAN_KEYSTORE_PASSWORD` | store password |
| `WIFIFAN_KEY_ALIAS` | key alias |
| `WIFIFAN_KEY_PASSWORD` | key password |

To get the base64 text onto the clipboard, run this in PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\Ayan\keys\wififan.jks")) | Set-Clipboard
```

### 4. Existing phones

Phones running v1.0 have no updater yet. Install the first release with the
updater (v1.1.0) on them by hand once; from then on they update themselves.

## Publishing an app release

1. Bump `appVersion` in `app/build.gradle.kts` (e.g. `"1.2.0"`) and commit and push.
2. Tag that commit and push the tag:

   ```
   git tag app-v1.2.0
   git push origin app-v1.2.0
   ```

3. The **App release** workflow (`.github/workflows/app-release.yml`) checks the
   tag matches `appVersion`, builds and signs the APK, and publishes release
   `app-v1.2.0` with `wififan-app-1.2.0.apk` attached. Follow it under the repo's
   **Actions** tab. If you drafted the release in the GitHub UI with that tag
   instead, the workflow attaches the APK to it.

**By hand instead:** run `bash tools/make_app_release.sh`. It builds
`dist/wififan-app-<version>.apk` and prints its signer. Then on GitHub go to
**Releases → Draft a new release**, tag `app-v<version>`, attach the APK, and
publish (not as a draft or pre-release).

## Updating on the phone

**Settings → App** checks GitHub when it opens. To update, tap **Update to vX**.

1. The APK downloads.
2. The first time, Android asks to **allow Glow to install apps**. Turn the
   switch on and go back; the install continues.
3. Android asks *"Do you want to update this app?"*. Tap **Update**. From the
   second self-update on, Android 12+ can skip this prompt.
4. The app closes when the update lands. Open it again.

Before installing, the app checks the download is Glow, has a higher version
code, and is signed with the same key. If one of these fails, it says which.
Note: a build run from Android Studio is signed with the *debug* key, so it
can't update itself to a GitHub release. Install a release build to test.

App side: `ota/AppUpdater.kt` and `ota/GitHubReleases.kt` (shared with the
firmware updater).
