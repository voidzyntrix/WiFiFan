// Refractive glass (Settings > App UI > Refractive glass), drawn with WebGL.
//
// One full-window canvas sits between the background and the UI. Each frame it draws the
// background (from source.ts) and, wherever a card is right now, a refracted copy of it:
//  - the Android app's rim bend: a circular bevel along the rounded rectangle's border pulls the
//    background inwards, with a hint of colour fringing and light catching the top-left rim;
//  - a soft warp across the inside, like uneven thick glass (it moves with the card).
// Cards are measured every frame (position, corner radius, opacity), so the glass slides, scales
// and fades in with their animations instead of appearing once they have settled.
// Everything is computed per pixel at the screen's full resolution.

import { useEffect, useRef } from 'react'
import { backdropSource } from './source'

/** Which elements are glass. */
const GLASS_SELECTOR = '.panel, .board-tile'
const MAX_PANELS = 32
/** Rim width and how far it bends the background, in CSS px (Android: 18 / 16 dp). */
const EDGE = 22
const STRENGTH = 20
/** The inside warp: how far (CSS px) and how wide its waves are. */
const WARP = 9
const WARP_SIZE = 150

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform bool uHasSrc;
uniform vec2 uRes;
uniform vec4 uUv;      // source uv = screen uv * xy + zw (crop for the photo)
uniform vec3 uBg;
uniform float uDim;
uniform float uScale;  // device pixels per CSS px
uniform int uCount;
uniform vec4 uRect[${MAX_PANELS}];  // x, y, w, h (device px, from the top left)
uniform vec4 uMeta[${MAX_PANELS}];  // corner radius, opacity, seed, -
out vec4 outColor;

vec3 bgAt(vec2 p) {
  vec3 c = uBg;
  if (uHasSrc) {
    vec4 t = texture(uSrc, (p / uRes) * uUv.xy + uUv.zw);
    c = c * (1.0 - t.a) + t.rgb;       // premultiplied
  }
  return c * (1.0 - uDim);
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
  vec3 col = bgAt(p);
  float edge = ${EDGE.toFixed(1)} * uScale;
  float strength = ${STRENGTH.toFixed(1)} * uScale;
  for (int i = 0; i < ${MAX_PANELS}; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec2 hs = r.zw * 0.5;
    vec2 lp = p - (r.xy + hs);
    float rad = min(uMeta[i].x, min(hs.x, hs.y));
    float d = sdRoundRect(lp, hs, rad);
    if (d > 1.0) continue;
    float depth = -d;

    // outward normal of the rim
    vec2 n = vec2(
      sdRoundRect(lp + vec2(1.0, 0.0), hs, rad) - sdRoundRect(lp - vec2(1.0, 0.0), hs, rad),
      sdRoundRect(lp + vec2(0.0, 1.0), hs, rad) - sdRoundRect(lp - vec2(0.0, 1.0), hs, rad));
    n /= max(length(n), 0.0001);

    // circular bevel: flat inside, steepest right at the border
    float k = 1.0 - clamp(depth / edge, 0.0, 1.0);
    float bend = 1.0 - sqrt(max(1.0 - k * k, 0.0));
    vec2 off = n * strength * bend;
    // the soft warp across the inside, fading out where the rim takes over
    off += warp((lp + uMeta[i].z) / (${WARP_SIZE.toFixed(1)} * uScale)) * (${(WARP * 2).toFixed(1)} * uScale) * (1.0 - bend);

    vec3 g;
    g.g = bgAt(p - off).g;
    g.r = bgAt(p - off * 1.04).r;
    g.b = bgAt(p - off * 0.96).b;
    float light = max(dot(n, vec2(-0.7071, -0.7071)), 0.0) * bend * 0.22;
    g = min(g + light, 1.0);

    float a = clamp(0.5 - d, 0.0, 1.0) * uMeta[i].y;   // antialiased border, card opacity
    col = mix(col, g, a);
  }
  outColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
  return s
}

/** Opacity as seen on screen: the element's and every ancestor's. */
function shownOpacity(el: HTMLElement) {
  let o = 1
  for (let e: HTMLElement | null = el; e && e !== document.body; e = e.parentElement) {
    o *= parseFloat(getComputedStyle(e).opacity)
    if (o < 0.01) return 0
  }
  return o
}

/** Each card keeps its own warp pattern while it exists. */
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

export function GlassLayer({ bg }: { bg: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef(bg)
  bgRef.current = bg

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
    document.documentElement.dataset.glassgl = '1'
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
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
    const u = (name: string) => gl.getUniformLocation(prog, name)
    const uHasSrc = u('uHasSrc'), uRes = u('uRes'), uUv = u('uUv'), uBg = u('uBg'), uDim = u('uDim')
    const uScale = u('uScale'), uCount = u('uCount'), uRect = u('uRect'), uMeta = u('uMeta')
    const rects = new Float32Array(MAX_PANELS * 4)
    const metas = new Float32Array(MAX_PANELS * 4)
    let uploaded: HTMLCanvasElement | HTMLImageElement | null = null

    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)

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
      gl.uniform3f(uBg, ...hexToRgb(bgRef.current))
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uScale, dpr)

      // the cards, where they are this frame
      let count = 0
      for (const el of document.querySelectorAll<HTMLElement>(GLASS_SELECTOR)) {
        if (count >= MAX_PANELS) break
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight) continue
        const o = shownOpacity(el)
        if (o < 0.01) continue
        // a scaled card (the press bounce) has scaled corners too
        const scale = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) * scale
        rects.set([r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr], count * 4)
        metas.set([radius * dpr, o, seedOf(el) * dpr, 0], count * 4)
        count++
      }
      gl.uniform1i(uCount, count)
      gl.uniform4fv(uRect, rects)
      gl.uniform4fv(uMeta, metas)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      delete document.documentElement.dataset.glassgl
      // (the context is left alone: React may mount this again on the same canvas)
    }
  }, [])

  return <canvas ref={ref} className="glass-canvas" aria-hidden />
}
