// Auto light (the Android app's AutoLight, AutoLightMachine, RoomLight and AutoLightService).
//
// Desktop substitutes for the phone's signals:
//  - "Phone in hand" -> At the PC: Windows unlocked and keyboard/mouse used within the last minute.
//  - "Phone down & locked" -> Away: Windows locked, or no input, for the wait time.
//  - Light sensor -> the webcam as a light meter: the average brightness of a tiny, fixed-exposure
//    frame once a second (0-100 %). Only while "Room light" is on; the camera light shows it.
// Pauses while Music, Visualizer or Screen sync drives the LED.

import { useSyncExternalStore } from 'react'
import { ble } from '../ble/ble'
import { desktop } from '../desktop'
import { settings } from '../settings/store'
import { loadScenes, type Scene } from '../model/scenes'
import { syncHub } from '../sync/engine'

export type AutoState = 'WAITING' | 'AT_PC' | 'AWAY' | 'ROOM_DARK' | 'ROOM_BRIGHT'

export interface AutoStatus {
  running: boolean
  state: AutoState
  paused: boolean
  sceneName: string | null
  /** Room light: the camera's last brightness reading (0-100). */
  level: number | null
  /** Why it can't run (no camera, not in the desktop app). */
  problem: string | null
}

/** No input for this long counts as away from the PC (before the wait starts counting). */
const IDLE_AWAY_S = 60
const POLL_MS = 2000
const SETTLE_MS = 3000

let status: AutoStatus = { running: false, state: 'WAITING', paused: false, sceneName: null, level: null, problem: null }
const listeners = new Set<() => void>()
function publish(patch: Partial<AutoStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export const useAutoStatus = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => status)

export function statusText(s: AutoStatus): string {
  const with_ = (t: string) => t + (s.sceneName ? ` · ${s.sceneName}` : '')
  if (s.problem) return s.problem
  if (s.paused) return 'Paused while another sync drives the LED'
  switch (s.state) {
    case 'AT_PC': return with_('At the PC')
    case 'AWAY': return with_('Away')
    case 'ROOM_DARK': return with_('Dark room')
    case 'ROOM_BRIGHT': return with_('Bright room')
    default: return 'Waiting'
  }
}

/** What the home screen lends Auto light: show a scene, and read the light as it is. */
export interface AutoHooks {
  applyScene(scene: Scene): void
  currentAsScene(): Scene
}
let hooks: AutoHooks | null = null
export function setAutoHooks(h: AutoHooks) { hooks = h }

const sceneById = (id: number) => loadScenes().find((s) => s.id === id) ?? null

function applySceneId(id: number) {
  if (ble.snapshot.state !== 'connected' || syncHub.get().active !== 'NONE' || !hooks) return
  const scene = sceneById(id)
  if (!scene) return
  // Remember the light as it was, the first time Auto light changes it.
  if (settings.get().autoSnapshot == null) {
    settings.set({ autoSnapshot: JSON.stringify(hooks.currentAsScene()) })
  }
  hooks.applyScene(scene)
}

/** Brings back the light from before Auto light first acted, then forgets it. */
function restore() {
  const json = settings.get().autoSnapshot
  if (!json) return
  settings.set({ autoSnapshot: null })
  if (syncHub.get().active !== 'NONE' || !hooks) return
  try { hooks.applyScene(JSON.parse(json) as Scene) } catch { /* corrupt snapshot */ }
}

// ---------------------------------------------------------------------------
// Lock & idle
// ---------------------------------------------------------------------------

let locked = false
let lockedSince = 0
let decided: AutoState = 'WAITING'
let pollTimer = 0
let unlistenPower: (() => void) | null = null

async function pollPower() {
  if (!desktop) return
  const now = Date.now()
  const st = await desktop.power.state()
  if (st.locked !== locked) { locked = st.locked; if (locked) lockedSince = now }
  const s = settings.get()
  const idleMs = st.idleSeconds * 1000
  const away = locked || st.idleSeconds >= IDLE_AWAY_S
  // Away since: the lock, or the last input.
  const awaySince = Math.min(locked ? lockedSince : now, now - idleMs)
  const waitMs = s.autoNightNoWait ? 0 : s.autoWaitMinutes * 60_000
  let want: AutoState | null = null
  if (!away) want = 'AT_PC'
  else if (now - awaySince >= waitMs) want = 'AWAY'
  const paused = syncHub.get().active !== 'NONE'
  if (want && want !== decided) {
    decided = want
    if (!paused) applySceneId(want === 'AT_PC' ? s.autoHandScene : s.autoNightScene)
  }
  const counting = away && want !== 'AWAY'
  const shown = counting ? 'WAITING' : decided
  publish({
    state: shown, paused,
    sceneName: shown === 'AT_PC' ? sceneById(s.autoHandScene)?.name ?? null
      : shown === 'AWAY' ? sceneById(s.autoNightScene)?.name ?? null : null,
  })
}

// ---------------------------------------------------------------------------
// Room light (webcam)
// ---------------------------------------------------------------------------

let camStream: MediaStream | null = null
let camTimer = 0
let roomDark: boolean | null = null
let pending: boolean | null = null
let pendingSince = 0

async function startCamera(): Promise<boolean> {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120, frameRate: 5 } })
  } catch {
    publish({ problem: 'Room light needs a webcam' })
    return false
  }
  // Fixed exposure where the camera allows it, so a dark room stays dark instead of being
  // brightened by auto-exposure.
  const track = camStream.getVideoTracks()[0]
  try {
    const caps = track.getCapabilities?.() as Record<string, unknown> | undefined
    if (caps && Array.isArray(caps.exposureMode) && (caps.exposureMode as string[]).includes('manual')) {
      await track.applyConstraints({ advanced: [{ exposureMode: 'manual' } as MediaTrackConstraintSet] })
    }
  } catch { /* auto exposure it is */ }
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = camStream
  await video.play().catch(() => {})
  const canvas = document.createElement('canvas')
  canvas.width = 32; canvas.height = 24
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  camTimer = window.setInterval(() => {
    if (!video.videoWidth) return
    g.drawImage(video, 0, 0, 32, 24)
    const d = g.getImageData(0, 0, 32, 24).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    roomSample((sum / (d.length / 4) / 255) * 100)
  }, 1000)
  publish({ problem: null })
  return true
}

function stopCamera() {
  window.clearInterval(camTimer)
  camStream?.getTracks().forEach((t) => t.stop())
  camStream = null
}

/** Dark at or below the dark level, bright from twice it (at least +8); settles for 3 s. */
function roomSample(level: number) {
  const s = settings.get()
  const darkAt = s.autoDarkLevel
  const brightAt = Math.max(darkAt * 2, darkAt + 8)
  const seen = level <= darkAt ? true : level >= brightAt ? false : null
  const now = Date.now()
  if (seen === null || seen === roomDark) pending = null
  else if (seen !== pending) { pending = seen; pendingSince = now }
  if (pending !== null && now - pendingSince >= SETTLE_MS) {
    roomDark = pending
    pending = null
    if (syncHub.get().active === 'NONE') applySceneId(roomDark ? s.autoDarkScene : s.autoBrightScene)
  }
  const state: AutoState = roomDark === null ? 'WAITING' : roomDark ? 'ROOM_DARK' : 'ROOM_BRIGHT'
  publish({
    level, state, paused: syncHub.get().active !== 'NONE',
    sceneName: roomDark === null ? null : sceneById(roomDark ? s.autoDarkScene : s.autoBrightScene)?.name ?? null,
  })
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

let roomMode = false

function startWatching() {
  if (status.running) return
  publish({ running: true, state: 'WAITING', sceneName: null, level: null, problem: null })
  decided = 'WAITING'
  roomDark = null
  pending = null
  roomMode = settings.get().autoRoomLight
  if (roomMode) {
    void startCamera()
  } else if (desktop) {
    unlistenPower = desktop.power.onChanged(() => void pollPower())
    pollTimer = window.setInterval(() => void pollPower(), POLL_MS)
    void pollPower()
  } else {
    publish({ problem: 'Lock & idle detection needs the desktop app' })
  }
}

function stopWatching() {
  window.clearInterval(pollTimer)
  unlistenPower?.()
  unlistenPower = null
  stopCamera()
  publish({ running: false, state: 'WAITING', sceneName: null, level: null, problem: null })
}

/** Runs while the setting is on and a board is connected; restarts when the source changes. */
function reconcile() {
  const s = settings.get()
  const want = s.autoLight && ble.snapshot.state === 'connected'
  if (want && status.running && roomMode !== s.autoRoomLight) stopWatching()
  if (want) startWatching()
  else if (status.running) stopWatching()
}

export function setAutoLight(on: boolean) {
  settings.set({ autoLight: on })
  if (!on) restore()
}

ble.subscribe(reconcile)
settings.subscribe(reconcile)
syncHub.subscribe(() => { if (status.running) publish({ paused: syncHub.get().active !== 'NONE' }) })
