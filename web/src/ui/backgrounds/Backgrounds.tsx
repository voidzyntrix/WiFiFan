// What sits behind the UI: floating particles, aurora glows, their ASCII twin, a photo, or nothing.
// Each one registers what it draws into (source.ts), so the refractive glass can bend it.

import { useEffect, useRef, useState } from 'react'
import { setBackdropFade, setBackdropSource } from './source'
import type { Background } from '../../settings/store'
import backgroundUrl from '../../assets/background.jpg'

/** Runs [frame] every animation frame with the time in seconds, while mounted. */
function useFrames(frame: (t: number, dt: number) => void) {
  const fn = useRef(frame)
  fn.current = frame
  useEffect(() => {
    let raf = 0, last = performance.now()
    const start = last
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      // light effects (phones): the background moves at 30 fps, which is plenty for slow drifting
      if (document.documentElement.dataset.effects === 'light' && now - last < 30) return
      fn.current((now - start) / 1000, Math.min(0.1, (now - last) / 1000))
      last = now
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

/** Background canvases are never wider than this many px (the glows and particles are soft anyway). */
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
// ASCII
// ---------------------------------------------------------------------------

/* The aurora's glows, drawn as characters instead of gradients: one glyph per cell, denser and
   brighter closer to a glow's centre, always in the app's own colour (the tint prop — onBg from
   theme.ts — so it follows System / Custom / Monochrome, never the LED light). The glows paint
   onto a tiny canvas at grid resolution and are read back in a single call, so the field costs
   next to nothing; the series of fillText over the lit cells is the only real work.

   Quantizing a smooth field into glyphs bands it into rings, so every cell carries a pinch of
   dither — one stable pseudo-random offset that interleaves neighbouring glyphs at the band
   edges. The mouse floats its own faint glow under the pointer (a lantern that glides after it
   and fades away when it leaves), so the light visibly reads. */

/* One brightness step per glyph, denser left to right — and every step a shape that fills its own
   cell: '-' and '=' read as horizontal strokes (a half step at best), so they didn't survive. */

const ASCII_GLYPHS = ' .:;+ox*#%@'
const ASCII_DITHER = 0.12   // how much of a glyph step one cell's dither can swing across

/** A stable random 0..1 per cell: the dither never flickers between redraws. */
function cellHash(x: number, y: number) {
  let h = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca77)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

function Ascii({ tint, size }: { tint: string; size: number }) {
  const ref = useCanvas()
  const field = useRef<HTMLCanvasElement | null>(null)
  const dither = useRef<Float32Array>(new Float32Array(0))
  const next = useRef(0)
  const smooth = useSmoothColor(tint)
  // the lantern: where the pointer is, eased toward its target; only an actual mouse (desktops) wields it
  const lantern = useRef({ x: 0.5, y: 0.45, on: 0 })
  const pointer = useRef({ x: 0.5, y: 0.45, on: 0 })
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pointer.current.x = e.clientX / Math.max(1, window.innerWidth)
      pointer.current.y = e.clientY / Math.max(1, window.innerHeight)
      pointer.current.on = 1
    }
    const off = () => { pointer.current.on = 0 }
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('mouseleave', off)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('mouseleave', off)
      window.removeEventListener('blur', off)
    }
  }, [])
  useFrames((t, dt) => {
    if (t < next.current) return   // the drift is slow: redraws a few times a second, characters pop, they don't smear
    const c = ref.current
    if (!c) return
    // the lantern glides after the pointer and fades with it
    const l = lantern.current, p = pointer.current
    const k = 1 - Math.exp(-9 * dt)
    l.x += (p.x - l.x) * k
    l.y += (p.y - l.y) * k
    l.on += (p.on - l.on) * (1 - Math.exp(-5 * dt))
    const dpr = c.width / Math.max(1, window.innerWidth)
    // the cell width is exactly the Glyph size setting: `size` CSS px on screen whatever the
    // window (the canvas's own scale is what dpr is here, so the cell ends up `size` CSS px wide)
    const cw = Math.max(3, Math.round(Math.max(6, Math.min(60, size)) * dpr))
    const cols = Math.ceil(c.width / cw)
    const rows = Math.ceil(c.height / cw)
    // a big grid redraws a little more slowly (a 4K window spells ~20k cells) — the drift is slow,
    // so the pop rate gives way before the redraw cost does
    next.current = t + Math.min(0.22, Math.max(0.05, cols * rows * 0.05 / 9000))
    // one field pixel per character cell: the same four drifting glows as Aurora
    const f = field.current ?? (field.current = document.createElement('canvas'))
    if (f.width !== cols || f.height !== rows) { f.width = cols; f.height = rows }
    const fg = f.getContext('2d', { willReadFrequently: true })!
    fg.clearRect(0, 0, cols, rows)
    const r = Math.max(cols, rows) * 0.55
    GLOWS.forEach((gl, i) => {
      const cx = cols * (0.5 + 0.42 * Math.sin(t * gl[1] * 6.2832 + gl[3]))
      const cy = rows * (0.5 + 0.42 * Math.cos(t * gl[2] * 6.2832 + gl[3] * 1.3))
      const a = i === 3 ? 0.16 : 0.26
      const grad = fg.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, `rgba(0, 0, 0, ${a})`)   // the colour is irrelevant; only the alpha is read
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      fg.fillStyle = grad
      fg.fillRect(0, 0, cols, rows)
    })
    if (l.on > 0.01) {
      // the lantern: a faint glow of its own, so the pointer has light to shadow
      const lx = cols * l.x, ly = rows * l.y
      const lgrad = fg.createRadialGradient(lx, ly, 0, lx, ly, Math.max(cols, rows) * 0.18)
      lgrad.addColorStop(0, `rgba(0, 0, 0, ${0.15 * l.on})`)
      lgrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      fg.fillStyle = lgrad
      fg.fillRect(0, 0, cols, rows)
    }
    const px = fg.getImageData(0, 0, cols, rows).data
    // the dither is one stable value per cell — constant between redraws — rebuilt with the grid
    let dn = dither.current
    if (dn.length !== cols * rows) {
      dn = dither.current = new Float32Array(cols * rows)
      for (let i = 0; i < dn.length; i++) dn[i] = cellHash(i % cols, (i / cols) | 0)
    }
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = smooth(dt)
    g.font = `${Math.round(cw * 0.62)}px 'JetBrains Mono', ui-monospace, monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (let row = 0; row < rows; row++) {
      const cells = row * cols
      for (let col = 0; col < cols; col++) {
        // the glows overlap at most ~0.6 alpha; that is 1 = the densest glyph at nearly full colour
        const b = Math.min(1, px[(cells + col) * 4 + 3] / 255 / 0.62)
        if (b < 0.06) continue
        // the dithered brightness picks the glyph (the quantizing bands break apart); the alpha
        // stays with the undithered brightness, so nothing shimmers as the glows drift
        const bd = Math.min(1, Math.max(0, b + (dn[cells + col] - 0.5) * ASCII_DITHER))
        const glyph = ASCII_GLYPHS[Math.min(ASCII_GLYPHS.length - 1, Math.round(bd * (ASCII_GLYPHS.length - 1)))]
        if (glyph === ' ') continue
        g.globalAlpha = Math.min(0.94, 0.25 + b * 0.72)
        g.fillText(glyph, col * cw + cw / 2, row * cw + cw / 2)
      }
    }
    g.globalAlpha = 1
  })
  return <canvas ref={ref} className="bg-canvas" />
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
  imageDim: number
  asciiSize: number
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
    case 'ASCII': return <Ascii tint={props.tint} size={props.asciiSize} />
    case 'IMAGE': return <Photo dim={props.imageDim} />
    default: return null
  }
}
