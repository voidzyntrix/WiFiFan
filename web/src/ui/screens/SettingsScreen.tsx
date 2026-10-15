// Settings: the app (look, feedback, updates) and, below it, each device type's own section (only
// for the types you have devices of). The one screen that scrolls.

import { useEffect } from 'react'
import { useConnection } from '../../devices/connection'
import { DEVICE_TYPES } from '../../devices/registry'
import { APP_VERSION, openLink, platform } from '../../platform'
import { RELEASES_PAGE } from '../../lib/github'
import { DEFAULT_ACCENT, settings, useSettings, type Background, type ColorSource } from '../../settings/store'
import { useAppUpdate, checkAppUpdate, installAppUpdate } from '../appUpdate'
import { CircleIconButton, PillButton, ProgressBar, SegmentedPill, SettingHeading, SettingSection, SettingSwitch } from '../components/Controls'
import { LevelSlider, SettingsCard } from '../components/SettingsCard'
import { BackIcon } from '../components/Icons'
import { sound } from '../sound'
import { Presence, Swap, Txt } from '../motion'

const ACCENTS = ['#7e57c2', '#5c6bc0', '#42a5f5', '#26a69a', '#66bb6a', '#ffca28', '#ff7043', '#ec407a']

export function SettingsScreen({ onBack, onWhatsNew }: { onBack: () => void; onWhatsNew: () => void }) {
  const p = useSettings()
  const conn = useConnection()
  const app = useAppUpdate()
  const set = settings.set
  const phone = platform.kind === 'android'

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.scrim')) onBack() }
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
        <div className="header-title"><h1>Settings</h1></div>
      </header>

      <div className="settings-grid">
        <div className="settings-col">
          <SettingsCard id="ui" title="App UI" i={1}>
            <SettingSection title="Colour" />
            <SettingHeading title="Theme" subtitle={{
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
                <label className="preset custom" title="Custom colour" style={{ background: ACCENTS.includes(p.accentColor) ? undefined : p.accentColor }}>
                  <input type="color" value={p.accentColor || DEFAULT_ACCENT} onChange={(e) => set({ accentColor: e.target.value })} />+
                </label>
              </div>
            </Presence>
            <SettingHeading title="Appearance" subtitle={phone ? 'Light or dark, or the same as the phone' : 'Light or dark, or the same as Windows'} />
            <SegmentedPill options={['System', 'Light', 'Dark']} selected={p.themeMode} onSelect={(i) => set({ themeMode: i })} />
            <SettingSwitch title="Pure black (OLED)" subtitle="Black background in dark mode" checked={p.pureBlack} onChange={(v) => set({ pureBlack: v })} />
            <SettingSection title="Background" />
            <SettingHeading title="Background" subtitle={{
              SIMPLE: 'Slow floating particles',
              AURORA: "Soft glows drifting in the light's colour",
              IMAGE: 'A photo of a living room',
              PLAIN: 'Nothing behind the controls; lightest on the GPU',
            }[p.background]} />
            <SegmentedPill options={['Particles', 'Aurora', 'Image', 'Plain']} selected={backgrounds.indexOf(p.background)} onSelect={(i) => set({ background: backgrounds[i] })} />
            <Presence show={p.background === 'IMAGE'}>
              <LevelSlider label="Darkness" value={p.imageDim / 0.95} text={`${Math.round(p.imageDim * 100)} %`} onChange={(f) => set({ imageDim: f * 0.95 })} />
            </Presence>
            <SettingSection title="Shape & surface" />
            <SettingSwitch title="Refractive glass" subtitle="Clear glass that bends the background at its edges, instead of frosted glass that blurs it" checked={p.refractiveGlass} onChange={(v) => set({ refractiveGlass: v })} />
            <SettingHeading title="Corners" subtitle="Roundness of everything: cards, buttons, pills, dots, thumbs" />
            <SegmentedPill options={['Square', 'Small', 'Medium', 'Large', 'Custom']} selected={p.cornerStyle} onSelect={(i) => set({ cornerStyle: i })} />
            <Presence show={p.cornerStyle === 4}>
              <LevelSlider label="Radius" value={p.customCorner / 2} text={`${Math.round(p.customCorner * 100)} %`} onChange={(f) => set({ customCorner: f * 2 })}
                hint="0 % is square, 100 % makes round things fully round, above that cards get rounder." />
            </Presence>
            <SettingHeading title="Font" subtitle="Used for all text in the app" />
            <SegmentedPill options={['System', 'JetBrains Mono']} selected={p.monoFont ? 1 : 0} onSelect={(i) => set({ monoFont: i === 1 })} />
            <SettingSection title="Behaviour" />
            <SettingSwitch title={phone ? 'Haptics' : 'Sounds'} subtitle={phone ? 'A light tick on sliders and buttons' : 'Soft clicks on sliders and buttons'}
              checked={p.sounds} onChange={(v) => set({ sounds: v })} />
            <Presence show={p.sounds && !phone}>
              <LevelSlider label="Volume" value={p.soundVolume} text={`${Math.round(p.soundVolume * 100)} %`}
                onChange={(f) => set({ soundVolume: Math.max(0.05, f) })} onDone={() => sound.confirm()} />
            </Presence>
            <SettingSwitch title="Keep screen on" subtitle="The display doesn't sleep while Glow is open" checked={p.keepScreenOn} onChange={(v) => set({ keepScreenOn: v })} />
            <SettingSwitch title="Update prompts" subtitle="Ask at launch when an update is available" checked={p.updatePrompts} onChange={(v) => set({ updatePrompts: v })} />
          </SettingsCard>

          <SettingsCard id="app" title="Updates" i={2} badge={app.kind === 'available'}>
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
                          : <PillButton text="Check for updates" onClick={() => void checkAppUpdate()} />}
              </Swap>
            </div>
            <div className="button-row">
              <PillButton text="What's new" onClick={onWhatsNew} />
              <PillButton text="All releases" onClick={() => openLink(RELEASES_PAGE)} />
            </div>
          </SettingsCard>
        </div>
        <div className="settings-col">
          {types.map((t) => { const Section = t.SettingsSection!; return <Section key={t.id} /> })}
        </div>
      </div>
    </div>
  )
}
