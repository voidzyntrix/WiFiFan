// Audio and picture analysis for the sync modes, ported 1:1 from the Android app
// (MusicReactor, BeatFlash, SpectrumAnalyzer, TwoLedBeats, ScreenSyncService's colour maths).
// Samples here are floats in -1..1 (Android used 16-bit shorts; the maths is the same).

import { lerpHue, normHue, rgbToHsv } from '../led/color'

export const WINDOW_MS = 40

/** Turns loudness into a 0..1 level plus beat events (adaptive floor, auto gain, energy spikes). */
export class LevelAnalyzer {
  private floor = 0
  private envelope = 0
  private history = new Float32Array(25)
  private historyCount = 0
  private historyPos = 0
  private sinceBeatMs = 1e9

  process(buf: Float32Array, n: number, windowMs: number, sensitivity: number): [number, boolean] {
    if (n <= 0) return [0, false]
    let sum = 0, peak = 0
    for (let i = 0; i < n; i++) {
      const s = buf[i]
      sum += s * s
      peak = Math.max(peak, Math.abs(s))
    }
    const rms = Math.sqrt(sum / n)
    // Noise floor: drop to quiet moments at once, creep up slowly.
    this.floor = rms < this.floor || this.floor === 0 ? rms : this.floor + (rms - this.floor) * 0.002
    // Auto gain: loudest recent level, decaying over a few seconds.
    this.envelope = Math.max(rms, this.envelope * 0.995, this.floor + 0.002)
    const gain = 0.5 + 1.5 * sensitivity
    const norm = Math.min(1, Math.max(0, (rms - this.floor) / (this.envelope - this.floor)))
    // Peaks (drum hits) punch a little above the RMS level.
    const punch = Math.min(0.25, Math.max(0, (peak - rms) / (this.envelope * 4 + 1e-4)))
    const level = Math.min(1, Math.max(0, (norm + punch) * gain)) ** 0.8

    const energy = rms * rms
    let avg = energy
    if (this.historyCount > 0) {
      avg = 0
      for (let i = 0; i < this.historyCount; i++) avg += this.history[i]
      avg /= this.historyCount
    }
    this.history[this.historyPos] = energy
    this.historyPos = (this.historyPos + 1) % this.history.length
    if (this.historyCount < this.history.length) this.historyCount++
    this.sinceBeatMs += windowMs
    const threshold = 1.25 + (1 - sensitivity) * 0.8
    const beat = this.historyCount > 5 && energy > avg * threshold && rms > this.floor * 1.8 + 0.004 && this.sinceBeatMs >= 180
    if (beat) this.sinceBeatMs = 0
    return [Math.min(1, Math.max(0, level)), beat]
  }
}

/** A short brightness spike on each beat that fades out over [durationMs]. */
export class BeatFlash {
  private leftMs = 0
  constructor(private boost = 0.35, private durationMs = 150) {}
  apply(level: number, beat: boolean, windowMs: number, enabled: boolean): number {
    if (!enabled) { this.leftMs = 0; return Math.min(1, Math.max(0, level)) }
    this.leftMs = beat ? this.durationMs : Math.max(0, this.leftMs - windowMs)
    return Math.min(1, Math.max(0, level + (this.boost * this.leftMs) / this.durationMs))
  }
}

/** Separate LEDs in Music: each beat steps the hue and lands on the LEDs in turn. */
export class TwoLedBeats {
  hue1: number
  hue2: number
  private latest: number
  private next = 0
  constructor(start: number, private step = 47) {
    this.hue1 = normHue(start)
    this.hue2 = normHue(start + step)
    this.latest = this.hue2
  }
  /** Returns the LED (0 or 1) that got the new colour. */
  onBeat(): number {
    this.latest = normHue(this.latest + this.step)
    const led = this.next
    if (led === 0) this.hue1 = this.latest
    else this.hue2 = this.latest
    this.next = 1 - this.next
    return led
  }
}

/** Bass, mids and treble: Hann-windowed FFT, each band relative to its own recent peak. */
export class SpectrumAnalyzer {
  readonly size: number
  private re: Float64Array
  private im: Float64Array
  private hann: Float64Array
  private cosT: Float64Array
  private sinT: Float64Array
  private rev: Uint32Array
  private edges: number[]
  private peak = [3e-4, 3e-4, 3e-4]
  private smooth = [0, 0, 0]

  constructor(private sampleRate: number, size = 1024) {
    this.size = size
    this.re = new Float64Array(size)
    this.im = new Float64Array(size)
    this.hann = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)))
    this.cosT = Float64Array.from({ length: size / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / size))
    this.sinT = Float64Array.from({ length: size / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / size))
    const bits = Math.log2(size)
    this.rev = Uint32Array.from({ length: size }, (_, i) => {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      return r
    })
    const bin = (hz: number) => Math.min(size / 2 - 1, Math.max(1, Math.round((hz * size) / this.sampleRate)))
    this.edges = [bin(40), bin(250), bin(2500), bin(10000)]
  }

  process(buf: Float32Array, n: number): number[] {
    const { size, re, im } = this
    const count = Math.min(n, size)
    for (let i = 0; i < size; i++) {
      re[this.rev[i]] = i < count ? buf[i] * this.hann[i] : 0
      im[this.rev[i]] = 0
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len / 2, step = size / len
      for (let i = 0; i < size; i += len) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const wr = this.cosT[k], wi = this.sinT[k]
          const xr = re[j + half] * wr - im[j + half] * wi
          const xi = re[j + half] * wi + im[j + half] * wr
          re[j + half] = re[j] - xr
          im[j + half] = im[j] - xi
          re[j] += xr
          im[j] += xi
        }
      }
    }
    const scale = 4 / size
    const mags = [0, 0, 0]
    for (let b = 0; b < 3; b++) {
      const lo = this.edges[b], hi = Math.max(this.edges[b + 1], lo + 1)
      let p = 0
      for (let k = lo; k < hi; k++) p += re[k] * re[k] + im[k] * im[k]
      mags[b] = Math.sqrt(p / (hi - lo)) * scale
      this.peak[b] = Math.max(mags[b], this.peak[b] * 0.996, 3e-4)
    }
    // A band 40 dB below the loudest one is only window leakage: it stays dark.
    const loudest = Math.max(...this.peak)
    for (let b = 0; b < 3; b++) {
      const target = Math.min(1, Math.max(0, mags[b] / Math.max(this.peak[b], loudest * 0.01))) ** 1.5
      this.smooth[b] += (target - this.smooth[b]) * (target > this.smooth[b] ? 0.7 : 0.2)
    }
    return [...this.smooth]
  }
}

const BAND_HUES = [0, 120, 240]

/** Colour organ: bass red, mids green, treble blue, mixed by strength. Returns (hue, sat). */
export function bandColour(bands: number[], fallbackHue: number): [number, number] {
  let x = 0, y = 0, sum = 0
  for (let i = 0; i < 3; i++) {
    const w = bands[i] * bands[i]
    const a = (BAND_HUES[i] * Math.PI) / 180
    x += w * Math.cos(a)
    y += w * Math.sin(a)
    sum += w
  }
  if (sum < 1e-4) return [fallbackHue, 0.6]
  const hue = normHue((Math.atan2(y, x) * 180) / Math.PI)
  const coherence = Math.sqrt(x * x + y * y) / sum
  return [hue, Math.min(1, Math.max(0, 0.45 + 0.55 * coherence))]
}

/** Separate LEDs: LED1 the low end, LED2 the high end; returns (hue, sat, weight) each. */
export function twoLedBandColours(bands: number[], f1: number, f2: number): [number[], number[]] {
  const bass = bands[0], mid = bands[1] * 0.5, treble = bands[2]
  const c1 = bandColour([bass, mid, 0], f1)
  const c2 = bandColour([0, mid, treble], f2)
  return [
    [c1[0], c1[1], 0.3 + 0.7 * Math.min(1, Math.max(bass, mid))],
    [c2[0], c2[1], 0.3 + 0.7 * Math.min(1, Math.max(treble, mid))],
  ]
}

/**
 * Vibrant dominant colour of RGBA pixels (a column range of an image) as (hue, sat):
 * near-black and near-white pixels are ignored, saturated ones weigh more.
 */
export function dominantColour(px: Uint8ClampedArray, width: number, x0: number, x1: number): [number, number] {
  let cx = 0, cy = 0, wSum = 0, sSum = 0, count = 0
  const rows = px.length / 4 / width
  for (let y = 0; y < rows; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * 4
      const [h, s, v] = rgbToHsv(px[o], px[o + 1], px[o + 2])
      count++
      if (v < 0.12 || (s < 0.1 && v > 0.9)) continue
      const w = s * s * v + 1e-4
      const a = (h * Math.PI) / 180
      cx += Math.cos(a) * w
      cy += Math.sin(a) * w
      wSum += w
      sSum += s * w
    }
  }
  if (wSum <= count * 2e-4) return [0, 0]
  const hue = normHue((Math.atan2(cy, cx) * 180) / Math.PI)
  const coherence = Math.sqrt(cx * cx + cy * cy) / wSum
  return [hue, Math.min(1, Math.max(0, (sSum / wSum) * coherence * 1.15))]
}

/** Eases a screen colour in: small changes slowly, clear jumps (scene cuts) at once. */
export function smoothColour(prev: [number, number] | null, target: [number, number]): [number, number] {
  if (!prev) return target
  const a = (prev[0] * Math.PI) / 180, b = (target[0] * Math.PI) / 180
  const dx = target[1] * Math.cos(b) - prev[1] * Math.cos(a)
  const dy = target[1] * Math.sin(b) - prev[1] * Math.sin(a)
  const follow = Math.min(1, 0.4 + (0.6 * Math.sqrt(dx * dx + dy * dy)) / 0.45)
  return [lerpHue(prev[0], target[0], follow), prev[1] + (target[1] - prev[1]) * follow]
}
