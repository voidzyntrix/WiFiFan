# Glow for Windows

The desktop version of the Glow app: controls the WiFiFan LED board over Bluetooth from a PC.
It is an [Electron](https://www.electronjs.org/) app, so it ships its own Chromium. Bluetooth,
screen capture and system audio work regardless of your browser (Firefox has no Web Bluetooth,
so a plain website couldn't reach the board).

The UI is React + TypeScript (`src/`), and the Electron main process is plain JavaScript
(`electron/`). Most of the logic is a direct port of the Android app, with the same names, so a
change on one side is easy to mirror on the other.

## Run it

```bash
cd desktop
npm install
npm run dev      # Electron + live-reloading UI
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server + Electron on top; UI edits reload instantly |
| `npm start` | Builds the UI, then runs Electron on the build |
| `npm run dist` | Builds `release/Glow-Desktop-<version>.exe` (portable, no installer) |
| `npm run typecheck` | TypeScript check only |
| `npx vite` | Just the UI in a browser tab, for layout work. No Bluetooth there; use **Try the controls without a board (demo)** on the connect screen |

If `npm install` leaves Electron half-installed ("Electron failed to install correctly"),
extract `%LOCALAPPDATA%\electron\Cache\…\electron-v33.2.1-win32-x64.zip` into
`node_modules/electron/dist` and write `electron.exe` into `node_modules/electron/path.txt`.
If `npm run dist` fails with "Cannot create symbolic link", turn on Windows Developer Mode, or
extract the downloaded `winCodeSign-*.7z` in `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`
into a `winCodeSign-2.6.0` folder there, skipping its `darwin` folder
(`7za x <file>.7z -owinCodeSign-2.6.0 -xr!darwin`).

## Where things are

| Path | Android counterpart | What |
|---|---|---|
| `electron/main.cjs` | system services | Bluetooth device picking, screen + system-audio capture, lock/idle, tray, no-CORS downloads |
| `electron/preload.cjs`, `src/desktop.ts` | | The bridge the UI uses (`window.glow`) |
| `src/ble/ble.ts` | `BleManager.kt` | Web Bluetooth link: FFE0/FFE1/FFE2, write queue, `\`-terminated lines |
| `src/model/modes.ts` | `LedModes.kt`, `LedCommands` | Modes and the text commands (`firmware/PROTOCOL.md`) |
| `src/model/scenes.ts` | `Scenes.kt`, `SceneApplier.kt` | Scenes and turning them into commands |
| `src/ui/screens/useLed.ts` | `HomeScreen.kt` (logic) | All LED state and actions |
| `src/ui/screens/*.tsx` | `HomeScreen`, `ConnectScreen`, `SettingsScreen` | The screens |
| `src/sync/` | `AudioSyncService`, `ScreenSyncService`, `MusicReactor`, … | Music, Visualizer, Screen sync |
| `src/auto/autoLight.ts` | `AutoLight*.kt` | Auto light |
| `src/ota/` | `OtaManager.kt`, `GitHubReleases.kt` | Firmware updates over Bluetooth |
| `src/ui/backgrounds/` | `Backgrounds.kt`, `FluidSim.kt` | Particles, Aurora, Fluid, Image, Plain |
| `src/settings/store.ts` | `Settings.kt` | Preferences (localStorage) |
| `src/styles.css`, `src/ui/theme.ts` | `Theme.kt` | Look and colour schemes |

## What's different from the phone

| Phone | Desktop substitute |
|---|---|
| Fluid tilts and splashes with the accelerometer/gyroscope | Moving the mouse anywhere pushes the liquid the same way (a little more near the pointer); dragging or shaking the window sloshes it (inertia). Settings → App UI → Mouse movement |
| Haptics | Soft synthesized clicks (Settings → Sounds, with volume) |
| Long press | Right-click (scenes, boards, power button → sleep timer) |
| Back gesture | Esc, or the back button |
| Music: microphone | Same (default Windows microphone) |
| Visualizer: phone playback capture | Everything Windows plays (system audio loopback), no prompt |
| Screen sync: MediaProjection | Screen capture; pick the monitor in Settings when you have several |
| Auto light "in hand / phone down & locked" | **At the PC** (unlocked, keyboard/mouse used in the last minute) / **Away & locked** (Windows locked or idle for the wait time) |
| Auto light "Room light" (light sensor) | The webcam as a light meter: one tiny frame a second, average brightness 0–100 % |
| Foreground services + notifications | Closing the window while a sync or Auto light runs keeps Glow in the tray |
| Online/offline pills on board tiles | Windows can't listen for adverts without a scan, so tiles say Connected / Click to connect |
| In-app APK update | Checks GitHub for `Glow-Desktop-<version>.exe` and opens the download |
| — | Keyboard: Space power, 1–9 scenes, `[` `]` brightness, M mode menu, `,` settings |
| — | Firmware can also be flashed from a local `.bin` file |

## Releasing

1. Bump `version` in `package.json` and add an entry to `src/ui/whatsNew.ts`.
2. Commit, push, then tag `desktop-v<version>` and push the tag.
3. `.github/workflows/desktop-release.yml` builds the exe and attaches it to a GitHub release.
   The Android app ignores these releases (it only looks at `app-v` and `fw-v` tags).
