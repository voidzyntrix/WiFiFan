// Every kind of device Glow can control. Add a new type here (and in its own folder).
// What a type lists here is only what the device list needs while nothing is connected: the label,
// icon, Bluetooth profile and what it matches in a scan. Its screens and session (under glow/)
// are loaded the first time a device connects, so none of that runs before the first paint.

import { lazy } from 'react'
import type { BtDevice } from '../platform'
import { BulbIcon } from '../ui/components/Icons'
import { WIFI_PORT, WIFI_TYPE_ID } from './glow/pair'
import type { DeviceType } from './types'

/** The LED board's run-time module, loaded once and then shared. */
let glow: Promise<typeof import('./glow')> | null = null
const loadGlow = () => (glow ??= import('./glow'))

/** The board's control screen and pairing dialog, as lazy components (loaded with their module). */
const GlowControlScreen = lazy(() => import('./glow/ControlScreen').then((m) => ({ default: m.ControlScreen })))
const GlowWifiSetup = lazy(() => import('./glow/WifiSetup').then((m) => ({ default: m.WifiSetup })))

export const DEVICE_TYPES: DeviceType[] = [
  {
    id: 'glow-led',
    label: 'LED board',
    Icon: BulbIcon,
    transport: 'ble',
    ble: [{ service: 0xffe0, write: 0xffe1, notify: 0xffe2 }],
    // The serial modules advertise names like "BT05", "HMSoft", "JDY-..", or a name set on the board.
    match: (d) => (/^(bt0|hm|jdy|mlt|wififan|glow)/i.test(d.name ?? '') ? 0.6 : 0.1),
    async open(link, device) {
      return (await loadGlow()).glowBoard.open(link, device)
    },
    ControlScreen: GlowControlScreen,
    demoLink: async () => (await loadGlow()).glowBoard.demoLink!(),
  },
  {
    id: WIFI_TYPE_ID,
    label: 'Wi-Fi LED board',
    Icon: BulbIcon,
    transport: 'wifi',
    ble: [],
    port: WIFI_PORT,
    match: () => 0,
    async open(link, device) {
      return (await loadGlow()).glowWifiBoard.open(link, device)
    },
    ControlScreen: GlowControlScreen,
    Setup: GlowWifiSetup,
  },
]

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
