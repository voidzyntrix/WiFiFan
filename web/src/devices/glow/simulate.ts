// The LEDs as the board drives them, simulated on the phone with the firmware's own formulas: the hsv
// colour maths, each animation (breathe, rainbow, candle, noise), and the LED output encode — the 2.2
// gamma through firmware 2.1.5, colours as sent from 2.1.6 (the board stopped gamma-encoding).
// The animations run on this device's clock, so their timing starts at a different point from the board's;
// the colours at any moment follow the same rules. Modes that depend on live data (Solar, the sound and
// screen modes) keep the estimate in preview.ts, passed through the same colour maths.

import { kelvinToHueSat, rgbToHsv, hsvToRgb } from '../../lib/color'
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

/** The firmware's ledsWrite(): worlds per firmware — the gamma 2.2 encode through 2.1.5, then colours
 * as they are once 2.1.6 stopped encoding the output. */
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

/**
 * Music's one-LED-per-beat mode: wanted on a ring board that can stream pixels (2.1.0+)
 * with the setting on; the engine's whole-ring/heartbeat fallbacks apply otherwise.
 */
export const perLedMusic = (c: LedController) =>
  c.s.mode === MODE.MUSIC && c.ring && c.caps.perPixel && !c.twoLeds && c.prefs.musicPerPixel

function gammaHsv(h: number, sat: number, v: number, noGamma = false): [number, number, number] {
  if (noGamma) return [h, sat, v]          // 2.1.6: the colour reaches the LEDs unaltered — the input is the output
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
  // The board's output encode, per firmware: 2.1.5 and older gamma-encode, 2.1.6+ leave colours as sent.
  const ledsOut = (h: number, sat: number, v: number): Out =>
    (caps.noGamma ? hsvToRgb(h, sat, v) : gamma(hsvLin(h, sat, v))) as Out
  switch (s.mode) {
    case MODE.SOLID:
      return previewFrom(ledsOut(h1, sat1, bri), ledsOut(h2, sat2, bri))
    case MODE.BREATHE: {
      // LED 2 runs 0.6 rad behind LED 1 (firmware: ph * 0.6)
      const k = (ph: number) => 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 4 + ph * 0.6)
      return previewFrom(ledsOut(h1, sat1, bri * k(0)), ledsOut(two ? h2 : h1, two ? sat2 : sat1, bri * k(1)))
    }
    case MODE.RAINBOW: {
      // one full turn every rainbowSeconds; LED 2 sits 30 degrees further round (firmware: ph * 30)
      const hue = (ph: number) => (t / prefs.rainbowSeconds) * 360 + ph * 30
      return previewFrom(ledsOut(hue(0), s.sat, bri), ledsOut(hue(1), s.sat, bri))
    }
    case MODE.CANDLE: {
      // candle: the same flicker for both LEDs unless Separate with two candles (own seeds per LED)
      const f = prefs.smoothCandle ? 0.3 : 1
      const hueBase = s.candleHue ?? prefs.candleHue
      const candle = (idx: number) => {
        const target = 0.55 + 0.45 * noise(t * 9 * f, idx * 31 + 1) * (0.6 + 0.4 * noise(t * 2 * f, idx + 7))
        const hue = hueBase + 8 * noise(t * 3 * f, idx * 17 + 3)
        return ledsOut(hue, 0.95, bri * target)
      }
      const separateFlames = two && prefs.twoCandles
      return previewFrom(candle(0), separateFlames ? candle(1) : candle(0))
    }
    default: {
      // sound, screen and Solar modes: the estimate, passed through the same colour maths
      const p = previewOf(c, t)
      return previewFrom(ledsOut(p.hue, p.sat, p.val), ledsOut(p.hue2, p.sat2, p.val2))
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
    const [gh, gs, gv] = gammaHsv(h, sat, bri, caps.noGamma)
    return { hue: gh, sat: gs, val: gv }
  })
  // One-LED-per-beat music: the trail runs round the ring, every pixel lit as its own beat left it.
  if (perLedMusic(c)) {
    const { sync } = c
    const sat = c.prefs.musicKeepColour ? c.s.sat : 1
    return dots.map((_, i) => {
      const v = sync.pixelVals?.[i] ?? 0
      const h = sync.pixelHues?.[i] ?? s.hue
      const [gh, gs, gv] = gammaHsv(h, sat, bri * v, caps.noGamma)
      return { hue: gh, sat: gs, val: gv }
    })
  }
  switch (s.mode) {
    case MODE.SOLID:
      if (!ringInd) return dots          // Linked: the whole ring one colour
      return Array.from({ length: n }, (_, i) => {
        const px = s.ringPal[i]
        if (!px) return dots[i]
        const [h, sat] = px.kelvinMode ? kelvinToHueSat(px.kelvin) : [px.hue, px.sat]
        const [gh, gs, gv] = gammaHsv(h, sat, bri, caps.noGamma)
        return { hue: gh, sat: gs, val: gv }
      })
    case MODE.RAINBOW: {
      if (!caps.spin) {                  // pre-2.0 rainbow: all the pixels share one turning hue
        const hue = (t / prefs.rainbowSeconds) * 360
        return dots.map(() => { const [gh, gs, gv] = gammaHsv(hue, s.sat, bri, caps.noGamma); return { hue: gh, sat: gs, val: gv } })
      }
      // The wheel: the hues spread round the ring (24 pixels, 15 degrees apart) and turn once per T.
      return dots.map((_, i) => {
        const [gh, gs, gv] = gammaHsv(((t / prefs.rainbowSeconds) * 360 + i * (360 / n)) % 360, s.sat, bri, caps.noGamma)
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
        const [gh, gs, gv] = gammaHsv(h, sat, bri * k(ph), caps.noGamma)
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
        const [gh, gs, gv] = gammaHsv(hue, 0.95, bri * target, caps.noGamma)
        return { hue: gh, sat: gs, val: gv }
      })
    }
    case MODE.SPIN: {
      // The board's spinner: a flat arc (spinLength pixels, firmware 2.1.13's L, default
      // 8); the falloff (2.1.11) reaches spinRadius pixels, sharing of the ring on the
      // wire (2.1.15), fading out evenly, and its whole ramp burns at spinStrength (P,
      // 2.1.16). With spinFalloffFront (2.1.12) the leak mirrors into the LEDs ahead of
      // the head. Like the firmware, the leak is clamped when the arc is long so the two
      // never meet. The head's sub-pixel position keeps both ends moving smoothly between
      // pixels.
      if (!caps.spin) return dots
      const arc = Math.min(prefs.spinLength, n)           // the flat arc's length (firmware L)
      const cap = Math.max(0, (n - arc) / 2)              // like the firmware: keep the leaks apart
      const fall = Math.min(prefs.spinRadius, cap)        // the leak's reach, in pixels
      const strength = prefs.spinStrength / 100           // how bright the leak's ramp burns
      const head = ((t / prefs.spinSeconds) % 1) * n      // the head's position, in pixels
      return dots.map((_, i) => {
        const behind = (((head - i) % n) + n) % n         // how far behind the head, in pixels
        let v = 0
        if (behind < arc) v = 1                           // the arc itself, full brightness
        else if (fall > 0 && behind < arc + fall) {
          const x = (behind - arc) / fall                 // 0..1 into the falloff
          v = strength * (1 - x)                          // like the firmware: an even, step-by-step fade to black
        } else if (fall > 0 && prefs.spinFalloffFront && behind > n - fall) {
          const x = (n - behind) / fall                   // how far ahead of the head, 0..1 out of the falloff
          v = strength * (1 - x)                          // the mirror of the falloff behind
        }
        const [gh, gs, gv] = gammaHsv(s.hue, s.sat, bri * v, caps.noGamma)
        return { hue: gh, sat: gs, val: gv }
      })
    }
    default: {
      // sound, screen and Solar modes: the estimate, passed through the same colour maths
      const p = previewOf(c, t)
      // The sync engines stream one colour for the whole ring, unless the board is the
      // two-LED kind streaming its halves — the ring's own layout does not matter here.
      const two = c.twoLeds
      return dots.map((_, i) => {
        const [h, sat, v] = two ? (i < half ? [p.hue, p.sat, p.val] : [p.hue2, p.sat2, p.val2]) : [p.hue, p.sat, p.val]
        const [gh, gs, gv] = gammaHsv(h, sat, v, caps.noGamma)
        return { hue: gh, sat: gs, val: gv }
      })
    }
  }
}
