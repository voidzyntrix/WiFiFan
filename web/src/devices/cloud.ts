// Reaching a Wi-Fi board from anywhere, through a cloud MQTT broker (HiveMQ Cloud or any other).
//
// The board keeps one outgoing connection to the broker and takes the same text commands as on the
// local network, as messages (firmware: "cloud (MQTT)" in Projects/ESP32 Glow/main/main.ino):
//   glow/<id>/cmd     app -> board   commands ('\' ends one), like on the TCP link
//   glow/<id>/out     board -> app   its replies
//   glow/<id>/online  board -> all   "1" while connected, "0" (its will) when it is gone
// The broker settings are entered once in Settings and handed to each board whenever Glow reaches it
// on the local network; a board also hands them to a Glow that has none. Changing the Wi-Fi, resetting
// or updating a board is only possible on the local network, never through the broker.

import { MqttClient } from '../platform/mqtt'
import type { BleLink } from '../platform'
import { settings, type CloudConfig } from '../settings/store'

export const cloudConfig = (): CloudConfig | null => settings.get().cloud

export const isConfigured = (c: CloudConfig | null): c is CloudConfig => !!c && c.host.trim().length > 0

/** What the board stores: the broker's address for its own (TCP) connection, and the login. */
export const boardJson = (c: CloudConfig) =>
  JSON.stringify({ host: c.host, port: c.port, wsPort: c.wsPort, tls: c.tls, user: c.user, pass: c.pass })

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
  }
}

export const sameCloud = (a: CloudConfig, b: CloudConfig) =>
  a.host === b.host && a.port === b.port && a.wsPort === b.wsPort && a.tls === b.tls && a.user === b.user && a.pass === b.pass

const ONLINE_WAIT_MS = 6000

/** Opens a link to a board (by its MAC) through the broker; rejects when the broker or the board can't be reached. */
export async function openCloudLink(mac: string): Promise<BleLink> {
  const cfg = cloudConfig()
  if (!isConfigured(cfg)) throw new Error('No internet access is set up (Settings > Internet access)')
  const url = `${cfg.tls ? 'wss' : 'ws'}://${cfg.host}:${cfg.wsPort}/mqtt`
  const client = await MqttClient.connect(url, { clientId: `glow-app-${Math.random().toString(16).slice(2, 10)}`, user: cfg.user, pass: cfg.pass })
    .catch((e: Error) => { throw new Error(`Internet: ${e.message}`) })

  const base = `glow/${mac}`
  const dataFns = new Set<(d: Uint8Array) => void>()
  const closeFns = new Set<() => void>()
  let closed = false
  const drop = () => { if (closed) return; closed = true; closeFns.forEach((f) => f()) }

  // the board's presence (retained): wait for it before handing the link out
  const online = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('The board is offline. It needs power and Wi-Fi.')), ONLINE_WAIT_MS)
    let announced = false
    client.onMessage((topic, payload) => {
      if (topic === `${base}/online`) {
        const up = payload[0] === 0x31
        if (!announced) {
          announced = true
          window.clearTimeout(timer)
          if (up) resolve(); else reject(new Error('The board is offline. It needs power and Wi-Fi.'))
        } else if (!up) drop()
      } else if (topic === `${base}/out`) {
        dataFns.forEach((f) => f(payload))
      }
    })
  })
  client.onClose(drop)
  client.subscribe(`${base}/online`)
  client.subscribe(`${base}/out`)
  try { await online } catch (e) { client.close(); throw e }

  return {
    id: mac,
    name: null,
    via: 'cloud',
    chunk: 480,
    async write(data) { client.publish(`${base}/cmd`, data) },
    onData(fn) { dataFns.add(fn); return () => { dataFns.delete(fn) } },
    onClose(fn) { closeFns.add(fn); return () => { closeFns.delete(fn) } },
    close() { client.close(); drop() },
  }
}
