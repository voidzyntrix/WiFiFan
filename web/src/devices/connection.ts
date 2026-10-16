// The one device Glow is connected to, and the devices it knows. Generic: it scans with the profiles
// of every registered type (and looks for Wi-Fi boards on the network), connects through the
// platform's transport for the device's type, hands the open link to the type (registry.ts) and
// remembers the device. It never looks inside a session.

import { useSyncExternalStore } from 'react'
import { platform, type BleLink, type BtDevice, type WifiDevice } from '../platform'
import { settings } from '../settings/store'
import { toast } from '../ui/toast'
import { cloudConfig, isConfigured, openCloudLink } from './cloud'
import { DEVICE_TYPES, deviceType, guessType, wifiType } from './registry'
import type { DeviceSession, DeviceType, SavedDevice } from './types'

export type Phase = 'idle' | 'scanning' | 'connecting' | 'connected'

export interface ConnectionState {
  phase: Phase
  /** Devices heard by the open scan. */
  nearby: BtDevice[]
  /** Wi-Fi boards that answered the open scan. */
  nearbyWifi: WifiDevice[]
  /** The device being connected or connected; stays set when the link drops, for "Reconnecting". */
  device: SavedDevice | null
  session: DeviceSession | null
  demo: boolean
}

let state: ConnectionState = { phase: 'idle', nearby: [], nearbyWifi: [], device: null, session: null, demo: false }
const listeners = new Set<() => void>()
function set(patch: Partial<ConnectionState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let stopScan: (() => void) | null = null
let stopWifiScan: (() => void) | null = null
let closeLink: (() => void) | null = null

const allProfiles = () => DEVICE_TYPES.flatMap((t) => t.ble)

/** A Wi-Fi board's saved id. */
export const wifiId = (mac: string) => `wifi:${mac}`

/** An address on a board's own setup network: where it is only while unpaired or while this device is still on that network. */
const onSetupNet = (host?: string) => !!host && host.startsWith('192.168.4.')

/**
 * Looks for one Wi-Fi board by its MAC; null when it doesn't answer within `ms`. With `ready`, only
 * an answer from the real network counts (not the board's own, which this device may still be on
 * while it switches back after pairing).
 */
export function findWifi(mac: string, ms: number, ready = true): Promise<WifiDevice | null> {
  const wifi = platform.wifi
  if (!wifi) return Promise.resolve(null)
  return new Promise((resolve) => {
    let done = false
    let stop: (() => void) | null = null
    const finish = (d: WifiDevice | null) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      queueMicrotask(() => stop?.())
      resolve(d)
    }
    const timer = window.setTimeout(() => finish(null), ms)
    stop = wifi.discover((list) => {
      const d = list.find((x) => x.id === mac && (!ready || (x.state !== 'setup' && !onSetupNet(x.host))))
      if (d) finish(d)
    })
  })
}

/** Opens the transport's link to a device of the given type. */
async function openLink(type: DeviceType, device: SavedDevice): Promise<BleLink> {
  if (type.transport === 'wifi') {
    const mac = device.id.replace(/^wifi:/, '')
    const cloud = isConfigured(cloudConfig())
    if (!platform.wifi && !cloud) throw new Error("Wi-Fi devices can't be reached here")
    let lanError: Error | null = null
    if (platform.wifi) {
      // The local network first (instant at home). Its address may have changed: ask the network,
      // fall back to the last one. Without internet access set up this waits for the network to be
      // there: right after pairing the device is still switching back to it.
      const found = await findWifi(mac, cloud ? 3000 : device.host && !onSetupNet(device.host) ? 4000 : 20_000)
      const host = found?.host ?? (onSetupNet(device.host) ? undefined : device.host)
      if (host) {
        device.host = host
        for (let i = 0; i < (cloud ? 2 : 4); i++) {
          try { return await platform.wifi.connect(host, type.port ?? 4210) } catch (e) { lanError = e as Error }
          await new Promise((r) => setTimeout(r, 1500))   // the network may still be settling
        }
      }
    }
    // Not on its network: through the internet, if that is set up.
    if (cloud) {
      const link = await openCloudLink(mac)
      toast('Connected over the internet')
      return link
    }
    throw lanError ?? new Error('The board was not found on this network. Is it powered, and is this device on the same Wi-Fi?')
  }
  if (!platform.ble) throw new Error("Bluetooth isn't available here")
  return (await platform.ble.connect(device.id, type.ble)).link
}

/** Saved devices, newest first as added. */
export const savedDevices = () => settings.get().devices

function remember(device: SavedDevice) {
  const list = savedDevices()
  const i = list.findIndex((d) => d.id === device.id)
  const merged = i >= 0 ? { ...list[i], ...device, name: list[i].name } : device
  settings.set({ devices: i >= 0 ? list.map((d, j) => (j === i ? merged : d)) : [...list, merged] })
}

export const connection = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },

  /** Lists nearby devices (state.nearby, state.nearbyWifi) until one is picked or the scan is cancelled. */
  scan() {
    if (!platform.ble && !platform.wifi) { toast("Bluetooth isn't available here."); return }
    this.cancelScan()
    set({ phase: 'scanning', nearby: [], nearbyWifi: [] })
    if (platform.ble) stopScan = platform.ble.scan((nearby) => set({ nearby }), allProfiles())
    if (platform.wifi) stopWifiScan = platform.wifi.discover((nearbyWifi) => set({ nearbyWifi }))
  },

  cancelScan() {
    stopScan?.()
    stopScan = null
    stopWifiScan?.()
    stopWifiScan = null
    if (state.phase === 'scanning') set({ phase: 'idle', nearby: [], nearbyWifi: [] })
  },

  /** Connects to a Wi-Fi board from the scan list (one already paired to this network). */
  async pickWifi(found: WifiDevice) {
    const type = wifiType()
    if (!type) return
    const id = wifiId(found.id)
    const saved = savedDevices().find((d) => d.id === id)
    await this.connect({ ...(saved ?? { id, type: type.id, name: null }), advertised: found.name, host: found.host })
  },

  /** Connects to a device from the scan list (its type is guessed from what it advertises). */
  async pick(found: BtDevice) {
    const type = guessType(found)
    const saved = savedDevices().find((d) => d.id === found.id)
    await this.connect(saved ?? { id: found.id, type: type.id, name: null, advertised: found.name })
  },

  /** Connects to a saved (or just picked) device. */
  async connect(device: SavedDevice): Promise<boolean> {
    const type = deviceType(device.type)
    if (!type || !(type.transport === 'wifi' ? platform.wifi || isConfigured(cloudConfig()) : platform.ble)) { toast("This device can't be reached here."); return false }
    if (state.phase === 'connected' || state.device) this.disconnect()
    // a pick from an open scan finishes that scan (the transport needs it to pick the device)
    const fromScan = !!stopScan && type.transport === 'ble'
    if (fromScan) stopScan = null
    stopWifiScan?.()
    stopWifiScan = null
    if (!fromScan) { stopScan?.(); stopScan = null }
    set({ phase: 'connecting', device, nearby: fromScan ? state.nearby : [], nearbyWifi: [] })
    try {
      device = { ...device }
      const link = await openLink(type, device)
      const known = { ...device, advertised: (type.transport === 'ble' ? link.name : null) ?? device.advertised }
      const session = type.open(link, known)
      closeLink = () => link.close()
      link.onClose(() => {
        if (state.session !== session) return
        session.close()
        closeLink = null
        set({ phase: 'idle', session: null })
        toast(`${displayName(known)} disconnected`)
      })
      remember(known)
      set({ phase: 'connected', device: known, session, nearby: [], demo: false })
      return true
    } catch (e) {
      set({ phase: 'idle', device: null, nearby: [], nearbyWifi: [] })
      toast(`Couldn't connect: ${(e as Error).message}`)
      return false
    }
  },

  /** The controls without a device, on a pretend link. */
  startDemo(typeId = DEVICE_TYPES[0].id) {
    const type = deviceType(typeId)
    const link = type?.demoLink?.()
    if (!type || !link) return
    this.disconnect()
    const device: SavedDevice = { id: 'demo', type: type.id, name: `Demo ${type.label}`, advertised: null }
    const session = type.open(link, device)
    closeLink = () => link.close()
    set({ phase: 'connected', device, session, demo: true })
  },

  disconnect() {
    const s = state.session
    const close = closeLink
    closeLink = null
    set({ phase: 'idle', session: null, device: null, demo: false })
    s?.close()
    close?.()
  },

  rename(id: string, name: string) {
    settings.set({ devices: savedDevices().map((d) => (d.id === id ? { ...d, name: name.trim() || null } : d)) })
    if (state.device?.id === id) set({ device: { ...state.device, name: name.trim() || null } })
  },

  /**
   * Resets a device (clears its Wi-Fi; it goes back to pairing) and forgets it. Connects first when
   * it isn't the connected one. Resolves false when that didn't work.
   */
  async reset(device: SavedDevice): Promise<boolean> {
    if (state.device?.id !== device.id || state.phase !== 'connected') {
      if (!(await this.connect(device))) return false
    }
    const session = state.session
    if (!session?.reset) { toast("This device can't be reset from Glow."); return false }
    try {
      await session.reset()
    } catch (e) {
      toast(`Couldn't reset: ${(e as Error).message}`)
      return false
    }
    this.forget(device.id)
    toast(`${displayName(device)} was reset. Set it up again to use it.`)
    return true
  },

  forget(id: string) {
    if (state.device?.id === id) this.disconnect()
    settings.set({ devices: savedDevices().filter((d) => d.id !== id) })
  },
}

export const displayName = (d: SavedDevice) => d.name ?? d.advertised ?? deviceType(d.type)?.label ?? 'Device'

export const useConnection = () => useSyncExternalStore(connection.subscribe, connection.get)
