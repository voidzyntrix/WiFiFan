// Refractive glass (Settings > App UI > Refractive glass), drawn with WebGL.
//
// One full-window canvas sits between the background and the UI. Each frame it draws the
// background (from source.ts) and then, for every glass element on screen (cards, buttons, pills,
// switches, sliders, dialogs, dots: see GLASS_SELECTOR), a refracted copy of it:
//  - a rim bend: a circular bevel along the rounded rectangle's border pulls the background
//    inwards. That is all: no highlights, no fringing, no shading. The depth comes from the bend;
//  - a soft warp across the inside, like uneven thick glass (it moves with the element).
// Small things bend less and thinner, in proportion to their size.
// Elements are measured every frame (position, corner radius, opacity, the box that clips them), so
// the glass slides, scales and fades in with their animations instead of appearing once they have
// settled. Each one is its own quad, so the cost follows the area of the glass, not how many pieces
// there are. Everything is computed per pixel at the screen's full resolution.

import { useEffect, useRef } from 'react'
import { backdropFade, backdropSource } from './source'

/** Which elements are glass: the glass design's surfaces and controls (the Material design has no glass). */
const GLASS_SELECTOR = [
  '.panel', '.board-tile', '.toast', '.update-block', '.nearby-row', '.dialog', 'input.text-field', 'button.action-row',
  'button.circle-btn', '.pill', '.pill-thumb', 'button.pill-button', 'button.switch', '.switch-knob', 'button.chip', 'button.menu-item',
  '.progress', '.progress-fill', '.gbar-track', '.gbar-thumb', '.gbar-dot', '.preset', '.level-meter', '.level-meter > div',
  '.board-pill', '.quiet-link', '.led-disc', '.swatch', '.beacon', '.board-dot', '.scan-dots span', '.update-dot',
].join(',')
/** Things that sit above the rest of the UI: their glass is drawn last. */
const OVERLAY_SELECTOR = '.mode-menu, .scrim, .toasts'
/** Rim width and how far it bends the background, in CSS px (Android: 18 / 16 dp), for a card; smaller things scale down. */
const EDGE = 22
const STRENGTH = 20
/** The inside warp: how far (CSS px) and how wide its waves are. */
const WARP = 4
const WARP_SIZE = 150
/** A thing this many CSS px across (its short side) gets the full effect. */
const FULL_SIZE = 90

const VERT = `#version 300 es
in vec2 aPos;
uniform vec4 uBox;     // the quad: x, y, w, h (device px, from the top left)
uniform vec2 uRes;
void main() {
  vec2 p = uBox.xy + aPos * uBox.zw;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform bool uHasSrc;
uniform bool uGlass;   // false: draw the background, true: draw one glass element
uniform vec2 uRes;
uniform vec4 uUv;      // source uv = screen uv * xy + zw (crop for the photo)
uniform vec3 uBg;
uniform float uDim;
uniform float uFade;   // 0 while one background swaps for another
uniform float uScale;  // device pixels per CSS px
uniform vec4 uRect;    // x, y, w, h (device px, from the top left)
uniform vec4 uMeta;    // corner radius, opacity, seed, size factor
out vec4 outColor;

vec3 bgAt(vec2 p) {
  vec3 c = uBg;
  if (uHasSrc) {
    vec4 t = texture(uSrc, (p / uRes) * uUv.xy + uUv.zw);
    c = c * (1.0 - t.a) + t.rgb;       // premultiplied
    c *= (1.0 - uDim);
  }
  return mix(uBg, c, uFade);
}

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
/** Smooth 2D displacement, -0.5..0.5 per axis. */
vec2 warp(vec2 q) {
  return vec2(
    vnoise(q) + 0.5 * vnoise(q * 2.03 + 7.1),
    vnoise(q + vec2(19.3, 4.7)) + 0.5 * vnoise(q * 2.03 + 13.7)) / 1.5 - 0.5;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  if (!uGlass) { outColor = vec4(bgAt(p), 1.0); return; }

  float k = uMeta.w;
  float edge = ${EDGE.toFixed(1)} * uScale * k;
  float strength = ${STRENGTH.toFixed(1)} * uScale * k;
  vec2 hs = uRect.zw * 0.5;
  vec2 lp = p - (uRect.xy + hs);
  float rad = min(uMeta.x, min(hs.x, hs.y));
  float d = sdRoundRect(lp, hs, rad);
  if (d > 1.0) discard;
  float depth = -d;

  // outward normal of the rim
  vec2 n = vec2(
    sdRoundRect(lp + vec2(1.0, 0.0), hs, rad) - sdRoundRect(lp - vec2(1.0, 0.0), hs, rad),
    sdRoundRect(lp + vec2(0.0, 1.0), hs, rad) - sdRoundRect(lp - vec2(0.0, 1.0), hs, rad));
  n /= max(length(n), 0.0001);

  // circular bevel: flat inside, steepest right at the border
  float t = 1.0 - clamp(depth / edge, 0.0, 1.0);
  float bend = 1.0 - sqrt(max(1.0 - t * t, 0.0));
  vec2 off = n * strength * bend;
  // the soft warp across the inside, fading out where the rim takes over
  off += warp((lp + uMeta.z) / (${WARP_SIZE.toFixed(1)} * uScale)) * (${(WARP * 2).toFixed(1)} * uScale * k) * (1.0 - bend);

  vec3 g = bgAt(p - off);

  float a = clamp(0.5 - d, 0.0, 1.0) * uMeta.y;   // antialiased border, element opacity
  outColor = vec4(g, a);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
  return s
}

type Box = [number, number, number, number]   // left, top, right, bottom (CSS px)

interface Context { opacity: number; clip: Box | null }

/**
 * What an element's ancestors do to it: their opacity multiplied (as seen on screen) and the box
 * they clip it to (overflow hidden / scroll). Memoised per frame, so each ancestor is read once.
 */
function contextOf(el: HTMLElement, memo: Map<HTMLElement, Context>): Context {
  if (el === document.body || el === document.documentElement) return { opacity: 1, clip: null }
  const known = memo.get(el)
  if (known) return known
  const up = el.parentElement ? contextOf(el.parentElement, memo) : { opacity: 1, clip: null }
  const cs = getComputedStyle(el)
  let clip = up.clip
  if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
    const r = el.getBoundingClientRect()
    clip = clip
      ? [Math.max(clip[0], r.left), Math.max(clip[1], r.top), Math.min(clip[2], r.right), Math.min(clip[3], r.bottom)]
      : [r.left, r.top, r.right, r.bottom]
  }
  const ctx = { opacity: up.opacity * parseFloat(cs.opacity), clip }
  memo.set(el, ctx)
  return ctx
}

/** Each element keeps its own warp pattern while it exists. */
const seeds = new WeakMap<HTMLElement, number>()
let nextSeed = 1
const seedOf = (el: HTMLElement) => {
  let s = seeds.get(el)
  if (s === undefined) { s = (nextSeed++ * 977.3) % 5000; seeds.set(el, s) }
  return s
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** A corner radius in px, from a computed value (px, or % of the short side for round things). */
function radiusPx(cs: CSSStyleDeclaration, w: number, h: number) {
  const v = cs.borderTopLeftRadius
  const n = parseFloat(v)
  if (!(n > 0)) return 0
  return v.endsWith('%') ? (n / 100) * Math.min(w, h) : n
}

interface Piece { el: HTMLElement; box: Box; clip: Box | null; radius: number; opacity: number; k: number }

export function GlassLayer({ bg, leaving = false }: { bg: string; leaving?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef(bg)
  bgRef.current = bg
  const working = useRef(false)

  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false })
    if (!gl) return     // no WebGL: the CSS fallback in styles.css stays
    let prog: WebGLProgram
    try {
      prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
    } catch (e) {
      console.warn('Refractive glass unavailable:', e)
      return
    }
    working.current = true
    document.documentElement.dataset.glassgl = '1'
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    const u = (name: string) => gl.getUniformLocation(prog, name)
    const uHasSrc = u('uHasSrc'), uGlass = u('uGlass'), uRes = u('uRes'), uUv = u('uUv'), uBg = u('uBg'), uDim = u('uDim')
    const uFade = u('uFade'), uScale = u('uScale'), uRect = u('uRect'), uMeta = u('uMeta'), uBox = u('uBox')
    let uploaded: HTMLCanvasElement | HTMLImageElement | null = null
    // the page colour eases to a new theme instead of snapping
    let shown: [number, number, number] | null = null
    let lastNow = performance.now()

    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - lastNow) / 1000)
      lastNow = now
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
      gl.enable(gl.SCISSOR_TEST)

      // the background
      const src = backdropSource()
      const ready = src && (src.el instanceof HTMLImageElement ? src.el.complete && src.el.naturalWidth > 0 : src.el.width > 1)
      if (src && ready) {
        if (src.live || uploaded !== src.el) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.el)
          uploaded = src.el
        }
        let sx = 1, sy = 1
        if (src.cover && src.el instanceof HTMLImageElement) {
          const va = w / h, ia = src.el.naturalWidth / src.el.naturalHeight
          if (ia > va) sx = va / ia
          else sy = ia / va
        }
        gl.uniform4f(uUv, sx, sy, (1 - sx) / 2, (1 - sy) / 2)
        gl.uniform1f(uDim, src.dim)
      } else {
        uploaded = null
        gl.uniform1f(uDim, 0)
      }
      gl.uniform1i(uHasSrc, src && ready ? 1 : 0)
      gl.uniform1f(uFade, backdropFade())
      const target = hexToRgb(bgRef.current)
      if (!shown) shown = target
      else {
        const k = 1 - Math.exp(-8 * dt)
        shown = [shown[0] + (target[0] - shown[0]) * k, shown[1] + (target[1] - shown[1]) * k, shown[2] + (target[2] - shown[2]) * k]
      }
      gl.uniform3f(uBg, shown[0], shown[1], shown[2])
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uScale, dpr)
      gl.scissor(0, 0, w, h)
      gl.disable(gl.BLEND)
      gl.uniform1i(uGlass, 0)
      gl.uniform4f(uBox, 0, 0, w, h)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // the glass, where each piece is this frame; overlays (menus, dialogs, toasts) after the rest
      const memo = new Map<HTMLElement, Context>()
      const under: Piece[] = [], over: Piece[] = []
      for (const el of document.querySelectorAll<HTMLElement>(GLASS_SELECTOR)) {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue
        const up = el.parentElement ? contextOf(el.parentElement, memo) : { opacity: 1, clip: null }
        const cs = getComputedStyle(el)
        const opacity = up.opacity * parseFloat(cs.opacity)
        if (opacity < 0.01 || cs.visibility === 'hidden') continue
        // a scaled piece (the press bounce) has scaled corners too
        const scale = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1
        const piece: Piece = {
          el, box: [r.left, r.top, r.right, r.bottom], clip: up.clip,
          radius: radiusPx(cs, r.width, r.height) * scale, opacity,
          k: Math.min(1, Math.max(0.3, Math.min(r.width, r.height) / FULL_SIZE)),
        }
        ;(el.closest(OVERLAY_SELECTOR) ? over : under).push(piece)
      }
      gl.enable(gl.BLEND)
      gl.uniform1i(uGlass, 1)
      for (const list of [under, over]) {
        for (const p of list) {
          let [l, t, rt, b] = p.box
          if (p.clip) {
            // the part of it that its scrolling or clipping parents let through
            const cl = Math.max(l - 1, p.clip[0]), ct = Math.max(t - 1, p.clip[1]), cr = Math.min(rt + 1, p.clip[2]), cb = Math.min(b + 1, p.clip[3])
            if (cr <= cl || cb <= ct) continue
            gl.scissor(Math.floor(cl * dpr), Math.floor(h - cb * dpr), Math.ceil((cr - cl) * dpr) + 1, Math.ceil((cb - ct) * dpr) + 1)
          } else {
            gl.scissor(0, 0, w, h)
          }
          l -= 1.5; t -= 1.5; rt += 1.5; b += 1.5
          gl.uniform4f(uBox, l * dpr, t * dpr, (rt - l) * dpr, (b - t) * dpr)
          const bw = p.box[2] - p.box[0], bh = p.box[3] - p.box[1]
          gl.uniform4f(uRect, p.box[0] * dpr, p.box[1] * dpr, bw * dpr, bh * dpr)
          gl.uniform4f(uMeta, p.radius * dpr, p.opacity, seedOf(p.el) * dpr, p.k)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      working.current = false
      delete document.documentElement.dataset.glassgl
      // (the context is left alone: React may mount this again on the same canvas)
    }
  }, [])

  // While the layer fades away the CSS blur already comes back (and the plain backdrop fades in).
  useEffect(() => {
    if (!working.current) return
    if (leaving) delete document.documentElement.dataset.glassgl
    else document.documentElement.dataset.glassgl = '1'
  }, [leaving])

  return <canvas ref={ref} className={'glass-canvas' + (leaving ? ' leaving' : '')} aria-hidden />
}
