// The LEDs as the board drives them, simulated on the phone with the firmware's own formulas: the hsv
// colour maths, each animation (breathe, rainbow, candle, noise), and the 2.2 gamma the LED output applies.
// The animations run on this device's clock, so their timing starts at a different point from the board's;
// the colours at any moment follow the same rules. Modes that depend on live data (Solar, the sound and
// screen modes) keep the estimate in preview.ts, passed through the same colour maths.

import { kelvinToHueSat, rgbToHsv } from '../../lib/color'
import { MODE } from './modes'
import { previewOf, type Preview } from './preview'
import type { LedController } from './useLed'

type Lin = [number, number, number]        // linear 0..1, as the firmware computes a colour
type Out = [number, number, number]        // 0..255, what the LED is sent

/** The firmware's hsv(): a linear colour from hue (degrees), saturation and value. */
function hsvLin(h: number, sat: number, v: number): Lin {
  h = ((h % 360) + 360) % 360
  const c = v * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(5, Math.floor(h / 60))]
  return [r + m, g + m, b + m]
}

/** The firmware's ledsWrite(): gamma 2.2, then 8 bits per colour. */
const gamma = (lin: Lin): Out => lin.map((x) => Math.round(Math.pow(Math.min(1, Math.max(0, x)), 2.2) * 255)) as Out

/** The firmware's hash01() and noise(), bit for bit. */
function hash01(x: number): number {
  x = x >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return (x & 0xffff) / 65535
}
function noise(t: number, seed: number): number {
  const i = Math.floor(t)
  const f0 = t - i
  const a = hash01((i * 7919 + seed) >>> 0), b = hash01(((i + 1) * 7919 + seed) >>> 0)
  const f = f0 * f0 * (3 - 2 * f0)
  return a + (b - a) * f
}

/** A Preview (hue, saturation, value per LED) from 8-bit colours, so the card draws exactly those colours. */
function previewFrom(a: Out, b: Out): Preview {
  const [hue, sat, val] = rgbToHsv(a[0], a[1], a[2])
  const [hue2, sat2, val2] = rgbToHsv(b[0], b[1], b[2])
  return { hue, sat, val, hue2, sat2, val2 }
}

/** One ring pixel's colour, through the same gamma and colour maths the cards show. */
export interface DotColour { hue: number; sat: number; val: number }

function gammaHsv(h: number, sat: number, v: number): [number, number, number] {
  const [r, g, b] = gamma(hsvLin(h, sat, v))
  return rgbToHsv(r, g, b)
}

/** What the two LEDs show now, as the board would send them. */
export function simulatedPreview(c: LedController, t: number): Preview {
  const { s, prefs, caps } = c
  const two = s.separate && caps.split
  const [h1, sat1] = s.kelvinMode ? kelvinToHueSat(s.kelvin) : [s.hue, s.sat]
  const [h2, sat2] = two ? (s.kelvinMode2 ? kelvinToHueSat(s.kelvin2) : [s.hue2, s.sat2]) : [h1, sat1]
  const bri = s.bri
  switch (s.mode) {
    case MODE.SOLID:
      return previewFrom(gamma(hsvLin(h1, sat1, bri)), gamma(hsvLin(h2, sat2, bri)))
    case MODE.BREATHE: {
      // LED 2 runs 0.6 rad behind LED 1 (firmware: ph * 0.6)
      const k = (ph: number) => 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 4 + ph * 0.6)
      return previewFrom(gamma(hsvLin(h1, sat1, bri * k(0))), gamma(hsvLin(two ? h2 : h1, two ? sat2 : sat1, bri * k(1))))
    }
    case MODE.RAINBOW: {
      // one full turn every rainbowSeconds; LED 2 sits 30 degrees further round (firmware: ph * 30)
      const hue = (ph: number) => (t / prefs.rainbowSeconds) * 360 + ph * 30
      return previewFrom(gamma(hsvLin(hue(0), s.sat, bri)), gamma(hsvLin(hue(1), s.sat, bri)))
    }
    case MODE.CANDLE: {
      // candle: the same flicker for both LEDs unless Separate with two candles (own seeds per LED)
      const f = prefs.smoothCandle ? 0.3 : 1
      const hueBase = s.candleHue ?? prefs.candleHue
      const candle = (idx: number) => {
        const target = 0.55 + 0.45 * noise(t * 9 * f, idx * 31 + 1) * (0.6 + 0.4 * noise(t * 2 * f, idx + 7))
        const hue = hueBase + 8 * noise(t * 3 * f, idx * 17 + 3)
        return gamma(hsvLin(hue, 0.95, bri * target))
      }
      const separateFlames = two && prefs.twoCandles
      return previewFrom(candle(0), separateFlames ? candle(1) : candle(0))
    }
    default: {
      // sound, screen and Solar modes: the estimate, passed through the same colour maths
      const p = previewOf(c, t)
      return previewFrom(gamma(hsvLin(p.hue, p.sat, p.val)), gamma(hsvLin(p.hue2, p.sat2, p.val2)))
    }
  }
}

/** What the ring's pixels show now (Individual), as the board would drive them. */
export function simulatedRing(c: LedController, t: number): DotColour[] {
  const { s, prefs, caps, ringPixels, ringInd } = c
  const n = ringPixels ?? 0
  if (n < 3) return []
  const half = Math.floor(n / 2)
  const [h1, sat1] = s.kelvinMode ? kelvinToHueSat(s.kelvin) : [s.hue, s.sat]
  const [h2, sat2] = caps.split && s.kelvinMode2 ? kelvinToHueSat(s.kelvin2) : [s.hue2, s.sat2]
  const bri = s.bri
  const hueSatOf = (i: number): [number, number] => (i < half ? [h1, sat1] : [h2, sat2])
  const dots = Array.from({ length: n }, (_, i) => {
    const [h, sat] = hueSatOf(i)
    const [gh, gs, gv] = gammaHsv(h, sat, bri)
    return { hue: gh, sat: gs, val: gv }
  })
  switch (s.mode) {
    case MODE.SOLID:
      if (!ringInd) return dots          // Linked: the whole ring one colour
      return Array.from({ length: n }, (_, i) => {
        const px = s.ringPal[i]
        if (!px) return dots[i]
        const [h, sat] = px.kelvinMode ? kelvinToHueSat(px.kelvin) : [px.hue, px.sat]
        const [gh, gs, gv] = gammaHsv(h, sat, bri)
        return { hue: gh, sat: gs, val: gv }
      })
    case MODE.RAINBOW: {
      if (!caps.spin) {                  // pre-2.0 rainbow: all the pixels share one turning hue
        const hue = (t / prefs.rainbowSeconds) * 360
        return dots.map(() => { const [gh, gs, gv] = gammaHsv(hue, s.sat, bri); return { hue: gh, sat: gs, val: gv } })
      }
      // The wheel: the hues spread round the ring (24 pixels, 15 degrees apart) and turn once per T.
      return dots.map((_, i) => {
        const [gh, gs, gv] = gammaHsv(((t / prefs.rainbowSeconds) * 360 + i * (360 / n)) % 360, s.sat, bri)
        return { hue: gh, sat: gs, val: gv }
      })
    }
    case MODE.BREATHE: {
      // 2.0.0: a wave runs round the ring (LED2 = pixel 12 sat 0.6 rad behind, so 0.5 % further each pixel);
      // the old board breathes its two sums together, except Separate's second half, a beat behind.
      const k = (ph: number) => 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 4 + ph * 0.6)
      return dots.map((_, i) => {
        const ph = caps.spin ? (s.separate ? i / 12 : 0) : s.separate ? (i < half ? 0 : 1) : 0
        const [h, sat] = hueSatOf(i)
        const [gh, gs, gv] = gammaHsv(h, sat, bri * k(ph))
        return { hue: gh, sat: gs, val: gv }
      })
    }
    case MODE.CANDLE: {
      // 2.0.0: Separate gives every pixel its own flame; Linked shares one flicker; the old board keeps its one/two seeds.
      const f = prefs.smoothCandle ? 0.3 : 1
      const hueBase = s.candleHue ?? prefs.candleHue
      return dots.map((_, i) => {
        const idx = caps.spin ? (s.separate ? i : 0) : s.separate && prefs.twoCandles ? (i < half ? 0 : half) : 0
        const target = 0.55 + 0.45 * noise(t * 9 * f, idx * 31 + 1) * (0.6 + 0.4 * noise(t * 2 * f, idx + 7))
        const hue = hueBase + 8 * noise(t * 3 * f, idx * 17 + 3)
        const [gh, gs, gv] = gammaHsv(hue, 0.95, bri * target)
        return { hue: gh, sat: gs, val: gv }
      })
    }
    case MODE.SPIN: {
      // A tail of 8 chasing round: brightest at the head, dying away behind, the rest dark.
      if (!caps.spin) return dots
      const step = (2 * Math.PI) / n
      const head = ((t / prefs.spinSeconds) * 2 * Math.PI) % (2 * Math.PI)
      const PROFILE = [1, 0.68, 0.47, 0.31, 0.2, 0.12, 0.06, 0.03]
      return dots.map((_, i) => {
        const behind = ((head - i * step) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
        const tailIdx = Math.round(behind / step)
        const [gh, gs, gv] = gammaHsv(s.hue, s.sat, bri * (tailIdx < PROFILE.length ? PROFILE[tailIdx] : 0))
        return { hue: gh, sat: gs, val: gv }
      })
    }
    default: {
      // sound, screen and Solar modes: the estimate, passed through the same colour maths
      const p = previewOf(c, t)
      const two = s.separate && caps.split
      return dots.map((_, i) => {
        const [h, sat, v] = i < half ? [p.hue, p.sat, p.val] : two ? [p.hue2, p.sat2, p.val2] : [p.hue, p.sat, p.val]
        const [gh, gs, gv] = gammaHsv(h, sat, v)
        return { hue: gh, sat: gs, val: gv }
      })
    }
  }
}
