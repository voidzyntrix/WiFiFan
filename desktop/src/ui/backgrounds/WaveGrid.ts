// The "Cells" style of the net behind the Particles and Fluid backgrounds: a grid of square cells
// that carries waves.
//  - Every cell has a height and a vertical speed; each step a cell is pulled towards the average
//    of its four neighbours (the wave equation), so a disturbance spreads out as rings and
//    bounces off the edges of the window. Stiffness is the wave speed.
//  - The mouse presses the grid down where it points (Ctrl: lifts it up), so moving it draws a
//    wake and a held pointer keeps a dent that sends rings outwards.
//  - The fluid stirs it: wherever fluid arrives in a cell or leaves it (a slosh, a splash, a
//    pointer shoving it about) the cell is kicked, so the moving surface sends waves across the
//    grid. And the waves ride along with the fluid: inside it, the heights are carried by the
//    fluid's own velocity.
// Cells are black where the grid is at rest. Where a wave passes, a cell glows red if the wave is
// travelling to the left and blue if it is travelling to the right (the sideways flow of the
// wave's energy), brighter the stronger the wave; faint lines show the grid itself.
// Units are CSS px and seconds; drawing scales to the canvas.

import type { FluidSim } from './FluidSim'

/** Cell size in CSS px (bigger on very large windows so there are never more than about 3000). */
const CELL = 26
/** Wave speed in cells per second at the default stiffness. */
const SPEED = 30
/** How fast waves die out (per second). */
const DAMPING = 3.6
/** The mouse's reach in cells, and its push (height-speed per second at the middle). */
const REACH = 5
const MOUSE_KICK = 70
/** A cell's change in fluid cover kicks its height by this much. */
const FLUID_KICK = 6
const STEP = 1 / 120
const LIMIT = 2

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
  private mouse = { x: -1e4, y: -1e4 }
  private pull = false
  private left = 0
  private seenFluid = false
  private resizeTimer = 0
  private readonly onMove: (e: PointerEvent) => void
  private readonly onLeave: () => void
  private readonly onKey: (e: KeyboardEvent) => void
  private readonly onBlur: () => void
  private readonly onResize: () => void

  constructor() {
    this.build()
    this.onMove = (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.pull = e.ctrlKey }
    this.onLeave = () => { this.mouse.x = this.mouse.y = -1e4 }
    this.onKey = (e) => { if (e.key === 'Control') this.pull = e.type === 'keydown' }
    this.onBlur = () => { this.pull = false; this.onLeave() }
    this.onResize = () => { window.clearTimeout(this.resizeTimer); this.resizeTimer = window.setTimeout(() => this.build(), 200) }
    window.addEventListener('pointermove', this.onMove)
    document.addEventListener('pointerleave', this.onLeave)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('resize', this.onResize)
  }

  dispose() {
    window.clearTimeout(this.resizeTimer)
    window.removeEventListener('pointermove', this.onMove)
    document.removeEventListener('pointerleave', this.onLeave)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('resize', this.onResize)
  }

  private build() {
    const w = window.innerWidth, hgt = window.innerHeight
    this.cell = Math.max(CELL, Math.sqrt((w * hgt) / 3000))
    this.cols = Math.ceil(w / this.cell) + 1
    this.rows = Math.ceil(hgt / this.cell) + 1
    const n = this.cols * this.rows
    for (const k of ['h', 'v', 'tmpH', 'tmpV', 'flowX', 'flowY', 'count', 'cover', 'lastCover'] as const) this[k] = new Float32Array(n)
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

  private step(dt: number, c2: number, mouseKick: number, hasFluid: boolean) {
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

    // the wave equation (edges reflect)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const l = x > 0 ? h[i - 1] : h[i], r = x < cols - 1 ? h[i + 1] : h[i]
        const u = y > 0 ? h[i - cols] : h[i], d = y < rows - 1 ? h[i + cols] : h[i]
        v[i] += (c2 * (l + r + u + d - 4 * h[i]) - DAMPING * v[i]) * dt
      }
    }

    // the mouse presses the grid down (Ctrl: up)
    const m = this.mouse
    if (m.x > -1e3 && mouseKick > 0) {
      const mx = m.x / this.cell, my = m.y / this.cell
      const x0 = Math.max(0, Math.floor(mx - REACH)), x1 = Math.min(cols - 1, Math.ceil(mx + REACH))
      const y0 = Math.max(0, Math.floor(my - REACH)), y1 = Math.min(rows - 1, Math.ceil(my + REACH))
      const sgn = this.pull ? 1 : -1
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my)
          if (d >= REACH) continue
          const f = 1 - d / REACH
          v[y * cols + x] += sgn * mouseKick * f * f * dt
        }
      }
    }

    for (let i = 0; i < n; i++) {
      h[i] += v[i] * dt
      if (h[i] > LIMIT) { h[i] = LIMIT; v[i] = 0 } else if (h[i] < -LIMIT) { h[i] = -LIMIT; v[i] = 0 }
    }
  }

  /**
   * Advances by `dt` seconds and draws onto `g` (a canvas `scale` times larger than CSS px).
   * `fluid` is the liquid in the window, when there is one; `mouse` scales the pointer's push.
   */
  frame(
    g: CanvasRenderingContext2D, dt: number, scale: number, color: string, stiffness: number, opacity: number,
    mouse: number, fluid?: { sim: FluidSim; cellPx: number },
  ) {
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
        if (d !== 0 && this.seenFluid) v[i] += d * FLUID_KICK     // (the first look is not an arrival)
        lastCover[i] = cover[i]
      }
      this.seenFluid = true
    } else {
      this.count.fill(0)
    }

    this.left += Math.min(0.05, dt)
    while (this.left >= STEP) { this.step(STEP, c2, MOUSE_KICK * mouse, !!fluid); this.left -= STEP }

    const { cols, rows, h, v } = this
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

    // red: a wave going left, blue: a wave going right. The energy of a wave flows with -v * dh/dx.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const dhdx = ((x < cols - 1 ? h[i + 1] : h[i]) - (x > 0 ? h[i - 1] : h[i])) * 0.5
        const flow = -v[i] * dhdx
        const m = Math.abs(flow)
        if (m < 0.002) continue
        g.globalAlpha = al(0.9 * (1 - Math.exp(-14 * m)))
        g.fillStyle = flow > 0 ? '#2f6bff' : '#ff3b3b'
        g.fillRect(x * cs + inset, y * cs + inset, side, side)
      }
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
