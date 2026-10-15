// A net of dots behind the UI (Particles and Fluid backgrounds). It is a small spring mesh:
//  - every dot sits on a grid and is held to its place by a weak spring,
//  - every dot is tied to its neighbours (sides and diagonals) by springs that only care how far
//    the two have moved relative to each other, so pushing one drags the next, which drags the
//    next: the movement travels through the net as a wave and rings out,
//  - the mouse pushes dots away from it (strongest close by) and carries them along with its
//    movement.
// Lines join each dot to its right and lower neighbour; they light up where the net is stretched.
// Units are CSS px and seconds; drawing scales to the canvas.

/** Gap between dots, CSS px. */
const SPACING = 60
/** Pull back to the home place, per second² per px. */
const HOME = 7
/** Pull between side / diagonal neighbours, per second² per px of relative movement. */
const SIDE = 140
const DIAG = 45
/** How quickly motion dies out (per second). */
const DAMPING = 3.2
/** The mouse reaches this far (px), pushing this hard (px/s²) at its centre. */
const REACH = 150
const PUSH = 14000
/** How much of the mouse's own movement the dots near it take along. */
const CARRY = 0.5
/** Fixed physics step (s). */
const STEP = 1 / 120

export class DotNet {
  private cols = 0
  private rows = 0
  private rx = new Float32Array(0)   // home places
  private ry = new Float32Array(0)
  private ux = new Float32Array(0)   // how far each dot is from home
  private uy = new Float32Array(0)
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private ax = new Float32Array(0)
  private ay = new Float32Array(0)
  private mouse = { x: -1e4, y: -1e4, vx: 0, vy: 0 }
  private left = 0
  /** Multiplies every spring (and damping by its square root): 1 is the default feel. */
  private tension = 1
  private resizeTimer = 0
  private readonly onMove: (e: PointerEvent) => void
  private readonly onLeave: () => void
  private readonly onResize: () => void

  constructor() {
    this.build()
    let last = { x: NaN, y: 0, t: 0 }
    this.onMove = (e) => {
      const now = performance.now()
      const m = this.mouse
      if (!Number.isNaN(last.x) && now - last.t < 100) {
        const dt = Math.max(0.004, (now - last.t) / 1000)
        // smoothed velocity of the pointer, px/s
        m.vx = m.vx * 0.5 + ((e.clientX - last.x) / dt) * 0.5
        m.vy = m.vy * 0.5 + ((e.clientY - last.y) / dt) * 0.5
      }
      last = { x: e.clientX, y: e.clientY, t: now }
      m.x = e.clientX; m.y = e.clientY
    }
    this.onLeave = () => { this.mouse.x = -1e4; this.mouse.y = -1e4; this.mouse.vx = this.mouse.vy = 0; last = { x: NaN, y: 0, t: 0 } }
    this.onResize = () => { window.clearTimeout(this.resizeTimer); this.resizeTimer = window.setTimeout(() => this.build(), 200) }
    window.addEventListener('pointermove', this.onMove)
    document.addEventListener('pointerleave', this.onLeave)
    window.addEventListener('blur', this.onLeave)
    window.addEventListener('resize', this.onResize)
  }

  dispose() {
    window.clearTimeout(this.resizeTimer)
    window.removeEventListener('pointermove', this.onMove)
    document.removeEventListener('pointerleave', this.onLeave)
    window.removeEventListener('blur', this.onLeave)
    window.removeEventListener('resize', this.onResize)
  }

  /** Lays the dots out over the window, with a margin so the net runs off every edge. */
  private build() {
    const w = window.innerWidth, h = window.innerHeight
    const sp = Math.max(SPACING, Math.sqrt((w * h) / 1800))   // never more than about 1800 dots
    this.cols = Math.ceil(w / sp) + 3
    this.rows = Math.ceil(h / sp) + 3
    const n = this.cols * this.rows
    this.rx = new Float32Array(n); this.ry = new Float32Array(n)
    this.ux = new Float32Array(n); this.uy = new Float32Array(n)
    this.vx = new Float32Array(n); this.vy = new Float32Array(n)
    this.ax = new Float32Array(n); this.ay = new Float32Array(n)
    const x0 = (w - (this.cols - 1) * sp) / 2, y0 = (h - (this.rows - 1) * sp) / 2
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        this.rx[j * this.cols + i] = x0 + i * sp
        this.ry[j * this.cols + i] = y0 + j * sp
      }
    }
  }

  private step(dt: number) {
    const { cols, rows, ux, uy, vx, vy, ax, ay } = this
    const n = cols * rows
    const T = this.tension, home = HOME * T, side = SIDE * T, diag = DIAG * T, damp = DAMPING * Math.sqrt(T)
    for (let k = 0; k < n; k++) { ax[k] = -home * ux[k] - damp * vx[k]; ay[k] = -home * uy[k] - damp * vy[k] }

    // springs between neighbours: they pull each other towards moving together
    const tie = (a: number, b: number, k: number) => {
      const fx = k * (ux[b] - ux[a]), fy = k * (uy[b] - uy[a])
      ax[a] += fx; ay[a] += fy
      ax[b] -= fx; ay[b] -= fy
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        if (i + 1 < cols) tie(k, k + 1, side)
        if (j + 1 < rows) {
          tie(k, k + cols, side)
          if (i + 1 < cols) tie(k, k + cols + 1, diag)
          if (i > 0) tie(k, k + cols - 1, diag)
        }
      }
    }

    // the mouse
    const m = this.mouse
    if (m.x > -1e3) {
      for (let k = 0; k < n; k++) {
        const dx = this.rx[k] + ux[k] - m.x, dy = this.ry[k] + uy[k] - m.y
        const d2 = dx * dx + dy * dy
        if (d2 >= REACH * REACH) continue
        const d = Math.sqrt(d2) || 0.001
        const f = 1 - d / REACH
        ax[k] += (dx / d) * PUSH * f * f
        ay[k] += (dy / d) * PUSH * f * f
        // moving the pointer through them takes them along
        ax[k] += (m.vx - vx[k]) * CARRY * f * 8
        ay[k] += (m.vy - vy[k]) * CARRY * f * 8
      }
    }

    for (let k = 0; k < n; k++) {
      vx[k] += ax[k] * dt; vy[k] += ay[k] * dt
      ux[k] += vx[k] * dt; uy[k] += vy[k] * dt
    }
    // the pointer's velocity fades when it stops moving
    m.vx *= Math.exp(-6 * dt); m.vy *= Math.exp(-6 * dt)
  }

  /** Advances by `dt` seconds and draws onto `g` (a canvas `scale` times larger than CSS px). */
  frame(g: CanvasRenderingContext2D, dt: number, scale: number, color: string, stiffness = 0.5) {
    // 0..1 from the slider: loose and wobbly (a quarter) to taut (four times), 0.5 as designed
    this.tension = 2 ** ((stiffness - 0.5) * 4)
    this.left += Math.min(0.05, dt)
    while (this.left >= STEP) { this.step(STEP); this.left -= STEP }

    const { cols, rows, rx, ry, ux, uy } = this
    const px = (k: number) => (rx[k] + ux[k]) * scale
    const py = (k: number) => (ry[k] + uy[k]) * scale
    g.save()
    g.strokeStyle = color
    g.fillStyle = color
    g.lineWidth = Math.max(1, scale)
    g.lineCap = 'round'

    // the whole net, faint
    g.globalAlpha = 0.11
    g.beginPath()
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        if (i + 1 < cols) { g.moveTo(px(k), py(k)); g.lineTo(px(k + 1), py(k + 1)) }
        if (j + 1 < rows) { g.moveTo(px(k), py(k)); g.lineTo(px(k + cols), py(k + cols)) }
      }
    }
    g.stroke()

    // stretched or moved parts light up, so a push is easy to follow through the net
    const lit = (a: number, b: number) => {
      const move = Math.hypot(ux[a], uy[a]) + Math.hypot(ux[b], uy[b])
      if (move < 3) return
      g.globalAlpha = Math.min(0.5, 0.11 + move * 0.012)
      g.beginPath()
      g.moveTo(px(a), py(a)); g.lineTo(px(b), py(b))
      g.stroke()
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        if (i + 1 < cols) lit(k, k + 1)
        if (j + 1 < rows) lit(k, k + cols)
      }
    }

    // the dots
    g.globalAlpha = 0.3
    g.beginPath()
    const r = 1.7 * scale
    for (let k = 0; k < cols * rows; k++) {
      const x = px(k), y = py(k)
      g.moveTo(x + r, y)
      g.arc(x, y, r, 0, Math.PI * 2)
    }
    g.fill()
    // ... and the ones that are away from home grow a little
    g.globalAlpha = 0.5
    g.beginPath()
    for (let k = 0; k < cols * rows; k++) {
      const move = Math.hypot(ux[k], uy[k])
      if (move < 4) continue
      const x = px(k), y = py(k), rr = r * Math.min(2, 1 + move * 0.03)
      g.moveTo(x + rr, y)
      g.arc(x, y, rr, 0, Math.PI * 2)
    }
    g.fill()
    g.restore()
  }
}
