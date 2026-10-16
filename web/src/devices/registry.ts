// Every kind of device Glow can control. Add a new type here (and in its own folder).

import type { BtDevice } from '../platform'
import { glowBoard, glowWifiBoard } from './glow'
import type { DeviceType } from './types'

export const DEVICE_TYPES: DeviceType[] = [glowBoard, glowWifiBoard]

export const deviceType = (id: string): DeviceType | undefined => DEVICE_TYPES.find((t) => t.id === id)

/** The type a device heard over Bluetooth most likely is (the first type when none claims it). */
export function guessType(device: BtDevice): DeviceType {
  let best = DEVICE_TYPES[0], score = -1
  for (const t of DEVICE_TYPES) {
    if (t.transport !== 'ble') continue
    const s = t.match(device)
    if (s > score) { best = t; score = s }
  }
  return best
}

/** The type Wi-Fi boards found by discovery are (they all answer the same broadcast). */
export const wifiType = (): DeviceType | undefined => DEVICE_TYPES.find((t) => t.transport === 'wifi')
