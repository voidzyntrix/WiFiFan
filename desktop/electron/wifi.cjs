// Wi-Fi boards for Glow for Windows: the UDP discovery broadcast and the TCP links, which a page
// can't open itself. The UI sees them as `glow.wifi` (preload.cjs, web/src/platform/wifi.ts).
//
// Discovery: "GLOW?" goes to every IPv4 interface's broadcast address (and 255.255.255.255) on
// UDP 4211 about once a second; each board answers "GLOW,<id>,<name>,<version>,<state>".

const { ipcMain } = require('electron')
const dgram = require('node:dgram')
const net = require('node:net')
const os = require('node:os')

const UDP_PORT = 4211
const CONNECT_TIMEOUT_MS = 6000

/** Broadcast addresses of this PC's IPv4 networks. */
function broadcastAddresses() {
  const out = new Set(['255.255.255.255'])
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue
      const ip = a.address.split('.').map(Number)
      const mask = a.netmask.split('.').map(Number)
      out.add(ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join('.'))
    }
  }
  return [...out]
}

function setupWifi(getWin) {
  const send = (channel, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(channel, data) }

  // --- discovery ---
  let udp = null
  let timer = null

  function startDiscovery() {
    if (udp) return
    udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    udp.on('error', () => stopDiscovery())
    udp.on('message', (msg, rinfo) => {
      const parts = msg.toString('utf8').trim().split(',')
      if (parts[0] !== 'GLOW' || !parts[1]) return
      send('wifi:found', { id: parts[1], name: parts[2] || null, version: parts[3] || null, state: parts[4] || 'ready', host: rinfo.address })
    })
    udp.bind(0, () => {
      udp.setBroadcast(true)
      const ping = () => {
        for (const addr of broadcastAddresses()) udp?.send('GLOW?', UDP_PORT, addr, () => {})
      }
      ping()
      timer = setInterval(ping, 1000)
    })
  }

  function stopDiscovery() {
    clearInterval(timer)
    timer = null
    try { udp?.close() } catch { /* already closed */ }
    udp = null
  }

  ipcMain.on('wifi:discover', (_e, on) => (on ? startDiscovery() : stopDiscovery()))

  // --- TCP links ---
  const sockets = new Map()
  let nextId = 1

  ipcMain.handle('wifi:connect', (_e, host, port) => new Promise((resolve, reject) => {
    const id = String(nextId++)
    const s = net.createConnection({ host, port })
    s.setNoDelay(true)
    s.setKeepAlive(true, 5000)
    s.setTimeout(CONNECT_TIMEOUT_MS)
    let open = false
    s.once('connect', () => {
      open = true
      s.setTimeout(0)
      sockets.set(id, s)
      resolve(id)
    })
    s.on('timeout', () => { if (!open) s.destroy(new Error(`${host} didn't answer`)) })
    s.on('data', (d) => send('wifi:data', { id, data: new Uint8Array(d) }))
    s.on('error', (err) => { if (!open) reject(new Error(err.code === 'ECONNREFUSED' ? `${host} refused the connection` : err.message)) })
    s.on('close', () => {
      if (sockets.delete(id)) send('wifi:closed', id)
    })
  }))

  ipcMain.handle('wifi:write', (_e, id, data) => new Promise((resolve, reject) => {
    const s = sockets.get(id)
    if (!s) { reject(new Error('Not connected')); return }
    s.write(Buffer.from(data), (err) => (err ? reject(err) : resolve()))
  }))

  ipcMain.on('wifi:close', (_e, id) => {
    const s = sockets.get(id)
    sockets.delete(id)
    s?.destroy()
  })
}

module.exports = { setupWifi }
