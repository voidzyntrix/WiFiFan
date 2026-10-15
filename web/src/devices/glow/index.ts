// The WiFiFan LED board as a Glow device type: a BLE serial module (FFE0 / FFE1 / FFE2) in front of
// the board's firmware, its own control screen (every option of every mode lives on it).

import { BulbIcon } from '../../ui/components/Icons'
import type { DeviceType } from '../types'
import { board, demoLink } from './board'
import { ControlScreen } from './ControlScreen'
import { stopSync } from './sync'

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
