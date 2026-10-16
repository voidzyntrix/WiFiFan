// The Wi-Fi board keeps its own settings (name, fade time, ...) in its memory, as one JSON object:
//
//   board -> app   "settings\"            ->  "SETTINGS,{...}\"
//   app -> board   "settings={...}\"      ->  "OK,settings\"
//
// On connect the app reads them and takes them over (a second phone then shows the same name and
// fade as the first); a board that has none yet is given the app's. After that every change is
// written back (a moment after the last, so a slider drag is one write).

import { settings, type Settings } from '../../settings/store'
import { boardJson, fromBoardJson, isConfigured, sameCloud } from '../cloud'
import { connection } from '../connection'
import type { SavedDevice } from '../types'
import { board } from './board'

/** The settings the board keeps: payload key -> the app setting it is. */
const FIELDS = {
  fade: 'fadeMs',
  split: 'separateLeds',
  smoothCandle: 'smoothCandle',
  twoCandles: 'twoCandles',
  rainbowSeconds: 'rainbowSeconds',
  candleHue: 'candleHue',
} as const satisfies Record<string, keyof Settings>

const WRITE_DELAY_MS = 600

/** A name the board can keep: no quotes, backslashes, commas or control characters (they are its separators). */
const cleanName = (name: string) => name.replace(/["\\,\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24)

function payloadOf(deviceId: string): string {
  const s = settings.get()
  const out: Record<string, unknown> = {}
  const name = cleanName(s.devices.find((d) => d.id === deviceId)?.name ?? '')
  if (name) out.name = name
  for (const [key, pref] of Object.entries(FIELDS)) out[key] = s[pref]
  return JSON.stringify(out)
}

/** Takes the board's values into the app. */
function applyFromBoard(deviceId: string, json: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}
  const current = settings.get()
  for (const [key, pref] of Object.entries(FIELDS)) {
    const v = json[key]
    if (typeof v === typeof current[pref]) patch[pref] = v
  }
  settings.set(patch as Partial<Settings>)
  if (typeof json.name === 'string' && json.name.trim()) {
    const saved = current.devices.find((d) => d.id === deviceId)
    if (saved && saved.name !== json.name) connection.rename(deviceId, json.name)
  }
}

/** Starts keeping the connected Wi-Fi board's settings and the app's the same; returns stop. */
export function startSettingsSync(device: SavedDevice): () => void {
  let stopped = false
  let applying = true
  let last = ''
  let timer = 0

  const write = () => {
    const payload = payloadOf(device.id)
    if (stopped || payload === last || board.snapshot.state !== 'connected') return
    last = payload
    board.sendData(`settings=${payload}`)
  }
  const onChange = () => {
    if (applying || stopped) return
    window.clearTimeout(timer)
    timer = window.setTimeout(write, WRITE_DELAY_MS)
  }
  const off = settings.subscribe(onChange)

  void (async () => {
    const reply = board.waitFor('SETTINGS,', 3000).catch(() => null)
    board.sendData('settings')
    const line = await reply
    if (stopped) return
    if (line) {
      try {
        const json = JSON.parse(line.slice('SETTINGS,'.length)) as Record<string, unknown>
        applyFromBoard(device.id, json)
        // already the same as the app's now? then there is nothing to write back
        const mine = payloadOf(device.id)
        const mineObj = JSON.parse(mine) as Record<string, unknown>
        if (Object.keys(mineObj).every((k) => json[k] === mineObj[k])) last = mine
      } catch { /* unreadable: the app's settings replace them */ }
    }   // else: older firmware without settings; nothing to sync
    applying = false
    if (line) write()   // gives a new board the app's settings, completes a partial set
  })()

  return () => { stopped = true; off(); window.clearTimeout(timer) }
}

/**
 * Internet access: on the local network the board gets the broker settings from the app (when they
 * differ), and a Glow that has none takes the board's, so a second phone is ready without typing.
 * (Over the internet the board refuses this: it is only for the local network.)
 */
export function provisionCloud() {
  void (async () => {
    const reply = board.waitFor('CLOUD,', 3000).catch(() => null)
    board.sendData('cloud')
    const line = await reply
    if (!line) return                                  // firmware without internet access
    const rest = line.slice('CLOUD,'.length)
    const comma = rest.indexOf(',')
    let theirs = null
    try { theirs = fromBoardJson(JSON.parse(rest.slice(comma + 1)) as Record<string, unknown>) } catch { /* none set */ }
    const mine = settings.get().cloud
    if (!isConfigured(mine)) {
      if (theirs) settings.set({ cloud: theirs })
    } else if (!theirs || !sameCloud(mine, theirs)) {
      board.sendData(`cloud=${boardJson(mine)}`)
    }
  })()
}
