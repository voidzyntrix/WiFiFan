// Pairing an ESP32 board over Wi-Fi (the board's side: Projects/ESP32 Glow/main/main.ino).
//
// A board without Wi-Fi opens its own network "Glow-XXXX" and listens on 192.168.4.1. Glow joins
// that network (Android asks the system to; on Windows the user joins it), sends the home network's
// name and password, and the board saves them once it got on. Then the board closes its network,
// the phone or PC is back on its own Wi-Fi, and Glow finds the board there by its MAC.

import { findWifi, wifiId } from '../connection'
import type { SavedDevice } from '../types'
import { platform, type BleLink } from '../../platform'

export const SETUP_PREFIX = 'Glow-'
export const SETUP_PASSWORD = 'glowsetup'
export const SETUP_HOST = '192.168.4.1'
export const WIFI_PORT = 4210
export const WIFI_TYPE_ID = 'glow-wifi'

export type PairStep = 'join' | 'connect' | 'send' | 'joining' | 'find'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const hex = (text: string) => Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('')

/** Lines from a raw link ('\' ends each), waited for one at a time. */
function lines(link: BleLink) {
  const decoder = new TextDecoder()
  let rx = ''
  const queue: string[] = []
  let waiter: ((line: string | null) => void) | null = null
  let closed = false
  link.onData((d) => {
    rx += decoder.decode(d, { stream: true })
    let i
    while ((i = rx.indexOf('\\')) >= 0) {
      const line = rx.slice(0, i).trim()
      rx = rx.slice(i + 1)
      if (!line) continue
      if (waiter) { const w = waiter; waiter = null; w(line) } else queue.push(line)
    }
  })
  link.onClose(() => { closed = true; waiter?.(null); waiter = null })
  /** The next line starting with one of `prefixes`; null when the link closed. */
  return async (prefixes: string[], ms: number): Promise<string | null> => {
    const deadline = Date.now() + ms
    for (;;) {
      const queued = queue.shift()
      const line = queued ?? (closed ? null : await new Promise<string | null>((resolve) => {
        const t = window.setTimeout(() => { waiter = null; resolve('') }, Math.max(0, deadline - Date.now()))
        waiter = (l) => { window.clearTimeout(t); resolve(l) }
      }))
      if (line === null) return null
      if (line === '') throw new Error("The board didn't answer")
      if (prefixes.some((p) => line.startsWith(p))) return line
    }
  }
}

async function connectSetup(): Promise<BleLink> {
  let last: Error | null = null
  for (let i = 0; i < 5; i++) {
    try { return await platform.wifi!.connect(SETUP_HOST, WIFI_PORT) } catch (e) { last = e as Error }
    await sleep(1500)   // the network was just joined: its address may not be ready yet
  }
  throw new Error(`Couldn't reach the board's network (${last?.message ?? 'no answer'})`)
}

/**
 * Gives a board waiting for pairing the network's name and password, then finds it on that network.
 * `onStep` follows along; the result is the device to save and connect to.
 */
export async function pairBoard(ssid: string, password: string, onStep: (step: PairStep) => void, signal: { cancelled: boolean }): Promise<SavedDevice> {
  const wifi = platform.wifi
  if (!wifi) throw new Error("Wi-Fi boards can't be set up here")
  let leave: (() => void) | null = null
  let link: BleLink | null = null
  try {
    if (wifi.joinSetup) {
      onStep('join')
      leave = (await wifi.joinSetup(SETUP_PREFIX, SETUP_PASSWORD)).leave
    }
    if (signal.cancelled) throw new Error('Cancelled')

    onStep('connect')
    link = await connectSetup()
    const next = lines(link)
    const send = (text: string) => link!.write(new TextEncoder().encode(text + '\\'))

    await send('info')
    const info = await next(['INFO,'], 5000)
    if (!info) throw new Error('The board closed the connection')
    const [, mac, name] = info.split(',')
    if (!mac) throw new Error('The board sent no id')

    onStep('send')
    await send(`wifi=${hex(ssid)},${hex(password)}`)
    onStep('joining')
    // The board answers once it is on the network, or why it isn't. Its own network can drop as it
    // joins (it moves to the router's channel); then the answer is lost and it is looked for below.
    const answer = await next(['WIFI,OK', 'WIFI,FAIL'], 35_000).catch(() => null)
    if (answer?.startsWith('WIFI,FAIL')) {
      const why = answer.split(',').slice(2).join(',') || 'it could not join'
      throw new Error(`The board couldn't join "${ssid}": ${why}. Check the name and password.`)
    }
    const hostHint = answer?.split(',')[2]

    link.close()
    link = null
    leave?.()
    leave = null

    onStep('find')
    // back on the home network (Windows: the PC goes back by itself once the board's network closes)
    const found = await findWifi(mac, 60_000)
    if (!found && !hostHint) throw new Error(`The board joined "${ssid}" but wasn't found there. Is this ${platform.kind === 'desktop' ? 'PC' : 'phone'} on that network?`)
    return { id: wifiId(mac), type: WIFI_TYPE_ID, name: null, advertised: found?.name ?? name ?? null, host: found?.host ?? hostHint }
  } finally {
    link?.close()
    leave?.()
  }
}
