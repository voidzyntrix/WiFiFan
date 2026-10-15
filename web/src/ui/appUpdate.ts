// Checks GitHub for a newer Glow for this platform (the shell names the release files: Glow for
// Windows: desktop-v<version> / Glow-Desktop-<version>.exe; Glow for Android: app-v<version> /
// wififan-app-<version>.apk) and installs it in one click: the shell downloads it and swaps it in
// (Windows restarts; Android asks to update). Where that isn't possible (a development run, a plain
// browser) the button opens the download page instead.

import { useSyncExternalStore } from 'react'
import { APP_VERSION, openLink, platform } from '../platform'
import { compareVersions } from '../lib/color'
import { newest, type ReleaseAsset } from '../lib/github'

export type AppUpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate'; latest: string }
  | { kind: 'available'; release: ReleaseAsset }
  /** fraction: how much of the file is here, null until the size is known. */
  | { kind: 'downloading'; version: string; fraction: number | null }
  | { kind: 'restarting'; version: string }
  | { kind: 'error'; message: string; release?: ReleaseAsset }

let state: AppUpdateState = { kind: 'idle' }
const listeners = new Set<() => void>()
const set = (s: AppUpdateState) => { state = s; listeners.forEach((l) => l()) }
export const appUpdateState = () => state
export const useAppUpdate = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)

export async function checkAppUpdate(quiet = false) {
  if (state.kind === 'checking' || state.kind === 'downloading' || state.kind === 'restarting') return
  if (!quiet) set({ kind: 'checking' })
  try {
    const channel = platform.update
    if (!channel) { if (!quiet) set({ kind: 'error', message: 'This build updates itself only as the installed app.' }); return }
    const latest = await newest(channel.asset, channel.kind, channel.assetName)
    if (!latest || compareVersions(latest.version, APP_VERSION) <= 0) set({ kind: 'upToDate', latest: latest?.version ?? APP_VERSION })
    else set({ kind: 'available', release: latest })
  } catch (e) {
    if (!quiet) set({ kind: 'error', message: `Couldn't check for updates: ${(e as Error).message}` })
  }
}

/** The one click: downloads [release], replaces this Glow with it and restarts. */
export async function installAppUpdate(release: ReleaseAsset) {
  if (state.kind === 'downloading' || state.kind === 'restarting') return
  const channel = platform.update
  if (!channel) { openLink(release.downloadUrl); return }
  const version = release.version
  set({ kind: 'downloading', version, fraction: null })
  try {
    await channel.install(release.downloadUrl, version, (received, total) =>
      set({ kind: 'downloading', version, fraction: total > 0 ? received / total : null }))
    set({ kind: 'restarting', version })      // Windows: Glow restarts by itself. Android: it asks to update.
  } catch (e) {
    const message = (e as Error).message
    if (message === 'UNSUPPORTED') { openLink(release.downloadUrl); set({ kind: 'available', release }) }
    else set({ kind: 'error', message: `Couldn't update: ${message}`, release })
  }
}

