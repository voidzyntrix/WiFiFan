// Draws the fluid (FluidSim's particles) as a smooth, tinted liquid with WebGL:
//  1. every particle is splatted as a soft blob into a half-resolution density map (additively,
//     so neighbouring particles melt into one body; a lone particle stays too faint to show);
//  2. the map is blurred a little so the surface comes out smooth, not lumpy;
//  3. one full-resolution pass turns it into a surface: the edge is where the density crosses a
//     threshold (anti-aliased to the pixel), the colour deepens with depth, and light from the
//     top left shades it by the slope of the surface: a soft sheen, one small glint, and a thin
//     crisp lit edge (a couple of pixels wide whatever the slope).
// The liquid is opaque enough to hide whatever is behind it. The result is premultiplied RGBA on
// its own canvas, which the background copies into the visible one.

import type { FluidSim } from './FluidSim'

/** Splat radius in sim radii (cells), and the density one particle adds at its centre. */
const SPLAT = 1.35
const WEIGHT = 0.17
/** Wider targets are drawn at this width and scaled up. */
const MAX_WIDTH = 1920
/** Density at the surface. */
const THRESHOLD = 0.4

const SPLAT_VERT = `#version 300 es
in vec2 aPos;      // px on the full-size canvas, from the top left
uniform vec2 uRes;
uniform float uSize;
void main() {
  vec2 p = aPos / uRes;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  gl_PointSize = uSize;
}`

const SPLAT_FRAG = `#version 300 es
precision highp float;
uniform float uWeight;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float k = 1.0 - r2;
  outColor = vec4(k * k * k * uWeight, 0.0, 0.0, 0.0);
}`

const QUAD_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;       // one tap, in uv
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uSrc, 0));
  float sum = texture(uSrc, uv).r * 0.2270270;
  sum += (texture(uSrc, uv + uStep * 1.3846).r + texture(uSrc, uv - uStep * 1.3846).r) * 0.3162162;
  sum += (texture(uSrc, uv + uStep * 3.2308).r + texture(uSrc, uv - uStep * 3.2308).r) * 0.0702703;
  outColor = vec4(sum, 0.0, 0.0, 0.0);
}`

const SHADE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uDensity;
uniform vec2 uRes;        // canvas, px
uniform float uCell;      // px per sim radius
uniform vec3 uColor;
uniform float uT;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;     // the density map is stored the same way up as it is drawn (y up)
  float d = texture(uDensity, uv).r;

  // distance to the edge in pixels (the density changes by fwidth(d) per pixel)
  float w = max(fwidth(d), 1e-4);
  float dist = (d - uT) / w;
  float cover = clamp(dist + 0.5, 0.0, 1.0);
  if (cover <= 0.0) { outColor = vec4(0.0); return; }

  // slope of the surface, per radius, from a wide enough step to be smooth
  float e = max(2.0, uCell * 0.3);
  vec2 ex = vec2(e, 0.0) / uRes, ey = vec2(0.0, e) / uRes;
  vec2 g = vec2(texture(uDensity, uv + ex).r - texture(uDensity, uv - ex).r,
                texture(uDensity, uv + ey).r - texture(uDensity, uv - ey).r) / (2.0 * e / uCell);
  vec3 n = normalize(vec3(-g * 0.9, 1.0));

  // how deep this is below the surface: the density around it a radius or two out
  float ring = 0.0;
  for (int i = 0; i < 6; i++) {
    float t = 1.0471976 * float(i);
    ring += texture(uDensity, uv + vec2(cos(t), sin(t)) * uCell * 1.9 / uRes).r;
  }
  float depth = smoothstep(0.25, 0.9, ring / 6.0);

  vec3 top = mix(uColor, vec3(1.0), 0.1) * 1.02;
  vec3 deep = uColor * 0.46;
  vec3 col = mix(top, deep, pow(depth, 0.85));

  // light from the top left (y is up here)
  vec3 L = normalize(vec3(-0.5, 0.65, 0.6));
  float diff = dot(n, L);
  col *= 0.9 + 0.22 * diff;
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, H), 0.0);
  col += vec3(1.0) * (pow(nh, 22.0) * 0.12 + pow(nh, 160.0) * 0.38);

  // a thin lit edge, two pixels wide, brightest where the edge faces the light
  float edge = 1.0 - smoothstep(0.0, 2.4, dist);
  float facing = 0.55 + 0.45 * clamp(dot(normalize(-g + vec2(1e-4)), vec2(-0.6, 0.8)), -1.0, 1.0);
  col += mix(uColor, vec3(1.0), 0.65) * edge * facing * 0.32;

  float a = cover * 0.97;
  outColor = vec4(min(col, vec3(1.0)) * a, a);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
  return s
}

function program(gl: WebGL2RenderingContext, vert: string, frag: string) {
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
  return p
}

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer }

export class FluidRenderer {
  readonly canvas = document.createElement('canvas')
  private gl: WebGL2RenderingContext
  private splat: WebGLProgram
  private blur: WebGLProgram
  private shade: WebGLProgram
  private a: Target
  private b: Target
  private buf: WebGLBuffer
  private vao: WebGLVertexArrayObject
  private data = new Float32Array(0)
  private mapW = 0
  private mapH = 0
  private maxPoint: number
  private loc: Record<string, WebGLUniformLocation | null> = {}

  /** null when WebGL2 or renderable float textures aren't there (the caller falls back to the flat metaballs). */
  static create(): FluidRenderer | null {
    try { return new FluidRenderer() } catch (e) { console.warn('Fluid shading unavailable:', e); return null }
  }

  private constructor() {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('no WebGL2')
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('no float targets')
    this.gl = gl
    this.maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]
    this.splat = program(gl, SPLAT_VERT, SPLAT_FRAG)
    this.blur = program(gl, QUAD_VERT, BLUR_FRAG)
    this.shade = program(gl, QUAD_VERT, SHADE_FRAG)
    this.a = { tex: gl.createTexture()!, fbo: gl.createFramebuffer()! }
    this.b = { tex: gl.createTexture()!, fbo: gl.createFramebuffer()! }
    this.buf = gl.createBuffer()!
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const aPos = gl.getAttribLocation(this.splat, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 8, 0)
    gl.bindVertexArray(null)
    for (const [prog, names] of [
      [this.splat, ['uRes', 'uSize', 'uWeight']],
      [this.blur, ['uSrc', 'uStep']],
      [this.shade, ['uDensity', 'uRes', 'uCell', 'uColor', 'uT']],
    ] as [WebGLProgram, string[]][]) {
      for (const n of names) this.loc[`${prog === this.splat ? 's' : prog === this.blur ? 'b' : 'h'}.${n}`] = gl.getUniformLocation(prog, n)
    }
  }

  private fitMaps(w: number, h: number) {
    const gl = this.gl
    const mw = Math.max(1, Math.ceil(w / 2)), mh = Math.max(1, Math.ceil(h / 2))
    if (mw === this.mapW && mh === this.mapH) return
    this.mapW = mw; this.mapH = mh
    for (const t of [this.a, this.b]) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, mw, mh, 0, gl.RGBA, gl.HALF_FLOAT, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
    }
  }

  /**
   * Draws the particles into [canvas] for a w x h px target; [cell] is device px per sim radius and
   * [rgb] the liquid's colour, 0..255. On very large screens it draws smaller (the liquid is soft
   * anyway) and the caller scales the canvas up.
   */
  render(sim: FluidSim, targetW: number, targetH: number, targetCell: number, rgb: [number, number, number]) {
    const gl = this.gl
    const q = Math.min(1, MAX_WIDTH / targetW)
    const w = Math.max(1, Math.round(targetW * q)), h = Math.max(1, Math.round(targetH * q)), cell = targetCell * q
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    this.fitMaps(w, h)

    const n = sim.count
    if (this.data.length < n * 2) this.data = new Float32Array(n * 2)
    const d = this.data
    for (let i = 0; i < n; i++) { d[i * 2] = sim.x[i] * cell; d[i * 2 + 1] = sim.y[i] * cell }

    gl.disable(gl.SCISSOR_TEST)
    gl.viewport(0, 0, this.mapW, this.mapH)

    // 1. density
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.fbo)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(this.splat)
    gl.uniform2f(this.loc['s.uRes'], w, h)
    gl.uniform1f(this.loc['s.uSize'], Math.min(this.maxPoint, SPLAT * 2 * cell * (this.mapW / w)))
    gl.uniform1f(this.loc['s.uWeight'], WEIGHT)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 2), gl.STREAM_DRAW)
    gl.drawArrays(gl.POINTS, 0, n)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)

    // 2. a little blur, along then across (a -> b -> a); the step follows the cell size
    const step = Math.max(0.6, cell * 0.075)
    gl.useProgram(this.blur)
    gl.uniform1i(this.loc['b.uSrc'], 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fbo)
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex)
    gl.uniform2f(this.loc['b.uStep'], step / this.mapW, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.fbo)
    gl.bindTexture(gl.TEXTURE_2D, this.b.tex)
    gl.uniform2f(this.loc['b.uStep'], 0, step / this.mapH)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 3. the surface
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.shade)
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex)
    gl.uniform1i(this.loc['h.uDensity'], 0)
    gl.uniform2f(this.loc['h.uRes'], w, h)
    gl.uniform1f(this.loc['h.uCell'], cell)
    gl.uniform3f(this.loc['h.uColor'], rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    gl.uniform1f(this.loc['h.uT'], THRESHOLD)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    return this.canvas
  }
}
