// Board firmware updates over Bluetooth (the Android app's OtaManager and FirmwareRepository).
//
// 1. "ota"                 -> the firmware restarts into its bootloader: "BOOT,<ver>,<baud>,<max>"
// 2. START{size, crc32}    -> "OK,START"
// 3. DATA{seq, 256 bytes}  -> "OK,<seq>"   (resent on errors)
// 4. END                   -> "DONE"       (CRC checked; the board restarts)
// 5. "ver"                 -> "VER,<new version>" confirms it
// Frames: A5 5A | cmd | len u16 | payload | crc32 (little-endian, CRC-32 over cmd..payload).
// An interrupted update leaves the board in its bootloader (blue LED); starting again finishes it.

import { useSyncExternalStore } from 'react'
import { ble, sleep } from '../ble/ble'
import { compareVersions } from '../led/color'
import { getBytes, newest, type ReleaseAsset } from './github'

export type OtaState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate'; latest: string }
  | { kind: 'available'; release: ReleaseAsset }
  | { kind: 'downloading' }
  | { kind: 'bootloader' }
  | { kind: 'uploading'; sent: number; total: number }
  | { kind: 'verifying' }
  | { kind: 'done'; version: string }
  | { kind: 'error'; message: string }

export const otaBusy = (s: OtaState) => ['downloading', 'bootloader', 'uploading', 'verifying'].includes(s.kind)

const APP_MAX = 56 * 1024
const APP_BASE = 0x2000
const ASSET = /wififan-fw-(\d+\.\d+\.\d+)\.bin/
const CMD_START = 0x01, CMD_DATA = 0x02, CMD_END = 0x03, CMD_INFO = 0x05
const BLOCK = 256
const RETRIES = 5

let state: OtaState = { kind: 'idle' }
const listeners = new Set<() => void>()
function set(s: OtaState) { state = s; listeners.forEach((l) => l()) }
export const useOta = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)
export const otaState = () => state

export async function checkFirmware(boardVersion: string | null, quiet = false) {
  if (otaBusy(state) || state.kind === 'checking') return
  if (!quiet) set({ kind: 'checking' })
  try {
    const latest = await newest(ASSET, 'fw', (v) => `wififan-fw-${v}.bin`)
    if (!latest) { if (!quiet) set({ kind: 'error', message: 'No firmware found in the GitHub releases' }); return }
    if (otaBusy(state)) return
    if (boardVersion != null && compareVersions(latest.version, boardVersion) <= 0) set({ kind: 'upToDate', latest: latest.version })
    else set({ kind: 'available', release: latest })
  } catch (e) {
    if (!quiet) set({ kind: 'error', message: `Couldn't check for updates: ${(e as Error).message}` })
  }
}

/** null if the image can be flashed, otherwise why not. */
export function validateImage(image: Uint8Array): string | null {
  if (image.length < 8) return 'Firmware file is empty'
  if (image.length > APP_MAX) return `Firmware is ${image.length} bytes, the board holds ${APP_MAX}`
  const base = new DataView(image.buffer, image.byteOffset).getUint32(4, true)
  if (base !== APP_BASE) return `Firmware is built for address 0x${base.toString(16)}, not 0x${APP_BASE.toString(16)}`
  return null
}

/** Updates from a release, or from a local .bin file (with [image]). */
export async function startFirmwareUpdate(release: ReleaseAsset | null, image?: Uint8Array, expectVersion?: string) {
  if (otaBusy(state)) return
  ble.quiet = true
  try {
    set(await runUpdate(release, image, expectVersion))
  } catch (e) {
    set({ kind: 'error', message: `Update failed: ${(e as Error).message}. Start it again to retry.` })
  } finally {
    ble.quiet = false
  }
}

class BoardError extends Error {}

async function runUpdate(release: ReleaseAsset | null, file?: Uint8Array, expectVersion?: string): Promise<OtaState> {
  set({ kind: 'downloading' })
  const image = file ?? await getBytes(release!.downloadUrl, APP_MAX + 1)
  const problem = validateImage(image)
  if (problem) throw new Error(problem)
  const wanted = release?.version ?? expectVersion ?? null

  // 1. Into the bootloader (already there after an interrupted update: it answers INFO).
  set({ kind: 'bootloader' })
  const boot = await request(6000, async () => ble.sendData('ota'), (l) => l.startsWith('BOOT,'))
    ?? await request(6000, () => ble.writeRaw(frame(CMD_INFO)), (l) => l.startsWith('BOOT,'))
  if (!boot) throw new Error("the board didn't enter its bootloader (is the firmware too old for updates?)")
  const fields = boot.split(',')
  const baud = parseInt(fields[2]) || 9600
  const maxSize = parseInt(fields[3]) || APP_MAX
  if (image.length > maxSize) throw new Error(`firmware is larger than the board's ${maxSize} bytes`)

  // 2. START
  await transact(frame(CMD_START, concat(le32(image.length), le32(crc32(image)))), baud, (l) => l === 'OK,START')

  // 3. DATA
  const blocks = Math.ceil(image.length / BLOCK)
  let seq = 0
  while (seq < blocks) {
    set({ kind: 'uploading', sent: seq * BLOCK, total: image.length })
    const data = image.subarray(seq * BLOCK, Math.min((seq + 1) * BLOCK, image.length))
    const reply = await transact(frame(CMD_DATA, concat(le16(seq), data)), baud, (l) => l === `OK,${seq}` || l.startsWith('ERR,SEQ,'))
    seq = reply.startsWith('ERR,SEQ,') ? parseInt(reply.slice(reply.lastIndexOf(',') + 1)) : seq + 1
  }

  // 4. END (if DONE got lost the board has still restarted: step 5 tells)
  set({ kind: 'verifying' })
  try {
    await transact(frame(CMD_END), baud, (l) => l === 'DONE')
  } catch (e) {
    if (e instanceof BoardError) throw e
  }

  // 5. The new firmware reports its version.
  await sleep(1500)
  for (let i = 0; i < 3; i++) {
    const ver = await request(3000, async () => ble.sendData('ver'), (l) => l.startsWith('VER,'))
    if (ver) {
      const v = ver.slice(4)
      if (wanted && v !== wanted) return { kind: 'error', message: `The board reports version ${v} after the update, expected ${wanted}` }
      return { kind: 'done', version: v }
    }
  }
  throw new Error("the board didn't report its version after the update")
}

/** Sends a frame; garbled frames and missing replies are retried, other ERR lines are fatal. */
async function transact(f: Uint8Array, baud: number, ok: (l: string) => boolean): Promise<string> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const reply = await request(4000, () => ble.writeRaw(f, baud), (l) => ok(l) || l.startsWith('ERR,'))
    if (reply == null || reply === 'ERR,FRAME') continue
    if (ok(reply)) return reply
    throw new BoardError(`the board answered ${reply}`)
  }
  throw new Error('no answer from the board')
}

/** Listens first, then sends, then waits up to [timeoutMs] for a matching line. */
function request(timeoutMs: number, send: () => Promise<void>, match: (l: string) => boolean): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: string | null) => {
      if (done) return
      done = true
      off()
      clearTimeout(timer)
      resolve(v)
    }
    const off = ble.onLine((l) => { if (match(l)) finish(l) })
    const timer = setTimeout(() => finish(null), timeoutMs)
    send().catch(() => finish(null))
  })
}

function frame(cmd: number, payload = new Uint8Array(0)) {
  const body = concat(new Uint8Array([cmd]), le16(payload.length), payload)
  return concat(new Uint8Array([0xa5, 0x5a]), body, le32(crc32(body)))
}
const le16 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255])
const le32 = (v: number) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255])
function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 as java.util.zip.CRC32. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
