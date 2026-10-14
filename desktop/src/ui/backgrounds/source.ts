// What the background currently draws into, so the refractive glass (Glass.tsx) can bend it.
// Canvases stretch over the whole window; the photo is cropped to cover it.

export interface BackdropSource {
  el: HTMLCanvasElement | HTMLImageElement
  /** Crop to cover the window (the photo) instead of stretching (canvases). */
  cover: boolean
  /** Black laid over it (the photo's Darkness), 0..1. */
  dim: number
  /** True when the pixels change every frame (canvases); the photo is uploaded once. */
  live: boolean
}

let current: BackdropSource | null = null

export function setBackdropSource(s: BackdropSource | null) { current = s }
export function backdropSource() { return current }
