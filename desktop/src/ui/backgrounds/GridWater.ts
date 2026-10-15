// The "Grid" fluid style: the very same particle fluid (FluidSim: same splashing, viscosity, mouse
// force, window sloshing), drawn on the grid instead of smoothly. Each cell of the grid is water or
// it is not: a cell is water when a particle is in it, or when the particles around it add up to a
// good share of a full cell; its outline (a thin bar along every side that meets air) is the bright
// tone and its body the dark one, as with the smooth fluid. Cells are exact squares that fit the
// window's height, the same grid the Cells net uses (gridSize.ts).

import type { FluidSim } from './FluidSim'
import { gridCell } from './gridSize'

/** A cell is water when the particles around it reach this share of a full cell. */
const FILL = 0.3

export class GridWater {
  private cols = 0
  private rows = 0
  private cell = 0
  private count = new Float32Array(0)
  private level = new Float32Array(0)   // 0..1 per cell, eased so cells at the edge don't flicker

  private fit(cell: number) {
    if (Math.abs(cell - this.cell) < 0.01 && this.count.length) return
    this.cell = cell
    this.cols = Math.ceil(window.innerWidth / cell)
    this.rows = Math.max(1, Math.round(window.innerHeight / cell))
    this.count = new Float32Array(this.cols * this.rows)
    this.level = new Float32Array(this.cols * this.rows)
  }

  /**
   * Draws the particles of [sim] as cells onto [g] (a canvas [scale] times larger than CSS px).
   * [unitPx] is CSS px per sim radius; [body] and [outline] are CSS colours.
   */
  frame(g: CanvasRenderingContext2D, dt: number, sim: FluidSim, unitPx: number, scale: number, resolution: number, body: string, outline: string) {
    this.fit(gridCell(resolution))
    const { cols, rows, count, level } = this
    const k = unitPx / this.cell                         // sim radii -> cells
    count.fill(0)
    for (let i = 0; i < sim.count; i++) {
      const cx = Math.floor(sim.x[i] * k), cy = Math.floor(sim.y[i] * k)
      if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) count[cy * cols + cx] += 1
    }
    // a full cell holds this many particles (about four per square radius)
    const full = Math.max(0.5, 4 / (k * k))
    const ease = 1 - Math.exp(-16 * dt)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        // the cell and its neighbours, weighted (the cell itself counts most)
        let near = count[i] * 2
        let w = 2
        if (x > 0) { near += count[i - 1]; w += 1 }
        if (x < cols - 1) { near += count[i + 1]; w += 1 }
        if (y > 0) { near += count[i - cols]; w += 1 }
        if (y < rows - 1) { near += count[i + cols]; w += 1 }
        const water = count[i] >= 1 || near / w >= FILL * full ? 1 : 0
        level[i] += (water - level[i]) * ease
      }
    }

    const cs = this.cell * scale
    const edge = Math.max(1.5 * scale, Math.min(cs * 0.18, 3 * scale))
    const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && level[y * cols + x] > 0.5
    g.save()
    g.fillStyle = body
    g.beginPath()
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (wet(x, y)) g.rect(x * cs, y * cs, cs + 0.5, cs + 0.5)
    g.fill()
    g.fillStyle = outline
    g.beginPath()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!wet(x, y)) continue
        if (!wet(x, y - 1)) g.rect(x * cs, y * cs, cs + 0.5, edge)
        if (!wet(x - 1, y)) g.rect(x * cs, y * cs, edge, cs + 0.5)
        if (!wet(x + 1, y)) g.rect(x * cs + cs - edge, y * cs, edge, cs + 0.5)
        if (y < rows - 1 && !wet(x, y + 1)) g.rect(x * cs, y * cs + cs - edge, cs + 0.5, edge)
      }
    }
    g.fill()
    g.restore()
  }
}
