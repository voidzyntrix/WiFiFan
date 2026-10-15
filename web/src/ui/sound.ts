// Feedback for touches and clicks: a tick while dragging a slider, a tap on toggles and pills, a
// firmer confirm, a heavier one for "long press" menus. On a phone these are haptics (the shell's
// vibration motor); on a PC, very short, soft synthesized clicks.
// Settings > App UI > Sounds / Haptics turns them off (and sets the click volume).

import { platform } from '../platform'
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

const haptic = platform.haptic
const feel = (kind: 'tap' | 'tick' | 'confirm' | 'long', click: () => void) => () => {
  if (!haptic) return click()
  if (settings.get().sounds) haptic(kind)
}

export const sound = {
  tick: feel('tick', () => blip(2200, 14, 0.25, 'triangle')),
  tap: feel('tap', () => blip(1400, 30, 0.5, 'triangle')),
  confirm: feel('confirm', () => blip(900, 60, 0.7)),
  longPress: feel('long', () => blip(420, 80, 0.8)),
}
