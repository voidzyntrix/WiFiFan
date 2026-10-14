// Checks GitHub for a newer Glow for Windows (releases tagged desktop-v<version> carrying
// Glow-Desktop-<version>.exe, made by .github/workflows/desktop-release.yml). Installing is
// left to the user: the button opens the download in the browser.

import { useSyncExternalStore } from 'react'
import { APP_VERSION } from '../desktop'
import { compareVersions } from '../led/color'
import { newest, type ReleaseAsset } from '../ota/github'

export type AppUpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate'; latest: string }
  | { kind: 'available'; release: ReleaseAsset }
  | { kind: 'error'; message: string }

let state: AppUpdateState = { kind: 'idle' }
const listeners = new Set<() => void>()
const set = (s: AppUpdateState) => { state = s; listeners.forEach((l) => l()) }
export const appUpdateState = () => state
export const useAppUpdate = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)

export async function checkAppUpdate(quiet = false) {
  if (state.kind === 'checking') return
  if (!quiet) set({ kind: 'checking' })
  try {
    const latest = await newest(/Glow-Desktop-(\d+\.\d+\.\d+)\.exe/, 'desktop', (v) => `Glow-Desktop-${v}.exe`)
    if (!latest || compareVersions(latest.version, APP_VERSION) <= 0) set({ kind: 'upToDate', latest: latest?.version ?? APP_VERSION })
    else set({ kind: 'available', release: latest })
  } catch (e) {
    if (!quiet) set({ kind: 'error', message: `Couldn't check for updates: ${(e as Error).message}` })
  }
}
