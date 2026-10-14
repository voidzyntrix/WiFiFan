// Scenes: saved LED states applied with one click, and the logic that turns a scene into board
// commands (shared by the scene chips and Auto light). Ported from Scenes.kt / SceneApplier.kt.

import { atLeast, kelvinScreenColor, kelvinToHueSat, hsvCss } from '../led/color'
import { settings, type Settings } from '../settings/store'
import { MODE, LedCommands, SYNC_MODES, type BoardCaps } from './modes'

/**
 * A saved LED state: the mode, its colour (hue/saturation or a colour temperature) and the
 * brightness. Music, Visualizer and Screen sync can't be scenes (they need a capture each time).
 */
export interface Scene {
  id: number
  name: string
  mode: number
  hue: number
  sat: number
  kelvinMode: boolean
  kelvin: number
  bri: number
  /** Candle flame hue picked in the colour controls; null = the Settings candle colour. */
  candleHue: number | null
  /** Layout it was saved in: true Separate, false Linked, null = before two-LED boards. */
  split: boolean | null
  hue2: number
  sat2: number
  kelvinMode2: boolean
  kelvin2: number
}

export const sceneDefaults = (p: Partial<Scene> & Pick<Scene, 'id' | 'name' | 'mode'>): Scene => ({
  hue: 0, sat: 0, kelvinMode: false, kelvin: 4000, bri: 1, candleHue: null, split: null,
  hue2: 0, sat2: 0, kelvinMode2: false, kelvin2: 4000, ...p,
})

export const DEFAULT_SCENES: Scene[] = [
  sceneDefaults({ id: 1, name: 'Night', mode: MODE.CANDLE, hue: 19, sat: 0.94, bri: 0.15 }),
  sceneDefaults({ id: 2, name: 'Read', mode: MODE.SOLID, kelvinMode: true, kelvin: 4000, bri: 0.8 }),
]

export const canSaveScene = (mode: number) => !SYNC_MODES.includes(mode)

export function loadScenes(): Scene[] {
  const json = settings.get().scenesJson
  if (json == null) {
    settings.set({ scenesJson: JSON.stringify(DEFAULT_SCENES) })
    return DEFAULT_SCENES
  }
  try {
    return (JSON.parse(json) as Partial<Scene>[]).map((o) =>
      sceneDefaults({ id: o.id ?? 0, name: o.name ?? 'Scene', mode: o.mode ?? MODE.SOLID, ...o }))
  } catch {
    return []
  }
}

export const saveScenes = (list: Scene[]) => settings.set({ scenesJson: JSON.stringify(list) })

const hueClose = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d) < 2
}

/** Whether the LED shows this scene right now (so its chip looks selected). */
export function sceneMatches(sc: Scene, st: LedState, twoLeds: boolean): boolean {
  if (st.mode !== sc.mode || Math.abs(st.bri - sc.bri) > 0.015) return false
  if (sc.mode === MODE.SOLID || sc.mode === MODE.BREATHE) {
    const ok = sc.kelvinMode ? st.kelvinMode && Math.abs(st.kelvin - sc.kelvin) < 60
      : !st.kelvinMode && hueClose(st.hue, sc.hue) && Math.abs(st.sat - sc.sat) < 0.03
    if (!ok) return false
  } else if (sc.mode === MODE.RAINBOW && Math.abs(st.sat - sc.sat) >= 0.03) return false
  if (sc.mode === MODE.CANDLE && sc.candleHue !== st.candleHue) return false
  // the two-LED part: the layout, and LED2's colour for the modes that show it
  if (sc.split == null) return true
  if (sc.split !== twoLeds) return false
  if (!twoLeds || (sc.mode !== MODE.SOLID && sc.mode !== MODE.BREATHE)) return true
  return sc.kelvinMode2 ? st.kelvinMode2 && Math.abs(st.kelvin2 - sc.kelvin2) < 60
    : !st.kelvinMode2 && hueClose(st.hue2, sc.hue2) && Math.abs(st.sat2 - sc.sat2) < 0.03
}

/** CSS background for a scene chip's dot: roughly the colour the LED will have. */
export function sceneSwatch(sc: Scene, settingsCandleHue: number): string {
  const c = (h: number, s: number) => hsvCss(h, s)
  switch (sc.mode) {
    case MODE.RAINBOW:
    case MODE.PARTY:
      return `conic-gradient(${[0, 60, 120, 180, 240, 300, 360].map((h) => c(h, Math.max(sc.sat, 0.6))).join(',')})`
    case MODE.CANDLE: {
      const h = sc.candleHue ?? settingsCandleHue
      return `linear-gradient(135deg, ${c(h + 12, 0.8)}, ${c(h, 0.95)})`
    }
    case MODE.OCEAN: return `linear-gradient(135deg, ${c(185, 0.85)}, ${c(225, 0.9)})`
    case MODE.AURORA: return `linear-gradient(135deg, ${c(150, 0.8)}, ${c(280, 0.75)})`
    default: {
      const c1 = sc.kelvinMode ? kelvinScreenColor(sc.kelvin) : c(sc.hue, sc.sat)
      if (sc.split && (sc.mode === MODE.SOLID || sc.mode === MODE.BREATHE)) {
        const c2 = sc.kelvinMode2 ? kelvinScreenColor(sc.kelvin2) : c(sc.hue2, sc.sat2)
        return `linear-gradient(90deg, ${c1} 50%, ${c2} 50%)`
      }
      return c1
    }
  }
}

/** Everything the board shows: the mode, LED1's (and LED2's) colour, brightness and layout. */
export interface LedState {
  mode: number
  hue: number
  sat: number
  kelvinMode: boolean
  kelvin: number
  bri: number
  candleHue: number | null
  separate: boolean
  hue2: number
  sat2: number
  kelvinMode2: boolean
  kelvin2: number
}

export function stateToScene(st: LedState, id: number, name: string, fwSplit = true): Scene {
  const two = st.separate && fwSplit
  return {
    id, name, mode: canSaveScene(st.mode) ? st.mode : MODE.SOLID,
    hue: st.hue, sat: st.sat, kelvinMode: st.kelvinMode, kelvin: st.kelvin, bri: st.bri,
    candleHue: st.mode === MODE.CANDLE ? st.candleHue : null,
    split: fwSplit ? two : null,
    hue2: two ? st.hue2 : 0, sat2: two ? st.sat2 : 0,
    kelvinMode2: two && st.kelvinMode2, kelvin2: two ? st.kelvin2 : 4000,
  }
}

export function capsOf(version: string | null): BoardCaps {
  return {
    hsv: atLeast(version, '1.1.0'), candle: atLeast(version, '1.2.0'), options: atLeast(version, '1.3.0'),
    effects: atLeast(version, '1.4.0'), split: atLeast(version, '1.6.0'), candleStyle: atLeast(version, '1.6.1'),
    sleep: atLeast(version, '1.7.0'),
  }
}

/** The state after applying a scene on top of [current]; `supported` is false when the board can't run its mode. */
export function resolveScene(scene: Scene, current: LedState, caps: BoardCaps): { next: LedState; supported: boolean } {
  const supported = scene.mode === MODE.CANDLE ? caps.candle
    : [MODE.BREATHE, MODE.OCEAN, MODE.PARTY, MODE.AURORA].includes(scene.mode as 3) ? caps.effects
      : scene.mode === MODE.CHASE ? caps.split
        : canSaveScene(scene.mode)
  const [h, s] = scene.kelvinMode ? kelvinToHueSat(scene.kelvin) : [scene.hue, scene.sat]
  let next: LedState = {
    ...current,
    mode: supported ? scene.mode : MODE.SOLID,
    hue: h, sat: s,
    kelvinMode: scene.kelvinMode,
    kelvin: scene.kelvinMode ? scene.kelvin : current.kelvin,
    bri: scene.bri,
    candleHue: scene.mode === MODE.CANDLE ? scene.candleHue : null,
  }
  if (scene.split === true) {
    const [h2, s2] = scene.kelvinMode2 ? kelvinToHueSat(scene.kelvin2) : [scene.hue2, scene.sat2]
    next = { ...next, hue2: h2, sat2: s2, kelvinMode2: scene.kelvinMode2, kelvin2: scene.kelvinMode2 ? scene.kelvin2 : current.kelvin2 }
  }
  // A scene saved Linked or Separate brings its layout back (older scenes keep the current one).
  if (caps.split && scene.split != null) next = { ...next, separate: scene.split }
  return { next, supported }
}

export interface LedOptions { smoothCandle: boolean; candleHue: number; twoCandles: boolean; rainbowSeconds: number }
export const ledOptionsOf = (s: Settings): LedOptions =>
  ({ smoothCandle: s.smoothCandle, candleHue: s.candleHue, twoCandles: s.twoCandles, rainbowSeconds: s.rainbowSeconds })

/** The commands that show [state]: the layout first when it changes, then the mode. */
export function stateCommands(state: LedState, caps: BoardCaps, opts: LedOptions, layoutChanged: boolean): string[] {
  const two = state.separate && caps.split
  const colour = () => two
    ? LedCommands.pair(state.hue, state.sat, state.bri, state.hue2, state.sat2, state.bri)
    : LedCommands.colour(state.hue, state.sat, state.bri, caps.hsv)
  let mode: string[]
  switch (state.mode) {
    case MODE.RAINBOW: mode = [LedCommands.rainbow(state.sat, state.bri, caps.options ? opts.rainbowSeconds : null)]; break
    case MODE.CANDLE:
      mode = [LedCommands.candle(state.bri, caps.options, opts.smoothCandle, state.candleHue ?? opts.candleHue, caps.candleStyle, opts.twoCandles)]
      break
    case MODE.BREATHE:
    case MODE.CHASE: mode = [colour(), LedCommands.effect(state.mode, state.bri)]; break
    case MODE.OCEAN:
    case MODE.PARTY:
    case MODE.AURORA: mode = [LedCommands.effect(state.mode, state.bri)]; break
    case MODE.MUSIC:
    case MODE.VISUALIZER:
    case MODE.SCREEN: mode = []; break
    default: mode = [colour()]
  }
  return (caps.split && layoutChanged ? [LedCommands.split(state.separate)] : []).concat(mode)
}
