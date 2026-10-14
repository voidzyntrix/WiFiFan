// Short messages at the bottom of the window (the Android app's Toasts).

import { useSyncExternalStore } from 'react'

export interface Toast { id: number; text: string }

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, ms = 3500) {
  const t = { id: nextId++, text }
  toasts = [...toasts.slice(-2), t]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    emit()
  }, ms)
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => toasts,
  )
}
