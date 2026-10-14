// The Bluetooth link to the LED board (the Android app's BleManager), over Web Bluetooth.
//
// The board's module is a BLE serial bridge: service FFE0, write FFE1, notify FFE2. Commands are
// text ending in `\`; replies come back the same way. Writes go through one queue so commands sent
// in quick succession (dragging a slider) are never dropped, and a stream of colours can skip a
// frame instead of queueing stale ones (`backlogged`).
//
// Picking a device: Chromium asks electron/main.cjs, which forwards the nearby devices to the UI
// (state.nearby). Reconnecting to a known board picks it automatically once it is heard.

import { useSyncExternalStore } from 'react'
import { desktop, type BtDevice } from '../desktop'
import { toast } from '../ui/toast'

const SERVICE = 0xffe0
const WRITE_CHAR = 0xffe1
const NOTIFY_CHAR = 0xffe2
const CHUNK = 20                  // ATT_MTU 23 - 3: what every module takes
const OP_TIMEOUT_MS = 3000
const MAX_PENDING_BYTES = 1024
/** Replies used by the app itself (version check, firmware update): no toast. */
const PROTOCOL_PREFIXES = ['VER,', 'OTA', 'BOOT,', 'OK,', 'ERR,', 'DONE']

export type LinkState = 'disconnected' | 'connecting' | 'connected'

export interface BleSnapshot {
  state: LinkState
  /** A device scan (picker or reconnect) is open. */
  scanning: boolean
  /** Devices heard during the scan, newest list. */
  nearby: BtDevice[]
  deviceId: string | null
  deviceName: string | null
  /** From the board's "VER,<x>" reply; null until it answered. */
  firmwareVersion: string | null
}

interface WriteOp {
  data: Uint8Array
  pauseAfterMs: number
  job: { resolve: () => void; reject: (e: Error) => void; done: boolean } | null
  last: boolean
}

class BleManager {
  private snap: BleSnapshot = {
    state: 'disconnected', scanning: false, nearby: [], deviceId: null, deviceName: null, firmwareVersion: null,
  }
  private listeners = new Set<() => void>()
  private lineListeners = new Set<(line: string) => void>()
  private device: BluetoothDevice | null = null
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null
  private queue: WriteOp[] = []
  private running = false
  private rx: number[] = []
  private decoder = new TextDecoder('ascii')
  /** While true (firmware update running) incoming lines don't pop toasts. */
  quiet = false

  get available() { return !!navigator.bluetooth }
  get snapshot() { return this.snap }

  private set(patch: Partial<BleSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    this.listeners.forEach((l) => l())
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }

  /** Every complete line from the board, in order (repeats included). */
  onLine(fn: (line: string) => void) {
    this.lineListeners.add(fn)
    return () => { this.lineListeners.delete(fn) }
  }

  // -------------------------------------------------------------------------
  // Finding and connecting
  // -------------------------------------------------------------------------

  private unlistenDevices: (() => void) | null = null

  /**
   * Opens a scan; nearby devices show up in `nearby` until one is picked with [pick] (or, with
   * [autoPickId], as soon as that board is heard). Resolves with the device, or null if cancelled.
   */
  private async scan(autoPickId?: string, timeoutMs?: number): Promise<BluetoothDevice | null> {
    if (!navigator.bluetooth) {
      toast('Bluetooth is not available here. Run Glow as the desktop app (npm run dev / Glow.exe).')
      return null
    }
    if (this.snap.scanning) this.cancelScan()
    this.set({ scanning: true, nearby: [] })
    this.unlistenDevices?.()
    this.unlistenDevices = desktop?.bluetooth.onDevices((d) => this.set({ nearby: d })) ?? null
    if (autoPickId) desktop?.bluetooth.autoPick(autoPickId)
    const timer = timeoutMs ? window.setTimeout(() => this.cancelScan(), timeoutMs) : 0
    try {
      return await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [SERVICE] })
    } catch (e) {
      const err = e as DOMException
      if (err.name !== 'NotFoundError' && err.name !== 'AbortError') toast(`Bluetooth: ${err.message}`)
      return null
    } finally {
      window.clearTimeout(timer)
      this.unlistenDevices?.()
      this.unlistenDevices = null
      this.set({ scanning: false })
    }
  }

  /** Opens the nearby-devices list; resolves once a device is picked and connected (or not). */
  async findAndConnect(): Promise<void> {
    const device = await this.scan()
    if (device) await this.connect(device)
  }

  /** Reconnects to a board connected before, by its device id. */
  async connectKnown(id: string, name: string | null): Promise<boolean> {
    if (this.snap.state !== 'disconnected') this.disconnect()
    this.set({ state: 'connecting', deviceId: id, deviceName: name })
    const device = await this.scan(id, 15_000)
    if (!device) {
      this.set({ state: 'disconnected' })
      toast(`${name ?? 'The board'} wasn't found. Is it powered and in range?`)
      return false
    }
    return this.connect(device)
  }

  /** Picks a device from `nearby` in an open scan. */
  pick(id: string) { desktop?.bluetooth.pick(id) }

  cancelScan() {
    desktop?.bluetooth.cancel()
    this.set({ scanning: false })
  }

  private onGattDisconnected = () => this.dropped()

  async connect(device: BluetoothDevice): Promise<boolean> {
    if (this.device && this.device !== device) this.disconnect()
    this.device = device
    this.set({ state: 'connecting', deviceId: device.id, deviceName: device.name ?? null, firmwareVersion: null })
    device.addEventListener('gattserverdisconnected', this.onGattDisconnected)
    try {
      const server = await device.gatt!.connect()
      const service = await server.getPrimaryService(SERVICE)
      this.writeChar = await service.getCharacteristic(WRITE_CHAR)
      // Most modules notify on FFE2; some answer on FFE1 itself.
      let notify: BluetoothRemoteGATTCharacteristic | null = null
      try { notify = await service.getCharacteristic(NOTIFY_CHAR) } catch { /* not there */ }
      if (!notify && this.writeChar.properties.notify) notify = this.writeChar
      if (notify) {
        notify.addEventListener('characteristicvaluechanged', (e) => {
          const v = (e.target as BluetoothRemoteGATTCharacteristic).value
          if (v) this.handleIncoming(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
        })
        await notify.startNotifications()
      }
      this.set({ state: 'connected' })
      // Replies can reach us now: ask which firmware the board runs.
      this.sendData('ver')
      return true
    } catch (e) {
      toast(`Couldn't connect: ${(e as Error).message}`)
      this.disconnect()
      return false
    }
  }

  private dropped() {
    this.writeChar = null
    this.rx = []
    this.clearQueue()
    if (this.snap.state !== 'disconnected') this.set({ state: 'disconnected', firmwareVersion: null })
  }

  disconnect() {
    this.demo = false
    const d = this.device
    this.device = null
    if (d) {
      d.removeEventListener('gattserverdisconnected', this.onGattDisconnected)
      try { d.gatt?.disconnect() } catch { /* already gone */ }
    }
    this.dropped()
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Demo: the controls without a board (dev builds; the Android app did this in the emulator)
  // -------------------------------------------------------------------------

  private demo = false

  startDemo() {
    this.demo = true
    this.set({ state: 'connected', deviceId: 'demo', deviceName: 'Demo board', firmwareVersion: '1.7.0' })
  }

  /** Send a command; the board's line delimiter (\) is appended. */
  sendData(text: string) {
    if (this.demo) { console.debug('[demo] ->', text); return }
    this.enqueue(new TextEncoder().encode(text + '\\'), 0, null)
  }

  /** A command already waits behind the one being written (a colour stream skips a frame then). */
  get backlogged() { return this.queue.length > 0 }
  get isDemo() { return this.demo }

  /**
   * Raw bytes (no delimiter), resolved once every chunk was written. With [baud], chunks are
   * spaced so the module's UART at that rate keeps up (10 bits a byte + 30 %).
   */
  writeRaw(data: Uint8Array, baud = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const job = { resolve, reject, done: false }
      const pause = baud > 0 ? Math.ceil((CHUNK * 13_000) / baud) : 0
      this.enqueue(data, pause, job)
    })
  }

  private enqueue(data: Uint8Array, pauseAfterMs: number, job: WriteOp['job']) {
    if (data.length === 0) { job?.resolve(); return }
    for (let off = 0; off < data.length; off += CHUNK) {
      const end = Math.min(off + CHUNK, data.length)
      this.queue.push({ data: data.slice(off, end), pauseAfterMs, job, last: end === data.length })
    }
    void this.pump()
  }

  private async pump() {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length) {
        const op = this.queue.shift()!
        if (op.job?.done) continue                           // its call already failed
        const ch = this.writeChar
        if (!ch) { this.fail(op, new Error('Not connected')); this.clearQueue(); break }
        try {
          const write = ch.properties.write ? ch.writeValueWithResponse(op.data) : ch.writeValueWithoutResponse(op.data)
          await Promise.race([write, sleep(OP_TIMEOUT_MS).then(() => { throw new Error('Bluetooth write timed out') })])
          if (op.last && op.job && !op.job.done) { op.job.done = true; op.job.resolve() }
          if (op.pauseAfterMs) await sleep(op.pauseAfterMs)
        } catch (e) {
          this.fail(op, e as Error)
        }
      }
    } finally {
      this.running = false
    }
  }

  private fail(op: WriteOp, e: Error) {
    if (op.job && !op.job.done) { op.job.done = true; op.job.reject(e) }
  }

  private clearQueue() {
    const q = this.queue
    this.queue = []
    q.forEach((op) => this.fail(op, new Error('Bluetooth link closed')))
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  private handleIncoming(bytes: Uint8Array) {
    let start = 0
    const buf = this.rx.concat(Array.from(bytes))
    let found = false
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 0x5c) continue          // backslash
      const line = this.decoder.decode(new Uint8Array(buf.slice(start, i)))
      start = i + 1
      found = true
      if (!line) continue
      if (line.startsWith('VER,')) this.set({ firmwareVersion: line.slice(4) })
      this.lineListeners.forEach((l) => l(line))
      if (!this.quiet && !PROTOCOL_PREFIXES.some((p) => line.startsWith(p))) toast(`Received: ${line}`)
    }
    this.rx = found ? buf.slice(start) : buf
    // Something that never sends the delimiter (older firmware): don't grow forever.
    if (this.rx.length > MAX_PENDING_BYTES) this.rx = []
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export const ble = new BleManager()

export function useBle(): BleSnapshot {
  return useSyncExternalStore(ble.subscribe, () => ble.snapshot)
}
