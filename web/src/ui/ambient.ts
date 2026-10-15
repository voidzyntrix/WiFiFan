// The colour the background follows (Aurora glows, livelier particles): whatever the connected
// device is showing. A device type's control screen publishes it; the app shell reads it, without
// either knowing about the other.

import { useSyncExternalStore } from 'react'

export interface Ambient {
  /** The device is showing a light right now. */
  active: boolean
  hue: number
  sat: number
}

const OFF: Ambient = { active: false, hue: 200, sat: 0.7 }
let current = OFF
const listeners = new Set<() => void>()

export function setAmbient(a: Ambient | null) {
  const next = a ?? OFF
  if (next.active === current.active && Math.abs(next.hue - current.hue) < 0.5 && Math.abs(next.sat - current.sat) < 0.01) return
  current = next
  listeners.forEach((l) => l())
}

export const useAmbient = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => current)
