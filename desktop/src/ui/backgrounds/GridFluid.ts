// The "Grid" fluid: water made of cells. Every cell holds an amount of water (0 empty, 1 full); each
// step water falls into the cell below, spreads sideways to level out, and a cell that is
// squeezed lets the extra up again (a cell automaton, as in sandbox games). Drawn as cells: the
// body of the water in a dark tone and a thin outline along its surface and edges in the bright
// one, a partly filled cell showing as a block as tall as it is full.
//
// The pointer pushes water away from it (Ctrl: pulls it in) by handing a share of each nearby
// cell's water to the neighbouring cell on the far (near) side, within its reach.
//
// It exposes how much water is in each cell (`mass`) and how it moves (`flowX`, `flowY`, in cells
// per second), which the Cells net feeds on, so waves ride along on this fluid too.

import { gridCell } from './gridSize'

const MAX = 1
/** How much more than full a cell may hold when squeezed from above. */
const COMPRESS = 0.03
const MIN = 0.004
/** Transfers smaller than this are not movement (a pool at rest shuffles a little). */
const QUIET = 0.012
const STEP = 1 / 75
/** The share of the screen's height that is water at the start (as the particle fluid). */
const SHARE = 380 * 0.25 / (14 * 31)

/** How much water a cell below should hold for a column of [total] over two cells. */
function stableBelow(total: number) {
  if (total <= MAX) return MAX
  if (total < 2 * MAX + COMPRESS) return (MAX * MAX + total * COMPRESS) / (MAX + COMPRESS)
  return (total + COMPRESS) / 2
}

export interface Push {
  /** The pointer, CSS px. */
  x: number; y: number
  /** How far it reaches (CSS px) and how hard it pushes (share of a cell's water per second at the pointer). */
  reach: number; rate: number
  /** Ctrl: pull towards the pointer instead of pushing away. */
  pull: boolean
}

export class GridFluid {
  cols = 0
  rows = 0
  cell = 26
  mass = new Float32Array(0)
  flowX = new Float32Array(0)
  flowY = new Float32Array(0)
  private next = new Float32Array(0)
  private fluxX = new Float32Array(0)
  private fluxY = new Float32Array(0)
  private left = 0
  private resizeTimer = 0
  private readonly onResize: () => void

  constructor(cell: number) {
    this.build(cell)
    this.onResize = () => { window.clearTimeout(this.resizeTimer); this.resizeTimer = window.setTimeout(() => this.build(this.cell), 200) }
    window.addEventListener('resize', this.onResize)
  }

  dispose() {
    window.clearTimeout(this.resizeTimer)
    window.removeEventListener('resize', this.onResize)
  }

  /** (Re)lays the grid out for cells of [cell] px and fills the bottom with water. */
  build(cell: number) {
    this.cell = cell
    // (one more than fits, like the Cells net, so the two are the same grid)
    this.cols = Math.ceil(window.innerWidth / cell) + 1
    this.rows = Math.ceil(window.innerHeight / cell) + 1
    const n = this.cols * this.rows
    this.mass = new Float32Array(n)
    this.next = new Float32Array(n)
    this.flowX = new Float32Array(n)
    this.flowY = new Float32Array(n)
    this.fluxX = new Float32Array(n)
    this.fluxY = new Float32Array(n)
    const filled = Math.round(this.rows * SHARE)
    for (let y = this.rows - filled; y < this.rows; y++) for (let x = 0; x < this.cols; x++) this.mass[y * this.cols + x] = MAX
  }

  /** Follows the resolution slider: a different cell size starts the water over. */
  fit(resolution: number) {
    const cell = gridCell(resolution)
    if (Math.abs(cell - this.cell) > 0.01) this.build(cell)
  }

  private step(dt: number, push: Push | null) {
    const { cols, rows, mass: m, next, fluxX, fluxY } = this
    next.set(m)
    fluxX.fill(0); fluxY.fill(0)
    const add = (i: number, amount: number) => { next[i] += amount }

    // the pointer hands water to the cell on the far side (near side when pulling)
    if (push && push.rate > 0) {
      const sgn = push.pull ? -1 : 1
      const reach = push.reach
      const x0 = Math.max(0, Math.floor((push.x - reach) / this.cell)), x1 = Math.min(cols - 1, Math.ceil((push.x + reach) / this.cell))
      const y0 = Math.max(0, Math.floor((push.y - reach) / this.cell)), y1 = Math.min(rows - 1, Math.ceil((push.y + reach) / this.cell))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * cols + x
          if (m[i] < MIN) continue
          const dx = (x + 0.5) * this.cell - push.x, dy = (y + 0.5) * this.cell - push.y
          const d = Math.hypot(dx, dy)
          if (d >= reach || d < this.cell * 0.5) continue
          const f = 1 - d / reach
          const share = Math.min(0.6, push.rate * f * f * dt)
          const ax = Math.abs(dx), ay = Math.abs(dy), tot = ax + ay || 1
          const mx = m[i] * share * (ax / tot), my = m[i] * share * (ay / tot)
          const sx = Math.sign(dx) * sgn, sy = Math.sign(dy) * sgn
          if (mx > 0 && sx !== 0 && x + sx >= 0 && x + sx < cols) { add(i, -mx); add(i + sx, mx); fluxX[i] += sx * mx }
          if (my > 0 && sy !== 0 && y + sy >= 0 && y + sy < rows) { add(i, -my); add(i + sy * cols, my); fluxY[i] += sy * my }
        }
      }
      m.set(next)
    }

    // water falls, spreads and (when squeezed) rises; from the bottom up
    next.set(m)
    for (let y = rows - 1; y >= 0; y--) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        let rest = m[i]
        if (rest < MIN) continue
        // down
        if (y < rows - 1) {
          const b = i + cols
          let flow = stableBelow(rest + m[b]) - m[b]
          flow = Math.min(Math.max(flow, 0), Math.min(1, rest))
          if (flow > 0) { next[i] -= flow; next[b] += flow; rest -= flow; if (flow > QUIET) fluxY[i] += flow }
        }
        // sideways: level out with the neighbours that hold less
        if (rest >= MIN && x > 0 && m[i - 1] < rest) {
          const flow = Math.min(Math.max((rest - m[i - 1]) / 4, 0), rest)
          if (flow > 0) { next[i] -= flow; next[i - 1] += flow; rest -= flow; if (flow > QUIET) fluxX[i] -= flow }
        }
        if (rest >= MIN && x < cols - 1 && m[i + 1] < rest) {
          const flow = Math.min(Math.max((rest - m[i + 1]) / 4, 0), rest)
          if (flow > 0) { next[i] -= flow; next[i + 1] += flow; rest -= flow; if (flow > QUIET) fluxX[i] += flow }
        }
        // up: only what does not fit
        if (rest >= MIN && y > 0) {
          const a = i - cols
          let flow = rest - stableBelow(rest + m[a])
          flow = Math.min(Math.max(flow, 0), Math.min(1, rest))
          if (flow > 0) { next[i] -= flow; next[a] += flow; rest -= flow; if (flow > QUIET) fluxY[i] -= flow }
        }
      }
    }
    m.set(next)
    for (let i = 0; i < cols * rows; i++) if (m[i] < MIN) m[i] = 0

    // how it moves, smoothed (cells per second)
    for (let i = 0; i < cols * rows; i++) {
      const w = Math.max(m[i], 0.25)
      this.flowX[i] += (fluxX[i] / dt / w - this.flowX[i]) * 0.3
      this.flowY[i] += (fluxY[i] / dt / w - this.flowY[i]) * 0.3
    }
  }

  frame(dt: number, push: Push | null) {
    this.left += Math.min(0.05, dt)
    while (this.left >= STEP) { this.step(STEP, push); this.left -= STEP }
  }

  /** Draws the water onto [g] (a canvas [scale] times larger than CSS px): [body] and [outline] are CSS colours. */
  draw(g: CanvasRenderingContext2D, scale: number, body: string, outline: string) {
    const { cols, rows, mass: m } = this
    const cs = this.cell * scale
    const edge = Math.max(1.5 * scale, Math.min(cs * 0.18, 3 * scale))
    const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && m[y * cols + x] >= 0.05
    g.save()
    g.fillStyle = body
    g.beginPath()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const a = m[y * cols + x]
        if (a < 0.05) continue
        // a cell with water above it is full to the top; otherwise it is as tall as it is full
        const h = wet(x, y - 1) || a >= MAX ? cs : cs * Math.min(1, a)
        g.rect(x * cs, y * cs + (cs - h), cs + 0.5, h + 0.5)
      }
    }
    g.fill()
    g.fillStyle = outline
    g.beginPath()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const a = m[y * cols + x]
        if (a < 0.05) continue
        const full = wet(x, y - 1) || a >= MAX
        const h = full ? cs : cs * Math.min(1, a)
        const top = y * cs + (cs - h)
        if (!wet(x, y - 1)) g.rect(x * cs, top, cs + 0.5, edge)                       // the surface
        if (!wet(x - 1, y)) g.rect(x * cs, top, edge, h)                               // left edge
        if (!wet(x + 1, y)) g.rect(x * cs + cs - edge, top, edge, h)                   // right edge
        if (y < rows - 1 && !wet(x, y + 1)) g.rect(x * cs, y * cs + cs - edge, cs, edge)   // underneath
      }
    }
    g.fill()
    g.restore()
  }
}
