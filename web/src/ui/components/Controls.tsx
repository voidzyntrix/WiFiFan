// The app's controls. Buttons, segmented buttons, switches, icon buttons, progress, dialogs, lists and
// text fields are Material 3 (Google's @material/web, see ../md.tsx), themed by Material You; the
// colour strips (hue, saturation, kelvin, brightness) are our own, as Material has no gradient
// slider, styled to match. Glass cards are ours too.

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { sound } from '../sound'
import { Txt } from '../motion'
import { flag, useElementEvent } from '../md'

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
  const [dragging, setDragging] = useState(false)   // while held the thumb follows the pointer exactly
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
      className={'gbar' + (dragging ? ' dragging' : '')}
      role="slider"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.fraction * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        ref.current!.setPointerCapture(e.pointerId)
        setDragging(true)
        step.current = -1
        report(at(e.clientX))
      }}
      onPointerMove={(e) => { if (ref.current!.hasPointerCapture(e.pointerId)) report(at(e.clientX)) }}
      onPointerUp={(e) => {
        if (!ref.current!.hasPointerCapture(e.pointerId)) return
        ref.current!.releasePointerCapture(e.pointerId)
        setDragging(false)
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
      {/* the stops are registered colour properties (styles.css), so a new colour glides in */}
      <div
        className="gbar-track"
        style={{
          background: `linear-gradient(90deg, ${props.stops.map((_, i) => `var(--g${i})`).join(',')})`,
          ...Object.fromEntries(props.stops.map((c, i) => [`--g${i}`, c])),
        }}
      />
      <div className="gbar-thumb" style={{ left: `${props.fraction * 100}%` }}>
        <div className="gbar-dot" style={{ background: props.thumbColor }} />
      </div>
    </div>
  )
}

/** Material 3 segmented buttons: one of a few options (-1 = none). */
export function SegmentedPill(props: { options: string[]; selected: number; onSelect: (i: number) => void; disabled?: boolean }) {
  return (
    <md-outlined-segmented-button-set class={'segmented' + (props.disabled ? ' disabled' : '')}>
      {props.options.map((o, i) => (
        <md-outlined-segmented-button
          key={o}
          label={o}
          no-checkmark
          selected={flag(i === props.selected)}
          disabled={flag(props.disabled)}
          onClick={() => { if (i !== props.selected) { sound.tap(); props.onSelect(i) } }}
        />
      ))}
    </md-outlined-segmented-button-set>
  )
}

/** A Material 3 switch. */
export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const ref = useElementEvent<HTMLElement & { selected: boolean }>('change', (el) => { sound.tap(); props.onChange(el.selected) })
  useEffect(() => { if (ref.current) ref.current.selected = props.checked }, [props.checked])
  return <md-switch ref={ref} icons show-only-selected-icon aria-label={props.label} selected={flag(props.checked)} />
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

/** A Material 3 button: filled when highlighted, tonal otherwise. */
export function PillButton(props: { text: string; highlighted?: boolean; enabled?: boolean; onClick: () => void }) {
  const enabled = props.enabled ?? true
  const click = (e: React.MouseEvent) => { e.preventDefault(); sound.tap(); props.onClick() }
  const label = <Txt>{props.text}</Txt>
  return props.highlighted
    ? <md-filled-button class="md-button" disabled={flag(!enabled)} onClick={click}>{label}</md-filled-button>
    : <md-filled-tonal-button class="md-button" disabled={flag(!enabled)} onClick={click}>{label}</md-filled-tonal-button>
}

/** A Material 3 icon button: tonal, or filled while `active` (the power button when on). */
export function CircleIconButton(props: { label: string; onClick: () => void; children: ReactNode; active?: boolean; onContextMenu?: () => void; title?: string }) {
  const common = {
    class: 'icon-btn',
    'aria-label': props.label,
    title: props.title ?? props.label,
    onClick: props.onClick,
    onContextMenu: props.onContextMenu ? (e: React.MouseEvent) => { e.preventDefault(); props.onContextMenu!() } : undefined,
  }
  return props.active
    ? <md-filled-icon-button {...common}>{props.children}</md-filled-icon-button>
    : <md-filled-tonal-icon-button {...common}>{props.children}</md-filled-tonal-icon-button>
}

/** Material 3 linear progress; null = indeterminate. */
export function ProgressBar({ fraction }: { fraction: number | null }) {
  return fraction == null
    ? <md-linear-progress class="md-progress" indeterminate />
    : <md-linear-progress class="md-progress" value={String(fraction)} />
}

export function SettingSwitch(props: { title: string; subtitle?: string | null; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-switch">
      <div className="setting-text">
        <div className="setting-title">{props.title}</div>
        {props.subtitle && <div className="setting-sub"><Txt>{props.subtitle}</Txt></div>}
      </div>
      <Switch checked={props.checked} onChange={props.onChange} label={props.title} />
    </div>
  )
}

export function SettingHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="setting-heading">
      <div className="setting-title">{title}</div>
      {subtitle && <div className="setting-sub"><Txt>{subtitle}</Txt></div>}
    </div>
  )
}

export const SettingSection = ({ title }: { title: string }) => <div className="setting-section">{title}</div>
export const Hint = ({ children }: { children: ReactNode }) => <p className="hint">{children}</p>

/** True while the dialog host is letting a dialog go: the Material dialog then plays its close. */
export const DialogClosing = createContext(false)

/** A Material 3 dialog (its own scrim and animations); Escape or a click outside closes it. */
export function Dialog({ onDismiss, children, wide }: { onDismiss: () => void; children: ReactNode; wide?: boolean }) {
  const closing = useContext(DialogClosing)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const closingRef = useRef(closing)
  closingRef.current = closing
  const ref = useElementEvent<HTMLElement & { show(): void; close(): void }>('close', () => { if (!closingRef.current) dismiss.current() })
  useEffect(() => { ref.current?.show() }, [])
  useEffect(() => { if (closing) ref.current?.close() }, [closing])
  return (
    <md-dialog ref={ref} class={'md-dialog' + (wide ? ' wide' : '')}>
      <div slot="content" className="dialog-content">{children}</div>
    </md-dialog>
  )
}

/** A short list of actions (long-press / right-click menus), as a Material list in a dialog. */
export function ActionsDialog(props: { title: string; subtitle?: string; actions: [string, () => void][]; onDismiss: () => void }) {
  return (
    <Dialog onDismiss={props.onDismiss}>
      <h2 className="dialog-title">{props.title}</h2>
      {props.subtitle && <div className="dialog-sub">{props.subtitle}</div>}
      <md-list class="dialog-actions">
        {props.actions.map(([label, fn]) => (
          <md-list-item key={label} type="button" onClick={() => { sound.tap(); fn() }}>
            <div slot="headline">{label}</div>
          </md-list-item>
        ))}
      </md-list>
    </Dialog>
  )
}

export function NameDialog(props: {
  title: string; subtitle?: string | null; initial: string; placeholder: string; allowEmpty?: boolean
  onDismiss: () => void; onSave: (name: string) => void
}) {
  const [text, setText] = useState(props.initial)
  const ok = props.allowEmpty || text.trim().length > 0
  const save = () => { if (ok) props.onSave(text.trim()) }
  const field = useElementEvent<HTMLElement & { value: string; focus(): void }>('input', (el) => setText(el.value))
  useEffect(() => {
    if (field.current) field.current.value = props.initial
    const t = window.setTimeout(() => field.current?.focus(), 150)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <Dialog onDismiss={props.onDismiss}>
      <h2 className="dialog-title">{props.title}</h2>
      {props.subtitle && <div className="dialog-sub">{props.subtitle}</div>}
      <md-outlined-text-field
        ref={field}
        class="text-field"
        label="Name"
        maxlength="40"
        placeholder={props.placeholder}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
      />
      <div className="dialog-buttons">
        <PillButton text="Cancel" onClick={props.onDismiss} />
        <PillButton text="Save" highlighted enabled={ok} onClick={save} />
      </div>
    </Dialog>
  )
}
