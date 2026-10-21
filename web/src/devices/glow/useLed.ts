// The LED controls' state and actions: a port of the logic in the Android app's HomeScreen.kt.
//
// State lives in a ref that actions mutate directly (like Compose's mutable state), so actions that
// call each other always see the newest values; `update()` re-renders and saves what's persisted.

import { useEffect, useReducer, useRef, useState } from 'react'
import { board, useBoard } from './board'
import { kelvinToHueSat, hexToHsv, normHue, atLeast } from '../../lib/color'
import { LED_EFFECTS, LedCommands, MIN_VISIBLE, MODE, SYNC_MODES, type PixelColour } from './modes'
import { solarCommand, solarFlags } from './solar'
import {
  capsOf, canSaveScene, ledOptionsOf, loadScenes, resolveScene, saveScenes, sceneMatches, stateCommands, stateToScene,
  type LedState, type Scene,
} from './scenes'
import { settings, useSettings } from '../../settings/store'
import { setSyncEndedHandler, startMusic, startScreen, startVisualizer, stopSync, syncHub, syncParams, useSync } from './sync'
import { toast } from '../../ui/toast'
import { sound } from '../../ui/sound'

/** A pixel's own colour as H/S: a kelvin-mode pixel reads out as its converted hue/sat. */
const pixelHs = (px: PixelColour): [number, number] =>
  px.kelvinMode ? kelvinToHueSat(px.kelvin) : [px.hue, px.sat]

/**
 * The ring palettes seen this session, per device. The control screen unmounts on any navigation
 * (Settings, the device list) and `useLed`'s state rebuilds from the saved two-LED preferences —
 * without this, returning repainted the ring as its two halves ("two tone") instead of the
 * user's per-pixel colours. Fresh layouts (scenes, polls, entering Individual) rebuild from the
 * two halves; re-entry restores. Session-scoped on purpose: a fresh app start re-reads the board.
 */
const ringPalettes = new Map<string, PixelColour[]>()

interface UiState extends LedState {
  lastOnBri: number
  lastOnMode: number
  /** Separate LEDs: the colour card edits LED1 (0), LED2 (1) or both (2). */
  editLed: number
  /** Sleep timer end (Date.now() ms), 0 when none runs. */
  sleepEndsAt: number
  scenes: Scene[]
  /** The ring in Individual: each pixel's own colour (its value is the shared brightness). */
  ringPal: PixelColour[]
}

function initialState(): UiState {
  const s = settings.get()
  const [kh, ks] = kelvinToHueSat(s.ledKelvin)
  const [kh2, ks2] = kelvinToHueSat(s.led2Kelvin)
  // Screen sync and Visualizer need a fresh capture after a restart: they come back as Solid.
  const mode = SYNC_MODES.includes(s.ledMode) && s.ledMode !== MODE.MUSIC ? MODE.SOLID : s.ledMode
  return {
    mode,
    hue: s.ledKelvinMode ? kh : s.ledHue,
    sat: s.ledKelvinMode ? ks : s.ledSat,
    kelvinMode: s.ledKelvinMode,
    kelvin: s.ledKelvin,
    bri: s.ledBrightness,
    candleHue: null,
    separate: s.separateLeds,
    hue2: s.led2KelvinMode ? kh2 : s.led2Hue,
    sat2: s.led2KelvinMode ? ks2 : s.led2Sat,
    kelvinMode2: s.led2KelvinMode,
    kelvin2: s.led2Kelvin,
    lastOnBri: s.ledBrightness >= MIN_VISIBLE ? s.ledBrightness : 1,
    lastOnMode: mode,
    editLed: 0,
    sleepEndsAt: 0,
    scenes: loadScenes(),
    ringPal: [],
  }
}

export function useLed() {
  const [initial] = useState(initialState)
  const st = useRef<UiState>(initial)
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const conn = useBoard()
  const prefs = useSettings()
  const sync = useSync()
  const connected = conn.state === 'connected'

  /** The firmware the board reported, or what it reported last time (known before it answers). */
  const fwVersion = conn.firmwareVersion ?? (conn.deviceId ? prefs.boardVersions[conn.deviceId] ?? null : null)
  const caps = capsOf(fwVersion)
  // The ring's size: the board's `leds` reply, remembered per device; boards that never report one —
  // or report 1-2 pixels — keep the app exactly as it was.
  const boardLeds = conn.deviceId ? prefs.boardLeds[conn.deviceId] ?? null : null
  const ringPixels = boardLeds?.pixels ?? null
  const ledsCount = boardLeds?.leds ?? null
  const isRing = ringPixels != null && ringPixels >= 3
  const ringInd = () => isRing && st.current.separate
  // "Two LEDs" means the paired-colour editing: halved boards, and never the ring's own layout.
  const twoLeds = () => !isRing && st.current.separate && caps.split && (ledsCount == null || ledsCount >= 2)

  const update = (patch: Partial<UiState>) => {
    Object.assign(st.current, patch)
    const s = st.current
    settings.set({
      ledHue: s.hue, ledSat: s.sat, ledBrightness: s.bri, ledMode: s.mode, ledKelvinMode: s.kelvinMode,
      ledKelvin: s.kelvin, separateLeds: s.separate, led2Hue: s.hue2, led2Sat: s.sat2,
      led2KelvinMode: s.kelvinMode2, led2Kelvin: s.kelvin2,
    })
    rerender()
  }

  /** When this app last told the board something: a read of its state right after would undo it. */
  const touched = useRef(0)
  const send = (cmd: string) => { touched.current = performance.now(); if (board.snapshot.state === 'connected') board.sendData(cmd) }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  const candleCommand = (bri: number) =>
    LedCommands.candle(bri, caps.options, prefs.smoothCandle, st.current.candleHue ?? prefs.candleHue, caps.candleStyle, prefs.twoCandles)
  // The rainbow's T (seconds per turn) is a 2.0.0 parameter: older boards keep taking plain rain=.
  const rainbowCommand = (sat: number, bri: number) =>
    LedCommands.rainbow(sat, bri, caps.spin ? prefs.rainbowSeconds : null)

  function sendHsvColour() {
    const s = st.current
    if (ringInd()) {
      if (caps.perPixel) {
        const focus = pixelFocus.current
        pixelFocus.current = null
        if (focus != null && s.ringPal[focus]) return sendPixel(focus)      // a drag moves just that pixel
        return sendRingPalette()                                            // commits set the whole ring
      }
      // Firmware without per-pixel commands (2.0.0): it drives the ring as its two halves, and the
      // chosen pixel's edits were mirrored into them — the preview still shows the per-pixel model.
      return send(LedCommands.pair(s.hue, s.sat, s.bri, s.hue2, s.sat2, s.bri))
    }
    // Separate (a ring-less board): both colours in one command; brightness applies to both.
    if (twoLeds()) send(LedCommands.pair(s.hue, s.sat, s.bri, s.hue2, s.sat2, s.bri))
    else if (s.mode === MODE.SPIN && caps.spin)
      // Leaving a running spinner: with the arc's own hue and saturation, h= and l= are
      // read as a brightness tweak (2.1.2) and the board keeps spinning. hh= always ends
      // the mode, and both halves get the same colour, so the board shows exactly the solid.
      send(LedCommands.pair(s.hue, s.sat, s.bri, s.hue, s.sat, s.bri))
    else send(LedCommands.colour(s.hue, s.sat, s.bri, caps.hsv))
  }
  function sendSolid() { sendHsvColour(); update({ mode: MODE.SOLID }) }
  function sendRainbow() { send(rainbowCommand(st.current.sat, st.current.bri)); update({ mode: MODE.RAINBOW }) }
  function sendCandle() { send(candleCommand(st.current.bri)); update({ mode: MODE.CANDLE }) }
  function sendSpinner() {
    const s = st.current
    send(LedCommands.spinner(s.hue, s.sat, s.bri, prefs.spinSeconds))
    update({ mode: MODE.SPIN })
  }
  function sendEffect(mode: number) { send(LedCommands.effect(mode, st.current.bri)); update({ mode }) }

  function sendCurrent() {
    const m = st.current.mode
    switch (m) {
      case MODE.RAINBOW: return sendRainbow()
      case MODE.CANDLE: return sendCandle()
      case MODE.BREATHE: sendHsvColour(); return sendEffect(m)
      case MODE.SPIN:
        if (!caps.spin) return sendSolid()          // an old board has no spinner: show the colour
        if (!(caps.spinLive || caps.spinBri)) return sendSpinner()    // 2.1.0 and older: spin= on every change, restarting the turn
        // From 2.1.1 this h= keeps the arc turning; 2.1.2+ narrows it to brightness (colour changes
        // drop the Spinner mode first, in colourPicked): a send here is brightness-only, so it keeps turning.
        return send(LedCommands.colour(st.current.hue, st.current.sat, st.current.bri, caps.hsv))
      case MODE.SOLAR: return send(solarCommand({ on: true, bri: Math.round(st.current.bri * 100) }))   // the board does it itself
      case MODE.MUSIC:
      case MODE.VISUALIZER:
      case MODE.SCREEN: return            // their engines send the colour
      default: return sendSolid()
    }
  }

  // Live update while dragging, throttled so the Bluetooth link isn't flooded.
  const lastSent = useRef(0)
  function sendThrottled() {
    const now = performance.now()
    if (now - lastSent.current >= 80) { lastSent.current = now; sendCurrent() }
  }

  // -------------------------------------------------------------------------
  // The ring (a board whose `leds` reply reports 3+ pixels)
  // -------------------------------------------------------------------------

  /** While a colour drag runs: the pixel it edits; null = the whole ring (brightness and commits). */
  const pixelFocus = useRef<number | null>(null)
  /** One colour to lay the whole ring out with, waiting for the board's `leds` reply (entering
   * Individual before the reply: keep the ring the one colour it was showing, not the two halves). */
  const uniformWanted = useRef<PixelColour | null>(null)
  const ringSel = () => Math.min(st.current.editLed, Math.max(0, st.current.ringPal.length - 1))

  // The per-pixel colours live longer than the control screen: leaving it for Settings (or the
  // device list) unmounts everything, and coming back must not repaint the ring as the two halves.
  // The palettes are remembered per device for this session; sees edits in place (same array).
  function initRingPalette(fresh = false, uniform?: PixelColour) {
    const s = st.current
    if (ringPixels == null || ringPixels < 3) return
    if (!fresh && conn.deviceId) {
      const kept = ringPalettes.get(conn.deviceId)
      if (kept && kept.length === ringPixels) { s.ringPal = kept; return }
    }
    const half = ledsCount != null && ledsCount < 2 ? ringPixels : Math.floor(ringPixels / 2)
    const at = (i: number): PixelColour => uniform
      ? { ...uniform }                                     // one object per pixel: they must not alias
      : i < half
        ? { hue: s.hue, sat: s.sat, kelvinMode: s.kelvinMode, kelvin: s.kelvin }
        : { hue: s.hue2, sat: s.sat2, kelvinMode: s.kelvinMode2, kelvin: s.kelvin2 }
    s.ringPal = Array.from({ length: ringPixels }, (_, i) => at(i))
    if (conn.deviceId) ringPalettes.set(conn.deviceId, s.ringPal)
  }
  // On first paint after returning, before any effect: the session's colours are already there.
  if (st.current.ringPal.length === 0 && isRing && st.current.separate) initRingPalette()

  function sendPixel(i: number) {
    const s = st.current
    const px = s.ringPal[i]
    if (!px) return
    const [h, sat] = pixelHs(px)
    send(LedCommands.pixel(i, h, sat, s.bri))
  }

  function sendRingPalette() {
    const s = st.current
    if (!s.ringPal.length) return
    send(LedCommands.ringPalette(s.ringPal.map((px) => LedCommands.hsv(...pixelHs(px), s.bri))))
  }

  // -------------------------------------------------------------------------
  // Colour editing
  // -------------------------------------------------------------------------

  /** Picking a colour keeps the modes that use one (Breathe, Candle); anything else becomes Solid. */
  function colourPicked(led2Only = false) {
    const s = st.current
    if (s.mode === MODE.BREATHE) return
    if (s.mode === MODE.MUSIC) { settings.set({ musicKeepColour: true }); return }
    if (s.mode === MODE.SPIN && caps.spinLive) return    // only 2.1.1 keeps turning for a colour; 2.1.2+ ends it again like older firmware
    if (led2Only) { s.mode = MODE.SOLID; return }
    if (s.mode === MODE.CANDLE) { s.candleHue = normHue(Math.round(s.hue)) % 360; return }
    s.mode = MODE.SOLID
  }
  const editsLed2 = () => twoLeds() && st.current.editLed === 1
  const editsBoth = () => twoLeds() && st.current.editLed === 2
  function copyLed1ToLed2() {
    const s = st.current
    Object.assign(s, { hue2: s.hue, sat2: s.sat, kelvinMode2: s.kelvinMode, kelvin2: s.kelvin })
  }
  function editHue(h: number) {
    const s = st.current
    if (ringInd()) { editRing({ hue: h }); return }
    if (editsLed2()) { s.hue2 = h; colourPicked(true) } else { s.hue = h; colourPicked(); if (editsBoth()) copyLed1ToLed2() }
    update({})
  }
  function editSat(v: number) {
    const s = st.current
    if (ringInd()) { editRing({ sat: v }); return }
    if (editsLed2()) s.sat2 = v
    else { s.sat = v; if (editsBoth()) copyLed1ToLed2() }
    update({})
  }
  function editColour(h: number, sv: number) {
    const s = st.current
    if (ringInd()) { editRing({ hue: h, sat: sv }); return }
    if (editsLed2()) { s.hue2 = h; s.sat2 = sv; colourPicked(true) } else { s.hue = h; s.sat = sv; colourPicked(); if (editsBoth()) copyLed1ToLed2() }
    update({})
  }
  function editKelvin(k: number) {
    const s = st.current
    const [h, sv] = kelvinToHueSat(k)
    if (ringInd()) { editRing({ kelvin: k, hue: h, sat: sv }); return }
    if (editsLed2()) { Object.assign(s, { kelvin2: k, hue2: h, sat2: sv }); colourPicked(true) } else {
      Object.assign(s, { kelvin: k, hue: h, sat: sv })
      colourPicked()
      if (editsBoth()) copyLed1ToLed2()
    }
    update({})
  }
  function editKelvinMode(on: boolean) {
    const s = st.current
    if (ringInd()) { const px = s.ringPal[ringSel()]; if (px) px.kelvinMode = on; update({}); return }
    if (editsLed2()) s.kelvinMode2 = on
    else { s.kelvinMode = on; if (editsBoth()) s.kelvinMode2 = on }
    update({})
  }

  /**
   * A colour change for the ring's chosen pixel — only that one, always: the app keeps a per-pixel
   * model (that's what the preview and, from firmware 2.1.0, `p=` commands show). Firmware without
   * per-pixel commands (2.0.0) can only drive the ring as its two halves, so the edit is mirrored
   * into the half it sits in (LED1 or LED2) to keep the board following; the preview stays per pixel.
   */
  function editRing(patch: Partial<PixelColour>) {
    const s = st.current
    const i = ringSel()
    const px = s.ringPal[i]
    if (!px) return
    Object.assign(px, patch)
    if (!caps.perPixel) {           // LED1/LED2 are the only colours that firmware knows
      const half = Math.max(1, Math.floor(s.ringPal.length / 2))
      const first = i < half
      if ('hue' in patch) { if (first) s.hue = patch.hue!; else s.hue2 = patch.hue! }
      if ('sat' in patch) { if (first) s.sat = patch.sat!; else s.sat2 = patch.sat! }
      if ('kelvinMode' in patch) { if (first) s.kelvinMode = patch.kelvinMode!; else s.kelvinMode2 = patch.kelvinMode! }
      if ('kelvin' in patch) { if (first) s.kelvin = patch.kelvin!; else s.kelvin2 = patch.kelvin! }
    }
    pixelFocus.current = i
    colourPicked(true)
    update({})
  }
  function ensureOn() { if (st.current.bri < MIN_VISIBLE) st.current.bri = st.current.lastOnBri }
  function pickPreset(hex: string) {
    const [h, s] = hexToHsv(hex)
    editColour(h, s)
    ensureOn()     // a preset changes the colour, not the brightness you chose
    sendCurrent()
  }
  function pickKelvinPreset(k: number) { ensureOn(); editKelvin(k); sendCurrent() }
  function setBrightness(b: number) {
    st.current.bri = b
    if (b >= MIN_VISIBLE) st.current.lastOnBri = b
    pixelFocus.current = null       // brightness is shared: the whole ring (or the pair) receives it
    update({})
    sendThrottled()
  }

  // -------------------------------------------------------------------------
  // Modes, power, sleep
  // -------------------------------------------------------------------------

  /**
   * A sync (Music, Visualizer, Screen) announces itself the moment it runs, before the mode here is
   * set; while it starts, the "stop a sync the mode doesn't want" effect below must not see that
   * in-between state and stop it again (that left the panel on "Starting..." for good).
   */
  const starting = useRef(false)
  async function startSync(start: () => Promise<boolean>, patch: Partial<UiState>) {
    starting.current = true
    try { if (await start()) update(patch) } finally { starting.current = false }
  }

  async function startMode(mode: number) {
    const s = st.current
    ensureOn()
    switch (mode) {
      case MODE.SOLID: return sendSolid()
      case MODE.RAINBOW:
        if (s.kelvinMode) { s.kelvinMode = false; s.sat = 1 }
        if (s.sat < 0.05) s.sat = 1
        return sendRainbow()
      case MODE.CANDLE: return sendCandle()
      case MODE.SPIN:
        if (!caps.spin) return sendSolid()      // no spinner yet (the chip is hidden anyway): show the colour
        if (s.kelvinMode) s.kelvinMode = false
        return sendSpinner()
      case MODE.MUSIC:
        return startSync(startMusic, { mode: MODE.MUSIC })
      case MODE.VISUALIZER:
        if (s.mode === MODE.VISUALIZER && sync.active === 'VISUALIZER') return
        return startSync(startVisualizer, { mode: MODE.VISUALIZER, kelvinMode: false })
      case MODE.SCREEN:
        if (s.mode === MODE.SCREEN && sync.active === 'SCREEN') return
        return startSync(startScreen, { mode: MODE.SCREEN, kelvinMode: false })
      case MODE.SOLAR: update({ mode: MODE.SOLAR, kelvinMode: false }); return sendCurrent()
      default:
        if (s.kelvinMode) s.kelvinMode = false
        return sendEffect(mode)
    }
  }

  const ledOn = st.current.bri >= MIN_VISIBLE
  function togglePower() {
    const s = st.current
    if (s.bri >= MIN_VISIBLE) {
      s.lastOnBri = s.bri; s.lastOnMode = s.mode
      s.bri = 0
      sendSolid()                 // fades to black, ends any effect
    } else {
      s.bri = s.lastOnBri
      // Screen sync and Visualizer need a fresh capture, so they come back as Solid.
      const m = s.lastOnMode === MODE.SCREEN || s.lastOnMode === MODE.VISUALIZER ? MODE.SOLID : s.lastOnMode
      if (m === MODE.MUSIC) void startMode(MODE.MUSIC)
      else { s.mode = m; sendCurrent() }
    }
  }

  function startSleep(minutes: number) {
    if (!caps.sleep) { toast('The sleep timer needs board firmware 1.7.0'); return }
    send(`sleep=${minutes}`)
    update({ sleepEndsAt: minutes === 0 ? 0 : Date.now() + minutes * 60_000 })
    sound.confirm()
    toast(minutes === 0 ? 'Sleep timer off' : `The light fades out over ${minutes} min`)
  }
  // When the timer has run out the board is off: show it.
  useEffect(() => {
    const end = st.current.sleepEndsAt
    if (!end) return
    const t = window.setTimeout(() => {
      const s = st.current
      if (s.bri >= MIN_VISIBLE) { s.lastOnBri = s.bri; s.lastOnMode = s.mode }
      stopSync()
      update({ bri: 0, sleepEndsAt: 0, mode: SYNC_MODES.includes(s.mode) ? MODE.SOLID : s.mode })
    }, Math.max(0, end - Date.now()))
    return () => window.clearTimeout(t)
  }, [st.current.sleepEndsAt])

  // -------------------------------------------------------------------------
  // Scenes
  // -------------------------------------------------------------------------

  const ledState = (): LedState => {
    const { lastOnBri: _a, lastOnMode: _b, editLed: _c, sleepEndsAt: _d, scenes: _e, ringPal: _f, ...rest } = st.current
    return rest
  }
  const currentScene = (id: number, name: string) => stateToScene(ledState(), id, name, caps.split)

  /** Takes over a state that was just sent (by a scene chip). */
  function adoptLedState(next: LedState) {
    const s = st.current
    if (next.bri >= MIN_VISIBLE) s.lastOnBri = next.bri
    if (next.separate !== s.separate && splitSent.current != null) splitSent.current = next.separate
    update({ ...next })
    initRingPalette(true)     // the board shows this state's two halves: the ring re-reads them
  }

  function applyScene(sc: Scene, quiet = false) {
    const current = ledState()
    const { next, supported } = resolveScene(sc, current, caps)
    stateCommands(next, caps, ledOptionsOf(settings.get()), next.separate !== current.separate).forEach(send)
    if (SYNC_MODES.includes(current.mode)) stopSync()
    adoptLedState(next)
    if (!supported && !quiet) toast(`"${sc.name}" needs newer board firmware; showing its colour.`)
  }

  function setScenes(list: Scene[]) { saveScenes(list); update({ scenes: list }) }
  function addScene(name: string) {
    const list = st.current.scenes
    const id = Math.max(0, ...list.map((s) => s.id)) + 1
    setScenes([...list, currentScene(id, name)])
  }
  const updateSceneToCurrent = (sc: Scene) =>
    setScenes(st.current.scenes.map((x) => (x.id === sc.id ? currentScene(sc.id, sc.name) : x)))
  const renameScene = (sc: Scene, name: string) =>
    setScenes(st.current.scenes.map((x) => (x.id === sc.id ? { ...x, name } : x)))
  const deleteScene = (sc: Scene) => setScenes(st.current.scenes.filter((x) => x.id !== sc.id))

  // -------------------------------------------------------------------------
  // Effects tied to the connection and Settings
  // -------------------------------------------------------------------------

  // Remember which firmware the board runs (shown before it answers next time).
  useEffect(() => {
    if (!connected || !conn.deviceId || board.isDemo || !conn.firmwareVersion) return
    const s = settings.get()
    if (s.boardVersions[conn.deviceId] !== conn.firmwareVersion) {
      settings.set({ boardVersions: { ...s.boardVersions, [conn.deviceId]: conn.firmwareVersion } })
    }
  }, [connected, conn.deviceId, conn.firmwareVersion])

  // The ring's size: 1.10.0+ answers `leds` and it never changes — remember it per device like the
  // firmware version. Older boards just never reply (nothing happens: two LEDs, no pixel count).
  useEffect(() => {
    const id = conn.deviceId
    if (!connected || !id || !conn.firmwareVersion || !atLeast(conn.firmwareVersion, '1.10.0')) return
    const known = settings.get().boardLeds[id]
    if (known != null && known.pixels != null && known.leds != null) return
    const wait = board.waitFor('LEDS,', 2000).catch(() => null)
    board.sendData('leds')
    let gone = false
    void wait.then((line) => {
      if (gone || !line) return
      const [, a, b] = line.split(',')
      const pixels = Number(a), leds = Number(b)
      if (!Number.isFinite(pixels) || !Number.isFinite(leds) || leds < 1) return
      const cur = settings.get().boardLeds
      if (cur[id]?.pixels === pixels && cur[id]?.leds === leds) return
      settings.set({ boardLeds: { ...cur, [id]: { pixels, leds } } })
    })
    return () => { gone = true }
  }, [connected, conn.deviceId, conn.firmwareVersion])

  // The Wi-Fi board can be changed by someone else (another phone, the internet): read what it shows
  // every few seconds (colours, mode, brightness) and take it over unless this app just changed it.
  useEffect(() => {
    if (!connected || board.isDemo || conn.kind !== 'wifi' || sync.active !== 'NONE') return
    let busy = false
    const read = async () => {
      if (busy || performance.now() - touched.current < 3000) return
      busy = true
      try {
        const reply = board.waitFor('STATE,', 2000).catch(() => null)
        board.sendData('state')
        const line = await reply
        if (line && performance.now() - touched.current >= 3000) takeBoardState(line)
      } finally { busy = false }
    }
    const first = window.setTimeout(() => void read(), 600)
    const timer = window.setInterval(() => void read(), 5000)
    return () => { window.clearTimeout(first); window.clearInterval(timer) }
  }, [connected, conn.kind, sync.active])

  /** "STATE,<mode>,<h>/<s>/<v>,<h>/<s>/<v>" from the board into the controls (nothing is sent back). */
  function takeBoardState(line: string) {
    const [, mode, a, b] = line.split(',')
    const c1 = a?.split('/').map(Number), c2 = b?.split('/').map(Number)
    if (!c1 || !c2 || c1.length !== 3 || c2.length !== 3 || [mode, ...c1, ...c2].some((x) => Number.isNaN(Number(x)))) return
    const s = st.current
    const v = Math.max(c1[2], c2[2]) / 100
    const patch: Partial<UiState> = {}
    const hueFar = (x: number, y: number) => { const d = Math.abs(x - y) % 360; return Math.min(d, 360 - d) > 3 }
    if (Number(mode) !== s.mode && !SYNC_MODES.includes(s.mode) && !(s.mode === MODE.SOLAR && solarFlags.setup)) patch.mode = Number(mode)
    if (Math.abs(v - s.bri) > 0.03) patch.bri = v
    // a colour that is off keeps the one it had; one with no saturation has no hue to show
    if (c1[2] > 0 && (Math.abs(c1[1] / 100 - s.sat) > 0.04 || (c1[1] > 4 && hueFar(c1[0], s.hue)))) { patch.hue = c1[0]; patch.sat = c1[1] / 100; patch.kelvinMode = false }
    if (c2[2] > 0 && (Math.abs(c2[1] / 100 - s.sat2) > 0.04 || (c2[1] > 4 && hueFar(c2[0], s.hue2)))) { patch.hue2 = c2[0]; patch.sat2 = c2[1] / 100; patch.kelvinMode2 = false }
    if (Object.keys(patch).length) { update(patch); initRingPalette(true) }
  }

  // Fade time: sent when the board connects and whenever it's changed.
  useEffect(() => {
    if (caps.options && connected && sync.active === 'NONE') send(`fade=${prefs.fadeMs}`)
  }, [caps.options, connected, prefs.fadeMs])

  // Changing candle/rainbow options while that mode runs applies them right away. The spinner's
  // seconds are separate: they need spin= (below), while colour and brightness go through sendCurrent's live path.
  const firstOpts = useRef(true)
  useEffect(() => {
    if (firstOpts.current) { firstOpts.current = false; return }
    if (!caps.options || !connected) return
    if ([MODE.CANDLE, MODE.RAINBOW].map(Number).includes(st.current.mode)) sendCurrent()
  }, [prefs.smoothCandle, prefs.rainbowSeconds, prefs.candleHue, prefs.twoCandles])

  // A new turn length always goes out as spin=H/S/V/T: pre-2.1.1 it is the only way in (restarts the
  // turn, like every change); from 2.1.1 the arc only re-learns its speed this way, colour goes through h=.
  const spinSecondsAt = useRef(prefs.spinSeconds)
  useEffect(() => {
    const before = spinSecondsAt.current
    spinSecondsAt.current = prefs.spinSeconds
    if (before === prefs.spinSeconds || !connected) return
    if (st.current.mode !== MODE.SPIN || !caps.spin) return
    sendSpinner()
  }, [prefs.spinSeconds])
  // A new Settings candle colour drops the colour picked while Candle ran.
  useEffect(() => { st.current.candleHue = null }, [prefs.candleHue])

  // The board boots Linked and forgets the layout: send it on every connect and on change.
  const splitSent = useRef<boolean | null>(null)
  useEffect(() => {
    if (!caps.split || !connected) { splitSent.current = null; return }
    const sep = st.current.separate
    if (splitSent.current === sep) return
    const changed = splitSent.current != null && splitSent.current !== sep
    send(LedCommands.split(sep))
    splitSent.current = sep
    if (sep && isRing) initRingPalette()
    if (st.current.mode === MODE.SPIN && caps.spin) sendSpinner()   // a fresh session (re)starts the arc (only spin= starts it); later brightness keeps it turning through h=
    else if (sep || changed) sendCurrent()
  }, [caps.split, connected, st.current.separate, isRing])

  // Settings > Linked / Separate.
  useEffect(() => {
    if (prefs.separateLeds !== st.current.separate) {
      update({ separate: prefs.separateLeds })
      if (prefs.separateLeds && isRing) initRingPalette()
    }
  }, [prefs.separateLeds])

  // The ring's size can also land after the layout did (first-ever connect, the leds reply arrives
  // later): whenever the palette is missing or stale, it re-reads the two halves — or the one colour
  // Individual was entered from, if the reply wasn't there when the layout changed yet.
  useEffect(() => {
    if (isRing && st.current.separate && st.current.ringPal.length !== ringPixels) {
      initRingPalette(!uniformWanted.current, uniformWanted.current ?? undefined)
      uniformWanted.current = null
    }
  }, [isRing, ringPixels, st.current.separate])

  // What the sync engines read live.
  Object.assign(syncParams, {
    hue: st.current.hue, sat: st.current.sat, bri: st.current.bri,
    sensitivity: prefs.musicSensitivity, keepColour: prefs.musicKeepColour, beatFlash: prefs.beatFlash,
    split: twoLeds(), hue2: st.current.hue2, sat2: st.current.sat2,
  })

  // A sync that ends by itself (capture stopped, error, disconnect): back to the picked colour.
  useEffect(() => {
    setSyncEndedHandler((message) => {
      if (message) toast(message, 5000)
      if (SYNC_MODES.includes(st.current.mode)) {
        st.current.mode = MODE.SOLID
        if (board.snapshot.state === 'connected') sendCurrent()
        else update({})
      }
    })
  })
  // Music resumes on connect (the microphone needs no fresh consent); stop syncs while off.
  useEffect(() => {
    const s = st.current
    if (connected && s.mode === MODE.MUSIC && s.bri >= MIN_VISIBLE && syncHub.get().active === 'NONE') void startMode(MODE.MUSIC)
    if (!connected && (s.mode === MODE.SCREEN || s.mode === MODE.VISUALIZER)) update({ mode: MODE.SOLID })
  }, [connected])
  useEffect(() => {
    const s = st.current
    const wanted = s.bri < MIN_VISIBLE ? 'NONE'
      : s.mode === MODE.MUSIC ? 'MUSIC' : s.mode === MODE.VISUALIZER ? 'VISUALIZER' : s.mode === MODE.SCREEN ? 'SCREEN' : 'NONE'
    if (starting.current) return
    if (sync.active !== 'NONE' && wanted !== sync.active) stopSync()
  }, [st.current.mode, st.current.bri, sync.active])

  // -------------------------------------------------------------------------
  // What the screen shows
  // -------------------------------------------------------------------------

  const s = st.current
  const selectedSceneId = !ledOn ? null : s.scenes.find((sc) => sceneMatches(sc, s, twoLeds()))?.id ?? null
  const sceneSuggestion = s.mode === MODE.SOLID && s.kelvinMode ? `${Math.round(s.kelvin / 100) * 100} K`
    : s.mode === MODE.SOLID ? `Scene ${s.scenes.length + 1}`
      : s.mode === MODE.RAINBOW ? 'Rainbow' : s.mode === MODE.CANDLE ? 'Candle'
        : LED_EFFECTS.find((e) => e[0] === s.mode)?.[1] ?? `Scene ${s.scenes.length + 1}`

  // The ring's Linked | Individual change (the Linked / LED 1 / LED 2 pill stays for other boards).
  function setRingLayout(individual: boolean) {
    const s = st.current
    if (individual) {
      // Linked → Individual keeps the ring the one colour it is showing — no two-halves reset.
      if (!s.separate) {
        const un: PixelColour = { hue: s.hue, sat: s.sat, kelvinMode: s.kelvinMode, kelvin: s.kelvin }
        uniformWanted.current = un
        initRingPalette(true, un)
      } else uniformWanted.current = null
      update({ separate: true, editLed: Math.min(s.editLed, Math.max(0, s.ringPal.length - 1)) })
    } else {
      pixelFocus.current = null
      uniformWanted.current = null
      update({ separate: false, editLed: 0 })
    }
  }

  return {
    s, caps, fwVersion, connected, isDemo: board.isDemo, ledOn, twoLeds: twoLeds(), sync, prefs,
    ring: isRing, ringPixels, ledsCount, ringInd: ringInd(), setRingLayout,
    editsLed2: editsLed2(), selectedSceneId, sceneSuggestion, canSaveScene: canSaveScene(s.mode),
    setEditLed: (i: number) => update({ editLed: i }),
    setLedLayout: (separate: boolean, edit: number) => update({ separate, editLed: edit }),
    editHue, editSat, editKelvin, editKelvinMode, pickPreset, pickKelvinPreset, setBrightness,
    sendCurrent, sendThrottled, startMode, togglePower, startSleep,
    applyScene, addScene, updateSceneToCurrent, renameScene, deleteScene,
  }
}

export type LedController = ReturnType<typeof useLed>
