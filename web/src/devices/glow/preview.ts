// What the LED preview shows: the board's mode, approximated on a 4 s animation loop (the board runs
// its effects by itself; this only mirrors them).

import { MODE } from './modes'
import type { LedController } from './useLed'

export interface Preview { hue: number; sat: number; val: number; hue2: number; sat2: number; val2: number }

/** What the preview shows: the board's mode, approximated (4 s animation loop). */
export function previewOf(c: LedController, t: number): Preview {
  const { s, prefs, sync, twoLeds } = c
  const live = sync.active !== 'NONE'
  const liveHue = live ? sync.hue : s.hue, liveSat = live ? sync.sat : s.sat
  const liveLevel = live ? sync.level : 0, liveLevel2 = live ? sync.level2 : 0
  const rainbowHue = (t / 4) % 1 * 360
  const phase = (rainbowHue / 360) * 6.2832
  const flame = s.mode === MODE.CANDLE && twoLeds && c.caps.candleStyle && !prefs.twoCandles
  const flameHue = s.candleHue ?? prefs.candleHue
  const sway = 0.2 * Math.sin(phase) + 0.05 * Math.sin(phase * 3 + 0.7)
  const core = (0.88 + 0.06 * Math.sin(phase * 2)) * (1 + 0.6 * sway)
  const tip = 0.7 * (0.86 + 0.06 * Math.sin(phase * 2 - 0.4) + 0.05 * Math.sin(phase * 9)) * (1 - 0.6 * sway)
  const clampV = (v: number, lo: number) => Math.min(1, Math.max(lo, v))
  const b = s.bri
  const sync3 = s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER || s.mode === MODE.SCREEN
  const hue = s.mode === MODE.RAINBOW || s.mode === MODE.PARTY ? rainbowHue
    : s.mode === MODE.CANDLE ? (flame ? flameHue + 5 : s.candleHue ?? prefs.candleHue)
      : sync3 ? liveHue
        : s.mode === MODE.OCEAN ? 205 + 20 * Math.sin(phase)
          : s.mode === MODE.AURORA ? 200 + 80 * Math.sin(phase / 4) : s.hue
  const sat = s.mode === MODE.CANDLE ? (flame ? 0.86 : 0.94) : s.mode === MODE.OCEAN ? 0.9 : s.mode === MODE.AURORA ? 0.82
    : s.mode === MODE.PARTY ? 1 : sync3 ? liveSat : s.sat
  const val = s.mode === MODE.CANDLE ? (flame ? b * clampV(core, 0.25) : b * (0.82 + 0.1 * Math.sin(phase * 2)))
    : s.mode === MODE.BREATHE ? b * (0.575 + 0.425 * Math.sin(phase))
      : s.mode === MODE.CHASE ? b * (twoLeds ? 0.5 + 0.5 * Math.sin(phase) : 0.55 - 0.45 * Math.cos(phase))
        : s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER ? b * (0.15 + 0.85 * liveLevel) : b
  const hue2 = s.mode === MODE.RAINBOW ? (rainbowHue + 180) % 360 : s.mode === MODE.PARTY ? (rainbowHue + 120) % 360
    : s.mode === MODE.CANDLE ? (flame ? Math.max(0, flameHue - 5) : s.candleHue ?? prefs.candleHue)
      : sync3 ? (live ? sync.hue2 : s.hue2)
        : s.mode === MODE.OCEAN ? 205 - 20 * Math.sin(phase)
          : s.mode === MODE.AURORA ? 200 - 80 * Math.sin(phase / 4) : s.mode === MODE.CHASE ? s.hue : s.hue2
  const sat2 = s.mode === MODE.RAINBOW || s.mode === MODE.CHASE ? s.sat : sync3 ? (live ? sync.sat2 : s.sat2)
    : s.mode === MODE.CANDLE ? (flame ? 0.99 : sat)
      : s.mode === MODE.OCEAN || s.mode === MODE.AURORA || s.mode === MODE.PARTY ? sat : s.sat2
  const val2 = s.mode === MODE.CANDLE ? (flame ? b * clampV(tip, 0.2) : b * (0.82 + 0.1 * Math.sin(phase * 3 + 1)))
    : s.mode === MODE.BREATHE ? b * (0.575 - 0.425 * Math.sin(phase))
      : s.mode === MODE.CHASE ? b * (0.5 - 0.5 * Math.sin(phase))
        : s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER ? b * (0.15 + 0.85 * liveLevel2) : b
  return { hue, sat, val, hue2, sat2, val2 }
}
