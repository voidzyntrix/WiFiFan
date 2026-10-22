// Music, Visualizer and Screen sync: the app-side modes that drive the LED from sound or the
// screen (the Android app's AudioSyncService, ScreenSyncService, SyncHub and LedLink).
//
// Desktop sources:
//  - Music: the microphone (getUserMedia).
//  - Visualizer: everything Windows plays (screen capture with system audio loopback, granted by
//    electron/main.cjs; the picture is ignored).
//  - Screen sync: a screen capture, sampled at 64 px wide 25 times a second.

import { useSyncExternalStore } from 'react'
import { board } from './board'
import { atLeast } from '../../lib/color'
import { LedCommands, MIN_VISIBLE } from './modes'
import { settings } from '../../settings/store'
import {
  BeatFlash, LevelAnalyzer, SpectrumAnalyzer, TwoLedBeats, WINDOW_MS, bandColour, dominantColour,
  smoothColour, twoLedBandColours,
} from './analysis'

export type SyncKind = 'NONE' | 'MUSIC' | 'VISUALIZER' | 'SCREEN'

/** Live values for the level meter and the LED preview. */
export interface SyncSnapshot {
  active: SyncKind
  level: number
  hue: number
  sat: number
  level2: number
  hue2: number
  sat2: number
  /** One-LED-per-beat music: this frame's per-pixel levels (0-1) and each pixel's own hue. */
  pixelVals: Float32Array | null
  pixelHues: Float32Array | null
}

/** What the user picked; the home screen keeps it current and the engines read it live. */
export const syncParams = {
  hue: 0, sat: 1, bri: 1, sensitivity: 0.5, keepColour: false, beatFlash: true,
  /** Separate LEDs wanted and the board has them. */
  split: false, hue2: 210, sat2: 1,
  /** The ring's pixel count when the board reported one (0 = unknown), the music per-LED setting,
   *  and how long a beat's LED trails before it is back to black (decay=MS, the board's job on 2.1.20+). */
  pixels: 0, perLed: true, decayMs: 700,
}

let snap: SyncSnapshot = { active: 'NONE', level: 0, hue: 0, sat: 1, level2: 0, hue2: 0, sat2: 1, pixelVals: null, pixelHues: null }
const listeners = new Set<() => void>()
function publish(patch: Partial<SyncSnapshot>) {
  snap = { ...snap, ...patch }
  listeners.forEach((l) => l())
}
export const syncHub = {
  get: () => snap,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
}
export const useSync = () => useSyncExternalStore(syncHub.subscribe, syncHub.get)

/** Called when a sync stops by itself (capture ended, error); the home screen goes back to Solid. */
let onEnded: ((message: string | null) => void) | null = null
export function setSyncEndedHandler(fn: (message: string | null) => void) { onEnded = fn }

// ---------------------------------------------------------------------------
// LedLink: throttled colour sends
// ---------------------------------------------------------------------------

let lastSend = 0
const fw = (v: string) => atLeast(board.snapshot.firmwareVersion, v)
const twoLeds = () => syncParams.split && fw('1.6.0')

function due(minGapMs: number) {
  const now = performance.now()
  if (now - lastSend < minGapMs) return false
  lastSend = now
  return true
}

function sendColour(h: number, s: number, v: number, minGapMs: number, skipIfBacklogged = false) {
  if (v < MIN_VISIBLE) return
  if (skipIfBacklogged && board.backlogged) return
  if (!due(minGapMs)) return
  board.sendData(LedCommands.colour(h, s, v, fw('1.1.0')))
}

function sendColours(h1: number, s1: number, v1: number, h2: number, s2: number, v2: number, minGapMs: number, skipIfBacklogged = false) {
  if (!fw('1.6.0')) return sendColour(h1, s1, v1, minGapMs, skipIfBacklogged)
  if (Math.max(v1, v2) < MIN_VISIBLE) return
  if (skipIfBacklogged && board.backlogged) return
  if (!due(minGapMs)) return
  board.sendData(LedCommands.pair(h1, s1, v1, h2, s2, v2))
}

const setFade = (ms: number) => { if (fw('1.3.0')) board.sendData(`fade=${ms}`) }

// ---------------------------------------------------------------------------
// Running a sync
// ---------------------------------------------------------------------------

interface Running { kind: SyncKind; stop: () => void }
let running: Running | null = null

export function stopSync(restoreFade = true) {
  const r = running
  running = null
  if (!r) return
  r.stop()
  publish({ active: 'NONE', level: 0, level2: 0, pixelVals: null, pixelHues: null })
  if (restoreFade && board.snapshot.state === 'connected') setFade(settings.get().fadeMs)
  // Music/Visualizer may have armed `decay=` on the board: hand the pixels back to normal
  // commands (2.1.20+ only - older boards keep their streamed trail and never see decay=).
  if ((r.kind === 'MUSIC' || r.kind === 'VISUALIZER') && board.snapshot.state === 'connected' && fw('2.1.20')) {
    board.sendData('decay=0')
  }
}

function begin(kind: SyncKind, stop: () => void, fadeMs: number) {
  running = { kind, stop }
  setFade(fadeMs)   // short fades so the LED can follow
  publish({
    active: kind, level: 0, level2: 0, pixelVals: null, pixelHues: null,
    hue: syncParams.hue, sat: syncParams.sat, hue2: syncParams.hue2, sat2: syncParams.sat2,
  })
}

function endedByItself(message: string | null) {
  if (!running) return
  stopSync()
  onEnded?.(message)
}

const SEND_GAP_AUDIO = 55       // at most ~18 colours a second
const SEND_GAP_SCREEN = 25

/**
 * The screen's dominant colour reads duller on the LEDs than on the display, so the
 * sampled saturation is lifted before it is smoothed, shown and sent (1 keeps it as sampled).
 */
const SCREEN_SAT_GAIN = 1.4
const vivid = ([h, s]: [number, number]): [number, number] => [h, Math.min(1, s * SCREEN_SAT_GAIN)]

/** Music: the microphone. Loudness is brightness; beats step the hue (or keep the picked colour). */
export async function startMusic(): Promise<boolean> {
  stopSync(false)
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
  } catch (e) {
    onEnded?.(`Music needs the microphone: ${(e as Error).message}`)
    return false
  }
  runAudio('MUSIC', stream)
  return true
}

/** Visualizer: what Windows plays, via screen capture with system audio. */
export async function startVisualizer(): Promise<boolean> {
  stopSync(false)
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  } catch (e) {
    onEnded?.(`The visualizer needs to capture the sound Windows plays: ${(e as Error).message}`)
    return false
  }
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    onEnded?.('No system audio came with the capture.')
    return false
  }
  // Only the sound matters; the picture is kept (stopping it can end the audio too) but unused.
  stream.getVideoTracks().forEach((t) => { t.enabled = false })
  runAudio('VISUALIZER', stream)
  return true
}

function runAudio(kind: 'MUSIC' | 'VISUALIZER', stream: MediaStream) {
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 4096
  analyser.smoothingTimeConstant = 0
  source.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  const level = new LevelAnalyzer()
  const flash = new BeatFlash(), flash2 = new BeatFlash()
  const spectrum = new SpectrumAnalyzer(ctx.sampleRate, 1024)
  const beats = new TwoLedBeats(syncParams.hue)
  let beatHue = syncParams.hue
  let hue = syncParams.hue, hue2 = syncParams.hue2
  const windowSamples = Math.round((ctx.sampleRate * WINDOW_MS) / 1000)
  // One LED per beat (Music and Visualizer, a ring board on 2.1.0+ with the setting): each
  // beat lands on the next pixel round the ring, that LED carries the loudness until the
  // next one comes round, and the pixels it left fade out as a trail behind it. On 2.1.20
  // the board owns the fading (`decay=MS`, one `p=` per frame); on older firmware the app
  // streams every lit pixel itself.
  const N = Math.max(0, Math.round(syncParams.pixels))
  const trail = new Float32Array(N)
  const trailHue = new Float32Array(N)
  const lit = new Uint8Array(N)
  let beatPix = 0, sinceTick = performance.now()
  // The per-LED state on the board is armed here and disarmed when leaving the mode (the
  // setting can be toggled while the stream runs, so the tick calls these as it crosses).
  let perLedOn = false, decayArmed = 0         // the decay= the board carries now (0 = none)
  const armPerLed = () => {
    if (!perLedOn) {
      perLedOn = true
      board.sendData(LedCommands.colour(0, 0, 0, true))    // the trail starts on a black ring
    }
    // decay= on 2.1.20+ does the whole trail: every `p=` re-arms that pixel, everything the
    // beat left fades to black on the board. Sent again when the slider moved while running,
    // so the fade answers without a restart.
    const ms = Math.max(1, Math.round(syncParams.decayMs || 700))
    if (decayArmed !== ms && fw('2.1.20')) {
      decayArmed = ms
      board.sendData(`decay=${ms}`)
    }
  }
  const disarmPerLed = () => {
    if (!perLedOn && !decayArmed) return
    perLedOn = false
    if (decayArmed) {
      decayArmed = 0
      if (board.snapshot.state === 'connected' && fw('2.1.20')) board.sendData('decay=0')
    }
  }

  const tick = () => {
    analyser.getFloatTimeDomainData(buf)
    const n = kind === 'MUSIC' ? windowSamples : spectrum.size
    const recent = buf.subarray(buf.length - n)
    const p = syncParams
    const [raw, beat] = level.process(recent, n, WINDOW_MS, p.sensitivity)
    const gap = beat ? 0 : SEND_GAP_AUDIO
    // The Visualizer's band mix drives its colours everywhere - the per-LED trail included.
    const bands = kind === 'VISUALIZER' ? spectrum.process(recent, n) : null
    // One LED per beat needs pixels to write and a ring layout: on the two-LED boards the
    // whole ring is one two-colour stream anyway.
    const perLed = (kind === 'MUSIC' || kind === 'VISUALIZER') && p.perLed && N >= 3 && !twoLeds() && fw('2.1.0')
    if (perLed) armPerLed(); else disarmPerLed()

    if (perLed) {
      const now = performance.now()
      // 2.1.20+: the board scales each fading pixel linearly to black over the decay time,
      // and the preview follows that exact envelope; older firmware keeps the app's
      // exponential. The slider answer is live: decayMs is read once per tick.
      const boardDecay = fw('2.1.20')
      const decayMs = Math.max(1, Math.round(p.decayMs || 700))
      const drop = boardDecay ? Math.max(0, 1 - (now - sinceTick) / decayMs) : Math.exp(-(now - sinceTick) / 220)
      sinceTick = now
      for (let i = 0; i < N; i++) trail[i] *= drop
      let h: number, s: number
      if (kind === 'MUSIC') {
        if (p.keepColour) trailHue.fill(p.hue)           // "My colour": every pixel takes the picked one
        if (beat) {
          if (!p.keepColour) beatHue = (beatHue + 47) % 360
          beatPix = (beatPix + 1) % N
        }
        h = p.keepColour ? p.hue : beatHue
        s = p.keepColour ? p.sat : 1
      } else {
        // the band mix is the beat's colour: every pixel keeps the palette it landed with,
        // so the trail is a ring of the spectra that have just played
        const [bh, bs] = bandColour(bands!, hue)
        hue = bh
        h = bh; s = bs
        if (beat) beatPix = (beatPix + 1) % N
      }
      const l = flash.apply(raw, beat, WINDOW_MS, p.beatFlash)
      if (beat) {
        // A beat is one touch of one LED: its colour and the moment's brightness, once.
        // From there the board does all the changing - no more app touches, no restarted
        // fades, nothing pulsing bright/dim between them.
        trail[beatPix] = 0.04 + 0.96 * l
        trailHue[beatPix] = h
      }
      publish({ level: l, hue: h, sat: s, pixelVals: trail, pixelHues: trailHue })
      if (beat && p.bri >= MIN_VISIBLE && !board.backlogged) {
        if (boardDecay) {
          // the board fades every pixel the beat leaves behind; the app sends one tiny
          // `p=` per beat and nothing in between
          board.sendData(LedCommands.pixel(beatPix, trailHue[beatPix], s, p.bri * trail[beatPix]))
        } else {
          // older firmware: the app streams the trail itself, every lit pixel per tick
          for (let i = 0; i < N; i++) {
            const v = p.bri * trail[i]
            if (v >= MIN_VISIBLE || lit[i]) {
              lit[i] = v >= MIN_VISIBLE ? 1 : 0
              board.sendData(LedCommands.pixel(i, trailHue[i], s, Math.min(1, v)))
            }
          }
        }
      }
      return
    }

    if (kind === 'MUSIC') {
      if (twoLeds()) {
        const led = beat ? beats.onBeat() : -1
        const l1 = flash.apply(raw, led === 0, WINDOW_MS, p.beatFlash)
        const l2 = flash2.apply(raw, led === 1, WINDOW_MS, p.beatFlash)
        const h1 = p.keepColour ? p.hue : beats.hue1, s1 = p.keepColour ? p.sat : 1
        const h2 = p.keepColour ? p.hue2 : beats.hue2, s2 = p.keepColour ? p.sat2 : 1
        publish({ level: l1, hue: h1, sat: s1, level2: l2, hue2: h2, sat2: s2 })
        sendColours(h1, s1, p.bri * (0.04 + 0.96 * l1), h2, s2, p.bri * (0.04 + 0.96 * l2), gap)
        return
      }
      const l = flash.apply(raw, beat, WINDOW_MS, p.beatFlash)
      if (beat && !p.keepColour) beatHue = (beatHue + 47) % 360
      const h = p.keepColour ? p.hue : beatHue, s = p.keepColour ? p.sat : 1
      publish({ level: l, hue: h, sat: s })
      sendColour(h, s, p.bri * (0.04 + 0.96 * l), gap)
      return
    }

    const l = flash.apply(raw, beat, WINDOW_MS, p.beatFlash)
    if (twoLeds()) {
      const [c1, c2] = twoLedBandColours(bands!, hue, hue2)
      hue = c1[0]; hue2 = c2[0]
      publish({ level: l * c1[2], hue: c1[0], sat: c1[1], level2: l * c2[2], hue2: c2[0], sat2: c2[1] })
      sendColours(c1[0], c1[1], p.bri * (0.04 + 0.96 * l * c1[2]), c2[0], c2[1], p.bri * (0.04 + 0.96 * l * c2[2]), gap)
      return
    }
    const [h, s] = bandColour(bands!, hue)
    hue = h
    publish({ level: l, hue: h, sat: s })
    sendColour(h, s, p.bri * (0.04 + 0.96 * l), gap)
  }
  const timer = window.setInterval(tick, WINDOW_MS)
  stream.getTracks().forEach((t) => t.addEventListener('ended', () => endedByItself(null)))
  begin(kind, () => {
    window.clearInterval(timer)
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }, 60)
}

/** Screen sync: the dominant colour on screen (Separate LEDs: left half LED1, right half LED2). */
export async function startScreen(): Promise<boolean> {
  stopSync(false)
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
  } catch (e) {
    onEnded?.(`Screen sync needs to see the screen: ${(e as Error).message}`)
    return false
  }
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  await video.play().catch(() => {})
  const W = 64
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  let smoothed: [number, number] | null = null
  let smoothed2: [number, number] | null = null

  const tick = () => {
    if (!video.videoWidth) return
    const H = Math.max(1, Math.round((W * video.videoHeight) / video.videoWidth))
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
    g.drawImage(video, 0, 0, W, H)
    const px = g.getImageData(0, 0, W, H).data
    const p = syncParams
    if (twoLeds()) {
      smoothed = smoothColour(smoothed, vivid(dominantColour(px, W, 0, W / 2)))
      smoothed2 = smoothColour(smoothed2, vivid(dominantColour(px, W, W / 2, W)))
      publish({ hue: smoothed[0], sat: smoothed[1], hue2: smoothed2[0], sat2: smoothed2[1] })
      sendColours(smoothed[0], smoothed[1], p.bri, smoothed2[0], smoothed2[1], p.bri, SEND_GAP_SCREEN, true)
      return
    }
    smoothed = smoothColour(smoothed, vivid(dominantColour(px, W, 0, W)))
    publish({ hue: smoothed[0], sat: smoothed[1] })
    sendColour(smoothed[0], smoothed[1], p.bri, SEND_GAP_SCREEN, true)
  }
  const timer = window.setInterval(tick, 40)
  stream.getTracks().forEach((t) => t.addEventListener('ended', () => endedByItself(null)))
  begin('SCREEN', () => {
    window.clearInterval(timer)
    stream.getTracks().forEach((t) => t.stop())
    video.srcObject = null
  }, 80)
  return true
}

// A dropped board ends whatever sync runs.
board.subscribe(() => {
  if (running && board.snapshot.state !== 'connected') endedByItself(null)
})
