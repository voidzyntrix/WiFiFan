// Bluetooth LE through Web Bluetooth (Chromium): Glow for Windows, and a plain Chrome tab.
//
// Web Bluetooth only lists devices through requestDevice(): Chromium asks the embedder to pick one.
// In Electron, electron/main.cjs forwards that list to the page (`picker`) and picks whichever id
// the page names, so the app can show its own "Nearby devices" list. In a plain browser Chrome
// shows its own chooser and the picked device is the whole list.

import type { BleCentral, BleLink, BleProfile, BtDevice } from './types'

/** Electron's side of the picker (preload.cjs), absent in a plain browser. */
export interface DevicePicker {
  onDevices(fn: (devices: BtDevice[]) => void): () => void
  pick(id: string): void
  cancel(): void
  autoPick(id: string): void
}

const OP_TIMEOUT_MS = 3000
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

class WebLink implements BleLink {
  readonly chunk = 20                                // ATT_MTU 23 - 3: what every module takes
  private dataFns = new Set<(d: Uint8Array) => void>()
  private closeFns = new Set<() => void>()
  private closed = false

  constructor(private device: BluetoothDevice, private writeChar: BluetoothRemoteGATTCharacteristic) {
    device.addEventListener('gattserverdisconnected', this.dropped)
  }

  get id() { return this.device.id }
  get name() { return this.device.name ?? null }

  async write(data: Uint8Array) {
    const ch = this.writeChar
    const write = ch.properties.write ? ch.writeValueWithResponse(data) : ch.writeValueWithoutResponse(data)
    await Promise.race([write, sleep(OP_TIMEOUT_MS).then(() => { throw new Error('Bluetooth write timed out') })])
  }

  onData(fn: (d: Uint8Array) => void) { this.dataFns.add(fn); return () => { this.dataFns.delete(fn) } }
  onClose(fn: () => void) { this.closeFns.add(fn); return () => { this.closeFns.delete(fn) } }

  /** From the notify characteristic. */
  received(bytes: Uint8Array) { this.dataFns.forEach((f) => f(bytes)) }

  private dropped = () => {
    if (this.closed) return
    this.closed = true
    this.device.removeEventListener('gattserverdisconnected', this.dropped)
    this.closeFns.forEach((f) => f())
  }

  close() {
    try { this.device.gatt?.disconnect() } catch { /* already gone */ }
    this.dropped()
  }
}

export function webBluetooth(picker: DevicePicker | null): BleCentral | null {
  if (!navigator.bluetooth) return null
  /** The pending requestDevice() of an open scan. */
  let pending: Promise<BluetoothDevice | null> | null = null
  /** Devices handed out by a browser chooser, by id. */
  const known = new Map<string, BluetoothDevice>()
  let unlisten: (() => void) | null = null

  const request = (profiles: BleProfile[]) => {
    const p = navigator.bluetooth
      .requestDevice({ acceptAllDevices: true, optionalServices: profiles.map((x) => x.service) as BluetoothServiceUUID[] })
      .then((d) => { known.set(d.id, d); return d })
      .catch(() => null)
      .finally(() => { if (pending === p) pending = null; unlisten?.(); unlisten = null })
    pending = p
    return p
  }

  return {
    scan(onDevices, profiles) {
      if (pending) picker?.cancel()
      onDevices([])
      if (picker) {
        unlisten = picker.onDevices(onDevices)
        void request(profiles)
        return () => picker.cancel()
      }
      // A browser: its own chooser is the scan; the one it picks is the list.
      void request(profiles).then((d) => { if (d) onDevices([{ id: d.id, name: d.name ?? null }]) })
      return () => {}
    },

    async connect(id, profiles) {
      let device = known.get(id) ?? null
      if (!device && picker) {
        if (!pending) {
          // Reconnecting to a known device: scan, and pick it the moment it is heard.
          const p = request(profiles)
          picker.autoPick(id)
          const timer = window.setTimeout(() => picker.cancel(), 15_000)
          device = await p
          window.clearTimeout(timer)
        } else {
          const p = pending
          picker.pick(id)
          device = await p
        }
      }
      if (!device) throw new Error('The device was not found. Is it powered and in range?')

      const server = await device.gatt!.connect()
      for (const profile of profiles) {
        let service: BluetoothRemoteGATTService
        try { service = await server.getPrimaryService(profile.service as BluetoothServiceUUID) } catch { continue }
        const writeChar = await service.getCharacteristic(profile.write as BluetoothCharacteristicUUID)
        let notify: BluetoothRemoteGATTCharacteristic | null = null
        if (profile.notify != null) {
          try { notify = await service.getCharacteristic(profile.notify as BluetoothCharacteristicUUID) } catch { /* not there */ }
        }
        if (!notify && writeChar.properties.notify) notify = writeChar
        const link = new WebLink(device, writeChar)
        if (notify) {
          notify.addEventListener('characteristicvaluechanged', (e) => {
            const v = (e.target as BluetoothRemoteGATTCharacteristic).value
            if (v) link.received(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
          })
          await notify.startNotifications()
        }
        return { link, profile }
      }
      try { device.gatt?.disconnect() } catch { /* already gone */ }
      throw new Error("This device doesn't speak any of Glow's device types")
    },
  }
}
