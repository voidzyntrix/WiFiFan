// Wi-Fi boards around, kept up to date while the device list is open (no button to press):
// boards already on this network (they answer the discovery broadcast) and unpaired boards, which
// are found by their own "Glow-XXXX" network. Generic over the platform's WifiTransport.

import { useEffect, useSyncExternalStore } from 'react'
import { platform, type WifiDevice } from '../platform'
import { SETUP_PREFIX, pairing } from './glow/pair'

export interface NearbyWifi {
  /** On this network (paired). */
  boards: WifiDevice[]
  /** Names of unpaired boards' own networks. */
  setups: string[]
}

const SETUP_POLL_MS = 10_000

let state: NearbyWifi = { boards: [], setups: [] }
const listeners = new Set<() => void>()
const set = (patch: Partial<NearbyWifi>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }

let users = 0
let stopDiscover: (() => void) | null = null
let timer = 0
let scanning = false

async function pollSetups() {
  const wifi = platform.wifi
  if (!wifi?.scanSetup || scanning || pairing.active) return
  scanning = true
  try {
    const setups = await wifi.scanSetup(SETUP_PREFIX)
    if (users > 0 && (setups.length !== state.setups.length || setups.some((s, i) => s !== state.setups[i]))) set({ setups })
  } finally { scanning = false }
}

function start() {
  const wifi = platform.wifi
  if (!wifi) return
  stopDiscover = wifi.discover((boards) => set({ boards }))
  void pollSetups()
  timer = window.setInterval(() => void pollSetups(), SETUP_POLL_MS)
}

function stop() {
  stopDiscover?.()
  stopDiscover = null
  window.clearInterval(timer)
  set({ boards: [], setups: [] })
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => state

/** Wi-Fi boards nearby; the search runs while something uses this with `on` (the device list). */
export function useNearbyWifi(on: boolean): NearbyWifi {
  useEffect(() => {
    if (!on) return
    if (users++ === 0) start()
    return () => { if (--users === 0) stop() }
  }, [on])
  return useSyncExternalStore(subscribe, snapshot)
}
