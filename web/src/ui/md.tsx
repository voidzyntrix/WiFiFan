// Material You widgets: mdui (mdui.org), a Material Design 3 component library on web components,
// registered here, typed for JSX, and wrapped where React needs help (it passes custom elements
// attributes, not properties, and doesn't hear their custom events). Their colours come from the
// --mdui-color-* tokens that theme.ts sets from the Material You scheme.
// Only the components the app renders are registered: every definition runs at boot.

import { useEffect, useRef } from 'react'
import 'mdui/mdui.css'
import 'mdui/components/button.js'
import 'mdui/components/button-icon.js'
import 'mdui/components/switch.js'
import 'mdui/components/tabs.js'
import 'mdui/components/tab.js'
import 'mdui/components/chip.js'
import 'mdui/components/dialog.js'
import 'mdui/components/text-field.js'
import 'mdui/components/fab.js'
import 'mdui/components/list.js'
import 'mdui/components/list-item.js'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [tag: `mdui-${string}`]: any
    }
  }
}

/** A boolean attribute: present when true, absent when false (React would write "false"). */
export const flag = (on: boolean | undefined) => (on ? '' : undefined)

/** Listens to a custom element's event. */
export function useElementEvent<T extends HTMLElement>(event: string, fn: (el: T, e: Event) => void) {
  const ref = useRef<T>(null)
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = (e: Event) => latest.current(el, e)
    el.addEventListener(event, h)
    return () => el.removeEventListener(event, h)
  }, [event])
  return ref
}

/** Material 3 primary tabs. */
export function Tabs(props: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  const ref = useElementEvent<HTMLElement & { value: string }>('change', (el) => {
    const i = Number(el.value)
    if (!Number.isNaN(i) && i !== props.active) props.onChange(i)
  })
  useEffect(() => { if (ref.current && ref.current.value !== String(props.active)) ref.current.value = String(props.active) }, [props.active, props.tabs.length])
  return (
    <mdui-tabs ref={ref} class="md-tabs" variant="primary" value={String(props.active)} full-width>
      {props.tabs.map((t, i) => <mdui-tab key={t} value={String(i)}>{t}</mdui-tab>)}
    </mdui-tabs>
  )
}
