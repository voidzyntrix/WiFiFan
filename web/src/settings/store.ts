// User preferences, saved in localStorage (the WebView's on Android, Electron's on Windows).
// One object holds everything; `useSettings()` re-renders on change, `settings.get()` reads it
// outside React. Device types keep their own options here too (the LED board's `led*` keys).

import { useSyncExternalStore } from 'react'
import type { SavedDevice } from '../devices/types'

/**
 * SYSTEM: Material You, from the system's colour (Android: the wallpaper; Windows: the accent).
 * CUSTOM: Material You from a colour picked here. MONOCHROME: grey, no colour.
 */
export type ColorSource = 'SYSTEM' | 'CUSTOM' | 'MONOCHROME'
/** SIMPLE is the particles. */
export type Background = 'SIMPLE' | 'AURORA' | 'IMAGE' | 'PLAIN'

export interface Settings {
  colorSource: ColorSource
  accentColor: string
  background: Background
  /** 0 follows the system, 1 light, 2 dark. */
  themeMode: number
  pureBlack: boolean
  monoFont: boolean
  /** 0 Square, 1 Small, 2 Medium, 3 Large, 4 Custom. */
  cornerStyle: number
  customCorner: number
  refractiveGlass: boolean
  imageDim: number
  /** Desktop: soft clicks on sliders and buttons. Android: haptics. */
  sounds: boolean
  soundVolume: number
  keepScreenOn: boolean
  updatePrompts: boolean
  lastSeenVersion: string | null
  /** Settings cards that are folded shut, by id. */
  collapsed: Record<string, boolean>
  /** Devices connected before. */
  devices: SavedDevice[]

  // --- the LED board (devices/glow) ---
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
  roundLedPreview: boolean
  musicSensitivity: number
  musicKeepColour: boolean
  beatFlash: boolean
  boardVersions: Record<string, string>
  scenesJson: string | null
  captureDisplay: number
}

export const DEFAULT_ACCENT = '#7e57c2'

const DEFAULTS: Settings = {
  colorSource: 'SYSTEM',
  accentColor: DEFAULT_ACCENT,
  background: 'SIMPLE',
  themeMode: 0,
  pureBlack: false,
  monoFont: false,
  cornerStyle: 2,
  customCorner: 1,
  refractiveGlass: false,
  imageDim: 0.9,
  sounds: true,
  soundVolume: 0.5,
  keepScreenOn: false,
  updatePrompts: true,
  lastSeenVersion: null,
  collapsed: {},
  devices: [],
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
  roundLedPreview: true,
  musicSensitivity: 0.5,
  musicKeepColour: false,
  beatFlash: true,
  boardVersions: {},
  scenesJson: null,
  captureDisplay: 0,
}

const KEY = 'glow_settings'

/** Older saved settings (Glow for Windows 1.x) into today's shape. */
function migrate(raw: Record<string, unknown>): Partial<Settings> {
  const out = { ...raw } as Record<string, unknown>
  if (!('devices' in raw) && Array.isArray(raw.pairedBoards)) {
    const names = (raw.boardNames ?? {}) as Record<string, string>
    out.devices = (raw.pairedBoards as { id: string; bleName: string | null }[]).map((b) => ({
      id: b.id, type: 'glow-led', name: names[b.id] ?? null, advertised: b.bleName,
    }))
  }
  if (!('colorSource' in raw) && typeof raw.colorScheme === 'string') {
    out.colorSource = raw.colorScheme === 'MONOCHROME' ? 'MONOCHROME' : raw.colorScheme === 'COLORED' ? 'CUSTOM' : 'SYSTEM'
  }
  if (raw.background === 'FLUID') out.background = 'SIMPLE'
  for (const k of Object.keys(out)) if (!(k in DEFAULTS)) delete out[k]
  return out as Partial<Settings>
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...migrate(JSON.parse(raw)) }
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
