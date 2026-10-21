# AGENTS.md

Instructions for AI coding agents working on Glow / WiFiFan (https://github.com/voidzyntrix/WiFiFan).

## Repo shape

- **`web/` is the single app**: React + TypeScript + Vite. It is served inside two shells — `app/` (Android WebView) and `desktop/` (Electron). Most work happens in `web/src/`; only platform-specific bits live in the shells (`app/src/main/java/...`, `desktop/electron/`).
- `desktop/README.md` refers to `src/...` paths from before the merge — read them as `web/src/...`. It still holds the best module map (`web/src/ble/modes/ota/sync/...` ↔ the old Android counterparts) and Windows-specific workarounds.
- The app talks to the board with text commands over BLE (`FFE0/FFE1/FFE2`, `\`-terminated lines). The command reference is `firmware/PROTOCOL.md`; `web/src/devices/glow/` implements it.

## Commands

- Build / typecheck the app (also the only verification — there are no tests): `npm --prefix web run build` (runs `tsc --noEmit && vite build`). A bare `npx vite` in `web/` opens the UI in a browser without Bluetooth; use the "demo" board on the connect screen for layout work.
- Desktop: `cd desktop && npm run dev` (Vite + live-reloading Electron), `npm run dist` (portable exe → `desktop/release/`).
- Android APK: `gradlew assembleRelease` **requires `web/dist` first** (it fails with "web/dist is missing" — run the web build before Gradle). The Gradle daemon JVM is pinned to JetBrains Runtime 21 via `gradle/gradle-daemon-jvm.properties`.
- Local signing needs `keystore.properties` in the repo root (gitignored; see `docs/APP_UPDATES.md`).
- Scripts under `tools/*.sh` are bash and do not run on this machine's PowerShell (`bash` is unavailable) — release builds happen on GitHub Actions. `tools/release.mjs` is Node and works anywhere.
- This machine's shell is Windows PowerShell 5.1: `&&` is not a valid statement separator — make one call per command instead of chaining.

## Versions and releases (most common mistake)

- **The version lives in one place: `web/package.json`** (`app/build.gradle.kts` reads it and derives `versionCode` = major×10000+minor×100+patch, so Android only accepts strictly increasing versions).
- A release = push a tag (`app-v<x.y.z>`, `desktop-v<x.y.z>`, `fw-v<x.y.z>`); **pushing `main` releases nothing**. Each workflow checks the tag matches the version source and fails otherwise:
  - app tag ↔ `web/package.json` version
  - desktop tag ↔ `desktop/package.json` version
  - fw tag ↔ `FW_VERSION` in `firmware/app/User/main.c`
- **`FW_VERSION` must stay under 2.2.0**: 2.2.0 is reserved for the future `imp=` (Solar's steps-by-import) firmware — the app already enables `importLevels` for any firmware ≥ 2.2.0 (`capsOf` in `web/src/devices/glow/scenes.ts`), so releasing 2.2.0+ without `imp=` in `main.c` would flip on a UI the board can't do. Iterate in 2.1.x.
- **Desktop build caches** (`desktop-release.yml`): the install + Electron download caches are keyed on the lockfiles, but GitHub scopes caches per ref and **tag runs can never restore each other's** — they can only fall back to the default branch's scope. `.github/workflows/desktop-cache.yml` warms that scope: it installs + builds once whenever a lockfile or `package.json` changes on `main` (plus a weekly touch), so desktop releases skip their Install step. If the cache is ever cold, releases still just work — they build from scratch and save (into the tag scope, which only helps re-runs of that same tag).
- Standard app/desktop release step (both together): `node tools/release.mjs` — bumps both `package.json` files + the matching `app`/`desktop` keys in `versions.json`, adds the What's-new entry at the top of `web/src/ui/whatsNew.ts`, commits, pushes `main`, pushes both tags and watches the workflows until the releases exist. Flags: `--major`/`--minor` (default patch), `--dry-run`, `release` as the verb, or phrase arguments for the What's-new bullets. Without notes it lists commit subjects since the previous `app-v*` tag — **commit UI changes with user-facing subjects before running it**. The workflows below can still be driven manually the old way (bump both `package.json` files + `versions.json` + `whatsNew.ts` entry, commit, push `main`, push both tags, `gh run watch`).
- **Before any app/desktop release, read `app-changes.md`** (repo root): requested app changes are staged there (the committed `.opencode/requested-app-changes/` skill says to apply them first), so implement what it lists before running the release script.
- `release.mjs` aborts before touching anything unless the only modified files are the four version files — stray dirt in the tree (agent-session files like `.claude/`, `.opencode/`, an uncommitted rename) stops the release until it is committed or stashed.
- **Firmware release ritual** (no script; plain git + `gh`): bump `FW_VERSION` in `firmware/app/User/main.c`, append a `## a.b.c — …` section to `Firmware Changes.md`, bump the `fw` key in `versions.json`, land it as one user-facing `Firmware a.b.c: …` commit on `main`, push the `fw-v…` tag, `gh run watch --exit-status` the `fw-release.yml` run, then check the release is published (not a draft) with its exact asset `wififan-fw-<v>.bin`. There is no local compile — CI is the verification.
- **`versions.json`** (`app`, `desktop`, `esp`, `fw`) is what the apps' update checks read first (`raw.githubusercontent.com`, with rate limit and CDN-cache-buster handling in `web/src/lib/github.ts`). Bumping it on `main` before tagging is safe: update offers only appear once the matching release asset exists.
- **Commit subjects on `main` become the release notes**: the app workflow lists `git log` subjects since the previous `app-v*` tag (path-filtered `:!firmware` — a firmware commit that also touches root files like `versions.json` still appears), so write every commit subject as a user-facing line.
- ESP32 firmware publishes differently — no workflow: `bash tools/make_esp_release.sh --publish` creates the `esp-v<ver>` release itself. Asset names: `wififan-app-<v>.apk`, `Glow-Desktop-<v>.exe`, `wififan-fw-<v>.bin`, `glow-esp32-<v>.bin`; the updaters match by exact asset name. Tags `app-v`/`desktop-v`/`fw-v`/`esp-v` live in the same repo side by side.
- The updater depends on `REPO` in `web/src/lib/github.ts` — keep it in sync if the repo moves.

## Firmware

- `firmware/app` (main) + `firmware/bootloader` (Bluetooth OTA). MounRiver Studio projects; CI builds with `CROSS=riscv-none-elf- bash firmware/app/build.sh out` (xPack GCC otherwise from PATH). `app/build.sh` needs bash.
- **Never "Erase All"**: it wipes the 8 KB bootloader at 0x0000 (app is max 56 KB at 0x2000) — see `firmware/README.md`.

## Conventions worth keeping

- Material You styling: mdui 2 web components only (registered in `web/src/ui/md.tsx`); theme tokens `--mdui-color-*` come from `web/src/ui/theme.ts`. All styling is plain `web/src/styles.css` — prefer the stock mdui component/variant and CSS `::part()` tinkering over hand-rolling new looks (overriding an mdui host rule also kills its built-in `:host([disabled])` fading unless scoped `:not([disabled])`).
- mdui components take attributes not properties (React passes them wrongly) — use the helpers in `md.tsx` (`flag()`, etc.).
- Non-obvious knobs the UI reads: Shapes/corner scale from `web/src/settings/store.ts` (published as `--u` by `theme.ts`; radii should follow `--u`).
