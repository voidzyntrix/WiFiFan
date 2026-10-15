// Material You: the app's colours are a Material 3 dynamic scheme (Google's material-color-utilities)
// grown from one source colour: the system's (Android: the wallpaper's colour; Windows: the accent
// colour), one picked in Settings, or none (Monochrome). Applied as CSS variables on <html>;
// styles.css only ever uses these variables.

import { useEffect, useState } from 'react'
import {
  argbFromHex, hexFromArgb, Hct, MaterialDynamicColors as C, SchemeMonochrome, SchemeTonalSpot, type DynamicScheme,
} from '@material/material-color-utilities'
import { platform } from '../platform'
import { cornerUnit, DEFAULT_ACCENT, type Settings } from '../settings/store'

export function useSystemDark() {
  const q = window.matchMedia('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(q.matches)
  useEffect(() => {
    const on = () => setDark(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return dark
}

/** The system's accent colour, read again whenever the app comes back to the front. */
export function useSystemAccent() {
  const [accent, setAccent] = useState<string | null>(null)
  useEffect(() => {
    const read = () => { void platform.accentColor().then(setAccent, () => {}) }
    read()
    const vis = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('focus', read)
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', read) }
  }, [])
  return accent
}

const MD_COLORS = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest', 'surfaceTint',
  'inverseSurface', 'inverseOnSurface', 'outline', 'outlineVariant', 'shadow', 'scrim',
]

/** Applies the scheme to <html> and returns the colours canvases need. */
export function applyTheme(s: Settings, systemDark: boolean, systemAccent: string | null): { onBg: string; primary: string; bg: string } {
  const dark = s.themeMode === 2 || (s.themeMode === 0 && systemDark)
  const seed = s.colorSource === 'SYSTEM' ? systemAccent ?? s.accentColor ?? DEFAULT_ACCENT : s.accentColor || DEFAULT_ACCENT
  const source = Hct.fromInt(argbFromHex(seed))
  const scheme: DynamicScheme = s.colorSource === 'MONOCHROME' ? new SchemeMonochrome(source, dark, 0) : new SchemeTonalSpot(source, dark, 0)
  const hex = (c: typeof C.surface) => hexFromArgb(c.getArgb(scheme))

  let bg = hex(C.surface), surface = hex(C.surfaceContainer)
  if (dark && s.pureBlack) { bg = '#000000'; surface = '#0a0a0a' }
  const onBg = hex(C.onSurface)
  const r = document.documentElement.style
  const mix = (a: number) => `color-mix(in srgb, ${onBg} ${a}%, transparent)`
  r.setProperty('--bg', bg)
  r.setProperty('--surface', surface)
  r.setProperty('--on-bg', onBg)
  for (const a of [4, 5, 6, 7, 8, 10, 12, 14, 18, 30, 45, 50, 55, 60, 70, 85]) r.setProperty(`--on-bg-${a}`, mix(a))
  r.setProperty('--primary', hex(C.primary))
  r.setProperty('--on-primary', hex(C.onPrimary))
  r.setProperty('--error', hex(C.error))
  // Selected / active controls: Material's secondary container; the main buttons: the primary container.
  r.setProperty('--active', hex(C.secondaryContainer))
  r.setProperty('--on-active', hex(C.onSecondaryContainer))
  r.setProperty('--active-strong', hex(C.primaryContainer))
  r.setProperty('--on-active-strong', hex(C.onPrimaryContainer))
  // The Material 3 widgets (@material/web) read the whole scheme as --md-sys-color-* tokens.
  for (const name of MD_COLORS) {
    const kebab = name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
    r.setProperty(`--md-sys-color-${kebab}`, hex((C as unknown as Record<string, typeof C.surface>)[name]))
  }
  if (dark && s.pureBlack) {
    r.setProperty('--md-sys-color-surface', bg)
    r.setProperty('--md-sys-color-surface-container-high', '#141414')
    r.setProperty('--md-sys-color-surface-container-highest', '#1c1c1c')
  }
  r.setProperty('--md-sys-typescale-body-font', "'Roboto', system-ui, sans-serif")
  r.setProperty('--md-ref-typeface-brand', "'Roboto', system-ui, sans-serif")
  r.setProperty('--md-ref-typeface-plain', "'Roboto', system-ui, sans-serif")
  // Tonal surfaces for the Material design's cards, sheets and tiles.
  r.setProperty('--card', hex(C.surfaceContainerLow))
  r.setProperty('--card-high', hex(C.surfaceContainerHigh))
  r.setProperty('--card-highest', hex(C.surfaceContainerHighest))
  r.setProperty('--outline', hex(C.outlineVariant))
  if (dark && s.pureBlack) { r.setProperty('--card', '#0d0d0d'); r.setProperty('--card-high', '#141414'); r.setProperty('--card-highest', '#1c1c1c') }
  r.setProperty('--u', String(cornerUnit(s)))
  r.setProperty('--led-radius', s.roundLedPreview ? '50%' : `${Math.min(50, 50 * cornerUnit(s))}%`)
  r.setProperty('--font', s.monoFont ? "'JetBrains Mono', ui-monospace, monospace" : "'Roboto', system-ui, sans-serif")
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  platform.systemBars?.(dark)
  const root = document.documentElement.dataset
  root.design = s.design === 'MATERIAL' ? 'material' : 'glass'
  root.glass = s.refractiveGlass && !s.lightEffects ? 'refractive' : 'frosted'
  root.effects = s.lightEffects || s.design === 'MATERIAL' ? 'light' : 'full'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg)
  return { onBg, primary: hex(C.primary), bg }
}
