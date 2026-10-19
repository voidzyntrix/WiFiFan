// The app's controls, in both designs (Settings > App UI > Design). Every control is one component
// with one API; it draws itself as a Material 3 widget (Google's @material/web, see ../md.tsx) when
// the Material design is on, and as our own glass control otherwise. Callers never know which.
// The colour strips (hue, saturation, kelvin) are ours in both: Material has no gradient slider.

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSetting, type Design } from '../../settings/store'
import { clamp, hsvCss, hsvToRgb, hexToHsv, gradientAt } from '../../lib/color'
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
  /** A plain level (brightness, volume): Material 3 Expressive draws it two-tone, active and inactive track. */
  level?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const material = useDesign() === 'MATERIAL'
  const [dragging, setDragging] = useState(false)   // while held the thumb follows the pointer exactly
  const [over, setOver] = useState(0)               // rubber-band drift past an end while held
  const step = useRef(-1)
  const finishTimer = useRef(0)
  const grab = useRef(0)   // pointer-to-pebble offset (px) from a drag that started on the pebble itself
  const report = (f: number) => {
    const c = Math.min(1, Math.max(0, f))
    const s = Math.round(c * 20)            // a tick every 5 %
    if (step.current >= 0 && s !== step.current) sound.tick()
    step.current = s
    props.onFraction(c)
  }
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    // material's track is inset by the handle's 16px reach (styles.css), so the pointer maps to that span
    const [inset, span] = material ? [16, r.width - 32] : [0, r.width]
    return (clientX - r.left - inset) / span
  }
  // Wheel and keys finish a moment after the last nudge, like letting go of a drag.
  const finishSoon = () => {
    window.clearTimeout(finishTimer.current)
    finishTimer.current = window.setTimeout(() => props.onFinished(), 250)
  }
  // the thumb shows the colour of the gradient right beneath it (level bars are solid primary).
  // it's a registered colour property, so it glides to a new colour exactly like the track stops and
  // follows the pointer instantly while held.
  const underThumb = props.level ? 'rgb(var(--mdui-color-primary))' : gradientAt(props.stops, props.fraction) ?? 'rgb(var(--mdui-color-primary))'
  return (
    <div
      ref={ref}
      className={'gbar' + (dragging ? ' dragging' : '') + (material ? ' m3e' : '') + (props.level ? ' level' : '')}
      style={{ ['--pos' as string]: `${props.fraction * 100}%`, ['--thumb-fill' as string]: underThumb, ['--over' as string]: `${over}px` }}
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
        setOver(0)
        const onThumb = material && !!(e.target as Element).closest?.('.gbar-thumb')
        if (!onThumb) {
          grab.current = 0
          report(at(e.clientX))          // a press on the track jumps to the finger, exactly as before
        } else {
          // grabbing the pebble: keep wherever on it you held it — it follows with that offset,
          // never snapping its centre under the finger
          const r = ref.current!.getBoundingClientRect()
          grab.current = e.clientX - (r.left + 16 + (r.width - 32) * props.fraction)
        }
      }}
      onPointerMove={(e) => {
        if (!ref.current!.hasPointerCapture(e.pointerId)) return
        const f = at(e.clientX - grab.current)
        report(f)
        // rubber band: pulled past an end the square drifts along the finger, damped (12px*saturating
        // on the raw overtravel) and springs home on release; the value itself stays clamped
        const extra = f < 0 ? f : f > 1 ? f - 1 : 0
        setOver(12 * Math.tanh((extra * (ref.current!.getBoundingClientRect().width - 32)) / 12))
      }}
      onPointerUp={(e) => {
        if (!ref.current!.hasPointerCapture(e.pointerId)) return
        ref.current!.releasePointerCapture(e.pointerId)
        setDragging(false)
        setOver(0)
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
      <div className="gbar-thumb" style={{ left: material ? `calc(16px + (100% - 32px) * ${props.fraction})` : `${props.fraction * 100}%` }}>
        {/* material rides within the track's own inset span so the pebble never pokes past the cards */}
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
    // Material 3 Expressive slider: thick two-tone track, a gap around a slim bar handle, a stop dot at the end
    return <GradientBar label={props.label} fraction={props.fraction} stops={['#000', '#000']} thumbColor="transparent" level
      onFraction={props.onFraction} onFinished={props.onFinished} />
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
    return <M3eButtonGroup {...props} />
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
  const ref = useElementEvent<HTMLElement & { checked: boolean }>('change', (el) => { sound.tap(); props.onChange(el.checked) })
  useEffect(() => { if (ref.current) ref.current.checked = props.checked }, [props.checked])
  return <mdui-switch ref={ref} aria-label={props.label} checked={flag(props.checked)} />
}

/**
 * Material 3 Expressive connected button group: separate pieces with small inner corners; the chosen
 * one turns fully round (the shapes move with a spring).
 */
function M3eButtonGroup(props: { options: string[]; selected: number; onSelect: (i: number) => void; disabled?: boolean }) {
  return (
    <div className={'m3e-group' + (props.disabled ? ' disabled' : '')} role="radiogroup">
      {props.options.map((o, i) => (
        <button
          key={o}
          role="radio"
          aria-checked={i === props.selected}
          disabled={props.disabled}
          className={'m3e-seg' + (i === props.selected ? ' on' : '')}
          onClick={() => { if (i !== props.selected) { sound.tap(); props.onSelect(i) } }}
        >
          <span className="m3e-seg-label">{o}</span>
        </button>
      ))}
    </div>
  )
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
      ? <mdui-button variant="filled" class="md-button" disabled={flag(!enabled)} onClick={click}>{label}</mdui-button>
      : <mdui-button variant="tonal" class="md-button" disabled={flag(!enabled)} onClick={click}>{label}</mdui-button>
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
      ? <mdui-button-icon variant="filled" class="icon-btn" {...common}>{props.children}</mdui-button-icon>
      : <mdui-button-icon variant="tonal" class="icon-btn" {...common}>{props.children}</mdui-button-icon>
  }
  return <button className={'circle-btn' + (props.active ? ' active' : '')} {...common}>{props.children}</button>
}

/** Progress; null = indeterminate. */
export function ProgressBar({ fraction }: { fraction: number | null }) {
  const design = useDesign()
  if (design === 'MATERIAL') {
    // Material 3's wavy progress: the filled part is a moving squiggle, the rest a flat track
    return (
      <div className={'wavy' + (fraction == null ? ' indeterminate' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={fraction == null ? undefined : Math.round(fraction * 100)}>
        <span className="wavy-fill" style={fraction == null ? undefined : { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
        <span className="wavy-track" />
      </div>
    )
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
        <mdui-chip variant="assist" class={props.className} title={props.title} onClick={props.onClick}>
          {props.icon && <span slot="icon" className="chip-icon">{props.icon}</span>}
          {props.label}
        </mdui-chip>
      )
    }
    return (
      <mdui-chip
        ref={ref}
        variant="filter"
        class={props.className}
        title={props.title}
        disabled={flag(props.disabled)}
        selectable=""
        selected={flag(props.selected)}
        onClick={(e: React.MouseEvent) => { e.preventDefault(); if (ref.current) ref.current.selected = !!props.selected; props.onClick() }}
        onContextMenu={props.onContextMenu}
      >
        {props.icon && <span slot="icon" className="chip-icon">{props.icon}</span>}
        {props.label}
      </mdui-chip>
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
  const ref = useElementEvent<HTMLElement & { open: boolean }>('close', () => { if (!closingRef.current) dismiss.current() })
  useEffect(() => { const t = requestAnimationFrame(() => { if (ref.current) ref.current.open = true }); return () => cancelAnimationFrame(t) }, [])
  useEffect(() => { if (closing && ref.current) ref.current.open = false }, [closing])
  return (
    <mdui-dialog ref={ref} class={'md-dialog' + (wide ? ' wide' : '')} close-on-overlay-click close-on-esc>
      <div className="dialog-content">{children}</div>
    </mdui-dialog>
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
        <mdui-list class="dialog-actions">
          {props.actions.map(([label, fn]) => (
            <mdui-list-item key={label} rounded headline={label} onClick={() => { sound.tap(); fn() }} />
          ))}
        </mdui-list>
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
  onEnter?: () => void; autoFocus?: boolean; mono?: boolean; password?: boolean
}) {
  const design = useDesign()
  return design === 'MATERIAL' ? <MdTextField {...props} /> : (
    <label className="field">
      <span>{props.label}</span>
      <input
        className="text-field"
        type={props.password ? 'password' : 'text'}
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
  onEnter?: () => void; autoFocus?: boolean; password?: boolean
}) {
  const field = useElementEvent<HTMLElement & { value: string; focus(): void }>('input', (el) => props.onChange(el.value))
  useEffect(() => {
    if (field.current && field.current.value !== props.value) field.current.value = props.value
  }, [props.value])
  useEffect(() => {
    if (!props.autoFocus) return
    const t = window.setTimeout(() => field.current?.focus(), 250)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <mdui-text-field
      ref={field}
      variant="outlined"
      class="text-field"
      label={props.label}
      type={props.password ? 'password' : 'text'}
      toggle-password={props.password ? '' : undefined}
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

/** Material 3 Expressive's loading indicator: a shape that keeps morphing (cookie, burst, pentagon, clover) as it turns. */
export function LoadingIndicator({ size = 40, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <span className="m3e-loading" role="progressbar" aria-label={label} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <path className="m3e-loading-shape" d="M50.0 8.0 L56.2 2.9 L62.0 5.3 L65.2 13.3 L68.0 18.8 L74.2 18.5 L82.7 17.3 L87.7 21.1 L86.4 29.0 L83.7 36.0 L86.5 40.2 L93.9 44.2 L98.0 50.0 L93.9 55.8 L86.5 59.8 L83.7 64.0 L86.4 71.0 L87.7 78.9 L82.7 82.7 L74.2 81.5 L68.0 81.2 L65.2 86.7 L62.0 94.7 L56.2 97.1 L50.0 92.0 L45.2 86.1 L40.2 86.5 L33.0 90.9 L26.0 91.6 L23.0 85.1 L23.3 76.7 L21.1 72.2 L13.6 71.0 L6.1 68.2 L5.3 62.0 L10.6 55.2 L14.0 50.0 L10.6 44.8 L5.3 38.0 L6.1 31.8 L13.6 29.0 L21.1 27.8 L23.3 23.3 L23.0 14.9 L26.0 8.4 L33.0 9.1 L40.2 13.5 L45.2 13.9 Z" />
      </svg>
    </span>
  )
}
