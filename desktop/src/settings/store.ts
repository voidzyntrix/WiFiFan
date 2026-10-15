// User preferences, saved in localStorage (the Android app's SettingsStore / SharedPreferences).
// One object holds everything; `useSettings()` re-renders on change, `settings.get()` reads it
// outside React (the sync engines and Auto light).

import { useSyncExternalStore } from 'react'

export type ColorScheme = 'MONOCHROME' | 'TINTED' | 'COLORED'
/** SIMPLE is the particles (the Android app's saved name). */
export type Background = 'SIMPLE' | 'AURORA' | 'FLUID' | 'IMAGE' | 'PLAIN'

/** A board the app has connected to: its Bluetooth device id and the name it advertises. */
export interface PairedBoard { id: string; bleName: string | null }

export interface Settings {
  colorScheme: ColorScheme
  accentColor: string
  background: Background
  rainbowSync: boolean
  // Last LED state, so the app reopens where it was left.
  ledHue: number
  ledSat: number
  ledBrightness: number
  ledMode: number
  ledKelvinMode: boolean
  ledKelvin: number
  separateLeds: boolean
  led2Hue: number
  led2Sat: number
  led2KelvinMode: boolean
  led2Kelvin: number
  smoothCandle: boolean
  twoCandles: boolean
  rainbowSeconds: number
  fadeMs: number
  candleHue: number
  collapsed: Record<string, boolean>
  monoFont: boolean
  /** 0 Square, 1 Small, 2 Medium, 3 Large, 4 Custom. */
  cornerStyle: number
  customCorner: number
  roundLedPreview: boolean
  pureBlack: boolean
  refractiveGlass: boolean
  musicSensitivity: number
  musicKeepColour: boolean
  beatFlash: boolean
  lastSeenVersion: string | null
  keepScreenOn: boolean
  updatePrompts: boolean
  /** Desktop stand-in for haptics: soft clicks on sliders and buttons. */
  sounds: boolean
  soundVolume: number
  /** 0 follows Windows, 1 light, 2 dark. */
  themeMode: number
  imageDim: number
  boardVersions: Record<string, string>
  boardNames: Record<string, string>
  pairedBoards: PairedBoard[]
  scenesJson: string | null
  autoLight: boolean
  autoHandScene: number
  autoNightScene: number
  autoWaitMinutes: number
  autoNightNoWait: boolean
  autoRoomLight: boolean
  /** Room light via the webcam: below this brightness (0-100 %) the room is dark. */
  autoDarkLevel: number
  autoDarkScene: number
  autoBrightScene: number
  autoSnapshot: string | null
  /** Fluid background: how hard the mouse stirs the liquid (0..1). */
  fluidStir: number
  /** A net of dots the mouse pushes around, behind the Particles and Fluid backgrounds. */
  dotNet: boolean
  /** How taut the net is, 0 (loose, wobbly) to 1 (stiff). */
  dotNetStiffness: number
  /** How visible the net is, 0 (not at all) to 1; 0.5 is the default look. */
  dotNetOpacity: number
  captureDisplay: number
}

export const DEFAULT_ACCENT = '#7e57c2'

const DEFAULTS: Settings = {
  colorScheme: 'MONOCHROME',
  accentColor: DEFAULT_ACCENT,
  background: 'SIMPLE',
  rainbowSync: true,
  ledHue: 0,
  ledSat: 0,
  ledBrightness: 1,
  ledMode: 0,
  ledKelvinMode: false,
  ledKelvin: 4000,
  separateLeds: false,
  led2Hue: 210,
  led2Sat: 1,
  led2KelvinMode: false,
  led2Kelvin: 4000,
  smoothCandle: false,
  twoCandles: false,
  rainbowSeconds: 15,
  fadeMs: 1500,
  candleHue: 19,
  collapsed: {},
  monoFont: false,
  cornerStyle: 2,
  customCorner: 1,
  roundLedPreview: true,
  pureBlack: false,
  refractiveGlass: false,
  musicSensitivity: 0.5,
  musicKeepColour: false,
  beatFlash: true,
  lastSeenVersion: null,
  keepScreenOn: false,
  updatePrompts: true,
  sounds: true,
  soundVolume: 0.5,
  themeMode: 0,
  imageDim: 0.9,
  boardVersions: {},
  boardNames: {},
  pairedBoards: [],
  scenesJson: null,
  autoLight: false,
  autoHandScene: 2,
  autoNightScene: 1,
  autoWaitMinutes: 2,
  autoNightNoWait: false,
  autoRoomLight: false,
  autoDarkLevel: 12,
  autoDarkScene: 1,
  autoBrightScene: 2,
  autoSnapshot: null,
  fluidStir: 0.6,
  dotNet: true,
  dotNetStiffness: 0.5,
  dotNetOpacity: 0.5,
  captureDisplay: 0,
}

const KEY = 'glow_settings'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* fresh start */ }
  return { ...DEFAULTS }
}

let current = load()
const listeners = new Set<() => void>()

export const settings = {
  get: (): Settings => current,
  set(patch: Partial<Settings>) {
    current = { ...current, ...patch }
    try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* storage full or blocked */ }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => { listeners.delete(l) }
  },
}

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get)
}

export const CORNER_SCALES = [0, 0.5, 1, 1.6]
export function cornerScale(s: Settings) {
  return s.cornerStyle === 4 ? s.customCorner : CORNER_SCALES[s.cornerStyle] ?? 1
}
