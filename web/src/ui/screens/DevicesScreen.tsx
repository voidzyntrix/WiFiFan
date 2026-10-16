// The devices you have, of every type, as tiles (click to connect and open its controls, right-click
// or long press to rename / forget), and "Add a device", which scans and lists what is nearby.
// Nothing scrolls: tiles and nearby devices page (Pager) when there are more than fit.

import { connection, displayName, useConnection, wifiId } from '../../devices/connection'
import { unpairedBoards, useNearbyWifi } from '../../devices/nearbyWifi'
import { DEVICE_TYPES, deviceType, guessType } from '../../devices/registry'
import type { SavedDevice } from '../../devices/types'
import { platform } from '../../platform'
import { useSettings } from '../../settings/store'
import { CircleIconButton, LoadingIndicator, PillButton, useDesign } from '../components/Controls'
import { AddIcon, BulbIcon, SettingsIcon } from '../components/Icons'
import { Pager } from '../components/Pager'
import { Swap, Txt } from '../motion'
import { sound } from '../sound'

export function DevicesScreen(props: {
  onSettings: () => void; onOpen: (d: SavedDevice) => void; onMenu: (d: SavedDevice) => void
  /** Opens a type's pairing dialog ("Set up a new …"), for one board's network when known. */
  onSetup: (typeId: string, ssid?: string) => void
}) {
  const { devices } = useSettings()
  const conn = useConnection()
  const material = useDesign() === 'MATERIAL'
  const picking = conn.phase === 'scanning' || (conn.phase === 'connecting' && conn.nearby.length > 0)

  const status = (d: SavedDevice) =>
    conn.device?.id === d.id ? (conn.phase === 'connected' ? 'Connected' : conn.phase === 'connecting' ? 'Connecting…' : 'Click to connect') : 'Click to connect'

  return (
    <div className="screen devices">
      <header className="header">
        <div className="header-title"><h1>Glow</h1><p className="header-sub">Your lights, in your colours</p></div>
        <CircleIconButton label="Settings" onClick={props.onSettings}><SettingsIcon /></CircleIconButton>
      </header>

      {!platform.ble && !platform.wifi && (
        <div className="panel warn">
          Bluetooth isn't available here. Use Glow for Windows or Glow for Android (or Chrome with Web Bluetooth).
        </div>
      )}

      <Swap k={picking ? 'pick' : devices.length > 0 ? 'devices' : 'empty'} className="fill">
        {picking ? (
          <NearbyList onSetup={props.onSetup} />
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
              <mdui-fab extended class="fab" onClick={() => { sound.tap(); connection.scan() }}>
                <span slot="icon" className="chip-icon"><AddIcon size={24} /></span>
                Add a device
              </mdui-fab>
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

type Nearby = { id: string; name: string | null; detail: string; pick(): void }

/** Devices heard while scanning (Bluetooth, and Wi-Fi boards on this network); picking one connects to it. */
function NearbyList({ onSetup }: { onSetup: (typeId: string, ssid?: string) => void }) {
  const conn = useConnection()
  const { devices } = useSettings()
  const around = useNearbyWifi(true)
  const wifiSetup = DEVICE_TYPES.find((t) => t.transport === 'wifi' && t.Setup)
  const setups = DEVICE_TYPES.filter((t) => t.Setup && (t.transport !== 'wifi' || platform.wifi))
  // Wi-Fi boards: ones that still need Wi-Fi (their own network), and ones already on this network,
  // which any Glow here can add. Boards this Glow already has are on the home screen, not listed.
  const items: Nearby[] = [
    ...(wifiSetup ? unpairedBoards(around, devices).map((ssid): Nearby => ({
      id: 'setup:' + ssid, name: ssid, detail: 'Wi-Fi LED board · waiting to be set up',
      pick: () => onSetup(wifiSetup.id, ssid),
    })) : []),
    ...(wifiSetup ? around.boards.filter((b) => b.state !== 'setup' && !devices.some((d) => d.id === wifiId(b.id))).map((b): Nearby => ({
      id: 'wifi:' + b.id, name: b.name, detail: `Wi-Fi LED board · ${b.host}`,
      pick: () => void connection.pickWifi(b),
    })) : []),
    ...conn.nearby.map((d): Nearby => ({ id: d.id, name: d.name, detail: `${guessType(d).label} · ${d.id}`, pick: () => void connection.pick(d) })),
  ]
  return (
    <div className="panel nearby">
      <div className="panel-head">
        <span>{conn.phase === 'connecting' ? 'Connecting…' : 'Nearby devices'}</span>
        {useDesign() === 'MATERIAL' ? <LoadingIndicator size={32} label="Looking for devices" /> : <span className="scan-dots"><span /><span /><span /></span>}
      </div>
      <Swap k={items.length === 0 ? 'empty' : 'list'} className="fill">
        {items.length === 0 ? (
          <div className="nearby-empty">
            <div>Looking for devices…</div>
            <p className="hint">Is the device powered and close by? Is Bluetooth on?{platform.wifi ? ' Wi-Fi boards show up here too.' : ''}</p>
          </div>
        ) : (
          <Pager
            items={items}
            itemWidth={220}
            itemHeight={58}
            gap={6}
            render={(d) => (
              <button key={d.id} className="nearby-row" disabled={conn.phase === 'connecting'} onClick={() => { sound.tap(); d.pick() }}>
                <span className="nearby-name">{d.name ?? 'Unknown device'}</span>
                <span className="nearby-id">{d.detail}</span>
              </button>
            )}
          />
        )}
      </Swap>
      <div className="dialog-buttons">
        <PillButton text="Cancel" onClick={() => connection.cancelScan()} />
        {setups.map((t) => <PillButton key={t.id} text={`Set up a new ${t.label}`} highlighted onClick={() => onSetup(t.id)} />)}
      </div>
    </div>
  )
}
