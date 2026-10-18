// Reaching a Wi-Fi board from anywhere, through an MQTT broker: a free public one (no account) or your own.
// Everything is encrypted end to end, so the broker only carries noise.
//
// The board keeps one outgoing connection to the broker and takes the same text commands as on the
// local network, as messages (firmware: "cloud (MQTT)" in Projects/ESP32 Glow/main/main.ino):
//   g/<base>/c   app -> board   commands ('\' ends one), like on the TCP link
//   g/<base>/o   board -> app   its replies
//   g/<base>/s   board -> all   "1" while connected, "0" (its will) when it is gone
// (<base> is derived from the shared key and the board's id; see crypt() below)
// The broker settings are entered once in Settings and handed to each board whenever Glow reaches it
// on the local network; a board also hands them to a Glow that has none. Changing the Wi-Fi, resetting
// or updating a board is only possible on the local network, never through the broker.

import type { BleLink } from '../platform'
import { settings, type CloudConfig } from '../settings/store'

export const cloudConfig = (): CloudConfig | null => settings.get().cloud

export const isConfigured = (c: CloudConfig | null): c is CloudConfig => !!c && c.host.trim().length > 0 && /^[0-9a-f]{32}$/.test(c.key)

/** A free public broker needs no account; the encryption below is what keeps the boards private. */
export const PUBLIC_BROKERS = [
  { name: 'EMQX public', host: 'broker.emqx.io', port: 8883, wsPort: 8084 },
  { name: 'HiveMQ public', host: 'broker.hivemq.com', port: 8883, wsPort: 8884 },
]

export const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

/** What the board stores: the broker's address for its own (TCP) connection, and the login. */
export const boardJson = (c: CloudConfig) =>
  JSON.stringify({ host: c.host, port: c.port, wsPort: c.wsPort, tls: c.tls, user: c.user, pass: c.pass, key: c.key })

/** Broker settings as the board reports them (null if it has none). */
export function fromBoardJson(json: Record<string, unknown>): CloudConfig | null {
  if (typeof json.host !== 'string' || !json.host) return null
  const port = typeof json.port === 'number' ? json.port : 8883
  return {
    host: json.host,
    port,
    wsPort: typeof json.wsPort === 'number' ? json.wsPort : port === 8883 ? 8884 : port,
    tls: json.tls !== false,
    user: typeof json.user === 'string' ? json.user : '',
    pass: typeof json.pass === 'string' ? json.pass : '',
    key: typeof json.key === 'string' ? json.key : '',
  }
}

export const sameCloud = (a: CloudConfig, b: CloudConfig) =>
  a.host === b.host && a.port === b.port && a.wsPort === b.wsPort && a.tls === b.tls && a.user === b.user && a.pass === b.pass && a.key === b.key

const ONLINE_WAIT_MS = 6000
const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!, (b) => parseInt(b, 16))
const concat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }

/**
 * Messages are sealed with AES-128-GCM under the shared key (a public broker only sees noise):
 * iv(12) | ciphertext | tag(16). A command's plaintext starts with this device's clock (8 bytes, ms),
 * which the board checks to refuse replays. Topics derive from the key and the board id.
 */
async function crypt(cfg: CloudConfig, mac: string) {
  const raw = hexBytes(cfg.key)
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  const base = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', concat(raw, new TextEncoder().encode(mac)))).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
  return {
    base: `g/${base}`,
    async seal(plain: Uint8Array) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      return concat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plain)))
    },
    /** null when it isn't from someone with the key. */
    async open(msg: Uint8Array) {
      if (msg.length < 28) return null
      try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: msg.subarray(0, 12), tagLength: 128 }, key, msg.subarray(12))) } catch { return null }
    },
  }
}

/** Opens a link to a board (by its MAC) through the broker; rejects when the broker or the board can't be reached. */
export async function openCloudLink(mac: string): Promise<BleLink> {
  const cfg = cloudConfig()
  if (!isConfigured(cfg)) throw new Error('No internet access is set up (Settings > Internet access)')
  if (!crypto.subtle) throw new Error('Encryption is not available in this window')
  const k = await crypt(cfg, mac)
  const url = `${cfg.tls ? 'wss' : 'ws'}://${cfg.host}:${cfg.wsPort}/mqtt`
  // The MQTT client only ever runs here, so it isn't loaded until now.
  const client = await import('../platform/mqtt').then((m) => m.MqttClient.connect(url, { clientId: `glow-app-${Math.random().toString(16).slice(2, 10)}`, user: cfg.user || undefined, pass: cfg.pass || undefined }))
    .catch((e: Error) => { throw new Error(`Internet: ${e.message}`) })

  const dataFns = new Set<(d: Uint8Array) => void>()
  const closeFns = new Set<() => void>()
  let closed = false
  const drop = () => { if (closed) return; closed = true; closeFns.forEach((f) => f()) }

  // the board's presence (retained, sealed): wait for it before handing the link out
  const offline = () => new Error('The board is offline. It needs power and Wi-Fi.')
  const online = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(offline()), ONLINE_WAIT_MS)
    let announced = false
    client.onMessage(async (topic, payload) => {
      const plain = await k.open(payload)
      if (!plain) return                                   // not from our board
      if (topic === `${k.base}/s`) {
        const up = plain[0] === 0x31
        if (!announced) {
          announced = true
          window.clearTimeout(timer)
          if (up) resolve(); else reject(offline())
        } else if (!up) drop()
      } else if (topic === `${k.base}/o`) {
        dataFns.forEach((f) => f(plain))
      }
    })
  })
  client.onClose(drop)
  client.subscribe(`${k.base}/s`)
  client.subscribe(`${k.base}/o`)
  try { await online } catch (e) { client.close(); throw e }

  return {
    id: mac,
    name: null,
    via: 'cloud',
    chunk: 480,
    async write(data) {
      const stamp = new Uint8Array(8)
      new DataView(stamp.buffer).setBigUint64(0, BigInt(Date.now()))
      client.publish(`${k.base}/c`, await k.seal(concat(stamp, data)))
    },
    onData(fn) { dataFns.add(fn); return () => { dataFns.delete(fn) } },
    onClose(fn) { closeFns.add(fn); return () => { closeFns.delete(fn) } },
    close() { client.close(); drop() },
  }
}
