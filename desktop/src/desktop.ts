// What electron/preload.cjs exposes as `window.glow`. Absent when the UI runs in a plain browser
// (`npx vite` for quick UI work): then Bluetooth, capture and Auto light are unavailable.

export interface BtDevice { id: string; name: string | null }

export interface GlowDesktop {
  platform: string
  bluetooth: {
    onDevices(fn: (devices: BtDevice[]) => void): () => void
    pick(id: string): void
    cancel(): void
    autoPick(id: string): void
  }
  capture: {
    displays(): Promise<{ index: number; label: string }[]>
    setDisplay(index: number): void
  }
  power: {
    state(): Promise<{ locked: boolean; idleSeconds: number }>
    onChanged(fn: (s: { locked: boolean }) => void): () => void
    keepAwake(on: boolean): void
  }
  net: {
    text(url: string): Promise<string>
    bytes(url: string, limit?: number): Promise<Uint8Array>
    exists(url: string): Promise<boolean>
  }
  openExternal(url: string): void
  keepRunning(on: boolean): void
}

declare global {
  interface Window { glow?: GlowDesktop }
  const __APP_VERSION__: string
}

export const desktop: GlowDesktop | undefined = window.glow
export const APP_VERSION: string = __APP_VERSION__

/** Opens a link in the user's own browser (Firefox or whatever is default). */
export function openLink(url: string) {
  if (desktop) desktop.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}
