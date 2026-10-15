// The LED board's control screen. It fills the window and nothing on it scrolls:
//  - the header (back to the device list, the board's name, settings, power),
//  - the live LED preview, which takes whatever height is left (and shrinks first on short screens),
//  - brightness, always there,
//  - a deck with tabs: Colour (hue / saturation or kelvin, presets), Modes, Scenes (paged), and the
//    running sync (Music, Visualizer, Screen) when one runs.
// Wide windows put the preview on the left and the controls on the right.
//
// Right-click (a long press on a phone) does more: power -> sleep timer, a scene -> rename / update /
// delete. Keyboard: Space power · 1-9 scenes · [ ] brightness · M modes · , settings

import { useEffect, useRef, useState } from 'react'
import { platform } from '../../platform'
import { hexOf, hsvCss, kelvinScreenColor, KELVIN_MAX, KELVIN_MIN } from '../../lib/color'
import { settings } from '../../settings/store'
import { setAmbient } from '../../ui/ambient'
import {
  ActionsDialog, CircleIconButton, GradientBar, Hint, NameDialog, PillButton, SegmentedPill, SettingSwitch, SliderLabel,
} from '../../ui/components/Controls'
import { AddIcon, BackIcon, EditIcon, PowerIcon, SettingsIcon } from '../../ui/components/Icons'
import { Pager } from '../../ui/components/Pager'
import { FilterChip, Tabs } from '../../ui/md'
import { Presence, Swap, Txt } from '../../ui/motion'
import { sound } from '../../ui/sound'
import { toast } from '../../ui/toast'
import type { ControlScreenProps } from '../types'
import { displayName } from '../connection'
import { LedPreview, LedPreviewPair } from './LedPreview'
import { KELVIN_PRESETS, LED_CHASE, LED_EFFECTS, LED_PRESETS, MODE, modeLabel } from './modes'
import { previewOf } from './preview'
import { sceneSwatch, type Scene } from './scenes'
import { useLed } from './useLed'
import { checkFirmware, useOta } from './ota'

/** Modes whose preview moves, so the clock only ticks when something animates. */
const ANIMATED = [MODE.RAINBOW, MODE.CANDLE, MODE.BREATHE, MODE.OCEAN, MODE.PARTY, MODE.AURORA, MODE.CHASE]

type Tab = 'colour' | 'modes' | 'scenes' | 'sync'
type Dialog = { kind: 'sleep' } | { kind: 'addScene' } | { kind: 'sceneMenu'; scene: Scene } | { kind: 'renameScene'; scene: Scene } | null

export function ControlScreen(props: ControlScreenProps) {
  const c = useLed()
  const { s, prefs, caps } = c
  const [tab, setTab] = useState<Tab>('colour')
  const [dialog, setDialog] = useState<Dialog>(null)
  const ota = useOta()

  // New board firmware: looked for on connect (quietly); a dot on Settings says there is one.
  useEffect(() => { if (c.connected && c.fwVersion && !c.isDemo) void checkFirmware(c.fwVersion, true) }, [c.connected, c.fwVersion])

  // The preview clock (and the rainbow sliders): ~30 fps while something animates.
  const [t, setT] = useState(0)
  const animating = c.connected && c.ledOn && (ANIMATED.includes(s.mode as 1) || c.sync.active !== 'NONE')
  useEffect(() => {
    if (!animating) return
    let raf = 0, last = 0
    const loop = (now: number) => {
      if (now - last > 33) { last = now; setT(now / 1000) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animating])
  const preview = previewOf(c, t)
  const rainbowHue = ((t / 4) % 1) * 360

  // The background follows the light.
  useEffect(() => { setAmbient({ active: c.connected && c.ledOn, hue: preview.hue, sat: Math.min(1, Math.max(0, preview.sat)) }) })
  useEffect(() => () => setAmbient(null), [])

  // A sync that starts shows its tab; one that ends goes back to Modes.
  const isSync = s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER || s.mode === MODE.SCREEN
  useEffect(() => { if (isSync) setTab('sync'); else setTab((x) => (x === 'sync' ? 'modes' : x)) }, [isSync])

  // Desktop: keep running in the tray while a sync drives the LED.
  useEffect(() => { platform.keepRunning(c.connected && c.sync.active !== 'NONE') }, [c.connected, c.sync.active])

  const cycling = s.mode === MODE.RAINBOW && prefs.rainbowSync
  const shownHue = cycling ? rainbowHue : s.hue
  const eKelvinMode = c.editsLed2 ? s.kelvinMode2 : s.kelvinMode
  const eKelvin = c.editsLed2 ? s.kelvin2 : s.kelvin
  const eSat = c.editsLed2 ? s.sat2 : s.sat
  const eHue = !c.editsLed2 ? shownHue : cycling ? (rainbowHue + 180) % 360 : s.hue2
  const briTop = eKelvinMode ? kelvinScreenColor(eKelvin) : hsvCss(eHue, eSat)

  const label = (kel: boolean, k: number, h: number, sat: number) => kel ? `${Math.round(k / 50) * 50} K` : hexOf(h, sat)
  const modeName = !c.ledOn ? 'Off'
    : s.mode === MODE.SOLID ? label(s.kelvinMode, s.kelvin, shownHue, s.sat) + (c.twoLeds ? '  ·  ' + label(s.kelvinMode2, s.kelvin2, s.hue2, s.sat2) : '')
      : s.mode === MODE.SCREEN ? 'Screen sync' : modeLabel(s.mode)

  const modeGroups: [string, [number, string, boolean][]][] = [
    ['Light', [[MODE.SOLID, 'Solid', true], [MODE.RAINBOW, 'Rainbow', true], [MODE.CANDLE, 'Candle', caps.candle]]],
    ['Board effects', [...LED_EFFECTS.map(([m, l]) => [m, l, caps.effects] as [number, string, boolean]), [LED_CHASE[0], LED_CHASE[1], caps.split]]],
    ['Reactive', [
      [MODE.MUSIC, 'Music', platform.capture.microphone],
      [MODE.VISUALIZER, 'Visualizer', platform.capture.systemAudio],
      [MODE.SCREEN, 'Screen', platform.capture.screen],
    ]],
  ]

  // Keyboard shortcuts (not while typing).
  const live = useRef({ c, props })
  live.current = { c, props }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest?.('input, textarea, [role=slider], .scrim') || e.ctrlKey || e.altKey || e.metaKey) return
      const cc = live.current.c
      if (e.key === ' ') { e.preventDefault(); sound.confirm(); cc.togglePower() }
      else if (/^[1-9]$/.test(e.key)) { const sc = cc.s.scenes[+e.key - 1]; if (sc) { sound.tap(); cc.applyScene(sc) } }
      else if (e.key === '[' || e.key === ']') {
        cc.setBrightness(Math.min(1, Math.max(0, cc.s.bri + (e.key === ']' ? 0.05 : -0.05))))
        cc.sendCurrent()
      } else if (e.key === 'm' || e.key === 'M') setTab('modes')
      else if (e.key === ',') live.current.props.onSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tabs: [Tab, string][] = [['colour', 'Colour'], ['modes', 'Modes'], ['scenes', 'Scenes']]
  if (isSync) tabs.push(['sync', s.mode === MODE.MUSIC ? 'Music' : s.mode === MODE.VISUALIZER ? 'Visualizer' : 'Screen'])
  const levelPct = Math.round((c.sync.active === 'NONE' ? 0 : c.sync.level) * 100)

  return (
    <div className="screen control">
      <header className="header entrance" style={{ ['--i' as string]: 0 }}>
        <CircleIconButton label="All devices" onClick={props.onBack}><BackIcon /></CircleIconButton>
        <div className="header-title">
          <h1>Glow</h1>
          <button className="board-pill" onClick={props.onRename} title="Rename">
            <span className="board-dot" />
            <span className="board-name"><Txt>{displayName(props.device)}</Txt></span>
            {c.fwVersion && <span className="board-ver">v{c.fwVersion}</span>}
            <EditIcon />
          </button>
        </div>
        <CircleIconButton label="Settings" title={ota.kind === 'available' ? `Settings (,) · board firmware v${ota.release.version} is available` : 'Settings (,)'} onClick={props.onSettings}>
          <SettingsIcon />
          <Presence show={ota.kind === 'available'} className="inline badge"><span className="update-dot" /></Presence>
        </CircleIconButton>
        <CircleIconButton
          label={c.ledOn ? 'Turn off' : 'Turn on'}
          title={(c.ledOn ? 'Turn off' : 'Turn on') + ' (Space) · right-click / long press: sleep timer'}
          active={c.ledOn}
          onClick={() => { sound.confirm(); c.togglePower() }}
          onContextMenu={() => { sound.longPress(); setDialog({ kind: 'sleep' }) }}
        >
          <PowerIcon />
        </CircleIconButton>
      </header>

      <div className="control-body">
        <div className="control-preview entrance" style={{ ['--i' as string]: 1 }}>
          <Swap k={c.twoLeds ? 'pair' : 'one'} className="fill">
            {c.twoLeds ? (
              <LedPreviewPair
                hue1={preview.hue} sat1={preview.sat} value1={preview.val}
                hue2={preview.hue2} sat2={preview.sat2} value2={preview.val2}
                editing={s.editLed}
                onTap={(i) => { sound.tap(); c.setEditLed(i) }}
              />
            ) : (
              <LedPreview hue={preview.hue} sat={preview.sat} value={preview.val} />
            )}
          </Swap>
          <div className="mode-name" key={modeName}>{modeName}</div>
          <button className="quiet-link small" onClick={() => { sound.tap(); props.onDisconnect() }}>Disconnect</button>
        </div>

        <div className="control-deck entrance" style={{ ['--i' as string]: 2 }}>
          <div className="panel brightness-panel">
            <SliderLabel text="Brightness" value={`${Math.round(s.bri * 100)} %`} />
            <GradientBar label="Brightness" fraction={s.bri} stops={['#000', briTop]} thumbColor={briTop}
              onFraction={c.setBrightness} onFinished={c.sendCurrent} />
          </div>

          <Tabs tabs={tabs.map(([, l]) => l)} active={tabs.findIndex(([k]) => k === tab)} onChange={(i) => { sound.tap(); setTab(tabs[i][0]) }} />

          <div className="panel deck-panel">
            <Swap k={tab} className="fill">
              {tab === 'colour' ? (
                <div className="deck">
                  <Presence show={c.twoLeds}>
                    <SegmentedPill options={['LED 1', 'LED 2', 'Both']} selected={s.editLed} onSelect={c.setEditLed} />
                  </Presence>
                  <SegmentedPill
                    options={['Color', 'Kelvin']}
                    selected={eKelvinMode ? 1 : 0}
                    onSelect={(i) => { c.editKelvinMode(i === 1); if (i === 1) { c.editKelvin(eKelvin); c.sendCurrent() } }}
                  />
                  <Swap k={eKelvinMode ? 'kelvin' : 'color'} className="stack">
                    {eKelvinMode ? (
                      <>
                        <SliderLabel text="Temperature" value={`${Math.round(eKelvin / 50) * 50} K`} />
                        <GradientBar
                          label="Temperature"
                          fraction={(eKelvin - KELVIN_MIN) / (KELVIN_MAX - KELVIN_MIN)}
                          stops={Array.from({ length: 9 }, (_, i) => kelvinScreenColor(KELVIN_MIN + (i / 8) * (KELVIN_MAX - KELVIN_MIN)))}
                          thumbColor={kelvinScreenColor(eKelvin)}
                          onFraction={(f) => { c.editKelvin(KELVIN_MIN + f * (KELVIN_MAX - KELVIN_MIN)); c.sendThrottled() }}
                          onFinished={c.sendCurrent}
                        />
                        <div className="presets">
                          {KELVIN_PRESETS.map((k) => (
                            <button key={k} className="preset" title={`${k} K`} style={{ background: kelvinScreenColor(k) }}
                              onClick={() => { sound.tap(); c.pickKelvinPreset(k) }} />
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <SliderLabel text="Hue" value={`${Math.round(eHue)}°`} />
                        <GradientBar
                          label="Hue"
                          fraction={eHue / 360}
                          stops={[0, 60, 120, 180, 240, 300, 360].map((h) => hsvCss(h, 1))}
                          thumbColor={hsvCss(eHue, 1)}
                          onFraction={(f) => { c.editHue(f * 360); c.sendThrottled() }}
                          onFinished={c.sendCurrent}
                        />
                        <SliderLabel text="Saturation" value={`${Math.round(eSat * 100)} %`} />
                        <GradientBar
                          label="Saturation"
                          fraction={eSat}
                          stops={[hsvCss(eHue, 0), hsvCss(eHue, 1)]}
                          thumbColor={hsvCss(eHue, eSat)}
                          onFraction={(f) => { c.editSat(f); c.sendThrottled() }}
                          onFinished={c.sendCurrent}
                        />
                        <div className="presets">
                          {LED_PRESETS.map((p) => (
                            <button key={p} className="preset" title={p} style={{ background: p }}
                              onClick={() => { sound.tap(); c.pickPreset(p) }} />
                          ))}
                        </div>
                      </>
                    )}
                  </Swap>
                </div>
              ) : tab === 'modes' ? (
                <div className="deck modes">
                  {modeGroups.map(([title, modes]) => (
                    <div key={title}>
                      <div className="menu-title">{title}</div>
                      <div className="menu-grid">
                        {modes.map(([m, l, enabled]) => (
                          <FilterChip
                            key={m}
                            label={l}
                            disabled={!enabled}
                            selected={m === s.mode}
                            className="menu-item"
                            onClick={() => { sound.tap(); void c.startMode(m) }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {!caps.effects && <Hint>Update the board firmware (Settings) for all modes.</Hint>}
                </div>
              ) : tab === 'scenes' ? (
                <div className="deck scenes">
                  <Pager
                    items={s.scenes}
                    itemWidth={128}
                    itemHeight={40}
                    gap={8}
                    render={(sc) => (
                      <FilterChip
                        key={sc.id}
                        className="chip scene"
                        label={sc.name}
                        selected={sc.id === c.selectedSceneId}
                        title={`${sc.name} · right-click / long press for options`}
                        icon={<span className="swatch" style={{ background: sceneSwatch(sc, prefs.candleHue) }} />}
                        onClick={() => { sound.tap(); c.applyScene(sc) }}
                        onContextMenu={(e) => { e.preventDefault(); sound.longPress(); setDialog({ kind: 'sceneMenu', scene: sc }) }}
                      />
                    )}
                    tail={
                      <md-assist-chip class={'chip add' + (c.canSaveScene ? '' : ' disabled')} label="Save" title="Save the current light as a scene"
                        onClick={() => {
                          if (c.canSaveScene) setDialog({ kind: 'addScene' })
                          else toast("Music, Visualizer and Screen sync can't be saved as scenes.")
                        }}>
                        <span slot="icon" className="chip-icon"><AddIcon /></span>
                      </md-assist-chip>
                    }
                  />
                </div>
              ) : (
                <div className="deck sync">
                  <div className="panel-head">
                    <span><Txt>{s.mode === MODE.MUSIC ? 'Music' : s.mode === MODE.VISUALIZER ? 'Visualizer' : 'Screen sync'}</Txt></span>
                    <span className="panel-state">
                      <Txt>
                        {c.sync.active === 'NONE' ? 'Starting…'
                          : s.mode === MODE.MUSIC ? 'Listening' : s.mode === MODE.VISUALIZER ? 'Listening to your PC' : 'Watching the screen'}
                      </Txt>
                    </span>
                  </div>
                  {s.mode !== MODE.SCREEN && (
                    <>
                      <div className="level-meter"><div style={{ width: `${levelPct}%` }} /></div>
                      <SliderLabel text="Sensitivity" />
                      <GradientBar label="Sensitivity" fraction={prefs.musicSensitivity} stops={['var(--on-bg-12)', 'var(--on-bg-55)']}
                        thumbColor="var(--primary)" onFraction={(f) => settings.set({ musicSensitivity: f })} onFinished={() => {}} />
                    </>
                  )}
                  {s.mode === MODE.MUSIC && (
                    <SegmentedPill options={['Beat colours', 'My colour']} selected={prefs.musicKeepColour ? 1 : 0}
                      onSelect={(i) => settings.set({ musicKeepColour: i === 1 })} />
                  )}
                  {s.mode !== MODE.SCREEN && (
                    <SettingSwitch title="Beat flash" subtitle="A quick burst of brightness on every beat"
                      checked={prefs.beatFlash} onChange={(v) => settings.set({ beatFlash: v })} />
                  )}
                  <PillButton text={`Stop ${s.mode === MODE.MUSIC ? 'music' : s.mode === MODE.VISUALIZER ? 'visualizer' : 'screen sync'}`}
                    onClick={() => void c.startMode(MODE.SOLID)} />
                </div>
              )}
            </Swap>
          </div>
        </div>
      </div>

      {dialog?.kind === 'sleep' && (
        <ActionsDialog
          title="Sleep timer"
          subtitle={s.sleepEndsAt ? `Running: off in about ${Math.floor((s.sleepEndsAt - Date.now()) / 60_000) + 1} min` : 'The light fades slowly to off'}
          actions={([
            ['15 minutes', () => { setDialog(null); c.startSleep(15) }],
            ['30 minutes', () => { setDialog(null); c.startSleep(30) }],
            ['1 hour', () => { setDialog(null); c.startSleep(60) }],
          ] as [string, () => void][]).concat(s.sleepEndsAt ? [['Stop the timer', () => { setDialog(null); c.startSleep(0) }]] : [])}
          onDismiss={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'addScene' && (
        <NameDialog
          title="Save scene"
          subtitle="Saves the mode, colour and brightness you have now."
          initial=""
          placeholder={c.sceneSuggestion}
          allowEmpty
          onDismiss={() => setDialog(null)}
          onSave={(n) => { c.addScene(n || c.sceneSuggestion); setDialog(null); sound.confirm() }}
        />
      )}
      {dialog?.kind === 'sceneMenu' && (
        <ActionsDialog
          title={dialog.scene.name}
          subtitle="Scene"
          actions={([
            ['Rename', () => setDialog({ kind: 'renameScene', scene: dialog.scene })],
          ] as [string, () => void][])
            .concat(c.canSaveScene ? [['Update to the current light', () => { c.updateSceneToCurrent(dialog.scene); setDialog(null); sound.confirm() }]] : [])
            .concat([['Delete', () => { c.deleteScene(dialog.scene); setDialog(null) }]])}
          onDismiss={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'renameScene' && (
        <NameDialog
          title="Rename scene"
          initial={dialog.scene.name}
          placeholder={dialog.scene.name}
          onDismiss={() => setDialog(null)}
          onSave={(n) => { c.renameScene(dialog.scene, n); setDialog(null) }}
        />
      )}
    </div>
  )
}
