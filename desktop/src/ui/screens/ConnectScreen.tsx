// Not on a board: the grid of boards connected before (click to connect, right-click to rename or
// forget), the first-run "Connect" beacon, and the nearby-devices list while scanning.
//
// Desktop difference: Windows can't hear which paired boards are advertising without opening a
// scan, so tiles say "Connected" or "Click to connect" instead of the phone's Online/Offline pills.

import { useRef } from 'react'
import { ble, useBle } from '../../ble/ble'
import { desktop } from '../../desktop'
import type { PairedBoard } from '../../settings/store'
import { CircleIconButton, PillButton } from '../components/Controls'
import { AddIcon, BulbIcon, SettingsIcon } from '../components/Icons'
import { sound } from '../sound'
import { Presence, Swap, Txt, useFlip, useLeavingList } from '../motion'

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
  const grid = useRef<HTMLDivElement>(null)
  useFlip(grid)
  const tiles = useLeavingList(props.paired, (b) => b.id)

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

      <Swap k={picking ? 'pick' : props.paired.length > 0 ? 'boards' : 'beacon'}>
      {picking ? (
        <NearbyList />
      ) : props.paired.length > 0 ? (
        <>
          <div className="grid-head">
            <h2>Your boards</h2>
            <span><Txt>{conn.state === 'connecting' ? 'Connecting…' : conn.state === 'connected' ? '1 connected' : `${props.paired.length} saved`}</Txt></span>
          </div>
          <div ref={grid} className="board-grid">
            {tiles.map(({ item: b, leaving }) => {
              const here = conn.deviceId === b.id
              const status = here && conn.state === 'connected' ? 'Connected' : here && conn.state === 'connecting' ? 'Connecting…' : 'Click to connect'
              return (
                <button
                  key={b.id}
                  data-flip={b.id}
                  disabled={leaving}
                  className={'board-tile' + (here && conn.state !== 'disconnected' ? ' live' : '') + (leaving ? ' leaving' : '')}
                  onClick={() => { sound.tap(); props.onOpenBoard(b) }}
                  onContextMenu={(e) => { e.preventDefault(); sound.longPress(); props.onBoardMenu(b) }}
                >
                  <span className="tile-icon"><BulbIcon /></span>
                  <span className="tile-name"><Txt>{nameOf(b)}</Txt></span>
                  <span className={'tile-status' + (status === 'Connected' ? ' on' : '') + (status === 'Connecting…' ? ' blink' : '')}>
                    <span className="dot" /><Txt>{status}</Txt>
                  </span>
                </button>
              )
            })}
            <button data-flip="add" className="board-tile add" onClick={() => { sound.tap(); props.onAdd() }}>
              <span className="tile-icon"><AddIcon size={28} /></span>
              <span className="tile-name">Add a board</span>
            </button>
          </div>
          <p className="hint center">Click a board to control it. Right-click it to rename or forget it.</p>
        </>
      ) : (
        <div className="beacon-wrap">
          <div className="beacon" />
          <div className="beacon-status"><Txt>{conn.state === 'connecting' ? 'Connecting…' : 'Not connected'}</Txt></div>
          <p className="hint center">Power the LED board and keep your PC's Bluetooth on and nearby.</p>
          <div className="beacon-button">
            <PillButton text="Connect" highlighted onClick={props.onAdd} />
          </div>
        </div>
      )}
      </Swap>

      <Presence show={(import.meta.env.DEV || !desktop) && !picking && conn.state === 'disconnected'}>
        <button className="quiet-link demo-link" onClick={() => ble.startDemo()}>Try the controls without a board (demo)</button>
      </Presence>
    </div>
  )
}

/** Devices heard while scanning; picking one connects to it. */
function NearbyList() {
  const conn = useBle()
  const list = useRef<HTMLDivElement>(null)
  useFlip(list)
  const rows = useLeavingList(conn.nearby, (d) => d.id)
  return (
    <div className="panel nearby">
      <div className="panel-head">
        <span>Nearby devices</span>
        <span className="scan-dots"><span /><span /><span /></span>
      </div>
      <Swap k={conn.nearby.length === 0 ? 'empty' : 'list'}>
        {conn.nearby.length === 0 ? (
          <div className="nearby-empty">
            <div>Looking for LED boards…</div>
            <p className="hint">Is the board powered and close by? Is Bluetooth on in Windows?</p>
          </div>
        ) : (
          <div ref={list} className="nearby-list">
            {rows.map(({ item: d, key, leaving }) => (
              <button key={key} data-flip={key} disabled={leaving} className={'nearby-row' + (leaving ? ' leaving' : '')} onClick={() => { sound.tap(); ble.pick(d.id) }}>
                <span className="nearby-name"><Txt>{d.name ?? 'Unknown device'}</Txt></span>
                <span className="nearby-id">{d.id}</span>
              </button>
            ))}
          </div>
        )}
      </Swap>
      <div className="dialog-buttons">
        <PillButton text="Cancel" onClick={() => ble.cancelScan()} />
      </div>
    </div>
  )
}
