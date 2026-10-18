// Board firmware: what is running, whether there is a newer one on GitHub, and the update itself.
// A dialog opened from the control screen (the update must not be cut off, so it keeps the display
// awake and warns before the window closes).

import { useEffect, useRef } from 'react'
import { platform } from '../../platform'
import { settings, useSettings } from '../../settings/store'
import { Dialog, PillButton, ProgressBar } from '../../ui/components/Controls'
import { Presence, Swap, Txt } from '../../ui/motion'
import { useBoard } from './board'
import { checkFirmware, firmwareVersionOf, otaBusy, startFirmwareUpdate, useOta, type OtaState } from './ota'

export function FirmwareDialog({ onDismiss }: { onDismiss: () => void }) {
  const conn = useBoard()
  const ota = useOta()
  const p = useSettings()
  const version = firmwareVersionOf(conn) ?? (conn.kind === 'ble' && conn.deviceId ? p.boardVersions[conn.deviceId] ?? null : null)
  return (
    <Dialog onDismiss={onDismiss}>
      <h2 className="dialog-title">Board firmware</h2>
      <FirmwareBlock state={ota} version={version} connected={conn.state === 'connected'} />
      <div className="dialog-buttons"><PillButton text="Close" onClick={onDismiss} /></div>
    </Dialog>
  )
}

function FirmwareBlock({ state, version, connected }: { state: OtaState; version: string | null; connected: boolean }) {
  const file = useRef<HTMLInputElement>(null)
  const busy = otaBusy(state)
  const status =
    state.kind === 'idle' ? 'New firmware is published as GitHub releases.'
      : state.kind === 'checking' ? 'Checking GitHub…'
        : state.kind === 'upToDate' ? `Up to date (latest release is v${state.latest}).`
          : state.kind === 'available' ? `Version ${state.release.version} is available.`
            : state.kind === 'downloading' ? 'Downloading…'
              : state.kind === 'preparing' ? 'Getting the board ready…'
                : state.kind === 'bootloader' ? 'Restarting the board into update mode…'
                : state.kind === 'uploading' ? `Sending… ${Math.floor((state.sent * 100) / Math.max(1, state.total))} % — keep Glow open`
                  : state.kind === 'verifying' ? 'Checking the new firmware…'
                    : state.kind === 'done' ? `Updated to v${state.version}.` : state.message

  // The update must not be cut off: keep the display awake and warn before closing.
  useEffect(() => {
    if (!busy) return
    platform.keepAwake(true)
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => { platform.keepAwake(settings.get().keepScreenOn); window.removeEventListener('beforeunload', warn) }
  }, [busy])

  return (
    <div className="update-block">
      <div className="update-title">
        <Txt>{!connected ? 'Board not connected' : version ? `Board firmware v${version}` : 'Board firmware version unknown'}</Txt>
        <Presence show={state.kind === 'available'} className="inline"><span className="update-dot" /></Presence>
      </div>
      <div className={'update-status' + (state.kind === 'error' ? ' error' : '')}><Txt>{status}</Txt></div>
      <Swap k={busy || state.kind === 'checking' ? 'progress' : state.kind === 'available' ? 'update' : 'check'}>
        {busy || state.kind === 'checking' ? (
          <ProgressBar fraction={state.kind === 'uploading' && state.total > 0 ? state.sent / state.total : null} />
        ) : state.kind === 'available' ? (
          <PillButton text={`Update to v${state.release.version}`} highlighted enabled={connected} onClick={() => void startFirmwareUpdate(state.release)} />
        ) : (
          <PillButton text="Check for updates" enabled={connected} onClick={() => void checkFirmware(version, false, true)} />
        )}
      </Swap>
      <Presence show={!busy && connected}>
        <div className="stack">
          <button className="quiet-link small" onClick={() => file.current?.click()}>Flash a firmware file (.bin)…</button>
          <input
            ref={file} type="file" accept=".bin" hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const v = /(\d+\.\d+\.\d+)/.exec(f.name)?.[1]
              await startFirmwareUpdate(null, new Uint8Array(await f.arrayBuffer()), v)
            }}
          />
        </div>
      </Presence>
    </div>
  )
}
