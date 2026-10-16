// The WiFiFan LED board as a Glow device type: a BLE serial module (FFE0 / FFE1 / FFE2) in front of
// the board's firmware, its own control screen (every option of every mode lives on it).
// The ESP32 LED board is the same board on Wi-Fi: the same commands over TCP, paired with
// WifiSetup, and it can be reset (forgets its Wi-Fi).

import { BulbIcon } from '../../ui/components/Icons'
import type { DeviceType } from '../types'
import { board, demoLink } from './board'
import { provisionCloud, startSettingsSync } from './boardSettings'
import { ControlScreen } from './ControlScreen'
import { WIFI_PORT, WIFI_TYPE_ID } from './pair'
import { stopSync } from './sync'
import { WifiSetup } from './WifiSetup'

export const glowBoard: DeviceType = {
  id: 'glow-led',
  label: 'LED board',
  Icon: BulbIcon,
  transport: 'ble',
  ble: [{ service: 0xffe0, write: 0xffe1, notify: 0xffe2 }],
  // The serial modules advertise names like "BT05", "HMSoft", "JDY-..", or a name set on the board.
  match: (d) => (/^(bt0|hm|jdy|mlt|wififan|glow)/i.test(d.name ?? '') ? 0.6 : 0.1),
  open(link) {
    board.attach(link, link.id === 'demo')
    return {
      close() {
        stopSync()
        board.detach()
      },
    }
  },
  ControlScreen,
  demoLink,
}

export const glowWifiBoard: DeviceType = {
  id: WIFI_TYPE_ID,
  label: 'Wi-Fi LED board',
  Icon: BulbIcon,
  transport: 'wifi',
  ble: [],
  port: WIFI_PORT,
  match: () => 0,
  open(link, device) {
    board.attach(link, false, 'wifi')
    board.sendData('info')    // its own firmware version
    const stopSettings = startSettingsSync(device)
    if (link.via !== 'cloud') provisionCloud()
    return {
      close() {
        stopSettings()
        stopSync()
        board.detach()
      },
      async reset() {
        stopSync()
        const done = board.waitFor('OK,reset', 4000)
        board.sendData('reset')
        await done
      },
    }
  },
  ControlScreen,
  Setup: WifiSetup,
}
