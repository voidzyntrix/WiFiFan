// The board screen: header, live LED preview, scenes, mode + brightness, sync panels and the
// colour card (the Android app's BleControlScreen when connected). Wide windows get two columns.
//
// Desktop extras: right-click does what a long press did; keyboard shortcuts:
//   Space power · 1-9 scenes · [ / ] brightness · M mode menu · , settings

import { useEffect, useRef, useState } from 'react'
import { Presence, Swap, Txt, useExit, useFlip, useLeavingList } from '../motion'
import { hexOf, hsvCss, kelvinScreenColor, KELVIN_MAX, KELVIN_MIN } from '../../led/color'
import { LedPreview, LedPreviewPair } from '../../led/LedPreview'
import { KELVIN_PRESETS, LED_EFFECTS, LED_CHASE, LED_PRESETS, MODE, modeLabel } from '../../model/modes'
import { sceneSwatch, type Scene } from '../../model/scenes'
import { settings } from '../../settings/store'
import { setAutoLight, statusText, useAutoStatus } from '../../auto/autoLight'
import { CircleIconButton, GradientBar, Hint, PanelCard, PillButton, SegmentedPill, SettingSwitch, SliderLabel } from '../components/Controls'
import { AddIcon, BackIcon, EditIcon, PowerIcon, SettingsIcon } from '../components/Icons'
import { sound } from '../sound'
import type { LedController } from './useLed'

export interface Preview { hue: number; sat: number; val: number; hue2: number; sat2: number; val2: number }

/** What the preview shows: the board's mode, approximated (4 s animation loop). */
export function previewOf(c: LedController, t: number): Preview {
  const { s, prefs, sync, twoLeds } = c
  const live = sync.active !== 'NONE'
  const liveHue = live ? sync.hue : s.hue, liveSat = live ? sync.sat : s.sat
  const liveLevel = live ? sync.level : 0, liveLevel2 = live ? sync.level2 : 0
  const rainbowHue = (t / 4) % 1 * 360
  const phase = (rainbowHue / 360) * 6.2832
  const flame = s.mode === MODE.CANDLE && twoLeds && c.caps.candleStyle && !prefs.twoCandles
  const flameHue = s.candleHue ?? prefs.candleHue
  const sway = 0.2 * Math.sin(phase) + 0.05 * Math.sin(phase * 3 + 0.7)
  const core = (0.88 + 0.06 * Math.sin(phase * 2)) * (1 + 0.6 * sway)
  const tip = 0.7 * (0.86 + 0.06 * Math.sin(phase * 2 - 0.4) + 0.05 * Math.sin(phase * 9)) * (1 - 0.6 * sway)
  const clampV = (v: number, lo: number) => Math.min(1, Math.max(lo, v))
  const b = s.bri
  const sync3 = s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER || s.mode === MODE.SCREEN
  const hue = s.mode === MODE.RAINBOW || s.mode === MODE.PARTY ? rainbowHue
    : s.mode === MODE.CANDLE ? (flame ? flameHue + 5 : s.candleHue ?? prefs.candleHue)
      : sync3 ? liveHue
        : s.mode === MODE.OCEAN ? 205 + 20 * Math.sin(phase)
          : s.mode === MODE.AURORA ? 200 + 80 * Math.sin(phase / 4) : s.hue
  const sat = s.mode === MODE.CANDLE ? (flame ? 0.86 : 0.94) : s.mode === MODE.OCEAN ? 0.9 : s.mode === MODE.AURORA ? 0.82
    : s.mode === MODE.PARTY ? 1 : sync3 ? liveSat : s.sat
  const val = s.mode === MODE.CANDLE ? (flame ? b * clampV(core, 0.25) : b * (0.82 + 0.1 * Math.sin(phase * 2)))
    : s.mode === MODE.BREATHE ? b * (0.575 + 0.425 * Math.sin(phase))
      : s.mode === MODE.CHASE ? b * (twoLeds ? 0.5 + 0.5 * Math.sin(phase) : 0.55 - 0.45 * Math.cos(phase))
        : s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER ? b * (0.15 + 0.85 * liveLevel) : b
  const hue2 = s.mode === MODE.RAINBOW ? (rainbowHue + 180) % 360 : s.mode === MODE.PARTY ? (rainbowHue + 120) % 360
    : s.mode === MODE.CANDLE ? (flame ? Math.max(0, flameHue - 5) : s.candleHue ?? prefs.candleHue)
      : sync3 ? (live ? sync.hue2 : s.hue2)
        : s.mode === MODE.OCEAN ? 205 - 20 * Math.sin(phase)
          : s.mode === MODE.AURORA ? 200 - 80 * Math.sin(phase / 4) : s.mode === MODE.CHASE ? s.hue : s.hue2
  const sat2 = s.mode === MODE.RAINBOW || s.mode === MODE.CHASE ? s.sat : sync3 ? (live ? sync.sat2 : s.sat2)
    : s.mode === MODE.CANDLE ? (flame ? 0.99 : sat)
      : s.mode === MODE.OCEAN || s.mode === MODE.AURORA || s.mode === MODE.PARTY ? sat : s.sat2
  const val2 = s.mode === MODE.CANDLE ? (flame ? b * clampV(tip, 0.2) : b * (0.82 + 0.1 * Math.sin(phase * 3 + 1)))
    : s.mode === MODE.BREATHE ? b * (0.575 - 0.425 * Math.sin(phase))
      : s.mode === MODE.CHASE ? b * (0.5 - 0.5 * Math.sin(phase))
        : s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER ? b * (0.15 + 0.85 * liveLevel2) : b
  return { hue, sat, val, hue2, sat2, val2 }
}

export function HomeScreen(props: {
  c: LedController
  preview: Preview
  rainbowHue: number
  boardTitle: string
  onRename: () => void
  onSettings: () => void
  onBack: () => void
  onDisconnect: () => void
  onSleepMenu: () => void
  onAddScene: () => void
  onSceneMenu: (s: Scene) => void
}) {
  const { c, preview } = props
  const { s, prefs, caps } = c
  const auto = useAutoStatus()
  const [modeMenu, setModeMenu] = useState(false)
  const menu = useExit(modeMenu, 200)
  const sceneRow = useRef<HTMLDivElement>(null)
  useFlip(sceneRow)
  const scenes = useLeavingList(s.scenes, (sc) => String(sc.id))

  const cycling = s.mode === MODE.RAINBOW && prefs.rainbowSync
  const shownHue = cycling ? props.rainbowHue : s.hue
  const eKelvinMode = c.editsLed2 ? s.kelvinMode2 : s.kelvinMode
  const eKelvin = c.editsLed2 ? s.kelvin2 : s.kelvin
  const eSat = c.editsLed2 ? s.sat2 : s.sat
  const eHue = !c.editsLed2 ? shownHue : cycling ? (props.rainbowHue + 180) % 360 : s.hue2
  const briTop = eKelvinMode ? kelvinScreenColor(eKelvin) : hsvCss(eHue, eSat)

  const label = (kel: boolean, k: number, h: number, sat: number) => kel ? `${Math.round(k / 50) * 50} K` : hexOf(h, sat)
  const modeName = !c.ledOn ? 'Off'
    : s.mode === MODE.SOLID ? label(s.kelvinMode, s.kelvin, shownHue, s.sat) + (c.twoLeds ? '  ·  ' + label(s.kelvinMode2, s.kelvin2, s.hue2, s.sat2) : '')
      : s.mode === MODE.SCREEN ? 'Screen sync' : modeLabel(s.mode)

  const modeGroups: [string, [number, string, boolean][]][] = [
    ['Light', [[MODE.SOLID, 'Solid', true], [MODE.RAINBOW, 'Rainbow', true], [MODE.CANDLE, 'Candle', caps.candle]]],
    ['Board effects', [...LED_EFFECTS.map(([m, l]) => [m, l, caps.effects] as [number, string, boolean]), [LED_CHASE[0], LED_CHASE[1], caps.split]]],
    ['Reactive', [[MODE.MUSIC, 'Music', true], [MODE.VISUALIZER, 'Visualizer', true], [MODE.SCREEN, 'Screen', true]]],
  ]

  // Keyboard shortcuts (not while typing).
  const live = useRef(props)
  live.current = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [role=slider], .scrim') || e.ctrlKey || e.altKey || e.metaKey) return
      const p = live.current, cc = p.c
      if (e.key === ' ') { e.preventDefault(); sound.confirm(); cc.togglePower() }
      else if (/^[1-9]$/.test(e.key)) { const sc = cc.s.scenes[+e.key - 1]; if (sc) { sound.tap(); cc.applyScene(sc) } }
      else if (e.key === '[' || e.key === ']') {
        cc.setBrightness(Math.min(1, Math.max(0, cc.s.bri + (e.key === ']' ? 0.05 : -0.05))))
        cc.sendCurrent()
      } else if (e.key === 'm' || e.key === 'M') setModeMenu((v) => !v)
      else if (e.key === ',') p.onSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isSync = s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER || s.mode === MODE.SCREEN
  const levelPct = Math.round((c.sync.active === 'NONE' ? 0 : c.sync.level) * 100)

  return (
    <div className="screen home">
      <header className="header entrance" style={{ ['--i' as string]: 0 }}>
        <CircleIconButton label="All boards" onClick={props.onBack}><BackIcon /></CircleIconButton>
        <div className="header-title">
          <h1>Glow</h1>
          <button className="board-pill" onClick={props.onRename} title="Rename this board">
            <span className="board-dot" />
            <span className="board-name"><Txt>{props.boardTitle}</Txt></span>
            {c.fwVersion && <span className="board-ver">v{c.fwVersion}</span>}
            <EditIcon />
          </button>
        </div>
        <CircleIconButton label="Settings" title="Settings (,)" onClick={props.onSettings}><SettingsIcon /></CircleIconButton>
        <CircleIconButton
          label={c.ledOn ? 'Turn off' : 'Turn on'}
          title={(c.ledOn ? 'Turn off' : 'Turn on') + ' (Space) · right-click: sleep timer'}
          active={c.ledOn}
          onClick={() => { sound.confirm(); c.togglePower() }}
          onContextMenu={() => { sound.longPress(); props.onSleepMenu() }}
        >
          <PowerIcon />
        </CircleIconButton>
      </header>

      <div className="home-grid">
        <div className="home-col">
          <div className="entrance" style={{ ['--i' as string]: 1 }}>
            <Swap k={c.twoLeds ? 'pair' : 'one'}>
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
          </div>

          <button className="quiet-link" onClick={() => { sound.tap(); props.onDisconnect() }}>Disconnect</button>
          <div className="shortcuts">Space power · 1–9 scenes · [ ] brightness · M modes · right-click for more</div>
        </div>

        {/* everything you click often, together and right under the power button */}
        <div className="home-col">
          <div ref={sceneRow} className="scene-row entrance" style={{ ['--i' as string]: 2 }}>
            <button data-flip="auto" className={'chip' + (prefs.autoLight ? ' selected' : '')} onClick={() => { sound.tap(); setAutoLight(!prefs.autoLight) }}>
              <span className="auto-mark"><span /></span>Auto
            </button>
            {scenes.map(({ item: sc, key, leaving }, i) => (
              <button
                key={key}
                data-flip={key}
                disabled={leaving}
                className={'chip scene' + (sc.id === c.selectedSceneId ? ' selected' : '') + (leaving ? ' leaving' : '')}
                title={i < 9 ? `${sc.name} (${i + 1}) · right-click for options` : 'Right-click for options'}
                onClick={() => { sound.tap(); c.applyScene(sc) }}
                onContextMenu={(e) => { e.preventDefault(); sound.longPress(); props.onSceneMenu(sc) }}
              >
                <span className="swatch" style={{ background: sceneSwatch(sc, prefs.candleHue) }} />
                <span className="chip-text"><Txt>{sc.name}</Txt></span>
              </button>
            ))}
            <button data-flip="add" className={'chip add' + (c.canSaveScene ? '' : ' disabled')} onClick={props.onAddScene} title="Save the current light as a scene">
              <AddIcon />{s.scenes.length === 0 && <span>Save scene</span>}
            </button>
          </div>
          <Presence show={prefs.autoLight} className="gap14">
            <div className="auto-status">Auto: <Txt>{auto.running ? statusText(auto) : 'Starting…'}</Txt></div>
          </Presence>

          <PanelCard className="entrance" style={{ ['--i' as string]: 3 }}>
            <div className="mode-anchor">
              <button className="mode-button glass-soft" onClick={() => setModeMenu(!modeMenu)} aria-expanded={modeMenu} title="Mode (M)">
                <span className="mode-label">Mode</span>
                <span className="mode-value"><Txt>{modeLabel(s.mode)}</Txt></span>
                <BackIcon size={18} className={'mode-arrow' + (modeMenu ? ' open' : '')} />
              </button>
              {menu.mounted && (
                <>
                  {modeMenu && <div className="menu-scrim" onPointerDown={() => setModeMenu(false)} />}
                  <div className={'mode-menu' + (menu.leaving ? ' leaving' : '')}>
                    {modeGroups.map(([title, modes]) => (
                      <div key={title}>
                        <div className="menu-title">{title}</div>
                        <div className="menu-grid">
                          {modes.map(([m, l, enabled]) => (
                            <button
                              key={m}
                              disabled={!enabled}
                              className={'menu-item' + (m === s.mode ? ' selected' : '')}
                              onClick={() => { sound.tap(); setModeMenu(false); void c.startMode(m) }}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <SliderLabel text="Brightness" value={`${Math.round(s.bri * 100)} %`} />
            <GradientBar
              label="Brightness"
              fraction={s.bri}
              stops={['#000', briTop]}
              thumbColor={briTop}
              onFraction={c.setBrightness}
              onFinished={c.sendCurrent}
            />
            <Presence show={!caps.effects}><Hint>Update the board firmware (Settings) for all modes.</Hint></Presence>
          </PanelCard>

          <Presence show={isSync} className="gap14">
            <PanelCard>
              <div className="panel-head">
                <span><Txt>{s.mode === MODE.MUSIC ? 'Music' : s.mode === MODE.VISUALIZER ? 'Visualizer' : 'Screen sync'}</Txt></span>
                <span className="panel-state">
                  <Txt>
                    {c.sync.active === 'NONE' ? 'Starting…'
                      : s.mode === MODE.MUSIC ? 'Listening' : s.mode === MODE.VISUALIZER ? 'Listening to your PC' : 'Watching the screen'}
                  </Txt>
                </span>
              </div>
              <Presence show={s.mode !== MODE.SCREEN}>
                <div className="stack">
                  <div className="level-meter"><div style={{ width: `${levelPct}%` }} /></div>
                  <SliderLabel text="Sensitivity" />
                  <GradientBar
                    label="Sensitivity"
                    fraction={prefs.musicSensitivity}
                    stops={['var(--on-bg-12)', 'var(--on-bg-55)']}
                    thumbColor="var(--primary)"
                    onFraction={(f) => settings.set({ musicSensitivity: f })}
                    onFinished={() => {}}
                  />
                </div>
              </Presence>
              <Presence show={s.mode === MODE.MUSIC}>
                <SegmentedPill options={['Beat colours', 'My colour']} selected={prefs.musicKeepColour ? 1 : 0}
                  onSelect={(i) => settings.set({ musicKeepColour: i === 1 })} />
              </Presence>
              <Presence show={s.mode !== MODE.SCREEN}>
                <SettingSwitch title="Beat flash" subtitle="A quick burst of brightness on every beat"
                  checked={prefs.beatFlash} onChange={(v) => settings.set({ beatFlash: v })} />
              </Presence>
              <Hint>
                <Txt>
                  {s.mode === MODE.MUSIC ? 'Listens to the microphone. Keeps running in the tray when you close the window.'
                    : s.mode === MODE.VISUALIZER ? 'Bass is red, mids green, treble blue. Plays along with everything Windows plays. Keeps running in the tray.'
                      : 'The LED follows the colours on your screen, also while other apps are open. Keeps running in the tray.'}
                </Txt>
              </Hint>
              <Presence show={s.mode !== MODE.MUSIC}>
                <PillButton text={s.mode === MODE.SCREEN ? 'Stop screen sync' : 'Stop visualizer'} onClick={() => void c.startMode(MODE.SOLID)} />
              </Presence>
            </PanelCard>
          </Presence>
          <PanelCard className="entrance" style={{ ['--i' as string]: 5 }}>
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
          </PanelCard>
        </div>
      </div>
    </div>
  )
}
