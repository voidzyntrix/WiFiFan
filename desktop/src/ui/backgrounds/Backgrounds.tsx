// What sits behind the UI: floating particles, aurora glows, the fluid, a photo, or nothing.
// Each one registers what it draws into (source.ts), so the refractive glass can bend it.

import { useEffect, useRef, useState } from 'react'
import { DotNet } from './DotNet'
import { FluidRenderer } from './FluidRenderer'
import { FluidSim } from './FluidSim'
import { setBackdropFade, setBackdropSource } from './source'
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


/** Reads any CSS colour as r, g, b (0..255). */
const probe = document.createElement('canvas')
probe.width = probe.height = 1
const probeCtx = probe.getContext('2d', { willReadFrequently: true })!
function parseColor(css: string): [number, number, number] {
  probeCtx.clearRect(0, 0, 1, 1)
  probeCtx.fillStyle = '#000'
  probeCtx.fillStyle = css
  probeCtx.fillRect(0, 0, 1, 1)
  const d = probeCtx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2]]
}

/** A colour that eases to its target instead of jumping: call the result once a frame with the frame time. */
function useSmoothColor(target: string, rate = 6) {
  const goal = useRef(parseColor(target))
  const cur = useRef<[number, number, number] | null>(null)
  const last = useRef(target)
  if (last.current !== target) { last.current = target; goal.current = parseColor(target) }
  return (dt: number) => {
    const g = goal.current
    if (!cur.current) cur.current = [...g]
    else {
      const k = 1 - Math.exp(-rate * dt)
      for (let i = 0; i < 3; i++) cur.current[i] += (g[i] - cur.current[i]) * k
    }
    const c = cur.current
    return `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`
  }
}

/** The dot net (DotNet.ts), alive while mounted; null while Settings > Dot net is off. */
function useDotNet() {
  const net = useRef<DotNet | null>(null)
  useEffect(() => {
    net.current = new DotNet()
    return () => { net.current?.dispose(); net.current = null }
  }, [])
  return net
}

/** Background canvases are never wider than this many px (the glow, liquid and net are soft anyway). */
const MAX_CANVAS_WIDTH = 1920

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
      let dpr = Math.min(2, window.devicePixelRatio || 1) * scale
      dpr = Math.min(dpr, MAX_CANVAS_WIDTH / Math.max(1, window.innerWidth))   // big screens: fewer pixels to fill and upload
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
  const smooth = useSmoothColor(tint)
  const net = useDotNet()
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
    const color = smooth(dt)
    g.fillStyle = color
    for (const p of parts.current) {
      g.globalAlpha = p.a
      g.beginPath()
      g.arc(p.x * c.width, p.y * c.height, p.r * dpr, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
    if (settings.get().dotNet) net.current?.frame(g, dt, dpr, color, settings.get().dotNetStiffness, settings.get().dotNetOpacity)
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
  const goal = useRef({ hue, sat })
  goal.current = { hue, sat }
  const shown = useRef<{ hue: number; sat: number } | null>(null)
  useFrames((t, dt) => {
    const c = ref.current
    if (!c) return
    // the glow's colour eases to the LED's (round the short way on the colour wheel)
    const k = 1 - Math.exp(-4 * dt)
    const cur = shown.current ?? (shown.current = { ...goal.current })
    cur.hue = (((cur.hue + (((goal.current.hue - cur.hue + 540) % 360) - 180) * k) % 360) + 360) % 360
    cur.sat += (goal.current.sat - cur.sat) * k
    const hue = cur.hue
    const s = Math.min(0.85, Math.max(0.35, cur.sat))
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
/**
 * The pointer is one force: it pushes fluid away from it (hold Ctrl and it pulls towards it
 * instead), strongest right at the pointer and fading to nothing at its reach. "Nearby fluid"
 * reaches NEAR_RADIUS radii; "Whole screen" is the same force with a reach so large that it
 * covers everything. FORCE is radii/s² right at the pointer for a slider at 100 % of the old
 * scale (gravity is about 50).
 */
const NEAR_RADIUS = 6
const WHOLE_RADIUS = 400
const FORCE = 180
/** How firmly grabbed fluid takes on the pointer's own speed (per second, at full strength right at the pointer). */
const GRIP = 60

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
function Fluid({ tint, netTint }: { tint: string; netTint: string }) {
  const ref = useCanvas()
  const dots = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const sim = useRef<FluidSim | null>(null)
  const mouse = useRef({ x: -1, y: -1, vx: 0, vy: 0, t: 0 })   // pointer position and its speed (px/s)
  const pull = useRef(false)    // Ctrl is held: the pointer attracts instead of pushing
  const grabbedRef = useRef(new Uint8Array(0))   // particles the pointer has grabbed while Ctrl is held
  const win = useRef({ x: window.screenX, y: window.screenY, vx: 0, vy: 0 })
  const smooth = useSmoothColor(tint, 5)
  const smoothNet = useSmoothColor(netTint)
  const shader = useRef<FluidRenderer | null | undefined>(undefined)
  const net = useDotNet()

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
      const now = performance.now()
      if (m.x >= 0 && now - m.t < 100) {
        const dt = Math.max(0.004, (now - m.t) / 1000)
        m.vx = m.vx * 0.5 + ((e.clientX - m.x) / dt) * 0.5
        m.vy = m.vy * 0.5 + ((e.clientY - m.y) / dt) * 0.5
      }
      m.t = now
      m.x = e.clientX; m.y = e.clientY
      pull.current = e.ctrlKey
    }
    const leave = () => { mouse.current.x = -1; mouse.current.vx = mouse.current.vy = 0 }
    // Holding Ctrl turns the pointer's push into a pull
    const key = (e: KeyboardEvent) => { if (e.key === 'Control') pull.current = e.type === 'keydown' }
    const blur = () => { pull.current = false }
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', move)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('blur', blur)
    document.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      window.removeEventListener('blur', blur)
      document.removeEventListener('pointerleave', leave)
    }
  }, [])

  useFrames((_t, dt) => {
    const s = sim.current, c = ref.current
    if (!s || !c) return
    const steps = Math.min(2, Math.max(1, Math.round(dt / STEP)))
    const cellPx = window.innerWidth / s.width          // CSS px per radius
    // viscosity: from watery (a hundredth of the default stickiness) to syrup (fifteen times it)
    const visc = settings.get().fluidViscosity
    s.viscosity = 0.04 * 2 ** ((visc - 0.5) * 7.8)
    s.drag = Math.max(0, visc - 0.6) * 9
    // the slider is the strength: gentle up to 60 %, then it climbs steeply (100 % = 8x)
    const raw = settings.get().fluidStir
    const stir = raw + Math.max(0, raw - 0.6) * 17.5
    const g = GRAVITY_PX / cellPx                        // radii/s²
    const frameS = Math.max(dt, 1 / 240)

    // Mouse: repel (hold Ctrl: attract), within the reach, strongest at the pointer.
    if (grabbedRef.current.length !== s.count) grabbedRef.current = new Uint8Array(s.count)
    const grabbed = grabbedRef.current
    const m = mouse.current
    m.vx *= Math.exp(-7 * frameS); m.vy *= Math.exp(-7 * frameS)    // a pointer that stops has no speed
    if (m.x >= 0 && stir > 0) {
      const reach = settings.get().fluidNearMouse ? NEAR_RADIUS : WHOLE_RADIUS
      const accel = FORCE * stir * frameS
      if (!pull.current) grabbed.fill(0)
      const hx = m.x / cellPx, hy = m.y / cellPx
      const pvx = m.vx / cellPx, pvy = m.vy / cellPx        // the pointer's speed, radii/s
      const r2max = reach * reach
      for (let i = 0; i < s.count; i++) {
        const dx = s.x[i] - hx, dy = s.y[i] - hy
        const d2 = dx * dx + dy * dy
        if (pull.current) {
          // Attract: whatever comes within the reach is grabbed, and stays grabbed (however fast the
          // pointer moves away) until Ctrl is let go. A grabbed particle is pulled to the pointer,
          // carried along with the pointer's own movement and slowed down around it, so it neither
          // shoots through nor flies off. The pull fades out right at the pointer (no jitter).
          if (d2 < r2max) grabbed[i] = 1
          if (!grabbed[i]) continue
          const d = Math.sqrt(d2) || 0.001
          const f = Math.max(0, 1 - d / reach)
          const pullForce = accel * (0.5 + 0.5 * f) * Math.min(1, d / 2.5)
          s.vx[i] -= (dx / d) * pullForce
          s.vy[i] -= (dy / d) * pullForce
          const grip = Math.min(1, GRIP * Math.min(stir, 3) * (0.4 + 0.6 * f) * frameS)
          s.vx[i] += (pvx - s.vx[i]) * grip
          s.vy[i] += (pvy - s.vy[i]) * grip
        } else if (d2 < r2max) {
          // Repel: strongest at the pointer, nothing at the edge of the reach.
          const d = Math.sqrt(d2) || 0.001
          const f = 1 - d / reach
          const push = accel * f * f
          s.vx[i] += (dx / d) * push
          s.vy[i] += (dy / d) * push
        }
      }
    }

    // Window: its change of speed pushes the liquid the other way (inertia), in radii/s.
    // The window's speed is smoothed first: while it is dragged, frames come unevenly and the
    // position jumps, and raw readings would kick the liquid about instead of sloshing it.
    const w = win.current
    const wvx = (window.screenX - w.x) / cellPx / frameS, wvy = (window.screenY - w.y) / cellPx / frameS
    const ease = 1 - Math.exp(-frameS * 14)
    const nvx = w.vx + (wvx - w.vx) * ease, nvy = w.vy + (wvy - w.vy) * ease
    const lim2 = (v: number) => Math.max(-8, Math.min(8, v))
    const ax = lim2(nvx - w.vx), ay = lim2(nvy - w.vy)
    w.x = window.screenX; w.y = window.screenY; w.vx = nvx; w.vy = nvy
    if (ax || ay) for (let i = 0; i < s.count; i++) { s.vx[i] -= ax * 0.6; s.vy[i] -= ay * 0.6 }

    // At most two steps a frame, and none more once the frame's budget is spent, so a slow
    // moment never snowballs into a slower one.
    const began = performance.now()
    for (let k = 0; k < steps; k++) {
      s.step(STEP, 0, g)
      if (performance.now() - began > 9) break
    }

    const cell = c.width / s.width
    const color = smooth(dt)
    if (shader.current === undefined) shader.current = FluidRenderer.create()
    const cg = c.getContext('2d')!
    // the net goes down first: the liquid is drawn over it and hides it
    const netColor = smoothNet(dt)
    const drawNet = () => {
      if (settings.get().dotNet) net.current?.frame(cg, dt, c.width / window.innerWidth, netColor, settings.get().dotNetStiffness, settings.get().dotNetOpacity)
    }
    if (shader.current) {
      // glossy water (FluidRenderer.ts)
      const [r, g2, b] = (color.match(/\d+/g) ?? ['255', '255', '255']).map(Number)
      const drawn = shader.current.render(s, c.width, c.height, cell, [r, g2, b])
      cg.clearRect(0, 0, c.width, c.height)
      drawNet()
      cg.drawImage(drawn, 0, 0, c.width, c.height)
    } else {
      // no WebGL2: dots first, then the goo filter onto the visible canvas (half opacity, like the phone)
      const d = dots.current
      if (d.width !== c.width || d.height !== c.height) { d.width = c.width; d.height = c.height }
      const dg = d.getContext('2d')!
      dg.clearRect(0, 0, d.width, d.height)
      const rr = cell * 0.42
      dg.fillStyle = color
      dg.beginPath()
      for (let i = 0; i < s.count; i++) {
        dg.moveTo(s.x[i] * cell + rr, s.y[i] * cell)
        dg.arc(s.x[i] * cell, s.y[i] * cell, rr, 0, Math.PI * 2)
      }
      dg.fill()
      // (the half opacity is part of the filter: a canvas applies globalAlpha before its filter,
      // which would move the threshold)
      cg.clearRect(0, 0, c.width, c.height)
      drawNet()
      cg.filter = 'url(#goo)'
      cg.drawImage(d, 0, 0)
      cg.filter = 'none'
    }
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
  // A new background fades the old one out, swaps, and fades in (the glass reads the same fade).
  const [shown, setShown] = useState(props.background)
  const goal = useRef(props.background)
  const showing = useRef(shown)
  goal.current = props.background
  showing.current = shown
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.backdrop')
    let raf = 0, last = performance.now(), fade = 1, applied = -1
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const swapping = goal.current !== showing.current
      fade = swapping ? Math.max(0, fade - dt / 0.25) : Math.min(1, fade + dt / 0.35)
      if (swapping && fade <= 0) setShown(goal.current)
      const eased = fade * fade * (3 - 2 * fade)
      if (eased !== applied) {
        applied = eased
        setBackdropFade(eased)
        root?.style.setProperty('--fade', String(eased))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  switch (shown) {
    case 'SIMPLE': return <Particles active={props.active} tint={props.tint} />
    case 'AURORA': return <Aurora hue={props.active ? props.hue : 200} sat={props.active ? props.sat : 0.7} />
    case 'FLUID': return <Fluid tint={props.liquid} netTint={props.tint} />
    case 'IMAGE': return <Photo dim={props.imageDim} />
    default: return null
  }
}
