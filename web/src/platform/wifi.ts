// Wi-Fi boards through the native shell's sockets (a page can't open UDP or TCP itself): Electron's
// main process on Windows (preload.cjs `glow.wifi`), Kotlin on Android (Bridge.kt, wrapped in
// android.ts). Both offer the same small SocketBridge; this turns it into the WifiTransport.

import type { BleLink, WifiDevice, WifiTransport } from './types'

/** What a shell offers: a discovery broadcast and TCP sockets, by id. */
export interface SocketBridge {
  /** Broadcasts "GLOW?" every second or so while on; each answer arrives through onFound. */
  discover(on: boolean): void
  onFound(fn: (device: WifiDevice) => void): () => void
  /** Resolves with the socket's id once connected. */
  connect(host: string, port: number): Promise<string>
  write(id: string, data: Uint8Array): Promise<void>
  close(id: string): void
  onData(fn: (id: string, data: Uint8Array) => void): () => void
  onClosed(fn: (id: string) => void): () => void
  joinSetup?(prefix: string, password: string): Promise<{ ssid: string | null }>
  leaveSetup?(): void
}

class SocketLink implements BleLink {
  readonly chunk = 512
  private dataFns = new Set<(d: Uint8Array) => void>()
  private closeFns = new Set<() => void>()
  private closed = false
  private offs: (() => void)[]

  constructor(private bridge: SocketBridge, private socket: string, readonly id: string, readonly name: string | null) {
    this.offs = [
      bridge.onData((s, d) => { if (s === socket) this.dataFns.forEach((f) => f(d)) }),
      bridge.onClosed((s) => { if (s === socket) this.dropped() }),
    ]
  }

  write(data: Uint8Array) { return this.bridge.write(this.socket, data) }
  onData(fn: (d: Uint8Array) => void) { this.dataFns.add(fn); return () => { this.dataFns.delete(fn) } }
  onClose(fn: () => void) { this.closeFns.add(fn); return () => { this.closeFns.delete(fn) } }

  private dropped() {
    if (this.closed) return
    this.closed = true
    this.offs.forEach((off) => off())
    this.closeFns.forEach((f) => f())
  }

  close() { this.bridge.close(this.socket); this.dropped() }
}

export function socketWifi(bridge: SocketBridge): WifiTransport {
  let discovering = 0
  return {
    discover(onDevices) {
      const found = new Map<string, WifiDevice>()
      onDevices([])
      const off = bridge.onFound((d) => {
        const was = found.get(d.id)
        if (was && was.host === d.host && was.state === d.state && was.name === d.name) return
        found.set(d.id, d)
        onDevices([...found.values()])
      })
      if (discovering++ === 0) bridge.discover(true)
      let stopped = false
      return () => {
        if (stopped) return
        stopped = true
        off()
        if (--discovering === 0) bridge.discover(false)
      }
    },
    async connect(host, port) {
      const socket = await bridge.connect(host, port).catch((e: Error) => {
        // Electron's IPC wraps errors: "Error invoking remote method '…': Error: <message>"
        throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      })
      return new SocketLink(bridge, socket, host, null)
    },
    joinSetup: bridge.joinSetup && (async (prefix, password) => {
      const { ssid } = await bridge.joinSetup!(prefix, password)
      return { ssid, leave: () => bridge.leaveSetup?.() }
    }),
  }
}
