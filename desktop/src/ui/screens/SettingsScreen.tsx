// Settings: Board LED, Auto light, App UI, Firmware & updates (collapsible cards, as on Android).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBle } from '../../ble/ble'
import { desktop, APP_VERSION, openLink } from '../../desktop'
import { atLeast } from '../../led/color'
import { loadScenes, sceneSwatch, type Scene } from '../../model/scenes'
import { DEFAULT_ACCENT, settings, useSettings, type Background, type ColorScheme } from '../../settings/store'
import { setAutoLight, useAutoStatus } from '../../auto/autoLight'
import { checkFirmware, otaBusy, startFirmwareUpdate, useOta, type OtaState } from '../../ota/ota'
import { RELEASES_PAGE } from '../../ota/github'
import { useAppUpdate, checkAppUpdate, installAppUpdate } from '../appUpdate'
import {
  CircleIconButton, GradientBar, Hint, PillButton, ProgressBar, SegmentedPill, SettingHeading, SettingSection, SettingSwitch,
} from '../components/Controls'
import { BackIcon } from '../components/Icons'
import { sound } from '../sound'
import { Presence, Swap, Txt } from '../motion'

const ACCENTS = ['#7e57c2', '#5c6bc0', '#42a5f5', '#26a69a', '#66bb6a', '#ffca28', '#ff7043', '#ec407a']

function SettingsCard(props: { id: string; title: string; badge?: boolean; children: ReactNode; i: number }) {
  const prefs = useSettings()
  const open = !prefs.collapsed[props.id]
  return (
    <section className="panel settings-card entrance" style={{ ['--i' as string]: props.i }}>
      <button
        className="card-head"
        aria-expanded={open}
        onClick={() => { sound.tap(); settings.set({ collapsed: { ...prefs.collapsed, [props.id]: open } }) }}
      >
        <span>{props.title}</span>
        {props.badge && <span className="update-dot" />}
        <BackIcon size={18} className={'card-arrow' + (open ? ' open' : '')} />
      </button>
      <Presence show={open}><div className="card-body">{props.children}</div></Presence>
    </section>
  )
}

export function SettingsScreen({ onBack, onWhatsNew }: { onBack: () => void; onWhatsNew: () => void }) {
  const p = useSettings()
  const conn = useBle()
  const ota = useOta()
  const app = useAppUpdate()
  const version = conn.firmwareVersion ?? (conn.deviceId ? p.boardVersions[conn.deviceId] ?? null : null)
  const twoLedBoard = atLeast(version, '1.6.0')
  const candleStyles = atLeast(version, '1.6.1')
  const set = settings.set

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !otaBusy(ota) && !document.querySelector('.scrim')) onBack() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onBack, ota])

  const backgrounds: Background[] = ['SIMPLE', 'AURORA', 'FLUID', 'IMAGE', 'PLAIN']
  const schemes: ColorScheme[] = ['MONOCHROME', 'TINTED', 'COLORED']

  return (
    <div className="screen settings">
      <header className="header entrance" style={{ ['--i' as string]: 0 }}>
        <CircleIconButton label="Back (Esc)" onClick={() => { if (!otaBusy(ota)) onBack() }}><BackIcon /></CircleIconButton>
        <div className="header-title"><h1>Settings</h1></div>
      </header>

      <div className="settings-grid">
        {/* what the LED does on the left, the app and updates on the right */}
        <div className="settings-col">
          <SettingsCard id="board" title="Board LED" i={1}>
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
          </SettingsCard>

          <SettingsCard id="auto" title="Auto light" i={2}>
            <AutoLightSettings />
          </SettingsCard>
        </div>
        <div className="settings-col">
          <SettingsCard id="ui" title="App UI" i={3}>
            <SettingSection title="Theme" />
            <SettingHeading title="Background" subtitle={{
              SIMPLE: 'Slow floating particles',
              AURORA: "Soft glows drifting in the LED's colour",
              FLUID: 'Liquid that follows your mouse movements and sloshes when you drag the window',
              IMAGE: 'A photo of a living room',
              PLAIN: 'Nothing behind the controls; lightest on the GPU',
            }[p.background]} />
            <SegmentedPill options={['Particles', 'Aurora', 'Fluid', 'Image', 'Plain']} selected={backgrounds.indexOf(p.background)} onSelect={(i) => set({ background: backgrounds[i] })} />
            <Presence show={p.background === 'IMAGE'}>
              <LevelSlider label="Darkness" value={p.imageDim / 0.95} text={`${Math.round(p.imageDim * 100)} %`} onChange={(f) => set({ imageDim: f * 0.95 })} />
            </Presence>
            <Presence show={p.background === 'FLUID'}>
              <LevelSlider label="Mouse force" value={p.fluidStir} text={p.fluidStir === 0 ? 'Off' : `${Math.round(p.fluidStir * 100)} %`} onChange={(f) => set({ fluidStir: f })}
                hint="The pointer pushes the fluid away. Hold Ctrl to pull it in instead." />
            </Presence>
            <Presence show={p.background === 'FLUID'}>
              <LevelSlider label="Motion blur" value={p.fluidMotionBlur} text={p.fluidMotionBlur === 0 ? 'Off' : `${Math.round(p.fluidMotionBlur * 100)} %`}
                onChange={(f) => set({ fluidMotionBlur: f })} hint="Fast fluid leaves a soft trail behind it." />
            </Presence>
            <Presence show={p.background === 'FLUID'}>
              <LevelSlider label="Viscosity" value={p.fluidViscosity} text={p.fluidViscosity < 0.2 ? 'Watery' : p.fluidViscosity > 0.8 ? 'Thick' : `${Math.round(p.fluidViscosity * 100)} %`}
                onChange={(f) => set({ fluidViscosity: f })} hint="Watery fluid sloshes and splashes; thick fluid flows slowly and holds together." />
            </Presence>
            <Presence show={p.background === 'FLUID'}>
              <div className="stack">
                <SettingHeading title="Mouse reach" subtitle={p.fluidNearMouse ? 'Only the fluid near the pointer is pushed or pulled' : 'All the fluid on screen is pushed or pulled'} />
                <SegmentedPill options={['Whole screen', 'Nearby fluid']} selected={p.fluidNearMouse ? 1 : 0} onSelect={(i) => set({ fluidNearMouse: i === 1 })} />
              </div>
            </Presence>
            <Presence show={p.background === 'SIMPLE' || p.background === 'FLUID'}>
              <SettingSwitch title="Dot net" subtitle="A net of dots the mouse pushes around; a push travels through the whole net" checked={p.dotNet} onChange={(v) => set({ dotNet: v })} />
            </Presence>
            <Presence show={p.dotNet && (p.background === 'SIMPLE' || p.background === 'FLUID')}>
              <div className="stack">
                <SettingHeading title="Net style" subtitle={p.dotNetStyle === 'CELLS' ? 'A grid of cells: waves travel across it, stirred by the mouse and the fluid' : 'Dots joined by lines, pushed around by the mouse'} />
                <SegmentedPill options={['Dots', 'Cells']} selected={p.dotNetStyle === 'CELLS' ? 1 : 0} onSelect={(i) => set({ dotNetStyle: i === 1 ? 'CELLS' : 'DOTS' })} />
              </div>
            </Presence>
            <Presence show={p.dotNet && (p.background === 'SIMPLE' || p.background === 'FLUID')}>
              <LevelSlider label="Net stiffness" value={p.dotNetStiffness} text={p.dotNetStiffness < 0.2 ? 'Loose' : p.dotNetStiffness > 0.8 ? 'Taut' : `${Math.round(p.dotNetStiffness * 100)} %`}
                onChange={(f) => set({ dotNetStiffness: f })} hint="Loose nets wobble and a push spreads slowly; taut ones snap back and carry it fast (for Cells: how fast waves travel)." />
            </Presence>
            <Presence show={p.dotNet && (p.background === 'SIMPLE' || p.background === 'FLUID')}>
              <LevelSlider label="Net opacity" value={p.dotNetOpacity} text={p.dotNetOpacity === 0 ? 'Hidden' : `${Math.round(p.dotNetOpacity * 100)} %`}
                onChange={(f) => set({ dotNetOpacity: f })} />
            </Presence>
            <SettingHeading title="Appearance" subtitle="Light or dark, or the same as Windows" />
            <SegmentedPill options={['System', 'Light', 'Dark']} selected={p.themeMode} onSelect={(i) => set({ themeMode: i })} />
            <SettingHeading title="Colour" subtitle="Pure grayscale, grayscale with accents, or fully coloured" />
            <SegmentedPill options={['Monochrome', 'Tinted', 'Coloured']} selected={schemes.indexOf(p.colorScheme)} onSelect={(i) => set({ colorScheme: schemes[i] })} />
            <Presence show={p.colorScheme === 'COLORED'}>
              <div className="accent-row">
                {ACCENTS.map((a) => (
                  <button key={a} className={'preset' + (a === p.accentColor ? ' selected' : '')} style={{ background: a }} title={a}
                    onClick={() => { sound.tap(); set({ accentColor: a }) }} />
                ))}
                <label className="preset custom" title="Custom colour" style={{ background: ACCENTS.includes(p.accentColor) ? undefined : p.accentColor }}>
                  <input type="color" value={p.accentColor || DEFAULT_ACCENT} onChange={(e) => set({ accentColor: e.target.value })} />+
                </label>
              </div>
            </Presence>
            <SettingHeading title="Font" subtitle="Used for all text in the app" />
            <SegmentedPill options={['System', 'JetBrains Mono']} selected={p.monoFont ? 1 : 0} onSelect={(i) => set({ monoFont: i === 1 })} />
            <SettingSwitch title="Pure black (OLED)" subtitle="Black background in dark mode" checked={p.pureBlack} onChange={(v) => set({ pureBlack: v })} />
            <SettingSection title="Shape & surface" />
            <SettingHeading title="Corners" subtitle="Roundness of everything: cards, buttons, pills, dots, thumbs" />
            <SegmentedPill options={['Square', 'Small', 'Medium', 'Large', 'Custom']} selected={p.cornerStyle} onSelect={(i) => set({ cornerStyle: i })} />
            <Presence show={p.cornerStyle === 4}>
              <LevelSlider label="Radius" value={p.customCorner / 2} text={`${Math.round(p.customCorner * 100)} %`} onChange={(f) => set({ customCorner: f * 2 })}
                hint="0 % is square, 100 % makes round things fully round, above that cards get rounder." />
            </Presence>
            <SettingSwitch title="Round LED preview" subtitle="Keep the LED preview a perfect circle whatever the corners" checked={p.roundLedPreview} onChange={(v) => set({ roundLedPreview: v })} />
            <SettingSwitch title="Refractive glass" subtitle="Everything is glass: clear pieces that bend the background at their edges instead of blurring it" checked={p.refractiveGlass} onChange={(v) => set({ refractiveGlass: v })} />
            <SettingSection title="Behaviour" />
            <SettingSwitch title="Rainbow preview" subtitle="Animate the colour sliders while Rainbow runs" checked={p.rainbowSync} onChange={(v) => set({ rainbowSync: v })} />
            <SettingSwitch title="Sounds" subtitle="Soft clicks on sliders and buttons (the phone app's haptics)" checked={p.sounds} onChange={(v) => set({ sounds: v })} />
            <Presence show={p.sounds}>
              <LevelSlider label="Volume" value={p.soundVolume} text={`${Math.round(p.soundVolume * 100)} %`}
                onChange={(f) => set({ soundVolume: Math.max(0.05, f) })} onDone={() => sound.confirm()} />
            </Presence>
            <SettingSwitch title="Keep screen on" subtitle="The display doesn't sleep while Glow runs" checked={p.keepScreenOn} onChange={(v) => set({ keepScreenOn: v })} />
            <SettingSwitch title="Update prompts" subtitle="Ask at launch when an update is available" checked={p.updatePrompts} onChange={(v) => set({ updatePrompts: v })} />
            {desktop && <CaptureDisplay />}
          </SettingsCard>

          <SettingsCard id="firmware" title="Firmware & updates" i={4} badge={ota.kind === 'available' || app.kind === 'available'}>
            <SettingSection title="Board" />
            <FirmwareBlock state={ota} version={version} connected={conn.state === 'connected'} />
            <SettingSection title="App" />
            <div className="update-block">
              <div className="update-title">Glow for Windows v{APP_VERSION}<Presence show={app.kind === 'available'} className="inline"><span className="update-dot" /></Presence></div>
              <div className={'update-status' + (app.kind === 'error' ? ' error' : '')}>
                <Txt>
                  {app.kind === 'idle' ? 'New versions are published as GitHub releases.'
                    : app.kind === 'checking' ? 'Checking GitHub…'
                      : app.kind === 'upToDate' ? `Up to date (latest release is v${app.latest}).`
                        : app.kind === 'available' ? `Version ${app.release.version} is available.`
                          : app.kind === 'downloading' ? `Downloading v${app.version}…${app.fraction != null ? ` ${Math.floor(app.fraction * 100)} %` : ''}`
                            : app.kind === 'restarting' ? `Installing v${app.version}. Glow restarts by itself…` : app.message}
                </Txt>
              </div>
              <Swap k={app.kind === 'available' || (app.kind === 'error' && app.release) ? 'update'
                : app.kind === 'checking' || app.kind === 'downloading' || app.kind === 'restarting' ? 'progress' : 'check'}>
                {app.kind === 'available'
                  ? <PillButton text={`Update to v${app.release.version}`} highlighted onClick={() => void installAppUpdate(app.release)} />
                  : app.kind === 'error' && app.release
                    ? <PillButton text="Try again" highlighted onClick={() => void installAppUpdate(app.release!)} />
                    : app.kind === 'checking' ? <ProgressBar fraction={null} />
                      : app.kind === 'downloading' ? <ProgressBar fraction={app.fraction} />
                        : app.kind === 'restarting' ? <ProgressBar fraction={1} />
                          : <PillButton text="Check for updates" onClick={() => void checkAppUpdate()} />}
              </Swap>
            </div>
            <div className="button-row">
              <PillButton text="What's new" onClick={onWhatsNew} />
              <PillButton text="All releases" onClick={() => openLink(RELEASES_PAGE)} />
            </div>
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}

function LevelSlider(props: { label: string; value: number; text: string; onChange: (f: number) => void; onDone?: () => void; hint?: string }) {
  return (
    <div className="level-slider">
      <div className="slider-label"><span>{props.label}</span><span className="slider-value">{props.text}</span></div>
      <GradientBar label={props.label} fraction={props.value} stops={['var(--on-bg-12)', 'var(--on-bg-55)']} thumbColor="var(--primary)"
        onFraction={props.onChange} onFinished={props.onDone ?? (() => {})} />
      {props.hint && <Hint>{props.hint}</Hint>}
    </div>
  )
}

/** Which screen Screen sync and the Visualizer capture (multi-monitor PCs). */
function CaptureDisplay() {
  const p = useSettings()
  const [displays, setDisplays] = useState<{ index: number; label: string }[]>([])
  useEffect(() => { void desktop!.capture.displays().then(setDisplays) }, [])
  useEffect(() => { desktop!.capture.setDisplay(p.captureDisplay) }, [p.captureDisplay])
  if (displays.length < 2) return null
  return (
    <>
      <SettingHeading title="Screen sync display" subtitle="Which monitor Screen sync watches" />
      <SegmentedPill options={displays.map((d) => `Display ${d.index + 1}`)} selected={Math.min(p.captureDisplay, displays.length - 1)}
        onSelect={(i) => settings.set({ captureDisplay: i })} />
    </>
  )
}

function ScenePicker({ selected, onPick }: { selected: number; onPick: (s: Scene) => void }) {
  const p = useSettings()
  const scenes = loadScenes()
  if (scenes.length === 0) return <Hint>Save a scene on the board screen first.</Hint>
  return (
    <div className="scene-row wrap">
      {scenes.map((s) => (
        <button key={s.id} className={'chip' + (s.id === selected ? ' selected' : '')} onClick={() => { sound.tap(); onPick(s) }}>
          <span className="swatch" style={{ background: sceneSwatch(s, p.candleHue) }} />
          <span className="chip-text">{s.name}</span>
        </button>
      ))}
    </div>
  )
}

function AutoLightSettings() {
  const p = useSettings()
  const auto = useAutoStatus()
  const set = settings.set
  return (
    <>
      <SettingSection title="Mode" />
      <SettingSwitch
        title="Auto light"
        subtitle={p.autoRoomLight ? 'Follows how bright the room is, seen through the webcam'
          : 'Reading light while you use the PC, night light once it is locked or left alone'}
        checked={p.autoLight}
        onChange={setAutoLight}
      />
      <SettingHeading title="Follows" subtitle="Windows lock & idle time, or the room's light (webcam)" />
      <SegmentedPill options={['Lock & idle', 'Room light']} selected={p.autoRoomLight ? 1 : 0} onSelect={(i) => set({ autoRoomLight: i === 1 })} />
      <SettingSection title="Scenes" />
      <Swap k={p.autoRoomLight ? 'room' : 'lock'} className="stack">
      {p.autoRoomLight ? (
        <>
          <SettingHeading title="Dark room" subtitle="Lights off or dim" />
          <ScenePicker selected={p.autoDarkScene} onPick={(s) => set({ autoDarkScene: s.id })} />
          <SettingHeading title="Bright room" subtitle="Lights on or daylight" />
          <ScenePicker selected={p.autoBrightScene} onPick={(s) => set({ autoBrightScene: s.id })} />
          <SettingSection title="Camera" />
          <LevelSlider label="Dark below" value={(p.autoDarkLevel - 1) / 59} text={`${Math.round(p.autoDarkLevel)} %`}
            onChange={(f) => set({ autoDarkLevel: 1 + f * 59 })} />
          <Hint>
            Light now: {auto.level != null ? `${Math.round(auto.level)} %` : 'turn Auto light on (with a board connected) to see it'}.
            Set the dark level a bit above what the camera reads with the lights off.
          </Hint>
          <Hint>
            The webcam takes one tiny, fixed-exposure look a second (its light stays on while this runs); nothing is
            recorded or sent anywhere. Bright starts at twice the dark level; switches after 3 s of steady light.
            Pauses while Music, Visualizer or Screen sync runs.
          </Hint>
        </>
      ) : (
        <>
          <SettingHeading title="At the PC" subtitle="Unlocked and keyboard or mouse used within the last minute" />
          <ScenePicker selected={p.autoHandScene} onPick={(s) => set({ autoHandScene: s.id })} />
          <SettingHeading title="Away & locked" subtitle="Windows locked, or no input, for the wait below" />
          <ScenePicker selected={p.autoNightScene} onPick={(s) => set({ autoNightScene: s.id })} />
          <SettingSwitch title="No wait" subtitle="Night light the moment Windows locks or you've been idle a minute" checked={p.autoNightNoWait} onChange={(v) => set({ autoNightNoWait: v })} />
          <SettingSection title="Timing" />
          <SettingHeading title="Wait before Night" subtitle="How long the PC stays locked or untouched first" />
          <SegmentedPill options={['1 min', '2 min', '5 min']} selected={[1, 2, 5].indexOf(p.autoWaitMinutes)} disabled={p.autoNightNoWait}
            onSelect={(i) => set({ autoWaitMinutes: [1, 2, 5][i] })} />
          <Hint>
            Pauses while Music, Visualizer or Screen sync runs. Turning it off brings back the light you had before it
            first changed anything. Closing the window keeps it running in the tray.
          </Hint>
        </>
      )}
      </Swap>
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
    desktop?.power.keepAwake(true)
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => { desktop?.power.keepAwake(settings.get().keepScreenOn); window.removeEventListener('beforeunload', warn) }
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
