// The devices you have, of every type, as tiles (click to connect and open its controls, right-click
// or long press to rename / forget), and "Add a device", which scans and lists what is nearby.
// Nothing scrolls: tiles and nearby devices page (Pager) when there are more than fit.

import { connection, displayName, useConnection, wifiId } from '../../devices/connection'
import { useNearbyWifi } from '../../devices/nearbyWifi'
import { DEVICE_TYPES, deviceType, guessType, wifiType } from '../../devices/registry'
import type { SavedDevice } from '../../devices/types'
import type { WifiDevice } from '../../platform'
import { platform } from '../../platform'
import { useSettings } from '../../settings/store'
import { CircleIconButton, PillButton, useDesign } from '../components/Controls'
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
  // Wi-Fi boards show up by themselves: unpaired ones (their own network) and ones on this network.
  const around = useNearbyWifi(!picking)
  const wifi = wifiType()
  const savedIds = new Set(devices.map((d) => d.id))
  const found: Tile[] = [
    ...around.setups.map((ssid): Tile => ({ kind: 'setup', ssid })),
    ...around.boards.filter((b) => b.state !== 'setup' && !savedIds.has(wifiId(b.id))).map((board): Tile => ({ kind: 'board', board })),
  ]
  const tiles: Tile[] = [...devices.map((device): Tile => ({ kind: 'saved', device })), ...(wifi ? found : [])]

  const status = (d: SavedDevice) =>
    conn.device?.id === d.id ? (conn.phase === 'connected' ? 'Connected' : conn.phase === 'connecting' ? 'Connecting…' : 'Click to connect') : 'Click to connect'

  return (
    <div className="screen devices">
      <header className="header">
        <div className="header-title"><h1>Glow</h1></div>
        <CircleIconButton label="Settings" onClick={props.onSettings}><SettingsIcon /></CircleIconButton>
      </header>

      {!platform.ble && !platform.wifi && (
        <div className="panel warn">
          Bluetooth isn't available here. Use Glow for Windows or Glow for Android (or Chrome with Web Bluetooth).
        </div>
      )}

      <Swap k={picking ? 'pick' : tiles.length > 0 ? 'devices' : 'empty'} className="fill">
        {picking ? (
          <NearbyList onSetup={props.onSetup} />
        ) : tiles.length > 0 ? (
          <div className="device-area">
            <div className="grid-head">
              <h2>Your devices</h2>
              <span><Txt>{conn.phase === 'connecting' ? 'Connecting…' : conn.phase === 'connected' ? '1 connected' : `${devices.length} saved`}</Txt></span>
            </div>
            <Pager
              items={tiles}
              itemWidth={160}
              itemHeight={150}
              gap={12}
              render={(t) => {
                if (t.kind === 'setup') {
                  return (
                    <button key={'setup:' + t.ssid} className="board-tile" onClick={() => { sound.tap(); if (wifi) props.onSetup(wifi.id, t.ssid) }}>
                      <span className="tile-icon"><BulbIcon /></span>
                      <span className="tile-name">{t.ssid}</span>
                      <span className="tile-kind">{wifi?.label}</span>
                      <span className="tile-status blink"><span className="dot" /><Txt>Click to set up</Txt></span>
                    </button>
                  )
                }
                if (t.kind === 'board') {
                  return (
                    <button key={'board:' + t.board.id} className="board-tile" onClick={() => { sound.tap(); void connection.pickWifi(t.board) }}>
                      <span className="tile-icon"><BulbIcon /></span>
                      <span className="tile-name">{t.board.name ?? 'Glow board'}</span>
                      <span className="tile-kind">{wifi?.label}</span>
                      <span className="tile-status"><span className="dot" /><Txt>Click to connect</Txt></span>
                    </button>
                  )
                }
                const d = t.device
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

type Tile =
  | { kind: 'saved'; device: SavedDevice }
  | { kind: 'setup'; ssid: string }
  | { kind: 'board'; board: WifiDevice }

type Nearby = { id: string; name: string | null; detail: string; pick(): void }

/** Devices heard while scanning (Bluetooth, and Wi-Fi boards on this network); picking one connects to it. */
function NearbyList({ onSetup }: { onSetup: (typeId: string, ssid?: string) => void }) {
  const conn = useConnection()
  const setups = DEVICE_TYPES.filter((t) => t.Setup && (t.transport !== 'wifi' || platform.wifi))
  const items: Nearby[] = [
    ...conn.nearbyWifi.map((d): Nearby => ({
      id: 'wifi:' + d.id, name: d.name,
      detail: d.state === 'setup' ? 'Wi-Fi · waiting to be set up' : `Wi-Fi · ${d.host}`,
      pick: () => {
        const t = DEVICE_TYPES.find((x) => x.transport === 'wifi')
        if (d.state === 'setup') { if (t) onSetup(t.id) } else void connection.pickWifi(d)
      },
    })),
    ...conn.nearby.map((d): Nearby => ({ id: d.id, name: d.name, detail: `${guessType(d).label} · ${d.id}`, pick: () => void connection.pick(d) })),
  ]
  return (
    <div className="panel nearby">
      <div className="panel-head">
        <span>{conn.phase === 'connecting' ? 'Connecting…' : 'Nearby devices'}</span>
        <span className="scan-dots"><span /><span /><span /></span>
      </div>
      <Swap k={items.length === 0 ? 'empty' : 'list'} className="fill">
        {items.length === 0 ? (
          <div className="nearby-empty">
            <div>Looking for devices…</div>
            <p className="hint">Is the device powered and close by? Is Bluetooth on?{platform.wifi ? ' Wi-Fi boards show up once they are set up.' : ''}</p>
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
