// Checks GitHub for a newer Glow for Windows (releases tagged desktop-v<version> carrying
// Glow-Desktop-<version>.exe, made by .github/workflows/desktop-release.yml) and installs it in
// one click: the desktop shell downloads the file, puts it in the running Glow's place and
// restarts (electron/updater.cjs). Where that isn't possible (a development run, a plain
// browser) the button opens the download page instead.

import { useSyncExternalStore } from 'react'
import { APP_VERSION, desktop, openLink } from '../desktop'
import { compareVersions } from '../led/color'
import { newest, type ReleaseAsset } from '../ota/github'

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
    const latest = await newest(/Glow-Desktop-(\d+\.\d+\.\d+)\.exe/, 'desktop', (v) => `Glow-Desktop-${v}.exe`)
    if (!latest || compareVersions(latest.version, APP_VERSION) <= 0) set({ kind: 'upToDate', latest: latest?.version ?? APP_VERSION })
    else set({ kind: 'available', release: latest })
  } catch (e) {
    if (!quiet) set({ kind: 'error', message: `Couldn't check for updates: ${(e as Error).message}` })
  }
}

/** The one click: downloads [release], replaces this Glow with it and restarts. */
export async function installAppUpdate(release: ReleaseAsset) {
  if (state.kind === 'downloading' || state.kind === 'restarting') return
  if (!desktop?.update) { openLink(release.downloadUrl); return }
  const version = release.version
  set({ kind: 'downloading', version, fraction: null })
  const stop = desktop.update.onProgress(({ received, total }) =>
    set({ kind: 'downloading', version, fraction: total > 0 ? received / total : null }))
  try {
    await desktop.update.install(release.downloadUrl, version)
    set({ kind: 'restarting', version })      // Glow closes by itself in a moment and the new one opens
  } catch (e) {
    const message = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    if (message === 'UNSUPPORTED') { openLink(release.downloadUrl); set({ kind: 'available', release }) }
    else set({ kind: 'error', message: `Couldn't update: ${message}`, release })
  } finally {
    stop()
  }
}

