// The colour schemes (the Android app's Theme.kt / Color.kt), applied as CSS variables on <html>.
// styles.css only ever uses these variables, so a new scheme only needs a new palette here.

import { useEffect, useState } from 'react'
import { cornerScale, type Settings } from '../settings/store'

interface Palette { bg: string; surface: string; onBg: string; primary: string; onPrimary: string; error: string }

const MONO_DARK: Palette = { bg: '#0E0E0E', surface: '#1A1A1A', onBg: '#F2F2F2', primary: '#F2F2F2', onPrimary: '#111111', error: '#F2B8B5' }
const MONO_LIGHT: Palette = { bg: '#F3F3F3', surface: '#FFFFFF', onBg: '#151515', primary: '#151515', onPrimary: '#FFFFFF', error: '#B3261E' }
// "Tinted": the phone takes its accent from the wallpaper (Material You); Windows gets Material's baseline.
const TINT_DARK: Palette = { bg: '#141414', surface: '#1F1F1F', onBg: '#E4E4E4', primary: '#D0BCFF', onPrimary: '#381E72', error: '#F2B8B5' }
const TINT_LIGHT: Palette = { bg: '#F5F0E8', surface: '#EDE8DF', onBg: '#1E1A14', primary: '#6750A4', onPrimary: '#FFFFFF', error: '#B3261E' }

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

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

/** Applies the scheme to <html> and returns the two colours canvases need. */
export function applyTheme(s: Settings, systemDark: boolean): { onBg: string; primary: string; bg: string } {
  const dark = s.themeMode === 2 || (s.themeMode === 0 && systemDark)
  let p: Palette
  if (s.colorScheme === 'MONOCHROME') p = dark ? MONO_DARK : MONO_LIGHT
  else if (s.colorScheme === 'TINTED') p = dark ? TINT_DARK : TINT_LIGHT
  else {
    const accent = s.accentColor
    const base = dark ? { bg: '#141218', surface: '#211F26', onBg: '#E6E0E9', error: '#F2B8B5' } : { bg: '#FEF7FF', surface: '#F3EDF7', onBg: '#1D1B20', error: '#B3261E' }
    p = { ...base, primary: accent, onPrimary: luminance(accent) > 0.5 ? '#000000' : '#FFFFFF' }
  }
  if (dark && s.pureBlack) p = { ...p, bg: '#000000', surface: '#0A0A0A' }
  const mono = s.colorScheme === 'MONOCHROME'
  const r = document.documentElement.style
  const mix = (a: number) => `color-mix(in srgb, ${p.onBg} ${a}%, transparent)`
  r.setProperty('--bg', p.bg)
  r.setProperty('--surface', p.surface)
  r.setProperty('--on-bg', p.onBg)
  for (const a of [4, 5, 6, 7, 8, 10, 12, 14, 18, 30, 45, 50, 55, 60, 70, 85]) r.setProperty(`--on-bg-${a}`, mix(a))
  r.setProperty('--primary', p.primary)
  r.setProperty('--on-primary', p.onPrimary)
  r.setProperty('--error', p.error)
  // Selected / active controls: the accent, or in Monochrome a soft translucent grey.
  r.setProperty('--active', mono ? mix(16) : p.primary)
  r.setProperty('--active-strong', mono ? mix(20) : p.primary)
  r.setProperty('--on-active', mono ? p.onBg : p.onPrimary)
  r.setProperty('--corner', String(cornerScale(s)))
  r.setProperty('--circle', String(Math.min(1, cornerScale(s))))
  r.setProperty('--led-radius', s.roundLedPreview ? '50%' : `${Math.min(50, 50 * cornerScale(s))}%`)
  r.setProperty('--font', s.monoFont ? "'JetBrains Mono', ui-monospace, monospace" : "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif")
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.glass = s.refractiveGlass ? 'refractive' : 'frosted'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', p.bg)
  return { onBg: p.onBg, primary: p.primary, bg: p.bg }
}
