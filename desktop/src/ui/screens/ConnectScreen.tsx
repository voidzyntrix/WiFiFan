// Not on a board: the grid of boards connected before (click to connect, right-click to rename or
// forget), the first-run "Connect" beacon, and the nearby-devices list while scanning.
//
// Desktop difference: Windows can't hear which paired boards are advertising without opening a
// scan, so tiles say "Connected" or "Click to connect" instead of the phone's Online/Offline pills.

import { ble, useBle } from '../../ble/ble'
import { desktop } from '../../desktop'
import type { PairedBoard } from '../../settings/store'
import { CircleIconButton, PillButton } from '../components/Controls'
import { AddIcon, BulbIcon, SettingsIcon } from '../components/Icons'
import { sound } from '../sound'

export function ConnectScreen(props: {
  paired: PairedBoard[]
  names: Record<string, string>
  onSettings: () => void
  onOpenBoard: (b: PairedBoard) => void
  onBoardMenu: (b: PairedBoard) => void
  onAdd: () => void
}) {
  const conn = useBle()
  const picking = conn.scanning && conn.state !== 'connecting'
  const nameOf = (b: PairedBoard) => props.names[b.id] ?? b.bleName ?? 'LED board'

  return (
    <div className="screen connect">
      <header className="header">
        <div className="header-title"><h1>Glow</h1></div>
        <CircleIconButton label="Settings" onClick={props.onSettings}><SettingsIcon /></CircleIconButton>
      </header>

      {!ble.available && (
        <div className="panel warn">
          Bluetooth isn't available in this window. Start Glow as the desktop app
          (<code>npm run dev</code> in <code>desktop/</code>, or the built Glow.exe).
        </div>
      )}

      {picking ? (
        <NearbyList />
      ) : props.paired.length > 0 ? (
        <>
          <div className="grid-head">
            <h2>Your boards</h2>
            <span>{conn.state === 'connecting' ? 'Connecting…' : conn.state === 'connected' ? '1 connected' : `${props.paired.length} saved`}</span>
          </div>
          <div className="board-grid">
            {props.paired.map((b) => {
              const here = conn.deviceId === b.id
              const status = here && conn.state === 'connected' ? 'Connected' : here && conn.state === 'connecting' ? 'Connecting…' : 'Click to connect'
              return (
                <button
                  key={b.id}
                  className={'board-tile' + (here && conn.state !== 'disconnected' ? ' live' : '')}
                  onClick={() => { sound.tap(); props.onOpenBoard(b) }}
                  onContextMenu={(e) => { e.preventDefault(); sound.longPress(); props.onBoardMenu(b) }}
                >
                  <span className="tile-icon"><BulbIcon /></span>
                  <span className="tile-name">{nameOf(b)}</span>
                  <span className={'tile-status' + (status === 'Connected' ? ' on' : '') + (status === 'Connecting…' ? ' blink' : '')}>
                    <span className="dot" />{status}
                  </span>
                </button>
              )
            })}
            <button className="board-tile add" onClick={() => { sound.tap(); props.onAdd() }}>
              <span className="tile-icon"><AddIcon size={28} /></span>
              <span className="tile-name">Add a board</span>
            </button>
          </div>
          <p className="hint center">Click a board to control it. Right-click it to rename or forget it.</p>
        </>
      ) : (
        <div className="beacon-wrap">
          <div className="beacon" />
          <div className="beacon-status">{conn.state === 'connecting' ? 'Connecting…' : 'Not connected'}</div>
          <p className="hint center">Power the LED board and keep your PC's Bluetooth on and nearby.</p>
          <div className="beacon-button">
            <PillButton text="Connect" highlighted onClick={props.onAdd} />
          </div>
        </div>
      )}

      {(import.meta.env.DEV || !desktop) && !picking && conn.state === 'disconnected' && (
        <button className="quiet-link demo-link" onClick={() => ble.startDemo()}>Try the controls without a board (demo)</button>
      )}
    </div>
  )
}

/** Devices heard while scanning; picking one connects to it. */
function NearbyList() {
  const conn = useBle()
  return (
    <div className="panel nearby">
      <div className="panel-head">
        <span>Nearby devices</span>
        <span className="scan-dots"><span /><span /><span /></span>
      </div>
      {conn.nearby.length === 0 ? (
        <div className="nearby-empty">
          <div>Looking for LED boards…</div>
          <p className="hint">Is the board powered and close by? Is Bluetooth on in Windows?</p>
        </div>
      ) : (
        <div className="nearby-list">
          {conn.nearby.map((d) => (
            <button key={d.id} className="nearby-row" onClick={() => { sound.tap(); ble.pick(d.id) }}>
              <span className="nearby-name">{d.name ?? 'Unknown device'}</span>
              <span className="nearby-id">{d.id}</span>
            </button>
          ))}
        </div>
      )}
      <div className="dialog-buttons">
        <PillButton text="Cancel" onClick={() => ble.cancelScan()} />
      </div>
    </div>
  )
}
