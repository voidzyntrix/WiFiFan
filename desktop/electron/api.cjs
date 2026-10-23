// The WebSocket API: a tiny RFC 6455 server (text frames only, no dependencies) on 127.0.0.1.
//
// It only moves messages. Every text frame a client sends goes to the UI process as-is (the app's
// web/src/api/bridge.ts turns it into board commands and answers), and whatever the UI sends back
// reaches the client. The protocol is documented in docs/API.md.
//
// Browsers always send an Origin header on a WebSocket; a web page must not be able to drive the
// LED from the user's browser, so a connection that has one is refused. Scripts and tools don't.

const http = require('node:http')
const crypto = require('node:crypto')

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_FRAME = 1 << 20   // 1 MB: far more than any command

function frame(opcode, payload) {
  const len = payload.length
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
      : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b })()
  return Buffer.concat([head, payload])
}

/** Starts (or restarts) the server; `onMessage(clientId, text)` gets every text frame. */
function createApiServer({ onMessage, onClients }) {
  let server = null
  let port = 0
  let nextId = 1
  const clients = new Map()   // id → socket

  function drop(id) {
    const s = clients.get(id)
    if (!s) return
    clients.delete(id)
    s.destroy()
    onClients?.(clients.size)
  }

  function handle(id, socket) {
    let buf = Buffer.alloc(0)
    let text = null   // a fragmented text message in progress
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        if (buf.length < 2) return
        const fin = (buf[0] & 0x80) !== 0
        const opcode = buf[0] & 0x0f
        const masked = (buf[1] & 0x80) !== 0
        let len = buf[1] & 0x7f
        let off = 2
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10 }
        if (!masked || len > MAX_FRAME) return drop(id)   // clients must mask (RFC 6455 §5.1)
        if (buf.length < off + 4 + len) return
        const mask = buf.subarray(off, off + 4)
        const data = Buffer.from(buf.subarray(off + 4, off + 4 + len))
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3]
        buf = buf.subarray(off + 4 + len)
        if (opcode === 0x8) { socket.end(frame(0x8, Buffer.alloc(0))); return drop(id) }
        if (opcode === 0x9) { socket.write(frame(0xA, data)); continue }
        if (opcode === 0xA) continue
        if (opcode === 0x1 || opcode === 0x0) {
          text = opcode === 0x1 ? data : Buffer.concat([text || Buffer.alloc(0), data])
          if (text.length > MAX_FRAME) return drop(id)
          if (fin) { const msg = text.toString('utf8'); text = null; onMessage(id, msg) }
        }
        // binary frames are ignored
      }
    })
    socket.on('close', () => drop(id))
    socket.on('error', () => drop(id))
  }

  function start(wantPort) {
    if (server && port === wantPort) return Promise.resolve(true)
    stop()
    return new Promise((resolve) => {
      const s = http.createServer((_req, res) => { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Glow API: connect with a WebSocket.\n') })
      s.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key']
        if (req.headers.origin || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
          socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
          return
        }
        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64')
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
        socket.setNoDelay(true)
        const id = nextId++
        clients.set(id, socket)
        handle(id, socket)
        onClients?.(clients.size)
        onMessage(id, '{"cmd":"status"}')   // a new client hears the current state at once
      })
      s.on('error', () => { if (server === s) { server = null; port = 0 } resolve(false) })
      s.listen(wantPort, '127.0.0.1', () => { server = s; port = wantPort; resolve(true) })
    })
  }

  function stop() {
    for (const id of [...clients.keys()]) drop(id)
    if (server) { server.close(); server = null; port = 0 }
  }

  /** Text to one client (`id`) or, without an id, to all of them. */
  function send(id, text) {
    const data = frame(0x1, Buffer.from(text, 'utf8'))
    if (id) clients.get(id)?.write(data)
    else for (const s of clients.values()) s.write(data)
  }

  return { start, stop, send }
}

module.exports = { createApiServer }
