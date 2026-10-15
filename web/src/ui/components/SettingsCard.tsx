// The building blocks of the Settings screen, shared with the device types' own sections: a
// foldable glass card, and a labelled level slider.

import type { ReactNode } from 'react'
import { settings, useSettings } from '../../settings/store'
import { Presence } from '../motion'
import { sound } from '../sound'
import { Hint, LevelBar } from './Controls'
import { BackIcon } from './Icons'

export function SettingsCard(props: { id: string; title: string; badge?: boolean; children: ReactNode; i: number }) {
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

export function LevelSlider(props: { label: string; value: number; text: string; onChange: (f: number) => void; onDone?: () => void; hint?: string }) {
  return (
    <div className="level-slider">
      <div className="slider-label"><span>{props.label}</span><span className="slider-value">{props.text}</span></div>
      <LevelBar label={props.label} fraction={props.value} onFraction={props.onChange} onFinished={props.onDone ?? (() => {})} />
      {props.hint && <Hint>{props.hint}</Hint>}
    </div>
  )
}
