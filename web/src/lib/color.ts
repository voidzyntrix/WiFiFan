// Colour maths: HSV, colour temperature (the board drives the LED with linear PWM, no gamma),
// and version comparison. Ported from the Android app's LedColor.

export const KELVIN_MIN = 1800
export const KELVIN_MAX = 10000

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const normHue = (h: number) => ((h % 360) + 360) % 360

/** HSV (h degrees, s/v 0..1) to 8-bit RGB. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = normHue(h) / 60
  const i = Math.floor(hh) % 6
  const f = hh - Math.floor(hh)
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i]
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d !== 0) {
    if (mx === r) h = 60 * ((((g - b) / d) % 6 + 6) % 6)
    else if (mx === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  return [h, mx === 0 ? 0 : d / mx, mx / 255]
}

export function hexToHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgbToHsv((n >> 16) & 255, (n >> 8) & 255, n & 255)
}

export const rgbCss = ([r, g, b]: [number, number, number], a = 1) =>
  a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`
export const hsvCss = (h: number, s: number, v = 1, a = 1) => rgbCss(hsvToRgb(h, clamp(s, 0, 1), clamp(v, 0, 1)), a)
export const hexOf = (h: number, s: number) =>
  '#' + hsvToRgb(h, s, 1).map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()

/** The colour of an even linear gradient at a position 0..1. Works with the stops GradientBar
 *  actually ships ('#aabbcc', '#abc', 'rgb(255 0 0)'); 'var(…)' strings can't be read in JS. */
export function gradientAt(stops: string[], f: number): string | null {
  if (stops.length === 0) return null
  const parse = (c: string): [number, number, number] | null => {
    if (c.startsWith('#')) {
      const h = c.slice(1)
      const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    const m = c.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)\)$/)
    return m ? [+m[1], +m[2], +m[3]] : null
  }
  const t = clamp(f, 0, 1) * (stops.length - 1)
  const i = Math.min(Math.floor(t), stops.length - 2)
  const a = parse(stops[i]), b = parse(stops[Math.max(i + 1, 0)])
  if (!a || !b) return null
  const k = t - i
  return rgbCss(a.map((c, j) => Math.round(c + (b[j] - c) * k)) as [number, number, number])
}

/** Blackbody chromaticity (Kim et al. approximation, 1667-25000 K). */
function blackbodyXy(k: number): [number, number] {
  const x = k <= 4000
    ? -0.2661239e9 / (k * k * k) - 0.2343589e6 / (k * k) + 0.8776956e3 / k + 0.179910
    : -3.0258469e9 / (k * k * k) + 2.1070379e6 / (k * k) + 0.2226347e3 / k + 0.240390
  const y = k <= 2222 ? -1.1063814 * x ** 3 - 1.3481102 * x * x + 2.18555832 * x - 0.20219683
    : k <= 4000 ? -0.9549476 * x ** 3 - 1.37418593 * x * x + 2.09137015 * x - 0.16748867
      : 3.081758 * x ** 3 - 5.8733867 * x * x + 3.75112997 * x - 0.37001483
  return [x, y]
}

/** Linear sRGB of a blackbody, largest channel = 1. */
function kelvinLinear(kelvin: number): [number, number, number] {
  const [x, y] = blackbodyXy(kelvin)
  const bx = x / y, bz = (1 - x - y) / y
  const r = Math.max(0, 3.2404542 * bx - 1.5371385 - 0.4985314 * bz)
  const g = Math.max(0, -0.969266 * bx + 1.8760108 + 0.041556 * bz)
  const b = Math.max(0, 0.0556434 * bx - 0.2040259 + 1.0572252 * bz)
  const m = Math.max(r, g, b)
  return [r / m, g / m, b / m]
}

/** Hue (degrees) and saturation (0..1) for a colour temperature, at full brightness. */
export function kelvinToHueSat(kelvin: number): [number, number] {
  const [h, s] = rgbToHsv(...kelvinLinear(kelvin).map((c) => c * 255) as [number, number, number])
  return [h, s]
}

const encode = (c: number) => {
  const v = clamp(c, 0, 1)
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

/** What a colour temperature looks like on screen (for sliders and swatches). */
export function kelvinScreenColor(kelvin: number): string {
  const c = kelvinLinear(kelvin).map((v) => Math.round(encode(v) * 255)) as [number, number, number]
  return rgbCss(c)
}

/** Compares "1.2.3"-style versions numerically; missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x) || 0)
  const pb = b.split('.').map((x) => parseInt(x) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export const atLeast = (version: string | null | undefined, v: string) =>
  version != null && compareVersions(version, v) >= 0

/** Shortest-way hue blend. */
export function lerpHue(a: number, b: number, t: number) {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return normHue(a + d * t)
}
