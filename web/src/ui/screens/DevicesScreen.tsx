// The devices you have, of every type, as tiles (click to connect and open its controls, right-click
// or long press to rename / forget), and "Add a device", which scans and lists what is nearby.
// Nothing scrolls: tiles and nearby devices page (Pager) when there are more than fit.

import { connection, displayName, useConnection } from '../../devices/connection'
import { deviceType, guessType } from '../../devices/registry'
import type { SavedDevice } from '../../devices/types'
import { platform } from '../../platform'
import { useSettings } from '../../settings/store'
import { CircleIconButton, PillButton, useDesign } from '../components/Controls'
import { AddIcon, BulbIcon, SettingsIcon } from '../components/Icons'
import { Pager } from '../components/Pager'
import { Swap, Txt } from '../motion'
import { sound } from '../sound'

export function DevicesScreen(props: { onSettings: () => void; onOpen: (d: SavedDevice) => void; onMenu: (d: SavedDevice) => void }) {
  const { devices } = useSettings()
  const conn = useConnection()
  const material = useDesign() === 'MATERIAL'
  const picking = conn.phase === 'scanning' || (conn.phase === 'connecting' && conn.nearby.length > 0)

  const status = (d: SavedDevice) =>
    conn.device?.id === d.id ? (conn.phase === 'connected' ? 'Connected' : conn.phase === 'connecting' ? 'Connecting…' : 'Click to connect') : 'Click to connect'

  return (
    <div className="screen devices">
      <header className="header">
        <div className="header-title"><h1>Glow</h1></div>
        <CircleIconButton label="Settings" onClick={props.onSettings}><SettingsIcon /></CircleIconButton>
      </header>

      {!platform.ble && (
        <div className="panel warn">
          Bluetooth isn't available here. Use Glow for Windows or Glow for Android (or Chrome with Web Bluetooth).
        </div>
      )}

      <Swap k={picking ? 'pick' : devices.length > 0 ? 'devices' : 'empty'} className="fill">
        {picking ? (
          <NearbyList />
        ) : devices.length > 0 ? (
          <div className="device-area">
            <div className="grid-head">
              <h2>Your devices</h2>
              <span><Txt>{conn.phase === 'connecting' ? 'Connecting…' : conn.phase === 'connected' ? '1 connected' : `${devices.length} saved`}</Txt></span>
            </div>
            <Pager
              items={devices}
              itemWidth={160}
              itemHeight={150}
              gap={12}
              render={(d) => {
                const type = deviceType(d.type)
                const Icon = type?.Icon ?? BulbIcon
                const st = status(d)
                return (
                  <button
                    key={d.id}
                    className={'board-tile' + (conn.device?.id === d.id && conn.phase !== 'idle' ? ' live' : '')}
                    onClick={() => { sound.tap(); props.onOpen(d) }}
                    onContextMenu={(e) => { e.preventDefault(); sound.longPress(); props.onMenu(d) }}
                  >
                    <span className="tile-icon"><Icon /></span>
                    <span className="tile-name"><Txt>{displayName(d)}</Txt></span>
                    <span className="tile-kind">{type?.label ?? 'Unknown device'}</span>
                    <span className={'tile-status' + (st === 'Connected' ? ' on' : '') + (st === 'Connecting…' ? ' blink' : '')}>
                      <span className="dot" /><Txt>{st}</Txt>
                    </span>
                  </button>
                )
              }}
              tail={material ? undefined : (
                <button className="board-tile add" onClick={() => { sound.tap(); connection.scan() }}>
                  <span className="tile-icon"><AddIcon size={28} /></span>
                  <span className="tile-name">Add a device</span>
                </button>
              )}
            />
            <p className="hint center">Click a device to control it. Right-click or long press to rename or forget it.</p>
            {material && (
              <md-fab class="fab" label="Add a device" onClick={() => { sound.tap(); connection.scan() }}>
                <span slot="icon" className="chip-icon"><AddIcon size={24} /></span>
              </md-fab>
            )}
          </div>
        ) : (
          <div className="beacon-wrap">
            <div className="beacon" />
            <div className="beacon-status"><Txt>{conn.phase === 'connecting' ? 'Connecting…' : 'No devices yet'}</Txt></div>
            <p className="hint center">Power your device and keep Bluetooth on and nearby.</p>
            <div className="beacon-button">
              <PillButton text="Add a device" highlighted onClick={() => connection.scan()} />
            </div>
            <button className="quiet-link demo-link" onClick={() => connection.startDemo()}>Try the controls without a device (demo)</button>
          </div>
        )}
      </Swap>
    </div>
  )
}

/** Devices heard while scanning; picking one connects to it. */
function NearbyList() {
  const conn = useConnection()
  return (
    <div className="panel nearby">
      <div className="panel-head">
        <span>{conn.phase === 'connecting' ? 'Connecting…' : 'Nearby devices'}</span>
        <span className="scan-dots"><span /><span /><span /></span>
      </div>
      <Swap k={conn.nearby.length === 0 ? 'empty' : 'list'} className="fill">
        {conn.nearby.length === 0 ? (
          <div className="nearby-empty">
            <div>Looking for devices…</div>
            <p className="hint">Is the device powered and close by? Is Bluetooth on?</p>
          </div>
        ) : (
          <Pager
            items={conn.nearby}
            itemWidth={220}
            itemHeight={58}
            gap={6}
            render={(d) => (
              <button key={d.id} className="nearby-row" disabled={conn.phase === 'connecting'} onClick={() => { sound.tap(); void connection.pick(d) }}>
                <span className="nearby-name">{d.name ?? 'Unknown device'}</span>
                <span className="nearby-id">{guessType(d).label} · {d.id}</span>
              </button>
            )}
          />
        )}
      </Swap>
      <div className="dialog-buttons">
        <PillButton text="Cancel" onClick={() => connection.cancelScan()} />
      </div>
    </div>
  )
}
