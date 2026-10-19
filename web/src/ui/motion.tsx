// Motion helpers: nothing in Glow changes without an animation.
//  - useExit / Presence: things that appear and disappear grow in and shrink away instead of popping
//  - Swap: content that is replaced by other content cross-fades (and the height follows)
//  - Txt: a piece of text that changes fades in from a blur
//  - useLeavingList: list items that are removed stay a moment to animate out
//  - useFlip: the items of a list slide to their new places when the list changes
// The look of each lives in styles.css (.presence, .swap, .txt, .leaving, ...).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/** How long the exit animations in styles.css take (ms); the element stays mounted that long. */
export const EXIT_MS = 300

/** Keeps something mounted while it animates out: `mounted` is what to render, `leaving` what to style. */
export function useExit(show: boolean, ms = EXIT_MS) {
  const [mounted, setMounted] = useState(show)
  useEffect(() => {
    if (show) { setMounted(true); return }
    const t = window.setTimeout(() => setMounted(false), ms)
    return () => window.clearTimeout(t)
  }, [show, ms])
  return { mounted: show || mounted, leaving: !show }
}

/**
 * Content that comes and goes. Grows open (and fades in) when `show` turns true, and folds shut
 * before it unmounts when it turns false. The gap the parent leaves between its children is
 * given as --gap (set on the parent in styles.css) so the space opens and closes with it.
 */
export function Presence({ show, children, className = '' }: { show: boolean; children: ReactNode; className?: string }) {
  const { mounted, leaving } = useExit(show)
  const last = useRef(children)
  if (show) last.current = children
  // animate in only when it turns on after mounting, not when the screen first appears
  const [prevShow, setPrevShow] = useState(show)
  const [entering, setEntering] = useState(false)
  if (show !== prevShow) { setPrevShow(show); setEntering(show) }
  if (!mounted) return null
  return (
    <div
      className={'presence' + (entering ? ' enter' : '') + (leaving ? ' leaving' : '') + (className ? ' ' + className : '')}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) setEntering(false) }}
    >
      <div className="presence-inner">{show ? children : last.current}</div>
    </div>
  )
}

/** Cross-fades when `k` changes: the old content fades out on top while the new fades in, and the height glides.
 *  `dir` (+1 forward, -1 back) slides it along the x axis instead, like the app's screens. */
export function Swap({ k, children, className = '', dir = 0 }: { k: string | number; children: ReactNode; className?: string; dir?: number }) {
  const last = useRef<{ k: string | number; node: ReactNode }>({ k, node: children })
  const [leaving, setLeaving] = useState<{ k: string | number; node: ReactNode; dir: number } | null>(null)
  const [prevK, setPrevK] = useState(k)
  if (k !== prevK) { setPrevK(k); setLeaving({ ...last.current, dir }) }
  last.current = { k, node: children }

  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setLeaving(null), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [leaving])

  const wrap = useRef<HTMLDivElement>(null)
  const height = useRef<number | null>(null)
  const gliding = useRef(false)
  const firstK = useRef(k)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el || k === firstK.current) return
    firstK.current = k
    const from = height.current
    el.style.height = ''
    const to = el.offsetHeight
    if (from == null || Math.abs(from - to) < 1) return
    gliding.current = true
    el.style.height = from + 'px'
    el.style.overflow = 'hidden'
    void el.offsetHeight
    el.style.transition = 'height 0.38s cubic-bezier(.2,.8,.2,1)'
    el.style.height = to + 'px'
    const done = window.setTimeout(() => {
      el.style.height = ''; el.style.overflow = ''; el.style.transition = ''
      gliding.current = false
      height.current = el.offsetHeight
    }, 400)
    return () => window.clearTimeout(done)
  }, [k])
  useLayoutEffect(() => {
    if (!gliding.current && wrap.current) height.current = wrap.current.offsetHeight
  })

  const slide = leaving ? (leaving.dir > 0 ? ' fwd' : leaving.dir < 0 ? ' back' : '') : ''
  return (
    <div ref={wrap} className={'swap' + slide + (className ? ' ' + className : '')}>
      {leaving && <div key={'out' + leaving.k} className="swap-out" aria-hidden>{leaving.node}</div>}
      <div key={k} className={'swap-in' + (leaving ? ' changed' : '')}>{children}</div>
    </div>
  )
}

/** Text that fades in (out of a blur) each time it changes. */
export function Txt({ children }: { children: ReactNode }) {
  const [text, setText] = useState(children)
  const [n, setN] = useState(0)
  const same = String(children) === String(text)
  if (!same) { setText(children); setN(n + 1) }
  return <span key={n} className={n > 0 ? 'txt' : undefined}>{children}</span>
}

interface Entry<T> { key: string; item: T; leaving: boolean }

/** The list as it should be drawn: removed items stay (leaving) until their exit animation is done. */
export function useLeavingList<T>(items: T[], keyOf: (t: T) => string, ms = EXIT_MS): { item: T; key: string; leaving: boolean }[] {
  const sig = items.map(keyOf).join('\u0000')
  const [entries, setEntries] = useState<Entry<T>[]>(() => items.map((item) => ({ key: keyOf(item), item, leaving: false })))
  const [prevSig, setPrevSig] = useState(sig)
  if (sig !== prevSig) {
    setPrevSig(sig)
    const next = new Set(items.map(keyOf))
    const out: Entry<T>[] = []
    let oi = 0
    for (const item of items) {
      const key = keyOf(item)
      const j = entries.findIndex((e, idx) => idx >= oi && e.key === key)
      if (j >= 0) {
        for (let i = oi; i < j; i++) if (!next.has(entries[i].key)) out.push({ ...entries[i], leaving: true })
        oi = j + 1
      }
      out.push({ key, item, leaving: false })
    }
    for (let i = oi; i < entries.length; i++) if (!next.has(entries[i].key)) out.push({ ...entries[i], leaving: true })
    setEntries(out)
  }
  const anyLeaving = entries.some((e) => e.leaving)
  useEffect(() => {
    if (!anyLeaving) return
    const t = window.setTimeout(() => setEntries((es) => es.filter((e) => !e.leaving)), ms)
    return () => window.clearTimeout(t)
  }, [anyLeaving, entries, ms])

  const latest = new Map(items.map((i) => [keyOf(i), i]))
  return entries.map((e) => ({ key: e.key, leaving: e.leaving, item: e.leaving ? e.item : latest.get(e.key) ?? e.item }))
}

/**
 * FLIP: when the children of `ref` (marked data-flip="<key>") end up somewhere else after a
 * render, they slide from where they were. Window resizes just move them.
 */
export function useFlip(ref: RefObject<HTMLElement>) {
  const before = useRef(new Map<string, { x: number; y: number }>())
  const width = useRef(window.innerWidth)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const resized = width.current !== window.innerWidth
    width.current = window.innerWidth
    const now = new Map<string, { x: number; y: number }>()
    for (const el of Array.from(root.children) as HTMLElement[]) {
      const key = el.dataset.flip
      if (!key) continue
      const pos = { x: el.offsetLeft, y: el.offsetTop }
      now.set(key, pos)
      const old = before.current.get(key)
      if (old && !resized && (Math.abs(old.x - pos.x) > 1 || Math.abs(old.y - pos.y) > 1)) {
        el.animate(
          [{ transform: `translate(${old.x - pos.x}px, ${old.y - pos.y}px)` }, { transform: 'none' }],
          { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' },
        )
      }
    }
    before.current = now
  })
}

/** A short fade-and-blur on an element (a change nothing else can animate, such as the font). */
export function pulse(el: Element | null) {
  el?.animate(
    [{ opacity: 0.2, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0)' }],
    { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
  )
}
