// Material You widgets: Google's Material 3 web components (@material/web), registered here, typed for
// JSX, and wrapped where React needs help (it passes custom elements attributes, not properties,
// and doesn't hear their custom events). Their colours come from the --md-sys-color-* tokens that
// theme.ts sets from the Material You scheme.

import { useEffect, useRef } from 'react'
import '@material/web/button/filled-button.js'
import '@material/web/button/filled-tonal-button.js'
import '@material/web/button/text-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/iconbutton/icon-button.js'
import '@material/web/iconbutton/filled-icon-button.js'
import '@material/web/iconbutton/filled-tonal-icon-button.js'
import '@material/web/switch/switch.js'
import '@material/web/tabs/tabs.js'
import '@material/web/tabs/primary-tab.js'
import '@material/web/chips/filter-chip.js'
import '@material/web/chips/assist-chip.js'
import '@material/web/dialog/dialog.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/progress/linear-progress.js'
import '@material/web/slider/slider.js'
import '@material/web/fab/fab.js'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'
import '@material/web/ripple/ripple.js'
import '@material/web/focus/md-focus-ring.js'
import '@material/web/labs/segmentedbutton/outlined-segmented-button.js'
import '@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [tag: `md-${string}`]: any
    }
  }
}

/** A boolean attribute: present when true, absent when false (React would write "false"). */
export const flag = (on: boolean | undefined) => (on ? true : undefined)

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
  const ref = useElementEvent<HTMLElement & { activeTabIndex: number }>('change', (el) => {
    if (el.activeTabIndex !== props.active) props.onChange(el.activeTabIndex)
  })
  useEffect(() => { if (ref.current && ref.current.activeTabIndex !== props.active) ref.current.activeTabIndex = props.active }, [props.active, props.tabs.length])
  return (
    <md-tabs ref={ref} class="md-tabs">
      {props.tabs.map((t) => <md-primary-tab key={t}>{t}</md-primary-tab>)}
    </md-tabs>
  )
}
