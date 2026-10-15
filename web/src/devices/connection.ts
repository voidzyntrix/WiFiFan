// The one device Glow is connected to, and the devices it knows. Generic: it scans with the profiles
// of every registered type, connects through the platform's transport, hands the open link to the
// device's type (registry.ts) and remembers the device. It never looks inside a session.

import { useSyncExternalStore } from 'react'
import { platform, type BtDevice } from '../platform'
import { settings } from '../settings/store'
import { toast } from '../ui/toast'
import { DEVICE_TYPES, deviceType, guessType } from './registry'
import type { DeviceSession, SavedDevice } from './types'

export type Phase = 'idle' | 'scanning' | 'connecting' | 'connected'

export interface ConnectionState {
  phase: Phase
  /** Devices heard by the open scan. */
  nearby: BtDevice[]
  /** The device being connected or connected; stays set when the link drops, for "Reconnecting". */
  device: SavedDevice | null
  session: DeviceSession | null
  demo: boolean
}

let state: ConnectionState = { phase: 'idle', nearby: [], device: null, session: null, demo: false }
const listeners = new Set<() => void>()
function set(patch: Partial<ConnectionState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let stopScan: (() => void) | null = null
let closeLink: (() => void) | null = null

const allProfiles = () => DEVICE_TYPES.flatMap((t) => t.ble)

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

  /** Lists nearby devices (state.nearby) until a device is picked or the scan is cancelled. */
  scan() {
    if (!platform.ble) { toast("Bluetooth isn't available here."); return }
    this.cancelScan()
    set({ phase: 'scanning', nearby: [] })
    stopScan = platform.ble.scan((nearby) => set({ nearby }), allProfiles())
  },

  cancelScan() {
    stopScan?.()
    stopScan = null
    if (state.phase === 'scanning') set({ phase: 'idle', nearby: [] })
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
    if (!type || !platform.ble) { toast("This device can't be reached here."); return false }
    if (state.phase === 'connected' || state.device) this.disconnect()
    // a pick from an open scan finishes that scan (the transport needs it to pick the device)
    const fromScan = !!stopScan
    stopScan = null
    set({ phase: 'connecting', device, nearby: fromScan ? state.nearby : [] })
    try {
      const { link } = await platform.ble.connect(device.id, type.ble)
      const known = { ...device, advertised: link.name ?? device.advertised }
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
      set({ phase: 'idle', device: null, nearby: [] })
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

  forget(id: string) {
    if (state.device?.id === id) this.disconnect()
    settings.set({ devices: savedDevices().filter((d) => d.id !== id) })
  },
}

export const displayName = (d: SavedDevice) => d.name ?? d.advertised ?? deviceType(d.type)?.label ?? 'Device'

export const useConnection = () => useSyncExternalStore(connection.subscribe, connection.get)
