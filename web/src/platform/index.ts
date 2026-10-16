// The platform the app runs on (see types.ts): Glow for Windows (Electron's preload exposes
// `window.glow`), Glow for Android (the WebView shell exposes `window.GlowAndroid`), or a plain
// browser (Web Bluetooth if Chrome has it, fetch for the network).

import { androidPlatform } from './android'
import type { Platform } from './types'
import { socketWifi, type SocketBridge } from './wifi'
import { webBluetooth, type DevicePicker } from './webBluetooth'

export type { BleLink, BleProfile, BtDevice, Platform, WifiDevice } from './types'

/** What desktop/electron/preload.cjs exposes. */
interface ElectronGlow {
  bluetooth: DevicePicker
  wifi: SocketBridge
  capture: { displays(): Promise<{ index: number; label: string }[]>; setDisplay(index: number): void }
  power: { keepAwake(on: boolean): void }
  net: { text(url: string): Promise<string>; bytes(url: string, limit?: number): Promise<Uint8Array>; exists(url: string): Promise<boolean> }
  update: {
    install(url: string, version: string): Promise<void>
    onProgress(fn: (p: { received: number; total: number }) => void): () => void
  }
  theme: { accent(): Promise<string | null> }
  openExternal(url: string): void
  keepRunning(on: boolean): void
}

declare global {
  interface Window { glow?: ElectronGlow }
  const __APP_VERSION__: string
}

export const APP_VERSION: string = __APP_VERSION__

function desktopPlatform(g: ElectronGlow): Platform {
  return {
    kind: 'desktop',
    name: 'Glow for Windows',
    ble: webBluetooth(g.bluetooth),
    wifi: socketWifi(g.wifi),
    net: { text: g.net.text, bytes: (url, limit) => g.net.bytes(url, limit), exists: g.net.exists },
    openExternal: g.openExternal,
    accentColor: () => g.theme.accent(),
    haptic: null,
    keepAwake: g.power.keepAwake,
    keepRunning: g.keepRunning,
    update: {
      asset: /Glow-Desktop-(\d+\.\d+\.\d+)\.exe/,
      kind: 'desktop',
      assetName: (v) => `Glow-Desktop-${v}.exe`,
      async install(url, version, onProgress) {
        const off = g.update.onProgress((p) => onProgress(p.received, p.total))
        try {
          await g.update.install(url, version)
        } catch (e) {
          // IPC wraps errors: "Error invoking remote method '…': Error: <message>"
          throw new Error((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
        } finally { off() }
      },
    },
    capture: { microphone: true, systemAudio: true, screen: true, displays: g.capture.displays, setDisplay: g.capture.setDisplay },
    onBack: () => () => {},
  }
}

function browserPlatform(): Platform {
  const fetchOk = async (url: string) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`GitHub answered HTTP ${r.status}`)
    return r
  }
  return {
    kind: 'browser',
    name: 'Glow',
    ble: webBluetooth(null),
    wifi: null,
    net: {
      text: async (url) => (await fetchOk(url)).text(),
      bytes: async (url, limit) => {
        const b = new Uint8Array(await (await fetchOk(url)).arrayBuffer())
        if (b.length > limit) throw new Error('Download larger than expected')
        return b
      },
      exists: async () => true,
    },
    openExternal: (url) => { window.open(url, '_blank', 'noopener') },
    accentColor: async () => null,
    haptic: null,
    keepAwake: () => {},
    keepRunning: () => {},
    update: null,
    capture: { microphone: !!navigator.mediaDevices, systemAudio: true, screen: !!navigator.mediaDevices?.getDisplayMedia },
    onBack: () => () => {},
  }
}

export const platform: Platform =
  window.glow ? desktopPlatform(window.glow)
    : window.GlowAndroid ? androidPlatform(window.GlowAndroid)
      : browserPlatform()

/** Opens a link in the user's own browser. */
export const openLink = (url: string) => platform.openExternal(url)
