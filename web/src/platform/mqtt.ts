// A small MQTT 3.1.1 client over WebSocket, for reaching Wi-Fi boards through a cloud broker from
// anywhere (devices/cloud.ts). Only what Glow needs: connect with a user name and password,
// subscribe, publish (QoS 0), receive. WebSocket is in every page, so Android, Windows and a plain
// browser all use it as it is; no native code.

const enc = new TextEncoder()
const dec = new TextDecoder()

const CONNACK_ERRORS: Record<number, string> = {
  1: 'the broker does not speak MQTT 3.1.1',
  2: 'the broker refused the client id',
  3: 'the broker is unavailable',
  4: 'wrong user name or password',
  5: 'not allowed (check the broker user and its permissions)',
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const u16 = (n: number) => new Uint8Array([n >> 8, n & 255])
const str = (s: string) => { const b = enc.encode(s); return concat(u16(b.length), b) }

function packet(first: number, body: Uint8Array) {
  const len: number[] = []
  let n = body.length
  do { let d = n & 127; n >>= 7; if (n) d |= 128; len.push(d) } while (n)
  return concat(new Uint8Array([first, ...len]), body)
}

export interface MqttOptions { clientId: string; user?: string; pass?: string; keepAliveSec?: number }

export class MqttClient {
  private messageFns = new Set<(topic: string, payload: Uint8Array, retained: boolean) => void>()
  private closeFns = new Set<(reason: string) => void>()
  private buf = new Uint8Array(0)
  private ping = 0
  private nextId = 1
  private closed = false

  private constructor(private ws: WebSocket) {}

  /** Connects and logs in; rejects with a readable reason. */
  static connect(url: string, opts: MqttOptions, timeoutMs = 10_000): Promise<MqttClient> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket
      try { ws = new WebSocket(url, 'mqtt') } catch (e) { reject(new Error(`bad broker address (${(e as Error).message})`)); return }
      ws.binaryType = 'arraybuffer'
      const client = new MqttClient(ws)
      let settled = false
      const fail = (why: string) => { if (settled) return; settled = true; window.clearTimeout(timer); client.shutdown(why); reject(new Error(why)) }
      const timer = window.setTimeout(() => fail("the broker didn't answer"), timeoutMs)

      ws.onopen = () => {
        const keep = opts.keepAliveSec ?? 30
        let flags = 0x02   // clean session
        if (opts.user) flags |= 0x80
        if (opts.user && opts.pass) flags |= 0x40
        ws.send(packet(0x10, concat(str('MQTT'), new Uint8Array([4, flags]), u16(keep), str(opts.clientId),
          opts.user ? str(opts.user) : new Uint8Array(0), opts.user && opts.pass ? str(opts.pass) : new Uint8Array(0))))
        client.ping = window.setInterval(() => client.send(new Uint8Array([0xc0, 0])), keep * 500)
      }
      ws.onmessage = (e) => {
        client.buf = concat(client.buf, new Uint8Array(e.data as ArrayBuffer))
        client.parse((first, body) => {
          if ((first >> 4) === 2 && !settled) {            // CONNACK
            if (body[1] === 0) { settled = true; window.clearTimeout(timer); resolve(client) }
            else fail(CONNACK_ERRORS[body[1]] ?? `the broker refused (code ${body[1]})`)
          }
        })
      }
      ws.onerror = () => fail("couldn't reach the broker (check its address and the WebSocket port)")
      ws.onclose = () => { if (!settled) fail("couldn't reach the broker"); else client.shutdown('the connection to the broker closed') }
    })
  }

  /** Splits the received bytes into whole packets. */
  private parse(onConnack?: (first: number, body: Uint8Array) => void) {
    for (;;) {
      if (this.buf.length < 2) return
      let rem = 0, mult = 1, i = 1
      for (;; i++) {
        if (i >= this.buf.length) return
        rem += (this.buf[i] & 127) * mult
        mult *= 128
        if (!(this.buf[i] & 128)) { i++; break }
        if (i > 4) { this.shutdown('broken data from the broker'); return }
      }
      if (this.buf.length < i + rem) return
      const first = this.buf[0], body = this.buf.slice(i, i + rem)
      this.buf = this.buf.slice(i + rem)
      onConnack?.(first, body)
      if ((first >> 4) === 3) this.publishReceived(first, body)
    }
  }

  private publishReceived(first: number, body: Uint8Array) {
    const tl = (body[0] << 8) | body[1]
    let off = 2 + tl
    const topic = dec.decode(body.subarray(2, 2 + tl))
    const qos = (first >> 1) & 3
    if (qos > 0) {
      const id = body.subarray(off, off + 2)
      off += 2
      if (qos === 1) this.send(packet(0x40, id))          // PUBACK
    }
    const payload = body.slice(off)
    this.messageFns.forEach((f) => f(topic, payload, (first & 1) === 1))
  }

  private send(data: Uint8Array) {
    if (!this.closed && this.ws.readyState === WebSocket.OPEN) this.ws.send(data)
  }

  subscribe(topic: string) {
    this.send(packet(0x82, concat(u16(this.nextId++), str(topic), new Uint8Array([0]))))
  }

  publish(topic: string, payload: Uint8Array, retain = false) {
    this.send(packet(0x30 | (retain ? 1 : 0), concat(str(topic), payload)))
  }

  onMessage(fn: (topic: string, payload: Uint8Array, retained: boolean) => void) { this.messageFns.add(fn); return () => { this.messageFns.delete(fn) } }
  onClose(fn: (reason: string) => void) { this.closeFns.add(fn); return () => { this.closeFns.delete(fn) } }

  private shutdown(reason: string) {
    if (this.closed) return
    this.closed = true
    window.clearInterval(this.ping)
    try { this.ws.close() } catch { /* already closed */ }
    this.closeFns.forEach((f) => f(reason))
  }

  close() {
    this.send(new Uint8Array([0xe0, 0]))
    this.shutdown('closed')
  }
}
