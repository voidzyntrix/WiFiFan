// The WebSocket API's brain (docs/API.md). The desktop shell only moves text between its local
// WebSocket server and this module; here each JSON message becomes board commands (firmware/PROTOCOL.md)
// and gets its answer. Commands go straight to the board and stop a running Music / Visualizer /
// Screen sync first, so the API always has priority over the UI's own modes.
//
// Headless mode lives here too: with it on, the app mounts no UI (main.tsx), the shell hides its
// window, and this module reconnects to the last board so the API keeps working on its own.

import { board } from '../devices/glow/board'
import { stopSync, syncHub } from '../devices/glow/sync'
import { connection } from '../devices/connection'
import { atLeast, clamp, rgbToHsv } from '../lib/color'
import { APP_VERSION, platform } from '../platform'
import { settings } from '../settings/store'

type Msg = Record<string, unknown>
type Hsv = { h: number; s: number; v: number }   // degrees, percent, percent
type Colour = ({ kind: 'hsv' } & Hsv) | { kind: 'rgb'; r: number; g: number; b: number }

class ApiError extends Error {}

const DEFAULT_PIXELS = 24
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const r0 = (x: number) => Math.round(x)

/** The last colour set through the API (what "on" and "brightness" come back to). */
let cur: Hsv | null = null

function fromSettings(): Hsv {
  const p = settings.get()
  return { h: p.ledHue, s: p.ledSat * 100, v: Math.max(p.ledBrightness, 0.05) * 100 }
}
const current = () => cur ?? fromSettings()

/** `{h,s,v}` (degrees, %), `{r,g,b}` (0-255) or a hex string "#rrggbb", in the message itself or under `color`. */
function parseColour(m: Msg): Colour {
  const src = typeof m.color === 'object' && m.color !== null ? (m.color as Msg) : m
  const hex = typeof m.color === 'string' ? m.color : typeof src.hex === 'string' ? src.hex : null
  if (hex !== null) {
    const t = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!t) throw new ApiError(`"${hex}" is not a #rrggbb colour`)
    const n = parseInt(t[1], 16)
    return { kind: 'rgb', r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  if (num(src.r) && num(src.g) && num(src.b)) {
    return { kind: 'rgb', r: clamp(r0(src.r), 0, 255), g: clamp(r0(src.g), 0, 255), b: clamp(r0(src.b), 0, 255) }
  }
  if (num(src.h)) {
    return { kind: 'hsv', h: ((r0(src.h) % 360) + 360) % 360, s: clamp(r0(num(src.s) ? src.s : 100), 0, 100), v: clamp(r0(num(src.v) ? src.v : 100), 0, 100) }
  }
  throw new ApiError('Give a colour as {"h","s","v"}, {"r","g","b"} or a "#rrggbb" string')
}

function toHsv(c: Colour): Hsv {
  if (c.kind === 'hsv') return c
  const [h, s, v] = rgbToHsv(c.r, c.g, c.b)
  return { h: r0(h), s: r0(s * 100), v: r0(v * 100) }
}

const hsvArg = (c: Hsv) => `${c.h}/${c.s}/${c.v}`

function needBoard() {
  if (board.snapshot.state !== 'connected') throw new ApiError('No board is connected')
}
function needFirmware(v: string, what: string) {
  if (!atLeast(board.snapshot.firmwareVersion, v)) throw new ApiError(`${what} needs firmware ${v} or newer`)
}
const pixelCount = () => {
  const id = board.snapshot.deviceId
  return (id && settings.get().boardLeds[id]?.pixels) || DEFAULT_PIXELS
}

/** The API has priority: whatever sound or screen sync drives the LED stops first. */
function take() {
  needBoard()
  if (syncHub.get().active !== 'NONE') stopSync()
}

function send(cmd: string) { board.sendData(cmd) }

function setRing(c: Colour) {
  const hsv = toHsv(c)
  cur = hsv.v > 0 ? hsv : { ...current(), v: current().v }
  if (c.kind === 'rgb') send(`l=${c.r}/${c.g}/${c.b}`)
  else send(`h=${hsvArg(hsv)}`)
}

function status() {
  const snap = board.snapshot
  const conn = connection.get()
  return {
    event: 'status',
    version: APP_VERSION,
    connected: snap.state === 'connected',
    device: snap.state === 'connected' ? { id: snap.deviceId, name: conn.device?.name ?? conn.device?.advertised ?? snap.deviceName, firmware: snap.firmwareVersion, pixels: pixelCount() } : null,
    color: cur,
    sync: syncHub.get().active,
    headless: settings.get().headless,
  }
}

const EFFECTS = ['rainbow', 'candle', 'breathe', 'spin', 'none']

function run(m: Msg): Msg | void {
  switch (m.cmd) {
    case 'status': return status()

    case 'on': {
      take()
      const c = current()
      cur = { ...c, v: c.v < 5 ? 100 : c.v }
      send(`h=${hsvArg(cur)}`)
      return
    }
    case 'off':
      take()
      send('off')
      return

    case 'color':
      take()
      setRing(parseColour(m))
      return

    case 'brightness': {
      if (!num(m.value)) throw new ApiError('"value" is a number from 0 to 100')
      take()
      cur = { ...current(), v: clamp(r0(m.value), 0, 100) }
      send(`h=${hsvArg(cur)}`)
      return
    }

    case 'led': {
      if (!num(m.index) || !Number.isInteger(m.index)) throw new ApiError('"index" is the pixel number')
      const n = pixelCount()
      if (m.index < 0 || m.index >= n) throw new ApiError(`"index" is 0 to ${n - 1}`)
      take()
      needFirmware('2.1.0', 'Single pixels')
      send(`p=${m.index}/${hsvArg(toHsv(parseColour(m)))}`)
      return
    }

    case 'leds': {
      const list = m.colors
      if (!Array.isArray(list) || list.length < 1) throw new ApiError('"colors" is a list of colours, pixel 0 first')
      const n = pixelCount()
      if (list.length > n) throw new ApiError(`"colors" has at most ${n} entries`)
      const hsv = list.map((c) => toHsv(parseColour(typeof c === 'string' ? { color: c } : (c as Msg))))
      take()
      needFirmware('2.1.0', 'A colour per pixel')
      send(`pal=${hsv.map(hsvArg).join(',')}`)
      return
    }

    case 'half': {
      if (m.half !== 1 && m.half !== 2) throw new ApiError('"half" is 1 (pixels 0-11) or 2 (pixels 12-23)')
      take()
      needFirmware('1.6.0', 'The halves')
      send(`h${m.half}=${hsvArg(toHsv(parseColour(m)))}`)
      return
    }

    case 'effect': {
      const name = String(m.name)
      if (!EFFECTS.includes(name)) throw new ApiError(`"name" is one of ${EFFECTS.join(', ')}`)
      take()
      const c = current()
      const v = num(m.value) ? clamp(r0(m.value), 0, 100) : c.v
      const secs = num(m.seconds) ? m.seconds : undefined
      if (name === 'none') send(`h=${hsvArg(c)}`)
      else if (name === 'rainbow') send(`rain=${r0(num(m.saturation) ? clamp(m.saturation, 0, 100) : 100)}/${v}${secs ? `/${clamp(r0(secs), 2, 120)}` : ''}`)
      else if (name === 'candle') send(`candle=${v}`)
      else if (name === 'breathe') send(`breathe=${v}`)
      else {
        const col = m.color !== undefined || m.h !== undefined || m.r !== undefined || m.hex !== undefined ? toHsv(parseColour(m)) : c
        send(`spin=${col.h}/${col.s}/${col.v}/${clamp(r0(secs ?? 2), 1, 60)}`)
      }
      return
    }

    case 'fade': {
      if (!num(m.ms)) throw new ApiError('"ms" is 0 to 5000')
      take()
      send(`fade=${clamp(r0(m.ms), 0, 5000)}`)
      return
    }

    case 'raw': {
      if (typeof m.line !== 'string' || !m.line.trim()) throw new ApiError('"line" is a firmware command (firmware/PROTOCOL.md)')
      if (m.line.length > 320) throw new ApiError('"line" is too long')
      take()
      send(m.line.replace(/\\+$/, ''))
      return
    }

    default:
      throw new ApiError(`Unknown cmd "${String(m.cmd)}"`)
  }
}

function answer(clientId: number, text: string) {
  const host = platform.api!
  let id: unknown
  try {
    const m = JSON.parse(text) as Msg
    if (typeof m !== 'object' || m === null || Array.isArray(m)) throw new ApiError('Send a JSON object with a "cmd"')
    id = m.id
    const out = run(m)
    host.send(clientId, JSON.stringify({ ...(out ?? {}), ...(id !== undefined ? { id } : {}), ...(out ? {} : { ok: true }) }))
  } catch (e) {
    const error = e instanceof SyntaxError ? 'Not valid JSON' : (e as Error).message
    host.send(clientId, JSON.stringify({ ...(id !== undefined ? { id } : {}), ok: false, error }))
  }
}

/** Starts the API on the desktop (a no-op elsewhere): the server follows the settings. */
export function startApi() {
  const host = platform.api
  if (!host) return

  host.onMessage(answer)
  host.onHeadlessExit(() => settings.set({ headless: false }))

  // The server and the shell's window follow the settings.
  let lastKey = ''
  const apply = () => {
    const p = settings.get()
    const key = `${p.apiEnabled}/${p.apiPort}/${p.headless}`
    if (key === lastKey) return
    const prev = lastKey.split('/')
    lastKey = key
    if (prev[0] !== String(p.apiEnabled) || prev[1] !== String(p.apiPort)) void host.listen(p.apiEnabled, p.apiPort)
    if (prev[2] !== String(p.headless)) host.setHeadless(p.headless)
    // headless without the API would be a window-less app nobody can reach
    if (p.headless && !p.apiEnabled) settings.set({ headless: false })
  }
  settings.subscribe(apply)
  apply()
  if (!settings.get().headless) host.setHeadless(false)

  // Everyone listening hears when the board, its colour or its firmware change.
  let sent = ''
  const broadcast = () => {
    const s = JSON.stringify(status())
    if (s === sent) return
    sent = s
    host.send(0, s)
  }
  board.subscribe(broadcast)
  connection.subscribe(broadcast)
  syncHub.subscribe(broadcast)

  // Remember the board, and learn the ring's size when no screen is around to ask for it.
  connection.subscribe(() => {
    const c = connection.get()
    if (c.phase === 'connected' && c.device && !c.demo && settings.get().lastDeviceId !== c.device.id) settings.set({ lastDeviceId: c.device.id })
  })
  board.subscribe(() => {
    const snap = board.snapshot
    const id = snap.deviceId
    if (snap.state !== 'connected' || !id || !atLeast(snap.firmwareVersion, '1.10.0') || settings.get().boardLeds[id]) return
    void board.waitFor('LEDS,', 2000).then((line) => {
      const [, a, b] = line.split(',')
      const pixels = Number(a), leds = Number(b)
      if (!Number.isFinite(pixels) || !Number.isFinite(leds) || leds < 1) return
      settings.set({ boardLeds: { ...settings.get().boardLeds, [id]: { pixels, leds } } })
      broadcast()
    }).catch(() => {})
    board.sendData('leds')
  })

  // Headless: no screen to pick a board on, so the last one is reconnected (and again after a drop).
  const reconnect = () => {
    const p = settings.get()
    const c = connection.get()
    if (!p.headless || c.phase !== 'idle' || c.demo) return
    const saved = p.devices.find((d) => d.id === p.lastDeviceId)
    if (saved) void connection.connect(saved)
  }
  window.setTimeout(reconnect, 1500)
  window.setInterval(reconnect, 8000)
}
