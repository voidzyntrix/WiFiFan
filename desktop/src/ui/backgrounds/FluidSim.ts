// A water-like particle liquid: Position Based Fluids (Macklin & Müller 2013, "Position Based
// Fluids"). Each step predicts where the particles go, then solves a constant-density constraint
// a few times, so the liquid barely compresses (water is nearly incompressible); XSPH viscosity
// keeps the flow coherent without making it gloopy. Only overfull regions are pushed apart (no
// pull between sparse particles), so it splits into drops freely instead of clumping.
//
// Units: lengths in interaction radii (h = 1), time in seconds. The Android app still uses the
// older spring-like solver (FluidSim.kt), tuned for slow phones.

/** Starting gap between particles (radii): 4 particles per square radius at rest. */
const SPACING = 0.5
/** Constraint iterations per step: more = stiffer (less compressible). */
const ITERATIONS = 4
/** Constraint softening (PBF's epsilon): keeps the solve stable where particles are few. */
const RELAXATION = 0.6
/** XSPH viscosity: how much each particle takes on its neighbours' velocity. */
const XSPH = 0.04
/** A particle never moves further than this in one step (radii). */
const MAX_MOVE = 0.55
const WALL = 0.15
const MAX_NEIGHBOURS = 48

const POLY6 = 4 / Math.PI          // 2D poly6 normalisation for h = 1: W = POLY6 (1 - r²)³
const SPIKY = -30 / Math.PI        // 2D spiky gradient for h = 1: |∇W| = SPIKY (1 - r)²

export class FluidSim {
  readonly x: Float32Array
  readonly y: Float32Array
  readonly vx: Float32Array
  readonly vy: Float32Array
  private px: Float32Array
  private py: Float32Array
  private lambda: Float32Array
  private rho: Float32Array
  private dx: Float32Array
  private dy: Float32Array
  private nbr: Int32Array
  private nbrCount: Int32Array
  private cols: number
  private rows: number
  private cellStart: Int32Array
  private cellFill: Int32Array
  private cellItems: Int32Array
  private cellOf: Int32Array
  private rho0: number

  constructor(readonly width: number, readonly height: number, readonly count: number) {
    const n = count
    this.x = new Float32Array(n); this.y = new Float32Array(n)
    this.vx = new Float32Array(n); this.vy = new Float32Array(n)
    this.px = new Float32Array(n); this.py = new Float32Array(n)
    this.lambda = new Float32Array(n); this.rho = new Float32Array(n)
    this.dx = new Float32Array(n); this.dy = new Float32Array(n)
    this.nbr = new Int32Array(n * MAX_NEIGHBOURS)
    this.nbrCount = new Int32Array(n)
    this.cols = Math.floor(width) + 1
    this.rows = Math.floor(height) + 1
    this.cellStart = new Int32Array(this.cols * this.rows + 1)
    this.cellFill = new Int32Array(this.cols * this.rows + 1)
    this.cellItems = new Int32Array(n)
    this.cellOf = new Int32Array(n)
    // Rest density: what a particle inside the starting lattice feels.
    let rho0 = 0
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const r2 = (a * SPACING) ** 2 + (b * SPACING) ** 2
      if (r2 < 1) rho0 += POLY6 * (1 - r2) ** 3
    }
    this.rho0 = rho0
    // a block of liquid resting at the bottom, jittered so it settles naturally
    const perRow = Math.floor(width / SPACING)
    for (let i = 0; i < n; i++) {
      this.x[i] = SPACING * ((i % perRow) + 0.5) + jitter(i)
      this.y[i] = height - SPACING * (Math.floor(i / perRow) + 0.5) + jitter(i * 7 + 3)
    }
  }

  /** XSPH strength and an overall drag (per second): both make the liquid thicker. */
  viscosity = XSPH
  drag = 0

  /** One step of [dt] seconds; gx, gy: gravity in radii/s² (y down). */
  step(dt: number, gx: number, gy: number) {
    const { count, x, y, vx, vy, px, py } = this
    const maxV = MAX_MOVE / dt
    // predict
    for (let i = 0; i < count; i++) {
      let u = vx[i] + gx * dt, v = vy[i] + gy * dt
      const sp = Math.sqrt(u * u + v * v)
      if (sp > maxV) { u *= maxV / sp; v *= maxV / sp }
      vx[i] = u; vy[i] = v
      px[i] = x[i]; py[i] = y[i]
      x[i] = this.clampX(x[i] + u * dt, i)
      y[i] = this.clampY(y[i] + v * dt, i)
    }
    this.findNeighbours()
    for (let it = 0; it < ITERATIONS; it++) this.solveDensity()
    // velocities from the corrected positions, then XSPH viscosity
    for (let i = 0; i < count; i++) {
      vx[i] = (x[i] - px[i]) / dt
      vy[i] = (y[i] - py[i]) / dt
    }
    this.xsph()
    if (this.drag > 0) {
      const f = Math.exp(-this.drag * dt)
      for (let i = 0; i < count; i++) { vx[i] *= f; vy[i] *= f }
    }
  }

  private clampX(v: number, i: number) {
    const wall = WALL + (i % 16) * 0.005
    return v < wall ? wall : v > this.width - wall ? this.width - wall : v
  }
  private clampY(v: number, i: number) {
    const wall = WALL + (i % 16) * 0.005
    return v < wall ? wall : v > this.height - wall ? this.height - wall : v
  }

  /** Grid bucketing (counting sort), then a neighbour list per particle within one radius. */
  private findNeighbours() {
    const { cellStart, cellFill, cellItems, cellOf, cols, rows, count, x, y, nbr, nbrCount } = this
    cellStart.fill(0)
    for (let i = 0; i < count; i++) {
      const c = Math.min(rows - 1, Math.max(0, Math.floor(y[i]))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x[i])))
      cellOf[i] = c
      cellStart[c + 1]++
    }
    for (let c = 1; c <= cols * rows; c++) cellStart[c] += cellStart[c - 1]
    cellFill.set(cellStart)
    for (let i = 0; i < count; i++) cellItems[cellFill[cellOf[i]]++] = i
    for (let i = 0; i < count; i++) {
      const c = cellOf[i], cx = c % cols, cy = (c - cx) / cols
      const y0 = cy > 0 ? cy - 1 : 0, y1 = cy < rows - 1 ? cy + 1 : cy
      const x0 = cx > 0 ? cx - 1 : 0, x1 = cx < cols - 1 ? cx + 1 : cx
      let n = 0
      const base = i * MAX_NEIGHBOURS
      for (let ny = y0; ny <= y1 && n < MAX_NEIGHBOURS; ny++) for (let nx = x0; nx <= x1 && n < MAX_NEIGHBOURS; nx++) {
        const cell = ny * cols + nx
        for (let k = cellStart[cell], end = cellStart[cell + 1]; k < end && n < MAX_NEIGHBOURS; k++) {
          const j = cellItems[k]
          if (j === i) continue
          const dx = x[j] - x[i], dy = y[j] - y[i]
          if (dx * dx + dy * dy < 1) nbr[base + n++] = j
        }
      }
      nbrCount[i] = n
    }
  }

  /** One Jacobi pass of the density constraint C_i = ρ_i / ρ0 - 1 (only where C_i > 0). */
  private solveDensity() {
    const { count, x, y, nbr, nbrCount, lambda, rho, dx: ddx, dy: ddy, rho0 } = this
    const inv = 1 / rho0
    for (let i = 0; i < count; i++) {
      let density = POLY6           // itself
      let gix = 0, giy = 0, sum2 = 0
      const base = i * MAX_NEIGHBOURS
      for (let k = 0; k < nbrCount[i]; k++) {
        const j = nbr[base + k]
        const dx = x[i] - x[j], dy = y[i] - y[j]
        const r2 = dx * dx + dy * dy
        if (r2 >= 1) continue
        const q = 1 - r2
        density += POLY6 * q * q * q
        if (r2 > 1e-9) {
          const r = Math.sqrt(r2)
          const g = (SPIKY * (1 - r) * (1 - r)) / r * inv   // ∇W / ρ0, along (dx, dy)
          const gx = g * dx, gy = g * dy
          gix += gx; giy += gy
          sum2 += gx * gx + gy * gy
        }
      }
      rho[i] = density
      const c = density * inv - 1
      lambda[i] = c > 0 ? -c / (sum2 + gix * gix + giy * giy + RELAXATION) : 0
    }
    for (let i = 0; i < count; i++) {
      let sx = 0, sy = 0
      const base = i * MAX_NEIGHBOURS
      const li = lambda[i]
      for (let k = 0; k < nbrCount[i]; k++) {
        const j = nbr[base + k]
        const s = li + lambda[j]
        if (s === 0) continue
        const dx = x[i] - x[j], dy = y[i] - y[j]
        const r2 = dx * dx + dy * dy
        if (r2 >= 1 || r2 < 1e-9) continue
        const r = Math.sqrt(r2)
        const g = (SPIKY * (1 - r) * (1 - r)) / r * inv * s
        sx += g * dx; sy += g * dy
      }
      ddx[i] = sx; ddy[i] = sy
    }
    for (let i = 0; i < count; i++) {
      x[i] = this.clampX(x[i] + ddx[i], i)
      y[i] = this.clampY(y[i] + ddy[i], i)
    }
  }

  /** XSPH: each particle takes on a little of its neighbours' average velocity. */
  private xsph() {
    const { count, x, y, vx, vy, nbr, nbrCount, rho, dx: ax, dy: ay } = this
    for (let i = 0; i < count; i++) {
      let sx = 0, sy = 0
      const base = i * MAX_NEIGHBOURS
      for (let k = 0; k < nbrCount[i]; k++) {
        const j = nbr[base + k]
        const dx = x[i] - x[j], dy = y[i] - y[j]
        const r2 = dx * dx + dy * dy
        if (r2 >= 1) continue
        const q = 1 - r2
        const w = (POLY6 * q * q * q) / Math.max(rho[j], 1e-3)
        sx += (vx[j] - vx[i]) * w
        sy += (vy[j] - vy[i]) * w
      }
      ax[i] = sx; ay[i] = sy
    }
    for (let i = 0; i < count; i++) { vx[i] += this.viscosity * ax[i]; vy[i] += this.viscosity * ay[i] }
  }
}

function jitter(seed: number) {
  return ((Math.imul(seed, 1103515245) + 12345) >>> 16 & 0xff) / 255 * 0.1 - 0.05
}
