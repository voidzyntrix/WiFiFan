// Audio and picture analysis for the sync modes, ported 1:1 from the Android app
// (MusicReactor, BeatFlash, SpectrumAnalyzer, TwoLedBeats, ScreenSyncService's colour maths).
// Samples here are floats in -1..1 (Android used 16-bit shorts; the maths is the same).

import { lerpHue, normHue, rgbToHsv } from '../../lib/color'

export const WINDOW_MS = 40

/** Turns loudness into a 0..1 level, plus note and beat events (adaptive floor, auto gain,
 *  energy spikes). Two gates: a note is any clear onset - at least 100 ms apart, so rolls
 *  and hi-hat runs all register; a beat must punch through the last second measured
 *  against its MEDIAN (a mean keeps drifting up behind a drum-heavy passage and eats the
 *  next hits with it), rise sharply - a swell never looks like a hit - and lean on the
 *  low band, which kicks and bass own. A candidate is finally the music's BEAT only where
 *  it can keep time: TempoTracker holds the candidates against the pulse their intervals
 *  agree on, so hats, wobbles and stray loud notes light pixels but don't claim beats. */
export class LevelAnalyzer {
  private floor = 0
  private envelope = 0
  private history = new Float32Array(25)   // the last second of window energies
  private scratch = new Float32Array(25)   // a sorted copy, for the median
  private historyCount = 0
  private historyPos = 0
  private sinceNoteMs = 1e9
  private clock = 0                        // the analyzer's own ms since it started
  private lastCandidate = -1e9             // when the last beat candidate passed (retracked
                                           // candidates must keep their own 280 ms gap)
  private lp = 0                           // low band: one-pole lowpass state, ~70 Hz at 48 kHz
  private prevBassE = 0                    // the low band's energy one window back
  private tempo = new TempoTracker()

  process(buf: Float32Array, n: number, windowMs: number, sensitivity: number): [number, boolean, boolean] {
    if (n <= 0) return [0, false, false]
    let sum = 0, peak = 0
    let lpSum = 0
    for (let i = 0; i < n; i++) {
      const s = buf[i]
      sum += s * s
      peak = Math.max(peak, Math.abs(s))
      this.lp += 0.0095 * (s - this.lp) // ~70 Hz one-pole at 48 kHz: the band kicks and bass own
      lpSum += this.lp * this.lp
    }
    const rms = Math.sqrt(sum / n)
    const lpRms = Math.sqrt(lpSum / n)
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
    // The energies of the last second, of the last ~240 ms, of the window before this one
    // and (sorted) the middle of the last second. The history is a ring: entry k back from
    // historyPos is the k-th most recent.
    let median = energy, shortAvg = energy, prev = energy
    if (this.historyCount > 0) {
      const back = (k: number) => this.history[(this.historyPos + this.history.length - 1 - k) % this.history.length]
      median = 0
      for (let k = 0; k < this.historyCount; k++) this.scratch[k] = back(k)
      const sorted = this.scratch.slice(0, this.historyCount).sort()
      const half = sorted.length / 2
      median = sorted.length % 2 ? sorted[half | 0] : (sorted[half - 1] + sorted[half]) / 2
      const shortCount = Math.min(this.historyCount, 6)
      shortAvg = 0
      for (let k = 0; k < shortCount; k++) shortAvg += back(k)
      shortAvg /= shortCount
      prev = back(0)
    }
    this.history[this.historyPos] = energy
    this.historyPos = (this.historyPos + 1) % this.history.length
    if (this.historyCount < this.history.length) this.historyCount++
    this.sinceNoteMs += windowMs
    this.clock += windowMs

    // A note: the window's energy clearly above the nearest ~240 ms (a slower average keeps
    // pace with a run and eats it - at 16ths, ~107 ms apart, a note is still 2x its silence)
    // or a sharp leap from the window before (the run has already pushed the short average).
    // Notes get out of each other's way at 100 ms; nothing above floor*1.6+0.003 is silence.
    const noteFactor = 1.12 + (1 - sensitivity) * 0.28
    const note = this.historyCount > 3
      && rms > this.floor * 1.6 + 0.003
      && (energy > shortAvg * noteFactor || energy > prev * 1.6)
      && this.sinceNoteMs >= 100
    if (note) this.sinceNoteMs = 0

    // A beat candidate. The test is the LOW band - kicks, bass and the body of snares
    // live there; hats, vocals and tremolo wobbles are highs, and no shine on top makes
    // them a beat. A real hit makes that band LEAP between windows (a 40 ms window next
    // to a kick carries multiples of the one before); a swell or an amplitude wobble only
    // drifts, however deep it eventually gets. On top of the leap there are two ways in:
    //  - the main spike: it stands out of the whole last second, measured against its
    //    MEDIAN (a mean keeps drifting up behind a drum-heavy passage and eats the next
    //    hits with it), and spiked against the window just gone or the nearest ~240 ms -
    //    so a slow buildup never qualifies however loud it gets.
    //  - the crushed-master escape: loud masters squash level differences, so a kick can
    //    barely dent the top line - but the low band still leaps, by more, above a real
    //    share of the window's energy.
    // Candidates keep at least 280 ms apart ON THEIR OWN, measured at their own hit: a
    // tail window must not shadow the hit it fell off of, and a leading bass note must
    // not push the drum behind it out of the ledger. No music carries beats faster than
    // 200 a minute.
    const beatFactor = 1.3 + (1 - sensitivity) * 0.7
    const bassE = lpRms * lpRms
    const candidate = this.historyCount > 8
      && rms > this.floor * 1.8 + 0.004
      && this.clock - this.lastCandidate >= 280
      && bassE > this.prevBassE * 1.6
      && ((energy > median * beatFactor && (energy > prev * 1.35 || energy > shortAvg * 1.4))
        || (bassE > this.prevBassE * 1.9 && bassE > 0.25 * energy && energy > median * 1.15))
    if (candidate) this.lastCandidate = this.clock
    this.prevBassE = bassE
    const beat = this.tempo.gate(this.clock, candidate)
    return [Math.min(1, Math.max(0, level)), note, beat]
  }
}

/** Music keeps a pulse; a random loud moment does not. The tracker keeps the beat
 *  candidates (the level gates already filtered them), folds their intervals by halves
 *  into a plausible pace, and once three of them agree the pulse is locked: from then on
 *  a candidate only fires the beat when it lands on the expected tick. Until a pulse
 *  holds, nothing flashes - a beat is a kept pulse, and flashing on the road to one is
 *  exactly the wobble-spam the tracker exists to stop. If the tick goes unlanded for over
 *  two and a half cycles, the lock drops and the tracker keeps listening. Two candidates in a row off
 *  the tick re-adopt the loop where it moved to. */
export class TempoTracker {
  private candidates: number[] = []       // recent candidate times, oldest first
  private period = 0                      // the learned beat period in ms (0 = no lock)
  private lastBeat = -1e9                 // when the last beat fired
  private lastOff = -1e9                  // the off-pulse candidate being watched

  /** Is this candidate (at `clock` ms on a monotonous clock) the beat? */
  gate(clock: number, candidate: boolean): boolean {
    if (!candidate) return false
    if (!this.period) {                    // no pulse learned yet: keep listening - a beat
      this.remember(clock)                 // is a kept pulse, so nothing flashes until
      this.tryToLock(clock)                // the candidates agree on one
      return false
    }
    // How far is this candidate from the nearest expected tick (lastBeat + k*period)?
    let off = (clock - this.lastBeat) % this.period
    if (off > this.period / 2) off -= this.period
    if (Math.abs(off) <= this.period * 0.28) {
      // On the tick: keep the phase, ease the period along with the real interval,
      // and clear the doubts.
      const steps = Math.max(1, Math.round((clock - this.lastBeat) / this.period))
      this.period = 0.75 * this.period + 0.25 * ((clock - this.lastBeat) / steps)
      this.lastBeat = clock
      this.lastOff = -1e9
      return true
    }
    // Off the tick: not the beat (a hat, a wobble, a stray hit). Two in a row say the
    // music moved: re-adopt their loop. And a pulse nobody lands on for over two and a
    // half cycles is gone: drop the lock and keep listening.
    if (clock - this.lastBeat > 2.6 * this.period) {
      this.period = 0
      this.candidates = []
      this.lastOff = -1e9
      return false
    }
    if (this.lastOff > clock - 2 * this.period) {
      let pace = clock - this.lastOff
      while (pace > 1050) pace /= 2
      if (pace >= 300) {
        // The music moved: this hit is the beat again, timed from the other one.
        this.period = 0.5 * this.period + 0.5 * pace
        this.lastBeat = clock
        this.lastOff = -1e9
        return true
      }
    }
    this.lastOff = clock
    return false
  }

  private remember(clock: number) {
    this.candidates.push(clock)
    if (this.candidates.length > 8) this.candidates.shift()
  }

  /** The candidates' back-to-back intervals vote for the pace between them (skips would
   *  inflate multiples: over seven steady kicks, the skip-two intervals of the double
   *  period outvote the true one). When at least three of the recent intervals sit
   *  within 10% of their median, their mean locks the pulse. Intervals fold by halves
   *  into [300, 1050] ms - 57 to 200 BPM: faster periodicities are runs and wobbles,
   *  not beats, and must never lock (the flash would ride them instead of the music). */
  private tryToLock(clock: number) {
    const paces: number[] = []
    for (let i = 0; i + 1 < this.candidates.length; i++) {
      let pace = this.candidates[i + 1] - this.candidates[i]
      while (pace > 1050) pace /= 2
      if (pace >= 300) paces.push(pace)
    }
    if (paces.length < 3) return
    paces.sort((a, b) => a - b)
    const med = paces[paces.length >> 1]
    const near = paces.filter(p => Math.abs(p - med) <= 0.1 * med)
    if (near.length >= 3) {
      this.period = near.reduce((s, p) => s + p, 0) / near.length
      this.lastBeat = clock
    }
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

/** Colour organ: bass red, mids green, treble blue, mixed by strength into a hue.
 *  Saturation was once mixed too (0.45 + 0.55*coherence) - with music's energy spread
 *  over bands that sat below ~0.8 and most colours came out washed out; it is always
 *  full now (2.13.82), the band mix only decides WHERE on the wheel the colour sits. */
export function bandColour(bands: number[], fallbackHue: number): [number, number] {
  let x = 0, y = 0, sum = 0
  for (let i = 0; i < 3; i++) {
    const w = bands[i] * bands[i]
    const a = (BAND_HUES[i] * Math.PI) / 180
    x += w * Math.cos(a)
    y += w * Math.sin(a)
    sum += w
  }
  if (sum < 1e-4) return [fallbackHue, 1]           /* silence: the picked hue, full sat */
  return [normHue((Math.atan2(y, x) * 180) / Math.PI), 1]
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
