// Controls in the Android app's look: gradient sliders, segmented pills, switches, glass cards,
// buttons and dialogs. Styling lives in styles.css; colours come from CSS variables (Theme.tsx).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { sound } from '../sound'

/**
 * A draggable colour strip (hue, saturation, brightness, kelvin, or a plain level).
 * Mouse: drag or click; wheel nudges by 2 %; keyboard: arrows (Shift for 10 %), Home/End.
 */
export function GradientBar(props: {
  fraction: number
  stops: string[]
  thumbColor: string
  onFraction: (f: number) => void
  onFinished: () => void
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const step = useRef(-1)
  const finishTimer = useRef(0)
  const report = (f: number) => {
    const c = Math.min(1, Math.max(0, f))
    const s = Math.round(c * 20)            // a tick every 5 %
    if (step.current >= 0 && s !== step.current) sound.tick()
    step.current = s
    props.onFraction(c)
  }
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return (clientX - r.left) / r.width
  }
  // Wheel and keys finish a moment after the last nudge, like letting go of a drag.
  const finishSoon = () => {
    window.clearTimeout(finishTimer.current)
    finishTimer.current = window.setTimeout(() => props.onFinished(), 250)
  }
  return (
    <div
      ref={ref}
      className="gbar"
      role="slider"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.fraction * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        ref.current!.setPointerCapture(e.pointerId)
        step.current = -1
        report(at(e.clientX))
      }}
      onPointerMove={(e) => { if (ref.current!.hasPointerCapture(e.pointerId)) report(at(e.clientX)) }}
      onPointerUp={(e) => {
        if (!ref.current!.hasPointerCapture(e.pointerId)) return
        ref.current!.releasePointerCapture(e.pointerId)
        props.onFinished()
      }}
      onWheel={(e) => {
        report(props.fraction + (e.deltaY < 0 || e.deltaX > 0 ? 0.02 : -0.02))
        finishSoon()
      }}
      onKeyDown={(e) => {
        const d = e.shiftKey ? 0.1 : 0.01
        const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? props.fraction + d
          : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? props.fraction - d
            : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null
        if (next == null) return
        e.preventDefault()
        report(next)
        finishSoon()
      }}
    >
      <div className="gbar-track" style={{ background: `linear-gradient(90deg, ${props.stops.join(',')})` }} />
      <div className="gbar-thumb" style={{ left: `${props.fraction * 100}%` }}>
        <div className="gbar-dot" style={{ background: props.thumbColor }} />
      </div>
    </div>
  )
}

/** One pill split into options; the selected one is filled by a sliding thumb (-1 = none). */
export function SegmentedPill(props: { options: string[]; selected: number; onSelect: (i: number) => void; disabled?: boolean }) {
  const n = props.options.length
  return (
    <div className={'pill glass-soft' + (props.disabled ? ' disabled' : '')} role="radiogroup">
      {props.selected >= 0 && (
        <div className="pill-thumb" style={{ width: `calc(${100 / n}% - 6px)`, transform: `translateX(calc(${props.selected * 100}% + ${props.selected * 6}px))` }} />
      )}
      {props.options.map((o, i) => (
        <button
          key={o}
          role="radio"
          aria-checked={i === props.selected}
          className={'pill-option' + (i === props.selected ? ' selected' : '')}
          onClick={() => { if (i !== props.selected) { sound.tap(); props.onSelect(i) } }}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      className={'switch' + (props.checked ? ' on' : '')}
      onClick={() => { sound.tap(); props.onChange(!props.checked) }}
    >
      <span className="switch-knob" />
    </button>
  )
}

/** A frosted (or refractive) glass card. */
export function PanelCard({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={'panel ' + className} style={style}>{children}</section>
}

export function SliderLabel({ text, value }: { text: string; value?: string }) {
  return (
    <div className="slider-label">
      <span>{text}</span>
      {value != null && <span className="slider-value">{value}</span>}
    </div>
  )
}

export function PillButton(props: { text: string; highlighted?: boolean; enabled?: boolean; onClick: () => void }) {
  const enabled = props.enabled ?? true
  return (
    <button
      className={'pill-button' + (props.highlighted ? ' highlighted' : '')}
      disabled={!enabled}
      onClick={() => { sound.tap(); props.onClick() }}
    >
      {props.text}
    </button>
  )
}

export function CircleIconButton(props: { label: string; onClick: () => void; children: ReactNode; active?: boolean; onContextMenu?: () => void; title?: string }) {
  return (
    <button
      className={'circle-btn' + (props.active ? ' active' : '')}
      aria-label={props.label}
      title={props.title ?? props.label}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu ? (e) => { e.preventDefault(); props.onContextMenu!() } : undefined}
    >
      {props.children}
    </button>
  )
}

export function ProgressBar({ fraction }: { fraction: number | null }) {
  return (
    <div className="progress">
      <div className={'progress-fill' + (fraction == null ? ' indeterminate' : '')} style={fraction == null ? undefined : { width: `${fraction * 100}%` }} />
    </div>
  )
}

export function SettingSwitch(props: { title: string; subtitle?: string | null; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-switch">
      <div className="setting-text">
        <div className="setting-title">{props.title}</div>
        {props.subtitle && <div className="setting-sub">{props.subtitle}</div>}
      </div>
      <Switch checked={props.checked} onChange={props.onChange} label={props.title} />
    </div>
  )
}

export function SettingHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="setting-heading">
      <div className="setting-title">{title}</div>
      {subtitle && <div className="setting-sub">{subtitle}</div>}
    </div>
  )
}

export const SettingSection = ({ title }: { title: string }) => <div className="setting-section">{title}</div>
export const Hint = ({ children }: { children: ReactNode }) => <p className="hint">{children}</p>

/** A modal card; Escape or a click outside closes it. */
export function Dialog({ onDismiss, children, wide }: { onDismiss: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onDismiss])
  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onDismiss() }}>
      <div className={'dialog' + (wide ? ' wide' : '')} role="dialog" aria-modal>{children}</div>
    </div>
  )
}

/** A short list of actions (the Android app's long-press menus; here also right-click). */
export function ActionsDialog(props: { title: string; subtitle?: string; actions: [string, () => void][]; onDismiss: () => void }) {
  return (
    <Dialog onDismiss={props.onDismiss}>
      <h2 className="dialog-title">{props.title}</h2>
      {props.subtitle && <div className="dialog-sub">{props.subtitle}</div>}
      <div className="dialog-actions">
        {props.actions.map(([label, fn]) => (
          <button key={label} className="action-row" onClick={() => { sound.tap(); fn() }}>{label}</button>
        ))}
      </div>
    </Dialog>
  )
}

export function NameDialog(props: {
  title: string; subtitle?: string | null; initial: string; placeholder: string; allowEmpty?: boolean
  onDismiss: () => void; onSave: (name: string) => void
}) {
  const [text, setText] = useState(props.initial)
  const ok = props.allowEmpty || text.trim().length > 0
  return (
    <Dialog onDismiss={props.onDismiss}>
      <h2 className="dialog-title">{props.title}</h2>
      {props.subtitle && <div className="dialog-sub">{props.subtitle}</div>}
      <form onSubmit={(e) => { e.preventDefault(); if (ok) props.onSave(text.trim()) }}>
        <input
          className="text-field"
          autoFocus
          maxLength={40}
          value={text}
          placeholder={props.placeholder}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="dialog-buttons">
          <PillButton text="Cancel" onClick={props.onDismiss} />
          <PillButton text="Save" highlighted enabled={ok} onClick={() => props.onSave(text.trim())} />
        </div>
      </form>
    </Dialog>
  )
}
