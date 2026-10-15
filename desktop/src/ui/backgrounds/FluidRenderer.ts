// Draws the fluid (FluidSim's particles) as glossy water with WebGL:
//  1. every particle is splatted as a soft blob into a half-resolution density map (additively,
//     so neighbouring particles melt into one body; a lone particle stays too faint to show);
//  2. one full-resolution pass turns the density into a surface: the edge where the density
//     crosses a threshold, a height from the density, normals from its slope, then
//     - body colour that deepens with depth (darker and richer further from the surface),
//     - soft diffuse light from the top left and a sharp specular glint,
//     - a Fresnel sheen and a bright rim along the edge,
//     - foam where the water moves fast,
//     - a faint halo around the edge.
// The result is premultiplied RGBA on its own canvas, which the background copies into the
// visible one (so the dot net and the refractive glass see the finished liquid).

import type { FluidSim } from './FluidSim'

/** Splat radius in sim radii (cells), and the density one particle adds at its centre. */
const SPLAT = 1.25
const WEIGHT = 0.2
/** Wider targets are drawn at this width and scaled up. */
const MAX_WIDTH = 1920
/** Density at the surface. */
const THRESHOLD = 0.42

const SPLAT_VERT = `#version 300 es
in vec2 aPos;      // px on the full-size canvas, from the top left
in vec2 aVel;      // radii / s
uniform vec2 uRes;
uniform float uSize;
out float vSpeed;
void main() {
  vec2 p = aPos / uRes;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  gl_PointSize = uSize;
  vSpeed = clamp(length(aVel) / 9.0, 0.0, 1.0);
}`

const SPLAT_FRAG = `#version 300 es
precision highp float;
uniform float uWeight;
in float vSpeed;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float k = 1.0 - r2;
  float w = k * k * k * uWeight;
  outColor = vec4(w, w * vSpeed, 0.0, 0.0);
}`

const QUAD_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const SHADE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uDensity;
uniform vec2 uRes;        // full-size canvas, px
uniform float uCell;      // px per sim radius
uniform vec3 uColor;
uniform float uT;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;     // the density map is stored the same way up as it is drawn (y up)
  vec4 s = texture(uDensity, uv);
  float d = s.r;

  // slope of the surface, per radius
  float e = max(2.0, uCell * 0.12);
  vec2 ex = vec2(e, 0.0) / uRes, ey = vec2(0.0, e) / uRes;
  vec2 g = vec2(texture(uDensity, uv + ex).r - texture(uDensity, uv - ex).r,
                texture(uDensity, uv + ey).r - texture(uDensity, uv - ey).r) / (2.0 * e / uCell);
  vec3 n = normalize(vec3(-g * 1.1, 1.0));

  float aa = fwidth(d) * 0.8 + 0.003;
  float body = smoothstep(uT - aa, uT + aa, d);
  // how deep this point is below the surface: the density a couple of radii around it (about
  // 1 deep inside the water, about a half at its edge, little in a thin sheet or a drop)
  float ring = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = 6.2831853 * float(i) / 8.0;
    ring += texture(uDensity, uv + vec2(cos(t), sin(t)) * uCell * 2.2 / uRes).r;
  }
  float depth = smoothstep(0.3, 0.95, ring / 8.0);

  vec3 L = normalize(vec3(-0.45, 0.6, 0.65));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 60.0);
  float glint = pow(max(dot(n, normalize(vec3(0.35, 0.5, 0.8) + vec3(0.0, 0.0, 1.0))), 0.0), 140.0);
  float fres = pow(1.0 - n.z, 2.2);

  vec3 shallow = uColor * 1.2 + 0.06;
  vec3 deep = uColor * 0.3;
  vec3 col = mix(shallow, deep, depth);
  col *= 0.72 + 0.55 * diff;
  col += vec3(1.0) * (spec * 0.7 + glint * 0.9);
  col += mix(uColor, vec3(1.0), 0.55) * fres * 0.65;

  // a bright rim just inside the edge, and foam where it moves quickly
  float rim = smoothstep(uT, uT + 0.05, d) * (1.0 - smoothstep(uT + 0.05, uT + 0.3, d));
  col += rim * mix(uColor, vec3(1.0), 0.6) * 0.45;
  float foam = clamp(s.g / max(d, 0.05), 0.0, 1.0) * (1.0 - depth * 0.6);
  col = mix(col, vec3(1.0), foam * 0.35 * body);

  float alpha = body * mix(0.58, 0.9, depth);
  // a faint halo outside the edge, so drops don't just stop
  float halo = smoothstep(uT * 0.25, uT, d) * (1.0 - body) * 0.22;
  vec3 haloCol = uColor * 1.1;
  float a = alpha + halo * (1.0 - alpha);
  vec3 rgb = col * alpha + haloCol * halo * (1.0 - alpha);
  outColor = vec4(min(rgb, vec3(1.0)), a);
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

export class FluidRenderer {
  readonly canvas = document.createElement('canvas')
  private gl: WebGL2RenderingContext
  private splat: WebGLProgram
  private shade: WebGLProgram
  private fbo: WebGLFramebuffer
  private tex: WebGLTexture
  private buf: WebGLBuffer
  private vao: WebGLVertexArrayObject
  private data = new Float32Array(0)
  private mapW = 0
  private mapH = 0
  private maxPoint: number

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
    this.shade = program(gl, QUAD_VERT, SHADE_FRAG)
    this.fbo = gl.createFramebuffer()!
    this.tex = gl.createTexture()!
    this.buf = gl.createBuffer()!
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const aPos = gl.getAttribLocation(this.splat, 'aPos'), aVel = gl.getAttribLocation(this.splat, 'aVel')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(aVel)
    gl.vertexAttribPointer(aVel, 2, gl.FLOAT, false, 16, 8)
    gl.bindVertexArray(null)
  }

  private fitMap(w: number, h: number) {
    const gl = this.gl
    const mw = Math.max(1, Math.ceil(w / 2)), mh = Math.max(1, Math.ceil(h / 2))
    if (mw === this.mapW && mh === this.mapH) return
    this.mapW = mw; this.mapH = mh
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, mw, mh, 0, gl.RGBA, gl.HALF_FLOAT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0)
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
    this.fitMap(w, h)

    const n = sim.count
    if (this.data.length < n * 4) this.data = new Float32Array(n * 4)
    const d = this.data
    for (let i = 0; i < n; i++) {
      d[i * 4] = sim.x[i] * cell; d[i * 4 + 1] = sim.y[i] * cell
      d[i * 4 + 2] = sim.vx[i]; d[i * 4 + 3] = sim.vy[i]
    }

    // 1. density
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.viewport(0, 0, this.mapW, this.mapH)
    gl.disable(gl.SCISSOR_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(this.splat)
    gl.uniform2f(gl.getUniformLocation(this.splat, 'uRes'), w, h)
    gl.uniform1f(gl.getUniformLocation(this.splat, 'uSize'), Math.min(this.maxPoint, SPLAT * 2 * cell * (this.mapW / w)))
    gl.uniform1f(gl.getUniformLocation(this.splat, 'uWeight'), WEIGHT)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 4), gl.STREAM_DRAW)
    gl.drawArrays(gl.POINTS, 0, n)
    gl.bindVertexArray(null)

    // 2. the surface
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.shade)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(gl.getUniformLocation(this.shade, 'uDensity'), 0)
    gl.uniform2f(gl.getUniformLocation(this.shade, 'uRes'), w, h)
    gl.uniform1f(gl.getUniformLocation(this.shade, 'uCell'), cell)
    gl.uniform3f(gl.getUniformLocation(this.shade, 'uColor'), rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    gl.uniform1f(gl.getUniformLocation(this.shade, 'uT'), THRESHOLD)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    return this.canvas
  }
}
