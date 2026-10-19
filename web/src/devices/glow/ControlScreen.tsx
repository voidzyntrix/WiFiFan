// The LED board's control screen. It fills the window and nothing on it scrolls:
//  - the header (back to the device list, the board's name, settings, power),
//  - the live LED preview, which takes whatever height is left and clips inside its own box,
//  - brightness, always there,
//  - a deck: brightness, the content panel (Colour, Modes, Scenes (paged), or Tune: the options of
//    the mode that runs), and a bottom switcher between them.
// Wide windows put the preview on the left and the controls, centred, on the right.
//
// The preview's clock lives in the preview (and the rainbow sliders'), so an animating LED redraws
// those two, not the whole screen.
//
// Right-click (a long press on a phone) does more: power -> sleep timer, a scene -> rename / update /
// delete. Keyboard: Space power · 1-9 scenes · [ ] brightness · C colour · M modes · S scenes · T tune · , settings

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { platform } from '../../platform'
import { hexOf, hsvCss, kelvinScreenColor, KELVIN_MAX, KELVIN_MIN } from '../../lib/color'
import { setAmbient } from '../../ui/ambient'
import {
  ActionsDialog, Chip, CircleIconButton, DeckNav, GradientBar, LevelBar, NameDialog, SegmentedPill, SliderLabel,
} from '../../ui/components/Controls'
import { AddIcon, BackIcon, EditIcon, ModesIcon, PaletteIcon, PowerIcon, ScenesIcon, SettingsIcon, TuneIcon } from '../../ui/components/Icons'
import { Pager } from '../../ui/components/Pager'
import { Presence, Swap, Txt } from '../../ui/motion'
import { sound } from '../../ui/sound'
import { toast } from '../../ui/toast'
import type { ControlScreenProps } from '../types'
import { displayName } from '../connection'
import { useBoard } from './board'
import { FirmwareDialog } from './Firmware'
import { LedPreview, LedPreviewPair } from './LedPreview'
import { KELVIN_PRESETS, LED_EFFECTS, LED_PRESETS, MODE, modeLabel } from './modes'
import { simulatedPreview } from './simulate'
import { sceneSwatch, type Scene } from './scenes'
import { hasTune, TuneTab, tuneLabel } from './Tune'
import { checkFirmware, firmwareVersionOf, useOta } from './ota'
import { type LedController, useLed } from './useLed'

const ANIMATED = [MODE.RAINBOW, MODE.CANDLE, MODE.BREATHE]

type Tab = 'colour' | 'modes' | 'scenes' | 'tune'
type Dialog =
  | { kind: 'sleep' } | { kind: 'addScene' } | { kind: 'sceneMenu'; scene: Scene } | { kind: 'renameScene'; scene: Scene }
  | { kind: 'firmware' } | null

/** A ~30 fps clock in seconds while `on` (the LED preview and rainbow sliders animate with it). */
function useClock(on: boolean) {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!on) return
    let raf = 0, last = 0
    const loop = (now: number) => {
      if (now - last > 33) { last = now; setT(now / 1000) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [on])
  return t
}

export function ControlScreen(props: ControlScreenProps) {
  const c = useLed()
  const { s, prefs } = c
  const [tab, setTab] = useState<Tab>('colour')
  const [dialog, setDialog] = useState<Dialog>(null)
  const ota = useOta()

  // New board firmware: looked for on connect (quietly); a dot on Firmware says there is one.
  // Said once per version: a board running older firmware may not do everything (colours, for one).
  const told = useRef('')
  useEffect(() => {
    if (ota.kind !== 'available' || told.current === ota.release.version) return
    told.current = ota.release.version
    toast(`Board firmware v${ota.release.version} is available. Open Firmware under the LED to update.`)
  }, [ota])

  const fw = firmwareVersionOf(useBoard())
  useEffect(() => {
    if (!c.connected || !fw || c.isDemo) return
    void checkFirmware(fw, true)
    const timer = window.setInterval(() => void checkFirmware(fw, true), 5000)   // every few seconds, quietly
    return () => window.clearInterval(timer)
  }, [c.connected, fw])

  // A sync that starts shows its tab; a mode without options takes the tune tab away.
  const isSync = s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER || s.mode === MODE.SCREEN
  const tunable = hasTune(s.mode)
  useEffect(() => { if (isSync || s.mode === MODE.SOLAR) setTab('tune') }, [isSync, s.mode === MODE.SOLAR])
  useEffect(() => { if (!tunable) setTab((x) => (x === 'tune' ? 'modes' : x)) }, [tunable])

  // Desktop: keep running in the tray while a sync drives the LED.
  useEffect(() => { platform.keepRunning(c.connected && c.sync.active !== 'NONE') }, [c.connected, c.sync.active])

  const isWifiBoard = useBoard().kind === 'wifi'
  const modeGroups: [string, [number, string, boolean][]][] = [
    ['Light', [[MODE.SOLID, 'Solid', true], [MODE.SOLAR, 'Solar', isWifiBoard], [MODE.RAINBOW, 'Rainbow', true], [MODE.CANDLE, 'Candle', c.caps.candle]]],
    ['Board effects', LED_EFFECTS.map(([m, l]) => [m, l, c.caps.effects] as [number, string, boolean])],
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
      if (el.closest?.('input, textarea, [role=slider], .scrim, mdui-dialog, mdui-text-field') || e.ctrlKey || e.altKey || e.metaKey) return
      const cc = live.current.c
      if (e.key === ' ') { e.preventDefault(); sound.confirm(); cc.togglePower() }
      else if (/^[1-9]$/.test(e.key)) { const sc = cc.s.scenes[+e.key - 1]; if (sc) { sound.tap(); cc.applyScene(sc) } }
      else if (e.key === '[' || e.key === ']') {
        cc.setBrightness(Math.min(1, Math.max(0, cc.s.bri + (e.key === ']' ? 0.05 : -0.05))))
        cc.sendCurrent()
      } else if (e.key === 'm' || e.key === 'M') setTab('modes')
      else if (e.key === 'c' || e.key === 'C') setTab('colour')
      else if (e.key === 's' || e.key === 'S') setTab('scenes')
      else if (e.key === 't' || e.key === 'T') { if (hasTune(cc.s.mode)) setTab('tune') }
      else if (e.key === ',') live.current.props.onSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tabs: [Tab, string, ReactNode][] = [
    ['colour', 'Colour', <PaletteIcon />],
    ['modes', 'Modes', <ModesIcon />],
    ['scenes', 'Scenes', <ScenesIcon />],
  ]
  if (tunable) tabs.push(['tune', tuneLabel(s.mode), <TuneIcon />])
  /* tab switches slide the deck like the screens do: forward when the deck order moves right, back
     when it moves left (a vanished tune tab or an untunable mode always slides back) */
  const tabIdx = tabs.findIndex(([k]) => k === tab)
  const prevIdx = useRef(tabIdx)
  const tabDir = tabIdx < 0 ? -1 : Math.sign(tabIdx - prevIdx.current)
  if (tabIdx >= 0) prevIdx.current = tabIdx
  const briTop = c.s.kelvinMode ? kelvinScreenColor(s.kelvin) : hsvCss(s.hue, s.sat)

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
        <CircleIconButton label="Settings" title="Settings (,)" onClick={props.onSettings}><SettingsIcon /></CircleIconButton>
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
        <Preview
          c={c}
          firmwareDot={ota.kind === 'available'}
          onDisconnect={props.onDisconnect}
          onFirmware={() => setDialog({ kind: 'firmware' })}
          onReset={props.onReset}
        />

        <div className="control-deck entrance" style={{ ['--i' as string]: 2 }}>
          <div className="panel brightness-panel">
            <SliderLabel text="Brightness" value={`${Math.round(s.bri * 100)} %`} />
            <LevelBar label="Brightness" fraction={s.bri} stops={['#000', briTop]} thumbColor={briTop}
              onFraction={c.setBrightness} onFinished={c.sendCurrent} />
          </div>

          <div className="panel deck-panel">
            <Swap k={tab === 'tune' ? 'tune' + s.mode : tab} className="fill" dir={tabDir}>
              {tab === 'colour' ? (
                <ColourTab c={c} />
              ) : tab === 'modes' ? (
                <div className="deck modes">
                  {modeGroups.map(([title, modes]) => (
                    <div key={title} className="mode-group" style={{ ['--rows' as string]: Math.ceil(modes.length / 3) }}>
                      <div className="menu-title">{title}</div>
                      <div className="menu-grid">
                        {modes.map(([m, l, enabled]) => (
                          <Chip
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
                </div>
              ) : tab === 'scenes' ? (
                <div className="deck scenes">
                  <Pager
                    items={s.scenes}
                    itemWidth={128}
                    itemHeight={44}
                    gap={8}
                    render={(sc) => (
                      <Chip
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
                      <Chip
                        assist
                        className={'chip add' + (c.canSaveScene ? '' : ' disabled')}
                        label="Save"
                        title="Save the current light as a scene"
                        icon={<AddIcon />}
                        onClick={() => {
                          if (c.canSaveScene) setDialog({ kind: 'addScene' })
                          else toast("Music, Visualizer and Screen sync can't be saved as scenes.")
                        }}
                      />
                    }
                  />
                </div>
              ) : (
                <TuneTab c={c} />
              )}
            </Swap>
          </div>

          <DeckNav
            items={tabs.map(([, l, icon]) => ({ icon, label: l }))}
            active={tabs.findIndex(([k]) => k === tab)}
            onChange={(i) => setTab(tabs[i][0])}
          />
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
      {dialog?.kind === 'firmware' && <FirmwareDialog onDismiss={() => setDialog(null)} />}
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

/** The LED preview, its name, and the background colour that follows it: this is what animates. */
function Preview({ c, firmwareDot, onDisconnect, onFirmware, onReset }: {
  c: LedController; firmwareDot: boolean; onDisconnect: () => void; onFirmware?: () => void; onReset?: () => void
}) {
  const { s } = c
  const t = useClock(c.connected && c.ledOn && (ANIMATED.includes(s.mode as 1) || c.sync.active !== 'NONE'))
  const preview = simulatedPreview(c, t)

  // The background follows the light.
  useEffect(() => { setAmbient({ active: c.connected && c.ledOn, hue: preview.hue, sat: Math.min(1, Math.max(0, preview.sat)) }) })
  useEffect(() => () => setAmbient(null), [])

  const label = (kel: boolean, k: number, h: number, sat: number) => kel ? `${Math.round(k / 50) * 50} K` : hexOf(h, sat)
  const modeName = !c.ledOn ? 'Off'
    : s.mode === MODE.SOLID ? label(s.kelvinMode, s.kelvin, s.hue, s.sat) + (c.twoLeds ? '  ·  ' + label(s.kelvinMode2, s.kelvin2, s.hue2, s.sat2) : '')
      : s.mode === MODE.SCREEN ? 'Screen sync' : modeLabel(s.mode)

  return (
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
      <div className="mode-name">{modeName}</div>
      <div className="preview-links">
        <button className="quiet-link small" onClick={() => { sound.tap(); onDisconnect() }}>Disconnect</button>
        {!c.isDemo && onReset && (
          <button className="quiet-link small" onClick={() => { sound.tap(); onReset() }}>Reset device</button>
        )}
        {!c.isDemo && onFirmware && (
          <button className="quiet-link small" onClick={() => { sound.tap(); onFirmware() }}>
            Firmware
            <Presence show={firmwareDot} className="inline badge"><span className="update-dot" /></Presence>
          </button>
        )}
      </div>
    </div>
  )
}

/** Colour: which LED, colour or kelvin, the sliders and presets. Animates with the rainbow here. */
function ColourTab({ c }: { c: LedController }) {
  const { s, prefs } = c
  const cycling = s.mode === MODE.RAINBOW && prefs.rainbowSync
  const t = useClock(cycling && c.connected && c.ledOn)
  const rainbowHue = ((t / 4) % 1) * 360
  const shownHue = cycling ? rainbowHue : s.hue
  const eKelvinMode = c.editsLed2 ? s.kelvinMode2 : s.kelvinMode
  const eKelvin = c.editsLed2 ? s.kelvin2 : s.kelvin
  const eSat = c.editsLed2 ? s.sat2 : s.sat
  const eHue = !c.editsLed2 ? shownHue : cycling ? (rainbowHue + 180) % 360 : s.hue2
  const ledChoice = !s.separate || !c.caps.split ? 0 : 1 + Math.min(1, s.editLed)

  return (
    <div className="deck colour">
      {c.caps.split && (
        <SegmentedPill
          options={['Linked', 'LED 1', 'LED 2']}
          selected={ledChoice}
          onSelect={(i) => c.setLedLayout(i > 0, i > 0 ? i - 1 : 0)}
        />
      )}
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
  )
}
