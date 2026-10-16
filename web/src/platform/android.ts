// Glow for Android: the WebView shell (app/, MainActivity.kt + Bridge.kt) exposes `window.GlowAndroid`
// (calls into Kotlin) and calls `window.__glowEmit(name, json)` with events back (results of those
// calls, Bluetooth data, download progress). This turns that into a Platform.

import type { BleCentral, BleLink, BleProfile, BtDevice, Platform, WifiDevice } from './types'
import { socketWifi, type SocketBridge } from './wifi'

/** What MainActivity's JavascriptInterface offers. Everything is strings and numbers. */
export interface AndroidBridge {
  /** JSON: { version, sdk, accent: "#rrggbb" | null } */
  info(): string
  bleScan(on: boolean): void
  /** profiles: JSON array of { service, write, notify? } as full 128-bit UUID strings */
  bleConnect(id: string, profiles: string): void
  bleWrite(request: string, base64: string): void
  bleDisconnect(): void
  wifiDiscover(on: boolean): void
  /** Answers with a "tcp" event: { request, ok, socket | error } */
  tcpConnect(request: string, host: string, port: number): void
  tcpWrite(request: string, socket: string, base64: string): void
  tcpClose(socket: string): void
  /** Answers with a "wifiSetup" event: { request, ok, ssid | error } */
  wifiJoinSetup(request: string, prefix: string, password: string): void
  wifiLeaveSetup(): void
  /** Answers with a "wifiScan" event: { request, ok, ssids } */
  wifiScanSetup(request: string, prefix: string): void
  /** Answers with a "wifiCurrent" event: { request, ok, ssid, password } */
  wifiCurrent(request: string): void
  /** kind: "text" | "bytes" | "exists" */
  net(request: string, kind: string, url: string, limit: number): void
  openExternal(url: string): void
  haptic(kind: string): void
  keepAwake(on: boolean): void
  darkTheme(dark: boolean): void
  updateInstall(url: string, version: string): void
}

declare global {
  interface Window {
    GlowAndroid?: AndroidBridge
    __glowEmit?: (name: string, json: string) => void
    __glowBack?: () => boolean
  }
}

type Listener = (data: any) => void   // eslint-disable-line @typescript-eslint/no-explicit-any
const listeners = new Map<string, Set<Listener>>()
function on(name: string, fn: Listener) {
  let set = listeners.get(name)
  if (!set) listeners.set(name, (set = new Set()))
  set.add(fn)
  return () => { set!.delete(fn) }
}

let nextRequest = 1
/** Calls the bridge and waits for the event that answers it (matched by `request`). */
function ask<T>(event: string, call: (request: string) => void): Promise<T> {
  const request = String(nextRequest++)
  return new Promise<T>((resolve, reject) => {
    const off = on(event, (d) => {
      if (d.request !== request) return
      off()
      if (d.ok) resolve(d as T)
      else reject(new Error(d.error ?? 'Failed'))
    })
    call(request)
  })
}

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function fromBase64(b64: string) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** 0xffe0 -> 0000ffe0-0000-1000-8000-00805f9b34fb */
function uuid(v: number | string) {
  return typeof v === 'number' ? `0000${v.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb` : v.toLowerCase()
}

function androidBle(bridge: AndroidBridge): BleCentral {
  let link: AndroidLink | null = null

  class AndroidLink implements BleLink {
    private dataFns = new Set<(d: Uint8Array) => void>()
    private closeFns = new Set<() => void>()
    closed = false
    constructor(readonly id: string, readonly name: string | null, readonly chunk: number) {}
    write(data: Uint8Array) { return ask<void>('bleWritten', (r) => bridge.bleWrite(r, toBase64(data))) }
    onData(fn: (d: Uint8Array) => void) { this.dataFns.add(fn); return () => { this.dataFns.delete(fn) } }
    onClose(fn: () => void) { this.closeFns.add(fn); return () => { this.closeFns.delete(fn) } }
    received(d: Uint8Array) { this.dataFns.forEach((f) => f(d)) }
    dropped() {
      if (this.closed) return
      this.closed = true
      this.closeFns.forEach((f) => f())
    }
    close() { bridge.bleDisconnect(); this.dropped() }
  }

  on('bleData', (d) => link?.received(fromBase64(d.base64)))
  on('bleState', (d) => { if (d.state === 'disconnected' && link && link.id === d.id) { link.dropped(); link = null } })

  return {
    scan(onDevices) {
      const off = on('bleDevices', (d: { devices: BtDevice[] }) => onDevices(d.devices))
      onDevices([])
      bridge.bleScan(true)
      return () => { off(); bridge.bleScan(false) }
    },
    connect(id, profiles) {
      return new Promise((resolve, reject) => {
        const off = on('bleState', (d) => {
          if (d.id !== id) return
          if (d.state === 'connected') {
            off()
            link?.dropped()
            link = new AndroidLink(id, d.name ?? null, Math.max(20, (d.mtu ?? 23) - 3))
            const profile = profiles.find((p) => uuid(p.service) === d.service) ?? profiles[0]
            resolve({ link, profile })
          } else if (d.state === 'disconnected' || d.state === 'failed') {
            off()
            reject(new Error(d.error ?? 'Could not connect. Is it powered and in range?'))
          }
        })
        const json = JSON.stringify(profiles.map((p: BleProfile) => ({
          service: uuid(p.service), write: uuid(p.write), notify: p.notify != null ? uuid(p.notify) : null,
        })))
        bridge.bleConnect(id, json)
      })
    },
  }
}

function androidSockets(bridge: AndroidBridge): SocketBridge {
  return {
    discover: (on) => bridge.wifiDiscover(on),
    onFound: (fn) => on('wifiFound', (d: WifiDevice) => fn(d)),
    connect: (host, port) => ask<{ socket: string }>('tcp', (r) => bridge.tcpConnect(r, host, port)).then((d) => d.socket),
    write: (socket, data) => ask<void>('tcpWritten', (r) => bridge.tcpWrite(r, socket, toBase64(data))).then(() => {}),
    close: (socket) => bridge.tcpClose(socket),
    onData: (fn) => on('tcpData', (d) => fn(d.socket, fromBase64(d.base64))),
    onClosed: (fn) => on('tcpClosed', (d) => fn(d.socket)),
    joinSetup: (prefix, password) => ask<{ ssid: string | null }>('wifiSetup', (r) => bridge.wifiJoinSetup(r, prefix, password)),
    leaveSetup: () => bridge.wifiLeaveSetup(),
    scanSetup: (prefix) => ask<{ ssids: string[] }>('wifiScan', (r) => bridge.wifiScanSetup(r, prefix)).then((d) => d.ssids),
    currentNetwork: () => ask<{ ssid: string | null; password: string | null }>('wifiCurrent', (r) => bridge.wifiCurrent(r)),
  }
}

export function androidPlatform(bridge: AndroidBridge): Platform {
  window.__glowEmit = (name, json) => {
    const data = json ? JSON.parse(json) : null
    listeners.get(name)?.forEach((f) => f(data))
  }
  const info = JSON.parse(bridge.info()) as { version: string; sdk: number; accent: string | null }
  const backHandlers: (() => boolean)[] = []
  window.__glowBack = () => {
    for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]()) return true
    return false
  }

  return {
    kind: 'android',
    name: 'Glow for Android',
    ble: androidBle(bridge),
    wifi: socketWifi(androidSockets(bridge)),
    net: {
      text: (url) => ask<{ text: string }>('net', (r) => bridge.net(r, 'text', url, 0)).then((d) => d.text),
      bytes: (url, limit) => ask<{ base64: string }>('net', (r) => bridge.net(r, 'bytes', url, limit)).then((d) => fromBase64(d.base64)),
      exists: (url) => ask<{ exists: boolean }>('net', (r) => bridge.net(r, 'exists', url, 0)).then((d) => d.exists, () => false),
    },
    openExternal: (url) => bridge.openExternal(url),
    accentColor: async () => info.accent,
    haptic: (kind) => bridge.haptic(kind),
    keepAwake: (on) => bridge.keepAwake(on),
    keepRunning: () => {},
    systemBars: (dark) => bridge.darkTheme(dark),
    update: {
      asset: /wififan-app-(\d+\.\d+\.\d+)\.apk/,
      kind: 'app',
      assetName: (v) => `wififan-app-${v}.apk`,
      install(url, version, onProgress) {
        return new Promise((resolve, reject) => {
          const off = on('update', (d) => {
            if (d.state === 'downloading') onProgress(d.received, d.total)
            else if (d.state === 'installing') { off(); resolve() }
            else if (d.state === 'error') { off(); reject(new Error(d.message)) }
          })
          bridge.updateInstall(url, version)
        })
      },
    },
    capture: { microphone: true, systemAudio: false, screen: false },
    onBack(handler) {
      backHandlers.push(handler)
      return () => { const i = backHandlers.indexOf(handler); if (i >= 0) backHandlers.splice(i, 1) }
    },
  }
}
