// What sits behind the UI: floating particles, aurora glows, the fluid, a photo, or nothing.
// Each one registers what it draws into (source.ts), so the refractive glass can bend it.

import { useEffect, useRef } from 'react'
import { FluidSim } from './FluidSim'
import { setBackdropSource } from './source'
import { settings, type Background } from '../../settings/store'
import backgroundUrl from '../../assets/background.jpg'

/** Runs [frame] every animation frame with the time in seconds, while mounted. */
function useFrames(frame: (t: number, dt: number) => void) {
  const fn = useRef(frame)
  fn.current = frame
  useEffect(() => {
    let raf = 0, last = performance.now()
    const start = last
    const loop = (now: number) => {
      fn.current((now - start) / 1000, Math.min(0.1, (now - last) / 1000))
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

/** A full-window canvas kept at device resolution, registered as what the glass bends. */
function useCanvas(scale = 1) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    setBackdropSource({ el: ref.current!, cover: false, dim: 0, live: true })
    return () => setBackdropSource(null)
  }, [])
  useEffect(() => {
    const fit = () => {
      const c = ref.current
      if (!c) return
      const dpr = Math.min(2, window.devicePixelRatio || 1) * scale
      c.width = Math.max(1, Math.round(window.innerWidth * dpr))
      c.height = Math.max(1, Math.round(window.innerHeight * dpr))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [scale])
  return ref
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

interface Particle { x: number; y: number; speed: number; r: number; a: number; drift: number }
const spawn = (y: number): Particle => ({
  x: Math.random(), y, speed: Math.random() * 0.0012 + 0.0003, r: Math.random() * 2.5 + 0.8,
  a: Math.random() * 0.055 + 0.018, drift: (Math.random() - 0.5) * 0.00015,
})

function Particles({ active, tint }: { active: boolean; tint: string }) {
  const ref = useCanvas()
  const parts = useRef<Particle[]>(Array.from({ length: 12 }, () => spawn(Math.random())))
  const spawnClock = useRef(0)
  useFrames((_t, dt) => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    spawnClock.current += dt * 1000
    const target = active ? 24 : 10
    if (spawnClock.current > (active ? 650 : 2500)) {
      spawnClock.current = 0
      if (parts.current.length < target) parts.current.push(spawn(1.05))
    }
    const k = dt * 60   // tuned per 60 Hz frame
    parts.current = parts.current.filter((p) => {
      p.y -= p.speed * k
      p.x = Math.min(1, Math.max(0, p.x + p.drift * k))
      return p.y > -0.05
    })
    g.clearRect(0, 0, c.width, c.height)
    const dpr = c.width / window.innerWidth
    g.fillStyle = tint
    for (const p of parts.current) {
      g.globalAlpha = p.a
      g.beginPath()
      g.arc(p.x * c.width, p.y * c.height, p.r * dpr, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  })
  return <canvas ref={ref} className="bg-canvas" />
}

// ---------------------------------------------------------------------------
// Aurora
// ---------------------------------------------------------------------------

const GLOWS = [
  [0, 0.05, 0.037, 0],
  [35, 0.041, 0.053, 2.1],
  [-40, 0.033, 0.029, 4.0],
  [160, 0.027, 0.045, 5.3],
]

function Aurora({ hue, sat }: { hue: number; sat: number }) {
  const ref = useCanvas(0.5)
  const s = Math.min(0.85, Math.max(0.35, sat))
  useFrames((t) => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const r = Math.max(c.width, c.height) * 0.55
    GLOWS.forEach((gl, i) => {
      const cx = c.width * (0.5 + 0.42 * Math.sin(t * gl[1] * 6.2832 + gl[3]))
      const cy = c.height * (0.5 + 0.42 * Math.cos(t * gl[2] * 6.2832 + gl[3] * 1.3))
      const h = (((hue + gl[0]) % 360) + 360) % 360
      const a = i === 3 ? 0.16 : 0.26
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, `hsl(${h} ${s * 100}% ${50 + 50 * (1 - s) / 2}% / ${a})`)
      grad.addColorStop(1, `hsl(${h} ${s * 100}% 50% / 0)`)
      g.fillStyle = grad
      g.fillRect(0, 0, c.width, c.height)
    })
  })
  return <canvas ref={ref} className="bg-canvas" />
}

// ---------------------------------------------------------------------------
// Fluid
// ---------------------------------------------------------------------------

/** Fixed simulation step (seconds); a frame runs as many as real time needs. */
const STEP = 1 / 120
/** Gravity in CSS px/s²: a calm pour across a desktop window, not the phone's tiny-box rush. */
const GRAVITY_PX = 1600
/**
 * Interaction radii across a portrait window. The phone used 14; a PC can afford much finer
 * particles (about 8x as many for the same amount of liquid): a smoother surface and drops.
 */
const SIM_WIDTH = 40
/** Liquid fills about the bottom fifth of the window (the phone's share). */
const LIQUID_SHARE = 380 * 0.25 / (14 * 31)
const MAX_PARTICLES = 3000
/** Moving the mouse anywhere pushes the whole liquid the same way, this hard. */
const MOUSE_PUSH = 0.12
/** ...and a bit harder right around the pointer, within this many radii. */
const STIR_RADIUS = 3

/** The fluid box for the window: square cells, SIM_WIDTH radii across a portrait window. */
function simSize() {
  const w = window.innerWidth, h = Math.max(1, window.innerHeight)
  const simW = Math.max(SIM_WIDTH, (SIM_WIDTH * w) / h * 0.75)
  return { simW, simH: (simW * h) / Math.max(1, w) }
}

/**
 * Liquid in the window. The phone version poured with tilt and splashed with shakes; on a PC:
 *  - gravity always points down the screen,
 *  - moving the mouse anywhere pushes the liquid the same way (left moves it left), a little
 *    more right under the pointer,
 *  - dragging or shaking the window sloshes it (the window's own acceleration, by inertia).
 * Drawn as metaballs at full resolution: dots blurred together and cut at a threshold (the #goo
 * SVG filter, applied by the canvas itself so the glass sees the finished liquid).
 */
function Fluid({ tint }: { tint: string }) {
  const ref = useCanvas()
  const dots = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const sim = useRef<FluidSim | null>(null)
  const mouse = useRef({ x: -1, y: -1, dx: 0, dy: 0 })
  const win = useRef({ x: window.screenX, y: window.screenY, vx: 0, vy: 0 })

  useEffect(() => {
    const make = () => {
      const { simW, simH } = simSize()
      // particles at rest pack about 4 per square radius (SPACING 0.5)
      const count = simW * simH * LIQUID_SHARE * 4
      sim.current = new FluidSim(simW, simH, Math.round(Math.min(MAX_PARTICLES, Math.max(200, count))))
    }
    make()
    let t = 0
    const resize = () => { window.clearTimeout(t); t = window.setTimeout(make, 200) }
    const move = (e: PointerEvent) => {
      const m = mouse.current
      if (m.x >= 0) { m.dx += e.clientX - m.x; m.dy += e.clientY - m.y }
      m.x = e.clientX; m.y = e.clientY
    }
    const leave = () => { mouse.current.x = -1 }
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', move)
    document.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
    }
  }, [])

  useFrames((_t, dt) => {
    const s = sim.current, c = ref.current
    if (!s || !c) return
    const steps = Math.min(3, Math.max(1, Math.round(dt / STEP)))
    const cellPx = window.innerWidth / s.width          // CSS px per radius
    const stir = settings.get().fluidStir
    const g = GRAVITY_PX / cellPx                        // radii/s²
    const frameS = Math.max(dt, 1 / 240)

    // Mouse: its movement (anywhere) pushes everything the same way, a little more near it.
    // Each px moved adds a little velocity (radii/s), so a gentle move gives a gentle push.
    const m = mouse.current
    if ((m.dx || m.dy) && stir > 0) {
      const lim = (v: number) => Math.max(-12, Math.min(12, v))
      const pushX = lim((m.dx / cellPx) * MOUSE_PUSH * stir * 4)
      const pushY = lim((m.dy / cellPx) * MOUSE_PUSH * stir * 4)
      const mx = m.x / cellPx, my = m.y / cellPx
      for (let i = 0; i < s.count; i++) {
        let k = 1
        if (m.x >= 0) {
          const dx = s.x[i] - mx, dy = s.y[i] - my
          const d2 = dx * dx + dy * dy
          if (d2 < STIR_RADIUS * STIR_RADIUS) k += 0.8 * (1 - Math.sqrt(d2) / STIR_RADIUS)
        }
        s.vx[i] += pushX * k
        s.vy[i] += pushY * k
      }
    }
    m.dx = 0; m.dy = 0

    // Window: its change of speed pushes the liquid the other way (inertia), in radii/s.
    const w = win.current
    const wvx = (window.screenX - w.x) / cellPx / frameS, wvy = (window.screenY - w.y) / cellPx / frameS
    const lim2 = (v: number) => Math.max(-25, Math.min(25, v))
    const ax = lim2(wvx - w.vx), ay = lim2(wvy - w.vy)
    w.x = window.screenX; w.y = window.screenY; w.vx = wvx; w.vy = wvy
    if (ax || ay) for (let i = 0; i < s.count; i++) { s.vx[i] -= ax * 0.6; s.vy[i] -= ay * 0.6 }

    for (let k = 0; k < steps; k++) s.step(STEP, 0, g)

    // Dots first, then the goo filter onto the visible canvas (half opacity, like the phone).
    const d = dots.current
    if (d.width !== c.width || d.height !== c.height) { d.width = c.width; d.height = c.height }
    const dg = d.getContext('2d')!
    dg.clearRect(0, 0, d.width, d.height)
    const cell = c.width / s.width
    const r = cell * 0.42
    dg.fillStyle = tint
    dg.beginPath()
    for (let i = 0; i < s.count; i++) {
      dg.moveTo(s.x[i] * cell + r, s.y[i] * cell)
      dg.arc(s.x[i] * cell, s.y[i] * cell, r, 0, Math.PI * 2)
    }
    dg.fill()
    // (the half opacity is part of the filter: a canvas applies globalAlpha before its filter,
    // which would move the threshold)
    const cg = c.getContext('2d')!
    cg.clearRect(0, 0, c.width, c.height)
    cg.filter = 'url(#goo)'
    cg.drawImage(d, 0, 0)
    cg.filter = 'none'
  })

  // Blur follows the cell size (0.32 of a cell, as on Android), in canvas pixels.
  const blur = (window.innerWidth / simSize().simW) * Math.min(2, window.devicePixelRatio || 1) * 0.32
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="goo" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* edges clamp (Android's TileMode.CLAMP), so liquid touching a wall isn't eaten away */}
          <feGaussianBlur stdDeviation={Math.max(1.5, blur)} edgeMode="duplicate" />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8.1" />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" />
        </filter>
      </svg>
      <canvas ref={ref} className="bg-canvas" />
    </>
  )
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

function Photo({ dim }: { dim: number }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = ref.current!
    const register = () => setBackdropSource({ el: img, cover: true, dim, live: false })
    if (img.complete) register()
    else img.addEventListener('load', register, { once: true })
    return () => setBackdropSource(null)
  }, [dim])
  return (
    <div className="bg-image">
      <img ref={ref} src={backgroundUrl} alt="" />
      <div className="bg-image-dim" style={{ opacity: dim }} />
    </div>
  )
}

// ---------------------------------------------------------------------------

export function BackgroundLayer(props: {
  background: Background
  active: boolean
  hue: number
  sat: number
  tint: string
  liquid: string
  imageDim: number
}) {
  switch (props.background) {
    case 'SIMPLE': return <Particles active={props.active} tint={props.tint} />
    case 'AURORA': return <Aurora hue={props.active ? props.hue : 200} sat={props.active ? props.sat : 0.7} />
    case 'FLUID': return <Fluid tint={props.liquid} />
    case 'IMAGE': return <Photo dim={props.imageDim} />
    default: return null
  }
}
