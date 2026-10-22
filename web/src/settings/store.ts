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
/**
 * The look of the whole app. GLASS: translucent glass cards over a background, our own controls.
 * MATERIAL: Material 3, solid tonal surfaces and Google's widgets. Colours (Material You or not)
 * are chosen separately (colorSource).
 */
export type Design = 'GLASS' | 'MATERIAL'

/** A cloud MQTT broker, for reaching Wi-Fi boards from anywhere (devices/cloud.ts). */
export interface CloudConfig {
  /** e.g. abc123.s1.eu.hivemq.cloud */
  host: string
  /** The board's own (TCP, TLS) port. */
  port: number
  /** The WebSocket port Glow uses. */
  wsPort: number
  tls: boolean
  /** Optional: public brokers need none. */
  user: string
  pass: string
  /** 32 hex digits: everything through the broker is encrypted with it (devices/cloud.ts). */
  key: string
}

export interface Settings {
  design: Design
  /** Glass without blur or WebGL: much lighter on phones. */
  lightEffects: boolean
  colorSource: ColorSource
  accentColor: string
  background: Background
  /** 0 follows the system, 1 light, 2 dark. */
  themeMode: number
  pureBlack: boolean
  monoFont: boolean
  /** 0 Square, 1 Small, 2 Medium, 3 Large, 4 Custom. */
  cornerStyle: number
  /** Custom corner size: 0 (square) to 2.5, in units where 1 is Material's medium (12 px cards). */
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
  /** Internet access to Wi-Fi boards; null until set up. */
  cloud: CloudConfig | null
  /** Solar live data: the FoxESS web login (the password only as its MD5, never in plain text). */
  foxUser: string
  foxPassMd5: string

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
  /** Spinner: seconds per turn (1-60, firmware 2.0.0's spin=T). */
  spinSeconds: number
  /** Spinner: the arc's length in pixels, not counting the falloff (1-12, firmware 2.1.13's spin=L). */
  spinLength: number
  /** Spinner: the falloff's radius, how far the leak reaches in pixels (0-12, sent as a
   * share of the ring on firmware 2.1.11's spin=F; 2.1.15 measures it against the ring). */
  spinRadius: number
  /** Spinner: the falloff's strength, how bright the leak burns (0-100, firmware 2.1.16's spin=P). */
  spinStrength: number
  /** Spinner: the falloff also leaks into the LEDs ahead of the head (firmware 2.1.12's spin=W). */
  spinFalloffFront: boolean
  fadeMs: number
  candleHue: number
  roundLedPreview: boolean
  musicSensitivity: number
  musicKeepColour: boolean
  /** Music: one LED per beat on ring boards (firmware 2.1.0+ streams p=); off = the whole ring. */
  musicPerPixel: boolean
  /** Music/Visualizer per-LED trail: how many ms a beat's LED takes to fade back to black (300-2000, decay=MS on 2.1.19+). */
  musicDecayMs: number
  beatFlash: boolean
  boardVersions: Record<string, string>
  /** The ring layout per board, from the `leds` reply (1.10.0+): how many pixels and logical LEDs. */
  boardLeds: Record<string, { pixels: number; leds: number }>
  scenesJson: string | null
  captureDisplay: number
}

export const DEFAULT_ACCENT = '#7e57c2'

const ON_PHONE = typeof window !== 'undefined' && !!(window as unknown as { GlowAndroid?: unknown }).GlowAndroid

const DEFAULTS: Settings = {
  // phones start with Material You (it is their own look and the lightest); PCs with glass
  design: ON_PHONE ? 'MATERIAL' : 'GLASS',
  lightEffects: ON_PHONE,
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
  cloud: null,
  foxUser: '',
  foxPassMd5: '',
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
  spinSeconds: 2,
  spinLength: 8,
  spinRadius: 6,
  spinStrength: 100,
  spinFalloffFront: true,
  fadeMs: 1500,
  candleHue: 19,
  roundLedPreview: true,
  musicSensitivity: 0.5,
  musicKeepColour: false,
  musicPerPixel: true,
  musicDecayMs: 700,
  beatFlash: true,
  boardVersions: {},
  boardLeds: {},
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

// Saved a moment after the last change: a slider drag changes settings every frame.
let persistTimer = 0
function persistSoon() {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* storage full or blocked */ }
  }, 250)
}
window.addEventListener('pagehide', () => {
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* ignore */ }
})

export const settings = {
  get: (): Settings => current,
  set(patch: Partial<Settings>) {
    current = { ...current, ...patch }
    persistSoon()
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

/** One unit is Material's medium shape (cards 12 px, ...); every radius in the app is a multiple of it. */
export const CORNER_UNITS = [0, 0.4, 1, 1.7]
export const MAX_CORNER_UNIT = 2.5
export function cornerUnit(s: Settings) {
  return s.cornerStyle === 4 ? Math.min(MAX_CORNER_UNIT, Math.max(0, s.customCorner)) : CORNER_UNITS[s.cornerStyle] ?? 1
}

/** A small hook for one value, so a component re-renders only when that value changes. */
export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(settings.subscribe, () => settings.get()[key])
}
