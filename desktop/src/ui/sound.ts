// The desktop stand-in for haptics: very short, soft synthesized clicks. A tick while dragging a
// slider, a tap on toggles and pills, a firmer confirm, a low thud for "long press" menus.
// Settings > App UI > Sounds turns them off or sets the volume.

import { settings } from '../settings/store'

let ctx: AudioContext | null = null

function blip(freq: number, ms: number, gain: number, type: OscillatorType = 'sine') {
  const s = settings.get()
  if (!s.sounds) return
  try {
    ctx ??= new AudioContext()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + ms / 1000)
    g.gain.setValueAtTime(gain * s.soundVolume * 0.25, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + ms / 1000 + 0.01)
  } catch { /* no audio output */ }
}

export const sound = {
  tick: () => blip(2200, 14, 0.25, 'triangle'),
  tap: () => blip(1400, 30, 0.5, 'triangle'),
  confirm: () => blip(900, 60, 0.7),
  longPress: () => blip(420, 80, 0.8),
}
