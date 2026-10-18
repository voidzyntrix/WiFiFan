// Settings: the app (look, feedback, updates) and, below it, each device type's own section (only
// for the types you have devices of). The one screen that scrolls.

import { useEffect, useState } from 'react'
import { useConnection } from '../../devices/connection'
import { DEVICE_TYPES } from '../../devices/registry'
import { APP_VERSION, openLink, platform } from '../../platform'
import { RELEASES_PAGE } from '../../lib/github'
import { cornerUnit, DEFAULT_ACCENT, MAX_CORNER_UNIT, settings, useSettings, type Background, type ColorSource, type Design } from '../../settings/store'
import { useAppUpdate, checkAppUpdate, installAppUpdate } from '../appUpdate'
import { CircleIconButton, ColourPickerDialog, PillButton, ProgressBar, SegmentedPill, SettingHeading, SettingSection, SettingSwitch } from '../components/Controls'
import { LevelSlider, SettingsCard } from '../components/SettingsCard'
import { BackIcon } from '../components/Icons'
import { CloudCard } from './CloudCard'
import { sound } from '../sound'
import { Presence, Swap, Txt } from '../motion'

const ACCENTS = ['#7e57c2', '#5c6bc0', '#42a5f5', '#26a69a', '#66bb6a', '#ffca28', '#ff7043', '#ec407a']

export function SettingsScreen({ onBack, onWhatsNew }: { onBack: () => void; onWhatsNew: () => void }) {
  const p = useSettings()
  const conn = useConnection()
  const app = useAppUpdate()
  const set = settings.set
  const phone = platform.kind === 'android'
  const [picking, setPicking] = useState(false)
  const material = p.design === 'MATERIAL'
  const designs: Design[] = ['GLASS', 'MATERIAL']

  // leaving Settings folds every card again, so the next visit starts closed
  useEffect(() => () => {
    settings.set({ collapsed: { ...settings.get().collapsed, ui: true, app: true, shape: true, behaviour: true, cloud: true } })
  }, [])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.scrim, mdui-dialog[open]')) onBack() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onBack])

  const backgrounds: Background[] = ['SIMPLE', 'AURORA', 'IMAGE', 'PLAIN']
  const sources: ColorSource[] = ['SYSTEM', 'CUSTOM', 'MONOCHROME']
  // a type's section shows once you have a device of it
  const types = DEVICE_TYPES.filter((t) => t.SettingsSection && (p.devices.some((d) => d.type === t.id) || conn.device?.type === t.id))

  return (
    <div className="screen settings scrolls">
      <header className="header entrance" style={{ ['--i' as string]: 0 }}>
        <CircleIconButton label="Back (Esc)" onClick={onBack}><BackIcon /></CircleIconButton>
        <div className="header-title"><h1>Settings</h1><p className="header-sub">Make Glow yours</p></div>
      </header>

      <div className="settings-grid">
        <div className="settings-col">
          <SettingsCard id="ui" title="Design & colour" i={1}>
            <SettingHeading title="Design" subtitle={material
              ? 'Material You: solid Material 3 surfaces and widgets. The lightest on the GPU'
              : 'Glass: translucent cards over a background, with blur or refraction'} />
            <SegmentedPill options={['Glass', 'Material You']} selected={designs.indexOf(p.design)} onSelect={(i) => set({ design: designs[i] })} />
            <SettingSection title="Colour" />
            <SettingHeading title="Colours" subtitle={{
              SYSTEM: phone ? 'Material You: colours from your wallpaper' : 'Material You: colours from your Windows accent colour',
              CUSTOM: 'Material You: colours from a colour you pick',
              MONOCHROME: 'Greys only',
            }[p.colorSource]} />
            <SegmentedPill options={['System', 'Custom', 'Monochrome']} selected={sources.indexOf(p.colorSource)} onSelect={(i) => set({ colorSource: sources[i] })} />
            <Presence show={p.colorSource === 'CUSTOM'}>
              <div className="accent-row">
                {ACCENTS.map((a) => (
                  <button key={a} className={'preset' + (a === p.accentColor ? ' selected' : '')} style={{ background: a }} title={a}
                    onClick={() => { sound.tap(); set({ accentColor: a }) }} />
                ))}
                <button className="preset custom" title="Pick any colour" style={{ background: ACCENTS.includes(p.accentColor) ? undefined : p.accentColor }}
                  onClick={() => { sound.tap(); setPicking(true) }}>+</button>
              </div>
            </Presence>
            <SettingHeading title="Appearance" subtitle={phone ? 'Light or dark, or the same as the phone' : 'Light or dark, or the same as Windows'} />
            <SegmentedPill options={['System', 'Light', 'Dark']} selected={p.themeMode} onSelect={(i) => set({ themeMode: i })} />
            <SettingSwitch title="Pure black (OLED)" subtitle="Black background in dark mode" checked={p.pureBlack} onChange={(v) => set({ pureBlack: v })} />
            {!material && <SettingSection title="Background" />}
            {!material && <SettingHeading title="Background" subtitle={{
              SIMPLE: 'Slow floating particles',
              AURORA: "Soft glows drifting in the light's colour",
              IMAGE: 'A photo of a living room',
              PLAIN: 'Nothing behind the controls; lightest on the GPU',
            }[p.background]} />}
            {!material && <SegmentedPill options={['Particles', 'Aurora', 'Image', 'Plain']} selected={backgrounds.indexOf(p.background)} onSelect={(i) => set({ background: backgrounds[i] })} />}
            <Presence show={!material && p.background === 'IMAGE'}>
              <LevelSlider label="Darkness" value={p.imageDim / 0.95} text={`${Math.round(p.imageDim * 100)} %`} onChange={(f) => set({ imageDim: f * 0.95 })} />
            </Presence>
          </SettingsCard>


          <SettingsCard id="app" title="Updates" i={4} badge={app.kind === 'available'}>
            <div className="update-block">
              <div className="update-title">{platform.name} v{APP_VERSION}<Presence show={app.kind === 'available'} className="inline"><span className="update-dot" /></Presence></div>
              <div className={'update-status' + (app.kind === 'error' ? ' error' : '')}>
                <Txt>
                  {app.kind === 'idle' ? 'New versions are published as GitHub releases.'
                    : app.kind === 'checking' ? 'Checking GitHub…'
                      : app.kind === 'upToDate' ? `Up to date (latest release is v${app.latest}).`
                        : app.kind === 'available' ? `Version ${app.release.version} is available.`
                          : app.kind === 'downloading' ? `Downloading v${app.version}…${app.fraction != null ? ` ${Math.floor(app.fraction * 100)} %` : ''}`
                            : app.kind === 'restarting' ? (phone ? `Installing v${app.version}…` : `Installing v${app.version}. Glow restarts by itself…`) : app.message}
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
                          : <PillButton text="Check for updates" onClick={() => void checkAppUpdate(false, true)} />}
              </Swap>
            </div>
            <div className="button-row">
              <PillButton text="What's new" onClick={onWhatsNew} />
              <PillButton text="All releases" onClick={() => openLink(RELEASES_PAGE)} />
            </div>
          </SettingsCard>
        </div>
        <div className="settings-col">
          <SettingsCard id="shape" title="Shape & surface" i={2}>
            {!material && <SettingSwitch title="Light effects" subtitle="No blur and no WebGL, a slower background: much smoother on a phone" checked={p.lightEffects} onChange={(v) => set({ lightEffects: v })} />}
            {!material && (
              <Presence show={!p.lightEffects}>
                <SettingSwitch title="Refractive glass" subtitle="Clear glass that bends the background at its edges, instead of frosted glass that blurs it" checked={p.refractiveGlass} onChange={(v) => set({ refractiveGlass: v })} />
              </Presence>
            )}
            <SettingHeading title="Corners" subtitle="Everything scales with it: cards, buttons, chips, switches, dots" />
            <SegmentedPill options={['Square', 'Small', 'Medium', 'Large', 'Custom']} selected={p.cornerStyle} onSelect={(i) => set({ cornerStyle: i })} />
            <Presence show={p.cornerStyle === 4}>
              <LevelSlider label="Radius" value={cornerUnit(p) / MAX_CORNER_UNIT} text={`${Math.round(cornerUnit(p) * 12)} px`}
                onChange={(f) => set({ customCorner: Math.round(f * MAX_CORNER_UNIT * 20) / 20 })}
                hint="0 is square. A card has 12 px at 12; buttons and chips are fully round from about 12 px up." />
            </Presence>
            <SettingSwitch title="Round LED preview" subtitle="Keep the LED preview a perfect circle whatever the corners" checked={p.roundLedPreview} onChange={(v) => set({ roundLedPreview: v })} />
            <SettingHeading title="Font" subtitle="Used for all text in the app" />
            <SegmentedPill options={['System', 'JetBrains Mono']} selected={p.monoFont ? 1 : 0} onSelect={(i) => set({ monoFont: i === 1 })} />
          </SettingsCard>

          <SettingsCard id="behaviour" title="Behaviour" i={3}>
            <SettingSwitch title={phone ? 'Haptics' : 'Sounds'} subtitle={phone ? 'A light tick on sliders and buttons' : 'Soft clicks on sliders and buttons'}
              checked={p.sounds} onChange={(v) => set({ sounds: v })} />
            <Presence show={p.sounds && !phone}>
              <LevelSlider label="Volume" value={p.soundVolume} text={`${Math.round(p.soundVolume * 100)} %`}
                onChange={(f) => set({ soundVolume: Math.max(0.05, f) })} onDone={() => sound.confirm()} />
            </Presence>
            <SettingSwitch title="Keep screen on" subtitle="The display doesn't sleep while Glow is open" checked={p.keepScreenOn} onChange={(v) => set({ keepScreenOn: v })} />
            <SettingSwitch title="Update prompts" subtitle="Ask at launch when an update is available" checked={p.updatePrompts} onChange={(v) => set({ updatePrompts: v })} />
          </SettingsCard>

          <CloudCard i={5} />

        {types.map((t) => { const Section = t.SettingsSection!; return <Section key={t.id} /> })}
        </div>
      </div>
      {picking && (
        <ColourPickerDialog
          title="Theme colour"
          initial={p.accentColor || DEFAULT_ACCENT}
          onDismiss={() => setPicking(false)}
          onPick={(hex) => { set({ accentColor: hex }); setPicking(false) }}
        />
      )}
    </div>
  )
}
