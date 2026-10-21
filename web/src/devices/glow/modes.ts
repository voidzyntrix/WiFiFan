// LED modes and the text commands the board understands (see firmware/PROTOCOL.md).

import { hsvToRgb, normHue, clamp } from '../../lib/color'

export const MODE = {
  SOLID: 0,
  RAINBOW: 1,
  CANDLE: 2,
  BREATHE: 3,
  /** Microphone-reactive: loudness drives brightness, beats step the hue (app-side). */
  MUSIC: 7,
  /** Screen sync: the dominant screen colour (app-side). */
  SCREEN: 8,
  /** Visualizer: bass, mids and treble of what Windows plays set the colour (app-side). */
  VISUALIZER: 9,
  /** Solar (ESP32 board, firmware 1.6.0+): the board follows a FoxESS inverter by itself. */
  SOLAR: 11,
  /** Spinner (ring board, firmware 2.0.0+): a bright tail chasing round the ring. */
  SPIN: 12,
} as const

/** Board effects: mode, button label, command stem (Spinner needs spin=H/S/V/T, built in useLed). */
export const LED_EFFECTS: [number, string, string][] = [
  [MODE.BREATHE, 'Breathe', 'breathe'],
  [MODE.SPIN, 'Spinner', 'spin'],
]

/** Modes that were removed (Ocean, Party, Aurora, Chase): a saved scene that used one becomes Solid. */
const REMOVED_MODES = [4, 5, 6, 10]
export const keepMode = (mode: number): number => (REMOVED_MODES.includes(mode) ? MODE.SOLID : mode)

export const SYNC_MODES: number[] = [MODE.MUSIC, MODE.VISUALIZER, MODE.SCREEN]

/** Below this the LED is effectively off (1 % = 3 of 255). */
export const MIN_VISIBLE = 0.01

export const LED_PRESETS = ['#FFFFFF', '#FF3B30', '#FF9500', '#FFD60A', '#34C759', '#00C7BE', '#0A84FF', '#BF5AF2', '#FF2D92']
export const KELVIN_PRESETS = [1900, 2700, 3500, 4500, 5600, 6500]

export const modeLabel = (mode: number): string =>
  ({
    [MODE.SOLID]: 'Solid', [MODE.RAINBOW]: 'Rainbow', [MODE.CANDLE]: 'Candle', [MODE.MUSIC]: 'Music',
    [MODE.VISUALIZER]: 'Visualizer', [MODE.SCREEN]: 'Screen', [MODE.SOLAR]: 'Solar', [MODE.SPIN]: 'Spinner',
  } as Record<number, string>)[mode] ?? LED_EFFECTS.find((e) => e[0] === mode)?.[1] ?? 'Solid'

/** Text commands for the board's colours. */
export const LedCommands = {
  /** `H/S/V`: hue 0-359 degrees, saturation and brightness 0-100 %. */
  hsv(h: number, s: number, v: number) {
    return `${normHue(Math.round(h)) % 360}/${Math.round(clamp(s, 0, 1) * 100)}/${Math.round(clamp(v, 0, 1) * 100)}`
  },
  /** One colour on both LEDs: h= on firmware 1.1.0+, l=R/G/B on older boards. */
  colour(h: number, s: number, v: number, hsvCommands: boolean) {
    if (hsvCommands) return 'h=' + LedCommands.hsv(h, s, v)
    const [r, g, b] = hsvToRgb(h, clamp(s, 0, 1), clamp(v, 0, 1))
    return `l=${r}/${g}/${b}`
  },
  /** Both LEDs in one go, each with its own colour (firmware 1.6.0+). */
  pair(h1: number, s1: number, v1: number, h2: number, s2: number, v2: number) {
    return `hh=${LedCommands.hsv(h1, s1, v1)}/${LedCommands.hsv(h2, s2, v2)}`
  },
  split: (separate: boolean) => `split=${separate ? 1 : 0}`,
  /** Candle: `candle=V`, `/M/H` with options (1.3.0+), `/S` with candle styles (1.6.1+). */
  candle(bri: number, options: boolean, smooth: boolean, hue: number, styles = false, twoCandles = false) {
    const v = Math.round(bri * 100)
    if (!options) return `candle=${v}`
    const opts = `candle=${v}/${smooth ? 1 : 0}/${hue}`
    return styles ? `${opts}/${twoCandles ? 1 : 0}` : opts
  },
  rainbow(sat: number, bri: number, seconds: number | null) {
    return `rain=${Math.round(sat * 100)}/${Math.round(bri * 100)}` + (seconds != null ? `/${seconds}` : '')
  },
  effect(mode: number, bri: number) {
    return `${LED_EFFECTS.find((e) => e[0] === mode)![2]}=${Math.round(bri * 100)}`
  },
  /** Spinner (2.0.0+): a tail chasing round the ring, one turn every 1-60 s; the 5th
   * number (2.1.11) is the falloff, % of the ring fading out behind it (2.1.15); the
   * 6th (2.1.12) is 1 when the falloff also fades into the LEDs ahead of the head;
   * the 7th (2.1.13) is the arc's length in pixels, 1-12. */
  spinner(h: number, s: number, v: number, seconds: number, falloff = 0, front = false, length = 8) {
    return `spin=${LedCommands.hsv(h, s, v)}/${Math.round(clamp(seconds, 1, 60))}/${clamp(Math.round(falloff), 0, 100)}/${front ? 1 : 0}/${clamp(Math.round(length), 1, 12)}`
  },
  /** One pixel of the ring (firmware 2.1.0+, "Firmware Changes.md"; index 0-based from the leds reply). */
  pixel(index: number, h: number, s: number, v: number) {
    return `p=${Math.max(0, Math.round(index))}/${LedCommands.hsv(h, s, v)}`
  },
  /** The whole ring in one go (2.1.0+): one H/S/V entry per pixel, comma-separated. */
  ringPalette(entries: string[]) {
    return 'pal=' + entries.join(',')
  },
}

/** What the connected board's firmware understands. */
export interface BoardCaps {
  hsv: boolean          // 1.1.0: h=H/S/V
  candle: boolean       // 1.2.0
  options: boolean      // 1.3.0: candle/rainbow options, fade=
  effects: boolean      // 1.4.0: breathe
  split: boolean        // 1.6.0: two LEDs
  candleStyle: boolean  // 1.6.1: one flame / two candles
  sleep: boolean        // 1.7.0: sleep timer
  spin: boolean         // 2.0.0: spinner, per-pixel candle and breathe, the rainbow's T
  spinLive: boolean     // 2.1.1: h=/l= recolour the arc live without restarting it (2.1.2 took back colour)
  spinBri: boolean      // 2.1.2: a brightness-only h=/l= keeps the arc turning; a colour ends it again
  perPixel: boolean     // 2.1.0: p=/pal=, one colour per ring pixel ("Firmware Changes.md")
  noGamma: boolean      // 2.1.6: the LEDs take colours as they are, no gamma encode in the output
  importLevels: boolean // 2.2.0: LED 1 steps by import (imp=)
}

/** One ring pixel's own colour (its value is the shared brightness: like the two LEDs share one). */
export interface PixelColour {
  hue: number
  sat: number
  kelvinMode: boolean
  kelvin: number
}
