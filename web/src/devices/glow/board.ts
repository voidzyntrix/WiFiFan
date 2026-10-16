// The WiFiFan LED board's serial protocol, on whatever link connects it (devices/connection.ts
// opens it; the link moves bytes, this speaks the board's language).
//
// The board's module is a BLE serial bridge: service FFE0, write FFE1, notify FFE2 (the ESP32 board
// takes the same commands over a TCP link instead). Commands are
// text ending in `\`; replies come back the same way. Writes go through one queue so commands sent
// in quick succession (dragging a slider) are never dropped, and a stream of colours can skip a
// frame instead of queueing stale ones (`backlogged`).

import { useSyncExternalStore } from 'react'
import type { BleLink } from '../../platform'
import { toast } from '../../ui/toast'

const MAX_PENDING_BYTES = 1024
/** Replies used by the app itself (version check, firmware update): no toast. */
const PROTOCOL_PREFIXES = ['VER,', 'OTA', 'BOOT,', 'OK,', 'ERR,', 'DONE', 'INFO,', 'WIFI,']

export type LinkState = 'disconnected' | 'connected'

export interface BoardSnapshot {
  state: LinkState
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

class Board {
  private snap: BoardSnapshot = { state: 'disconnected', deviceId: null, deviceName: null, firmwareVersion: null }
  private listeners = new Set<() => void>()
  private lineListeners = new Set<(line: string) => void>()
  private link: BleLink | null = null
  private unlink: (() => void) | null = null
  private queue: WriteOp[] = []
  private running = false
  private rx: number[] = []
  private decoder = new TextDecoder('ascii')
  private demo = false
  /** While true (firmware update running) incoming lines don't pop toasts. */
  quiet = false

  get snapshot() { return this.snap }
  get isDemo() { return this.demo }

  private set(patch: Partial<BoardSnapshot>) {
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

  /** Takes over an open link (the device type's session start). */
  attach(link: BleLink, demo: boolean) {
    this.detach()
    this.link = link
    this.demo = demo
    const offData = link.onData((d) => this.handleIncoming(d))
    const offClose = link.onClose(() => this.detach())
    this.unlink = () => { offData(); offClose() }
    this.set({ state: 'connected', deviceId: link.id, deviceName: link.name, firmwareVersion: null })
    this.sendData('ver')     // which firmware the board runs
  }

  detach() {
    this.unlink?.()
    this.unlink = null
    this.link = null
    this.demo = false
    this.rx = []
    this.clearQueue()
    if (this.snap.state !== 'disconnected') this.set({ state: 'disconnected', firmwareVersion: null })
  }

  /** Send a command; the board's line delimiter (\) is appended. */
  sendData(text: string) {
    this.enqueue(new TextEncoder().encode(text + '\\'), 0, null)
  }

  /** The next line from the board that starts with `prefix`; rejects after `ms`. */
  waitFor(prefix: string, ms: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const off = this.onLine((line) => {
        if (!line.startsWith(prefix)) return
        off(); window.clearTimeout(timer); resolve(line)
      })
      const timer = window.setTimeout(() => { off(); reject(new Error("The board didn't answer")) }, ms)
    })
  }

  /** A command already waits behind the one being written (a colour stream skips a frame then). */
  get backlogged() { return this.queue.length > 0 }

  /**
   * Raw bytes (no delimiter), resolved once every chunk was written. With [baud], chunks are
   * spaced so the module's UART at that rate keeps up (10 bits a byte + 30 %).
   */
  writeRaw(data: Uint8Array, baud = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const job = { resolve, reject, done: false }
      const chunk = this.link?.chunk ?? 20
      const pause = baud > 0 ? Math.ceil((chunk * 13_000) / baud) : 0
      this.enqueue(data, pause, job)
    })
  }

  private enqueue(data: Uint8Array, pauseAfterMs: number, job: WriteOp['job']) {
    if (data.length === 0) { job?.resolve(); return }
    const chunk = this.link?.chunk ?? 20
    for (let off = 0; off < data.length; off += chunk) {
      const end = Math.min(off + chunk, data.length)
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
        const link = this.link
        if (!link) { this.fail(op, new Error('Not connected')); this.clearQueue(); break }
        try {
          await link.write(op.data)
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
    q.forEach((op) => this.fail(op, new Error('Link closed')))
  }

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

export const board = new Board()

export function useBoard(): BoardSnapshot {
  return useSyncExternalStore(board.subscribe, () => board.snapshot)
}

/** A pretend board for the demo: takes every command, answers the version check. */
export function demoLink(): BleLink {
  const dataFns = new Set<(d: Uint8Array) => void>()
  const closeFns = new Set<() => void>()
  return {
    id: 'demo', name: 'Demo board', chunk: 244,
    async write(data) {
      const text = new TextDecoder().decode(data)
      console.debug('[demo] ->', text)
      if (text.includes('ver\\')) setTimeout(() => dataFns.forEach((f) => f(new TextEncoder().encode('VER,1.7.0\\'))), 30)
    },
    onData(fn) { dataFns.add(fn); return () => { dataFns.delete(fn) } },
    onClose(fn) { closeFns.add(fn); return () => { closeFns.delete(fn) } },
    close() { closeFns.forEach((f) => f()) },
  }
}
