// Every mode's own options, on the control screen (the "tune" tab shows the current mode's):
//   Solid     colour fade          Rainbow   speed, animated sliders       Candle  flicker, tint, style
//   Music     sensitivity, colours, beat flash, one LED per beat + trail decay (rings)     Visualizer  the same options where they fit
//   Screen    which display (PCs with several)
// Options the board's firmware is too old for say so instead of vanishing.

import { useEffect, useState } from 'react'
import { platform } from '../../platform'
import { settings } from '../../settings/store'
import { Hint, LevelBar, PillButton, SegmentedPill, SettingHeading, SettingSwitch, SliderLabel } from '../../ui/components/Controls'
import { Swap, Txt } from '../../ui/motion'
import { MODE } from './modes'
import { SolarTab } from './SolarTab'
import type { LedController } from './useLed'

/** Does this mode have options to show? */
export const hasTune = (mode: number) =>
  mode === MODE.SOLID || mode === MODE.RAINBOW || mode === MODE.CANDLE || mode === MODE.SPIN || mode === MODE.MUSIC || mode === MODE.VISUALIZER || mode === MODE.SCREEN || mode === MODE.SOLAR

export const tuneLabel = (mode: number) =>
  mode === MODE.SOLID ? 'Fade' : mode === MODE.RAINBOW ? 'Rainbow' : mode === MODE.CANDLE ? 'Candle' : mode === MODE.SPIN ? 'Spinner'
    : mode === MODE.MUSIC ? 'Music' : mode === MODE.VISUALIZER ? 'Visualizer' : mode === MODE.SOLAR ? 'Solar' : 'Screen'

export function TuneTab({ c }: { c: LedController }) {
  const { s, prefs, caps } = c
  const set = settings.set
  const needs = (fw: string) => <Hint>Needs board firmware {fw}</Hint>

  if (s.mode === MODE.SOLAR) return <SolarTab c={c} />

  if (s.mode === MODE.SOLID) {
    return (
      <div className="deck tune">
        <SettingHeading title="Colour fade" subtitle="How long the light takes to reach a new colour" />
        {caps.options
          ? <SegmentedPill options={['Quick', 'Normal', 'Slow']} selected={[500, 1500, 3000].indexOf(prefs.fadeMs)} onSelect={(i) => set({ fadeMs: [500, 1500, 3000][i] })} />
          : needs('1.3.0')}
      </div>
    )
  }

  if (s.mode === MODE.RAINBOW) {
    return (
      <div className="deck tune">
        <SettingHeading title="Speed" subtitle="One trip round the colour wheel" />
        {caps.options ? (
          <>
            <SliderLabel text="Seconds per turn" value={`${prefs.rainbowSeconds} s`} />
            <LevelBar label="Seconds per turn" fraction={(prefs.rainbowSeconds - 2) / 118}
              onFraction={(f) => set({ rainbowSeconds: 2 + Math.round(f * 118) })} onFinished={() => {}} />
          </>
        ) : needs('1.3.0')}
        <SettingSwitch title="Animate the colour sliders" subtitle="Hue and saturation follow the rainbow while it runs" checked={prefs.rainbowSync} onChange={(v) => set({ rainbowSync: v })} />
      </div>
    )
  }

  if (s.mode === MODE.SPIN) {
    return (
      <div className="deck tune">
        <SettingHeading title="Speed" subtitle="One turn round the ring" />
        {caps.spin ? (
          <>
            <SliderLabel text="Seconds per turn" value={`${prefs.spinSeconds} s`} />
            <LevelBar label="Seconds per turn" fraction={(prefs.spinSeconds - 1) / 59}
              onFraction={(f) => set({ spinSeconds: 1 + Math.round(f * 59) })} onFinished={() => {}} />
            <SliderLabel text="Length" value={`${prefs.spinLength} px`} />
            <LevelBar label="Length" fraction={(prefs.spinLength - 1) / 11} wheelStep={1 / 11}
              onFraction={(f) => set({ spinLength: 1 + Math.round(f * 11) })} onFinished={() => {}} />
            <SliderLabel text="Falloff radius" value={`${prefs.spinRadius} px`} />
            <LevelBar label="Falloff radius" fraction={prefs.spinRadius / 12} wheelStep={1 / 12}
              onFraction={(f) => set({ spinRadius: Math.round(f * 12) })} onFinished={() => {}} />
            <SliderLabel text="Falloff strength" value={`${prefs.spinStrength} %`} />
            <LevelBar label="Falloff strength" fraction={prefs.spinStrength / 100} wheelStep={0.05}
              onFraction={(f) => set({ spinStrength: Math.round(f * 100) })} onFinished={() => {}} />
            <SettingSwitch title="Front + back" subtitle="The falloff also leaks into the LEDs ahead of the head" checked={prefs.spinFalloffFront} onChange={(v) => set({ spinFalloffFront: v })} />
          </>
        ) : needs('2.0.0')}
      </div>
    )
  }

  if (s.mode === MODE.CANDLE) {
    return (
      <div className="deck tune">
        {caps.options ? (
          <>
            <SettingSwitch title="Smooth flicker" subtitle="Slow and gentle, easier on the eyes at night" checked={prefs.smoothCandle} onChange={(v) => set({ smoothCandle: v })} />
            <SettingHeading title="Flame colour" />
            <SegmentedPill options={['Ember', 'Warm', 'Amber']} selected={[10, 19, 30].indexOf(prefs.candleHue)} onSelect={(i) => set({ candleHue: [10, 19, 30][i] })} />
            {!caps.spin && (                                     // 2.0.0: every flame is its own — the style choice does nothing
              <>
                <SettingHeading title="Style" subtitle={prefs.twoCandles ? 'Each LED is a candle of its own' : 'One flame: LED 1 the bright core, LED 2 the flickering tip'} />
                <Swap k={!caps.candleStyle ? 'fw' : !c.twoLeds ? 'sep' : 'pill'}>
                  {!caps.candleStyle ? needs('1.6.1')
                    : !c.twoLeds ? <Hint>Set the LEDs to Separate (Colour tab) to choose</Hint>
                      : <SegmentedPill options={['One flame', 'Two candles']} selected={prefs.twoCandles ? 1 : 0} onSelect={(i) => set({ twoCandles: i === 1 })} />}
                </Swap>
              </>
            )}
          </>
        ) : needs('1.3.0')}
      </div>
    )
  }

  if (s.mode === MODE.SCREEN) {
    return (
      <div className="deck tune">
        <div className="panel-head">
          <span>Screen sync</span>
          <span className="panel-state"><Txt>{c.sync.active === 'NONE' ? 'Starting…' : 'Watching the screen'}</Txt></span>
        </div>
        <CaptureDisplay />
        <PillButton text="Stop screen sync" onClick={() => void c.startMode(MODE.SOLID)} />
      </div>
    )
  }

  // Music / Visualizer
  const levelPct = Math.round((c.sync.active === 'NONE' ? 0 : c.sync.level) * 100)
  return (
    <div className="deck tune">
      <div className="panel-head">
        <span>{s.mode === MODE.MUSIC ? 'Music' : 'Visualizer'}</span>
        <span className="panel-state"><Txt>{c.sync.active === 'NONE' ? 'Starting…' : s.mode === MODE.MUSIC ? 'Listening' : 'Listening to your PC'}</Txt></span>
      </div>
      <div className="level-meter"><div style={{ width: `${levelPct}%` }} /></div>
      <SliderLabel text="Sensitivity" />
      <LevelBar label="Sensitivity" fraction={prefs.musicSensitivity} onFraction={(f) => set({ musicSensitivity: f })} onFinished={() => {}} />
      {s.mode === MODE.MUSIC && (
        <SegmentedPill options={['Beat colours', 'My colour']} selected={prefs.musicKeepColour ? 1 : 0} onSelect={(i) => set({ musicKeepColour: i === 1 })} />
      )}
      {(s.mode === MODE.MUSIC || s.mode === MODE.VISUALIZER) && c.ring && (     // the whole ring is a two-LED stream there; per-LED beats need pixels
        c.caps.perPixel ? (
          <>
            <SettingSwitch title="One LED per beat" subtitle="Each beat lands on the next pixel round the ring; every beat's LED fades out to black again" checked={prefs.musicPerPixel} onChange={(v) => set({ musicPerPixel: v })} />
            {prefs.musicPerPixel && (
              <>
                <SliderLabel text="Beat trail decay" value={`${prefs.musicDecayMs} ms`} />
                <LevelBar label="Beat trail decay" fraction={(prefs.musicDecayMs - 100) / 1900} onFraction={(f) => set({ musicDecayMs: 100 + Math.round((f * 1900) / 50) * 50 })} onFinished={() => {}} />
              </>
            )}
          </>
        ) : needs('2.1.0')
      )}
      <SettingSwitch title="Beat flash" subtitle="A quick burst of brightness on every beat" checked={prefs.beatFlash} onChange={(v) => set({ beatFlash: v })} />
      <PillButton text={`Stop ${s.mode === MODE.MUSIC ? 'music' : 'visualizer'}`} onClick={() => void c.startMode(MODE.SOLID)} />
    </div>
  )
}

/** Which screen Screen sync watches (PCs with several monitors). */
function CaptureDisplay() {
  const [displays, setDisplays] = useState<{ index: number; label: string }[]>([])
  const [chosen, setChosen] = useState(settings.get().captureDisplay)
  useEffect(() => { void platform.capture.displays?.().then(setDisplays) }, [])
  useEffect(() => { platform.capture.setDisplay?.(chosen) }, [chosen])
  if (displays.length < 2) return null
  return (
    <>
      <SettingHeading title="Display" subtitle="Which monitor to watch" />
      <SegmentedPill options={displays.map((d) => `Display ${d.index + 1}`)} selected={Math.min(chosen, displays.length - 1)}
        onSelect={(i) => { setChosen(i); settings.set({ captureDisplay: i }) }} />
    </>
  )
}
