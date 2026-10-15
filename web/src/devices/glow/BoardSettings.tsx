// The LED board's section of Settings: how the LEDs behave, the board's firmware, and (on a PC with
// several monitors) which screen Screen sync watches.

import { useEffect, useRef, useState } from 'react'
import { platform } from '../../platform'
import { atLeast } from '../../lib/color'
import { settings, useSettings } from '../../settings/store'
import { Hint, PillButton, ProgressBar, SegmentedPill, SettingHeading, SettingSection, SettingSwitch } from '../../ui/components/Controls'
import { SettingsCard } from '../../ui/components/SettingsCard'
import { Presence, Swap, Txt } from '../../ui/motion'
import { useBoard } from './board'
import { checkFirmware, otaBusy, startFirmwareUpdate, useOta, type OtaState } from './ota'

export function BoardSettings() {
  const p = useSettings()
  const conn = useBoard()
  const ota = useOta()
  const version = conn.firmwareVersion ?? (conn.deviceId ? p.boardVersions[conn.deviceId] ?? null : null)
  const twoLedBoard = atLeast(version, '1.6.0')
  const candleStyles = atLeast(version, '1.6.1')
  const set = settings.set

  return (
    <>
      <SettingsCard id="board" title="LED board" i={1}>
        <SettingSection title="Layout" />
        <SettingHeading title="LEDs" subtitle={p.separateLeds && twoLedBoard ? 'Each LED has its own colour; effects run in two-LED versions' : 'Both LEDs show the same light'} />
        <Swap k={twoLedBoard ? 'pill' : 'hint'}>
          {twoLedBoard
            ? <SegmentedPill options={['Linked', 'Separate']} selected={p.separateLeds ? 1 : 0} onSelect={(i) => set({ separateLeds: i === 1 })} />
            : <Hint>Needs board firmware 1.6.0</Hint>}
        </Swap>
        <SettingSection title="Candle" />
        <SettingSwitch title="Smooth candle" subtitle="Slow, gentle flicker (easier on the eyes at night)" checked={p.smoothCandle} onChange={(v) => set({ smoothCandle: v })} />
        <SettingHeading title="Candle colour" subtitle="Tint of the candle flame" />
        <SegmentedPill options={['Ember', 'Warm', 'Amber']} selected={[10, 19, 30].indexOf(p.candleHue)} onSelect={(i) => set({ candleHue: [10, 19, 30][i] })} />
        <SettingHeading title="Candle style" subtitle={p.twoCandles ? 'With Separate LEDs: each LED is a candle of its own' : 'With Separate LEDs: one flame, LED1 the bright core, LED2 the flickering tip'} />
        <Swap k={!candleStyles ? 'fw' : !p.separateLeds ? 'sep' : 'pill'}>
          {!candleStyles ? <Hint>Needs board firmware 1.6.1</Hint>
            : !p.separateLeds ? <Hint>Set LEDs to Separate to choose</Hint>
              : <SegmentedPill options={['One flame', 'Two candles']} selected={p.twoCandles ? 1 : 0} onSelect={(i) => set({ twoCandles: i === 1 })} />}
        </Swap>
        <SettingSection title="Effects" />
        <SettingHeading title="Rainbow speed" subtitle="One trip round the colour wheel: 30, 15 or 6 s" />
        <SegmentedPill options={['Slow', 'Normal', 'Fast']} selected={[30, 15, 6].indexOf(p.rainbowSeconds)} onSelect={(i) => set({ rainbowSeconds: [30, 15, 6][i] })} />
        <SettingHeading title="Colour fade" subtitle="Time to reach a new colour: 0.5, 1.5 or 3 s" />
        <SegmentedPill options={['Quick', 'Normal', 'Slow']} selected={[500, 1500, 3000].indexOf(p.fadeMs)} onSelect={(i) => set({ fadeMs: [500, 1500, 3000][i] })} />
        <Hint>Candle options, rainbow speed and fade need board firmware 1.3.0 or newer.</Hint>
        <SettingSection title="Controls" />
        <SettingSwitch title="Rainbow preview" subtitle="Animate the colour sliders while Rainbow runs" checked={p.rainbowSync} onChange={(v) => set({ rainbowSync: v })} />
        <SettingSwitch title="Round LED preview" subtitle="Keep the LED preview a perfect circle whatever the corners" checked={p.roundLedPreview} onChange={(v) => set({ roundLedPreview: v })} />
        {platform.capture.displays && <CaptureDisplay />}
      </SettingsCard>

      <SettingsCard id="firmware" title="Board firmware" i={2} badge={ota.kind === 'available'}>
        <FirmwareBlock state={ota} version={version} connected={conn.state === 'connected'} />
      </SettingsCard>
    </>
  )
}

/** Which screen Screen sync and the Visualizer capture (multi-monitor PCs). */
function CaptureDisplay() {
  const p = useSettings()
  const [displays, setDisplays] = useState<{ index: number; label: string }[]>([])
  useEffect(() => { void platform.capture.displays?.().then(setDisplays) }, [])
  useEffect(() => { platform.capture.setDisplay?.(p.captureDisplay) }, [p.captureDisplay])
  if (displays.length < 2) return null
  return (
    <>
      <SettingHeading title="Screen sync display" subtitle="Which monitor Screen sync watches" />
      <SegmentedPill options={displays.map((d) => `Display ${d.index + 1}`)} selected={Math.min(p.captureDisplay, displays.length - 1)}
        onSelect={(i) => settings.set({ captureDisplay: i })} />
    </>
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
          <PillButton text="Check for updates" enabled={connected} onClick={() => void checkFirmware(version)} />
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
