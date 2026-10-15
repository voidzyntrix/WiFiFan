// The "Cells" style of the net behind the Particles and Fluid backgrounds: a grid of square cells
// that carries waves.
//  - Every cell has a height and a vertical speed; each step a cell is pulled towards the average
//    of its four neighbours (the wave equation), so a disturbance spreads out as rings and
//    bounces off the edges of the window. Stiffness is the wave speed. The heights are also
//    smoothed a little by their neighbours every step, so the field stays soft, not grainy.
//  - The fluid stirs it: wherever fluid arrives in a cell or leaves it (a slosh, a splash, a
//    shove) the cell is kicked, so the moving surface sends waves across the grid. And the waves
//    ride along with the fluid: inside it, the heights are carried by the fluid's own velocity.
//    The mouse does not touch the grid; it only moves the fluid.
// Cells are black where the grid is at rest. Where a wave passes, a cell glows by the direction
// the wave travels (the flow of its energy): red = left, blue = right, green = up, amber = down.
// The glow lingers and fades out slowly, and is averaged with the neighbouring cells so it comes
// out smooth. Faint lines show the grid itself.
// Units are CSS px and seconds; drawing scales to the canvas.

import type { FluidSim } from './FluidSim'
import { gridCell } from './gridSize'

/** Cell size in CSS px (bigger on very large windows so there are never more than about 3000). */
const CELL = 26
/** Wave speed in cells per second at the default stiffness. */
const SPEED = 30
/** How fast waves die out (per second). */
const DAMPING = 3.6
/** How much of the neighbours' average each cell takes on per step (smoothing). */
const SMOOTH = 0.12
/** A cell's change in fluid cover kicks its height by this much. */
const FLUID_KICK = 22
const STEP = 1 / 120
const LIMIT = 2
/** How long a glow lingers: its strength falls to a third in this many seconds. */
const LINGER = 1.8
/** The energy flow below which a cell stays black. */
const QUIET = 0.004
/** How strongly a wave lights a cell. */
const GAIN = 160

/** left, right, up, down */
const COLOURS: [number, number, number][] = [[255, 59, 59], [47, 107, 255], [47, 209, 107], [255, 204, 47]]

export class WaveGrid {
  private cols = 0
  private rows = 0
  private cell = CELL
  private h = new Float32Array(0)
  private v = new Float32Array(0)
  private tmpH = new Float32Array(0)
  private tmpV = new Float32Array(0)
  private flowX = new Float32Array(0)     // fluid velocity per cell, cells/s
  private flowY = new Float32Array(0)
  private count = new Float32Array(0)
  private cover = new Float32Array(0)     // 0..1, how much fluid is in a cell
  private lastCover = new Float32Array(0)
  private glow = new Float32Array(0)      // per cell: left, right, up, down (0..1), fading slowly
  private soft = new Float32Array(0)      // the glow averaged with the neighbours, for drawing
  private left = 0
  private seenFluid = false
  private resizeTimer = 0
  private readonly onResize: () => void

  constructor() {
    this.build()
    this.onResize = () => { window.clearTimeout(this.resizeTimer); this.resizeTimer = window.setTimeout(() => this.build(), 200) }
    window.addEventListener('resize', this.onResize)
  }

  dispose() {
    window.clearTimeout(this.resizeTimer)
    window.removeEventListener('resize', this.onResize)
  }

  private build(cell = this.cell) {
    const w = window.innerWidth, hgt = window.innerHeight
    this.cell = cell
    this.cols = Math.ceil(w / this.cell)
    this.rows = Math.max(1, Math.round(hgt / this.cell))
    const n = this.cols * this.rows
    for (const k of ['h', 'v', 'tmpH', 'tmpV', 'flowX', 'flowY', 'count', 'cover', 'lastCover'] as const) this[k] = new Float32Array(n)
    this.glow = new Float32Array(n * 4)
    this.soft = new Float32Array(n * 4)
    this.seenFluid = false
  }

  /** Reads the fluid: where it is (cover) and how it moves (flow), per cell. */
  private readFluid(sim: FluidSim, cellPx: number) {
    const { cols, rows, count, flowX, flowY, cover } = this
    count.fill(0); flowX.fill(0); flowY.fill(0)
    const k = cellPx / this.cell                     // sim radii -> cells
    for (let i = 0; i < sim.count; i++) {
      const cx = Math.floor(sim.x[i] * k), cy = Math.floor(sim.y[i] * k)
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue
      const j = cy * cols + cx
      count[j] += 1
      flowX[j] += sim.vx[i] * k
      flowY[j] += sim.vy[i] * k
    }
    for (let j = 0; j < cols * rows; j++) {
      const c = count[j]
      if (c > 0) { flowX[j] /= c; flowY[j] /= c }
      cover[j] = Math.min(1, c / 3)
    }
  }

  private step(dt: number, c2: number, hasFluid: boolean) {
    const { cols, rows, h, v, tmpH, tmpV, flowX, flowY, count } = this
    const n = cols * rows

    // the waves ride along with the fluid: inside it, heights and speeds are carried by its flow
    if (hasFluid) {
      const sample = (a: Float32Array, x: number, y: number) => {
        x = Math.min(cols - 1.001, Math.max(0, x)); y = Math.min(rows - 1.001, Math.max(0, y))
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
        const i = y0 * cols + x0
        return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + cols] * (1 - fx) + a[i + cols + 1] * fx) * fy
      }
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          if (count[i] > 0) {
            tmpH[i] = sample(h, x - flowX[i] * dt, y - flowY[i] * dt)
            tmpV[i] = sample(v, x - flowX[i] * dt, y - flowY[i] * dt)
          } else { tmpH[i] = h[i]; tmpV[i] = v[i] }
        }
      }
      h.set(tmpH); v.set(tmpV)
    }

    // the wave equation (edges reflect), with each height also drawn towards its neighbours' average
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const l = x > 0 ? h[i - 1] : h[i], r = x < cols - 1 ? h[i + 1] : h[i]
        const u = y > 0 ? h[i - cols] : h[i], d = y < rows - 1 ? h[i + cols] : h[i]
        v[i] += (c2 * (l + r + u + d - 4 * h[i]) - DAMPING * v[i]) * dt
        tmpH[i] = (l + r + u + d) * 0.25
      }
    }
    for (let i = 0; i < n; i++) {
      h[i] += v[i] * dt
      h[i] += (tmpH[i] - h[i]) * SMOOTH
      if (h[i] > LIMIT) { h[i] = LIMIT; v[i] = 0 } else if (h[i] < -LIMIT) { h[i] = -LIMIT; v[i] = 0 }
    }
  }

  /**
   * Advances by `dt` seconds and draws onto `g` (a canvas `scale` times larger than CSS px).
   * `fluid` is the liquid in the window, when there is one; without it the grid stays at rest.
   */
  frame(
    g: CanvasRenderingContext2D, dt: number, scale: number, color: string, stiffness: number, opacity: number,
    fluid?: { sim: FluidSim; cellPx: number }, resolution = 0.5,
  ) {
    const cell = gridCell(resolution)
    if (Math.abs(cell - this.cell) > 0.01) this.build(cell)
    const tension = 2 ** ((stiffness - 0.5) * 4)
    const speed = SPEED * Math.sqrt(tension)
    const c2 = speed * speed
    const k = opacity * 2
    const al = (a: number) => Math.min(1, a * k)

    if (fluid) {
      this.readFluid(fluid.sim, fluid.cellPx)
      // fluid arriving in a cell or leaving it kicks it
      const { cover, lastCover, v, cols, rows } = this
      for (let i = 0; i < cols * rows; i++) {
        const d = cover[i] - lastCover[i]
        if (Math.abs(d) > 0.03 && this.seenFluid) v[i] += d * FLUID_KICK     // (the first look is not an arrival; a pool at rest only shivers)
        lastCover[i] = cover[i]
      }
      this.seenFluid = true
    } else {
      this.count.fill(0)
    }

    this.left += Math.min(0.05, dt)
    while (this.left >= STEP) { this.step(STEP, c2, !!fluid); this.left -= STEP }

    const { cols, rows, h, v, glow, soft } = this
    const n = cols * rows

    // the glow: how strongly a wave travels in each direction now, kept while it fades slowly
    const keep = Math.exp(-dt / LINGER)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const dhdx = ((x < cols - 1 ? h[i + 1] : h[i]) - (x > 0 ? h[i - 1] : h[i])) * 0.5
        const dhdy = ((y < rows - 1 ? h[i + cols] : h[i]) - (y > 0 ? h[i - cols] : h[i])) * 0.5
        // the energy of a wave flows with -v * grad h (positive x = right, positive y = down)
        const fx = -v[i] * dhdx, fy = -v[i] * dhdy
        const light = (f: number) => 1 - Math.exp(-GAIN * Math.max(0, f - QUIET))     // (waves too small to see stay dark)
        const t0 = light(-fx), t1 = light(fx), t2 = light(-fy), t3 = light(fy)
        const o = i * 4
        glow[o] = Math.max(t0, glow[o] * keep)
        glow[o + 1] = Math.max(t1, glow[o + 1] * keep)
        glow[o + 2] = Math.max(t2, glow[o + 2] * keep)
        glow[o + 3] = Math.max(t3, glow[o + 3] * keep)
      }
    }
    // averaged with the neighbours, so it comes out smooth
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const o = (y * cols + x) * 4
        const l = x > 0 ? o - 4 : o, r = x < cols - 1 ? o + 4 : o, u = y > 0 ? o - cols * 4 : o, d = y < rows - 1 ? o + cols * 4 : o
        for (let c = 0; c < 4; c++) soft[o + c] = 0.4 * glow[o + c] + 0.15 * (glow[l + c] + glow[r + c] + glow[u + c] + glow[d + c])
      }
    }

    const cs = this.cell * scale
    g.save()
    g.lineWidth = Math.max(1, scale)
    const inset = Math.max(1, scale)
    const side = cs - inset * 2

    // black where nothing happens
    g.globalAlpha = al(0.55)
    g.fillStyle = '#000'
    g.beginPath()
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g.rect(x * cs + inset, y * cs + inset, side, side)
    g.fill()

    // coloured by the direction the waves go
    for (let i = 0; i < n; i++) {
      const o = i * 4
      const sum = soft[o] + soft[o + 1] + soft[o + 2] + soft[o + 3]
      if (sum < 0.01) continue
      let r = 0, gr = 0, b = 0
      for (let c = 0; c < 4; c++) { const w = soft[o + c]; r += COLOURS[c][0] * w; gr += COLOURS[c][1] * w; b += COLOURS[c][2] * w }
      g.globalAlpha = al(0.95 * Math.sqrt(Math.min(1, sum * 2.5)))
      g.fillStyle = `rgb(${Math.round(r / sum)} ${Math.round(gr / sum)} ${Math.round(b / sum)})`
      const x = i % cols, y = (i - x) / cols
      g.fillRect(x * cs + inset, y * cs + inset, side, side)
    }

    // the grid itself, faint
    g.globalAlpha = al(0.08)
    g.strokeStyle = color
    g.beginPath()
    for (let x = 0; x <= cols; x++) { g.moveTo(x * cs, 0); g.lineTo(x * cs, rows * cs) }
    for (let y = 0; y <= rows; y++) { g.moveTo(0, y * cs); g.lineTo(cols * cs, y * cs) }
    g.stroke()
    g.restore()
  }
}
