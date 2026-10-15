// The app's controls, in both designs (Settings > App UI > Design). Every control is one component
// with one API; it draws itself as a Material 3 widget (Google's @material/web, see ../md.tsx) when
// the Material design is on, and as our own glass control otherwise. Callers never know which.
// The colour strips (hue, saturation, kelvin) are ours in both: Material has no gradient slider.

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSetting, type Design } from '../../settings/store'
import { clamp, hsvCss, hsvToRgb, hexToHsv } from '../../lib/color'
import { sound } from '../sound'
import { Txt } from '../motion'
import { flag, Tabs as MdTabs, useElementEvent } from '../md'

/** Which design is on; a component using it re-renders only when the design changes. */
export const useDesign = (): Design => useSetting('design')

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

/** A plain 0..1 level (brightness, sensitivity, volume): a Material slider, or a grey strip in glass. */
export function LevelBar(props: {
  fraction: number; label: string; onFraction: (f: number) => void; onFinished: () => void
  /** Glass: the strip's colours and thumb. */
  stops?: string[]; thumbColor?: string
}) {
  const design = useDesign()
  const ref = useRef<HTMLElement & { value: number }>(null)
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const input = () => latest.current.onFraction(el.value / 100)
    const change = () => latest.current.onFinished()
    el.addEventListener('input', input)
    el.addEventListener('change', change)
    return () => { el.removeEventListener('input', input); el.removeEventListener('change', change) }
  }, [design])
  useEffect(() => {
    const el = ref.current
    if (el && Math.abs(el.value - props.fraction * 100) > 0.5) el.value = props.fraction * 100
  })
  if (design === 'MATERIAL') {
    return <md-slider ref={ref} class="md-slider" min="0" max="100" step="1" aria-label={props.label} value={String(Math.round(props.fraction * 100))} />
  }
  return (
    <GradientBar label={props.label} fraction={props.fraction} stops={props.stops ?? ['var(--on-bg-12)', 'var(--on-bg-55)']}
      thumbColor={props.thumbColor ?? 'var(--primary)'} onFraction={props.onFraction} onFinished={props.onFinished} />
  )
}

/** One of a few options (-1 = none): Material segmented buttons, or one pill with a sliding thumb. */
export function SegmentedPill(props: { options: string[]; selected: number; onSelect: (i: number) => void; disabled?: boolean }) {
  const design = useDesign()
  const n = props.options.length
  if (design === 'MATERIAL') {
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
  return (
    <div className={'pill' + (props.disabled ? ' disabled' : '')} role="radiogroup">
      <div
        className="pill-thumb"
        style={{
          width: `calc(${100 / n}% - ${(4 * (n - 1)) / n + 6 / n}px)`,
          transform: `translateX(calc(${Math.max(0, props.selected) * 100}% + ${Math.max(0, props.selected) * 4}px))`,
          opacity: props.selected >= 0 ? 1 : 0,
        }}
      />
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

/** Tabs: Material primary tabs, or the same pill as above in glass. */
export function TabBar(props: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  const design = useDesign()
  if (design === 'MATERIAL') return <MdTabs tabs={props.tabs} active={props.active} onChange={props.onChange} />
  return <SegmentedPill options={props.tabs} selected={props.active} onSelect={props.onChange} />
}

/** An on / off switch. */
export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const design = useDesign()
  return design === 'MATERIAL' ? <MdSwitch {...props} /> : (
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
function MdSwitch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const ref = useElementEvent<HTMLElement & { selected: boolean }>('change', (el) => { sound.tap(); props.onChange(el.selected) })
  useEffect(() => { if (ref.current) ref.current.selected = props.checked }, [props.checked])
  return <md-switch ref={ref} icons show-only-selected-icon aria-label={props.label} selected={flag(props.checked)} />
}

/** A card: frosted / refractive glass, or a Material tonal surface. */
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

/** A button: filled when highlighted, tonal otherwise. */
export function PillButton(props: { text: string; highlighted?: boolean; enabled?: boolean; onClick: () => void }) {
  const design = useDesign()
  const enabled = props.enabled ?? true
  const click = (e: React.MouseEvent) => { e.preventDefault(); sound.tap(); props.onClick() }
  const label = <Txt>{props.text}</Txt>
  if (design === 'MATERIAL') {
    return props.highlighted
      ? <md-filled-button class="md-button" disabled={flag(!enabled)} onClick={click}>{label}</md-filled-button>
      : <md-filled-tonal-button class="md-button" disabled={flag(!enabled)} onClick={click}>{label}</md-filled-tonal-button>
  }
  return (
    <button className={'pill-button' + (props.highlighted ? ' highlighted' : '')} disabled={!enabled} onClick={click}>
      {label}
    </button>
  )
}

/** A round icon button: tonal, or filled while `active` (the power button when on). */
export function CircleIconButton(props: { label: string; onClick: () => void; children: ReactNode; active?: boolean; onContextMenu?: () => void; title?: string }) {
  const design = useDesign()
  const common = {
    'aria-label': props.label,
    title: props.title ?? props.label,
    onClick: props.onClick,
    onContextMenu: props.onContextMenu ? (e: React.MouseEvent) => { e.preventDefault(); props.onContextMenu!() } : undefined,
  }
  if (design === 'MATERIAL') {
    return props.active
      ? <md-filled-icon-button class="icon-btn" {...common}>{props.children}</md-filled-icon-button>
      : <md-filled-tonal-icon-button class="icon-btn" {...common}>{props.children}</md-filled-tonal-icon-button>
  }
  return <button className={'circle-btn' + (props.active ? ' active' : '')} {...common}>{props.children}</button>
}

/** Progress; null = indeterminate. */
export function ProgressBar({ fraction }: { fraction: number | null }) {
  const design = useDesign()
  if (design === 'MATERIAL') {
    return fraction == null
      ? <md-linear-progress class="md-progress" indeterminate />
      : <md-linear-progress class="md-progress" value={String(fraction)} />
  }
  return (
    <div className="progress">
      <div className={'progress-fill' + (fraction == null ? ' indeterminate' : '')} style={fraction == null ? undefined : { width: `${fraction * 100}%` }} />
    </div>
  )
}

/** A selectable chip (a mode, a scene) with an optional icon; or, with `assist`, a plain action chip. */
export function Chip(props: {
  label: string; selected?: boolean; disabled?: boolean; icon?: ReactNode; title?: string; className?: string; assist?: boolean
  onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void
}) {
  const design = useDesign()
  const ref = useRef<HTMLElement & { selected: boolean }>(null)
  useEffect(() => { if (ref.current && design === 'MATERIAL') ref.current.selected = !!props.selected })
  if (design === 'MATERIAL') {
    if (props.assist) {
      return (
        <md-assist-chip class={props.className} label={props.label} title={props.title} onClick={props.onClick}>
          {props.icon && <span slot="icon" className="chip-icon">{props.icon}</span>}
        </md-assist-chip>
      )
    }
    return (
      <md-filter-chip
        ref={ref}
        class={props.className}
        label={props.label}
        title={props.title}
        disabled={flag(props.disabled)}
        selected={flag(props.selected)}
        onClick={(e: React.MouseEvent) => { e.preventDefault(); if (ref.current) ref.current.selected = !!props.selected; props.onClick() }}
        onContextMenu={props.onContextMenu}
      >
        {props.icon && <span slot="icon" className="chip-icon">{props.icon}</span>}
      </md-filter-chip>
    )
  }
  return (
    <button
      className={(props.className ?? '') + (props.selected ? ' selected' : '')}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
    >
      {props.icon}
      <span className="chip-text">{props.label}</span>
    </button>
  )
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

// ---------------------------------------------------------------------------
// Dialogs and text
// ---------------------------------------------------------------------------

/** True while the dialog host is letting a dialog go: the dialog then plays its close animation. */
export const DialogClosing = createContext(false)

/** A modal card (Material: a Material 3 dialog). Escape or a click outside closes it. */
export function Dialog({ onDismiss, children, wide }: { onDismiss: () => void; children: ReactNode; wide?: boolean }) {
  const design = useDesign()
  return design === 'MATERIAL'
    ? <MdDialog onDismiss={onDismiss} wide={wide}>{children}</MdDialog>
    : <GlassDialog onDismiss={onDismiss} wide={wide}>{children}</GlassDialog>
}

function MdDialog({ onDismiss, children, wide }: { onDismiss: () => void; children: ReactNode; wide?: boolean }) {
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

function GlassDialog({ onDismiss, children, wide }: { onDismiss: () => void; children: ReactNode; wide?: boolean }) {
  const closing = useContext(DialogClosing)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onDismiss])
  return (
    <div className={'scrim' + (closing ? ' closing' : '')} onPointerDown={(e) => { if (e.target === e.currentTarget) onDismiss() }}>
      <div className={'dialog dialog-content' + (wide ? ' wide' : '')} role="dialog" aria-modal>{children}</div>
    </div>
  )
}

/** A short list of actions (long-press / right-click menus). */
export function ActionsDialog(props: { title: string; subtitle?: string; actions: [string, () => void][]; onDismiss: () => void }) {
  const design = useDesign()
  return (
    <Dialog onDismiss={props.onDismiss}>
      <h2 className="dialog-title">{props.title}</h2>
      {props.subtitle && <div className="dialog-sub">{props.subtitle}</div>}
      {design === 'MATERIAL' ? (
        <md-list class="dialog-actions">
          {props.actions.map(([label, fn]) => (
            <md-list-item key={label} type="button" onClick={() => { sound.tap(); fn() }}>
              <div slot="headline">{label}</div>
            </md-list-item>
          ))}
        </md-list>
      ) : (
        <div className="dialog-actions">
          {props.actions.map(([label, fn]) => (
            <button key={label} className="action-row" onClick={() => { sound.tap(); fn() }}>{label}</button>
          ))}
        </div>
      )}
    </Dialog>
  )
}

/** A text input: our own in glass, Material's outlined field otherwise. Never the browser's. */
export function TextField(props: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
  onEnter?: () => void; autoFocus?: boolean; mono?: boolean
}) {
  const design = useDesign()
  return design === 'MATERIAL' ? <MdTextField {...props} /> : (
    <label className="field">
      <span>{props.label}</span>
      <input
        className="text-field"
        style={props.mono ? { fontFamily: "'JetBrains Mono', monospace" } : undefined}
        autoFocus={props.autoFocus}
        maxLength={props.maxLength}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); props.onEnter?.() } }}
      />
    </label>
  )
}

function MdTextField(props: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
  onEnter?: () => void; autoFocus?: boolean
}) {
  const field = useElementEvent<HTMLElement & { value: string; focus(): void }>('input', (el) => props.onChange(el.value))
  useEffect(() => {
    if (field.current && field.current.value !== props.value) field.current.value = props.value
  }, [props.value])
  useEffect(() => {
    if (!props.autoFocus) return
    const t = window.setTimeout(() => field.current?.focus(), 150)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <md-outlined-text-field
      ref={field}
      class="text-field"
      label={props.label}
      maxlength={props.maxLength}
      value={props.value}
      placeholder={props.placeholder}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); props.onEnter?.() } }}
    />
  )
}

export function NameDialog(props: {
  title: string; subtitle?: string | null; initial: string; placeholder: string; allowEmpty?: boolean
  onDismiss: () => void; onSave: (name: string) => void
}) {
  const [text, setText] = useState(props.initial)
  const ok = props.allowEmpty || text.trim().length > 0
  const save = () => { if (ok) props.onSave(text.trim()) }
  return (
    <Dialog onDismiss={props.onDismiss}>
      <h2 className="dialog-title">{props.title}</h2>
      {props.subtitle && <div className="dialog-sub">{props.subtitle}</div>}
      <TextField label="Name" value={text} onChange={setText} placeholder={props.placeholder} maxLength={40} onEnter={save} autoFocus />
      <div className="dialog-buttons">
        <PillButton text="Cancel" onClick={props.onDismiss} />
        <PillButton text="Save" highlighted enabled={ok} onClick={save} />
      </div>
    </Dialog>
  )
}

const hexFrom = (h: number, s: number, v: number) =>
  '#' + hsvToRgb(h, s, v).map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')

/** Pick any colour: hue, saturation and value strips plus a hex field. Replaces the browser's colour input. */
export function ColourPickerDialog(props: { initial: string; title?: string; onDismiss: () => void; onPick: (hex: string) => void }) {
  const start = /^#[0-9a-f]{6}$/i.test(props.initial) ? hexToHsv(props.initial) : [260, 0.6, 0.76] as [number, number, number]
  const [h, setH] = useState(start[0])
  const [s, setS] = useState(start[1])
  const [v, setV] = useState(start[2])
  const [typed, setTyped] = useState<string | null>(null)
  const hex = hexFrom(h, s, v)
  const nop = () => {}
  const typedHex = (t: string) => {
    setTyped(t)
    const m = /^#?([0-9a-f]{6})$/i.exec(t.trim())
    if (m) { const [nh, ns, nv] = hexToHsv('#' + m[1]); setH(nh); setS(ns); setV(nv) }
  }
  return (
    <Dialog onDismiss={props.onDismiss}>
      <h2 className="dialog-title">{props.title ?? 'Pick a colour'}</h2>
      <div className="cp-preview" style={{ background: hex }} />
      <SliderLabel text="Hue" value={`${Math.round(h)}°`} />
      <GradientBar label="Hue" fraction={h / 360} stops={[0, 60, 120, 180, 240, 300, 360].map((x) => hsvCss(x, 1))} thumbColor={hsvCss(h, 1)}
        onFraction={(f) => { setH(clamp(f, 0, 1) * 360); setTyped(null) }} onFinished={nop} />
      <SliderLabel text="Saturation" value={`${Math.round(s * 100)} %`} />
      <GradientBar label="Saturation" fraction={s} stops={[hsvCss(h, 0, v), hsvCss(h, 1, v)]} thumbColor={hex}
        onFraction={(f) => { setS(f); setTyped(null) }} onFinished={nop} />
      <SliderLabel text="Brightness" value={`${Math.round(v * 100)} %`} />
      <GradientBar label="Brightness" fraction={v} stops={['#000', hsvCss(h, s, 1)]} thumbColor={hex}
        onFraction={(f) => { setV(f); setTyped(null) }} onFinished={nop} />
      <TextField label="Hex" value={typed ?? hex} onChange={typedHex} maxLength={7} mono onEnter={() => props.onPick(hex)} />
      <div className="dialog-buttons">
        <PillButton text="Cancel" onClick={props.onDismiss} />
        <PillButton text="Use colour" highlighted onClick={() => props.onPick(hex)} />
      </div>
    </Dialog>
  )
}
