// The LED controls' state and actions: a port of the logic in the Android app's HomeScreen.kt.
//
// State lives in a ref that actions mutate directly (like Compose's mutable state), so actions that
// call each other always see the newest values; `update()` re-renders and saves what's persisted.

import { useEffect, useReducer, useRef, useState } from 'react'
import { board, useBoard } from './board'
import { kelvinToHueSat, hexToHsv, normHue } from '../../lib/color'
import { ALL_EFFECTS, LedCommands, MIN_VISIBLE, MODE, SYNC_MODES } from './modes'
import {
  capsOf, canSaveScene, ledOptionsOf, loadScenes, resolveScene, saveScenes, sceneMatches, stateCommands, stateToScene,
  type LedState, type Scene,
} from './scenes'
import { settings, useSettings } from '../../settings/store'
import { setSyncEndedHandler, startMusic, startScreen, startVisualizer, stopSync, syncHub, syncParams, useSync } from './sync'
import { toast } from '../../ui/toast'
import { sound } from '../../ui/sound'

interface UiState extends LedState {
  lastOnBri: number
  lastOnMode: number
  /** Separate LEDs: the colour card edits LED1 (0), LED2 (1) or both (2). */
  editLed: number
  /** Sleep timer end (Date.now() ms), 0 when none runs. */
  sleepEndsAt: number
  scenes: Scene[]
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
  const twoLeds = () => st.current.separate && caps.split

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
  const rainbowCommand = (sat: number, bri: number) =>
    LedCommands.rainbow(sat, bri, caps.options ? prefs.rainbowSeconds : null)

  function sendHsvColour() {
    const s = st.current
    // Separate: both colours in one command; brightness applies to both.
    if (twoLeds()) send(LedCommands.pair(s.hue, s.sat, s.bri, s.hue2, s.sat2, s.bri))
    else send(LedCommands.colour(s.hue, s.sat, s.bri, caps.hsv))
  }
  function sendSolid() { sendHsvColour(); update({ mode: MODE.SOLID }) }
  function sendRainbow() { send(rainbowCommand(st.current.sat, st.current.bri)); update({ mode: MODE.RAINBOW }) }
  function sendCandle() { send(candleCommand(st.current.bri)); update({ mode: MODE.CANDLE }) }
  function sendEffect(mode: number) { send(LedCommands.effect(mode, st.current.bri)); update({ mode }) }

  function sendCurrent() {
    const m = st.current.mode
    switch (m) {
      case MODE.RAINBOW: return sendRainbow()
      case MODE.CANDLE: return sendCandle()
      case MODE.BREATHE:
      case MODE.CHASE: sendHsvColour(); return sendEffect(m)
      case MODE.OCEAN:
      case MODE.PARTY:
      case MODE.AURORA: return sendEffect(m)
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
  // Colour editing
  // -------------------------------------------------------------------------

  /** Picking a colour keeps the modes that use one (Breathe, Candle, Chase); anything else becomes Solid. */
  function colourPicked(led2Only = false) {
    const s = st.current
    if (s.mode === MODE.BREATHE) return
    if (s.mode === MODE.MUSIC) { settings.set({ musicKeepColour: true }); return }
    if (led2Only) { s.mode = MODE.SOLID; return }
    if (s.mode === MODE.CHASE) return
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
    if (editsLed2()) { s.hue2 = h; colourPicked(true) } else { s.hue = h; colourPicked(); if (editsBoth()) copyLed1ToLed2() }
    update({})
  }
  function editSat(v: number) {
    const s = st.current
    if (editsLed2()) s.sat2 = v
    else { s.sat = v; if (editsBoth()) copyLed1ToLed2() }
    update({})
  }
  function editColour(h: number, sv: number) {
    const s = st.current
    if (editsLed2()) { s.hue2 = h; s.sat2 = sv; colourPicked(true) } else { s.hue = h; s.sat = sv; colourPicked(); if (editsBoth()) copyLed1ToLed2() }
    update({})
  }
  function editKelvin(k: number) {
    const s = st.current
    const [h, sv] = kelvinToHueSat(k)
    if (editsLed2()) { Object.assign(s, { kelvin2: k, hue2: h, sat2: sv }); colourPicked(true) } else {
      Object.assign(s, { kelvin: k, hue: h, sat: sv })
      colourPicked()
      if (editsBoth()) copyLed1ToLed2()
    }
    update({})
  }
  function editKelvinMode(on: boolean) {
    const s = st.current
    if (editsLed2()) s.kelvinMode2 = on
    else { s.kelvinMode = on; if (editsBoth()) s.kelvinMode2 = on }
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
      case MODE.MUSIC:
        return startSync(startMusic, { mode: MODE.MUSIC })
      case MODE.VISUALIZER:
        if (s.mode === MODE.VISUALIZER && sync.active === 'VISUALIZER') return
        return startSync(startVisualizer, { mode: MODE.VISUALIZER, kelvinMode: false })
      case MODE.SCREEN:
        if (s.mode === MODE.SCREEN && sync.active === 'SCREEN') return
        return startSync(startScreen, { mode: MODE.SCREEN, kelvinMode: false })
      case MODE.CHASE: sendHsvColour(); return sendEffect(MODE.CHASE)
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
    const { lastOnBri: _a, lastOnMode: _b, editLed: _c, sleepEndsAt: _d, scenes: _e, ...rest } = st.current
    return rest
  }
  const currentScene = (id: number, name: string) => stateToScene(ledState(), id, name, caps.split)

  /** Takes over a state that was just sent (by a scene chip). */
  function adoptLedState(next: LedState) {
    const s = st.current
    if (next.bri >= MIN_VISIBLE) s.lastOnBri = next.bri
    if (next.separate !== s.separate && splitSent.current != null) splitSent.current = next.separate
    update({ ...next })
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
    if (Number(mode) !== s.mode && !SYNC_MODES.includes(s.mode)) patch.mode = Number(mode)
    if (Math.abs(v - s.bri) > 0.03) patch.bri = v
    // a colour that is off keeps the one it had; one with no saturation has no hue to show
    if (c1[2] > 0 && (Math.abs(c1[1] / 100 - s.sat) > 0.04 || (c1[1] > 4 && hueFar(c1[0], s.hue)))) { patch.hue = c1[0]; patch.sat = c1[1] / 100; patch.kelvinMode = false }
    if (c2[2] > 0 && (Math.abs(c2[1] / 100 - s.sat2) > 0.04 || (c2[1] > 4 && hueFar(c2[0], s.hue2)))) { patch.hue2 = c2[0]; patch.sat2 = c2[1] / 100; patch.kelvinMode2 = false }
    if (Object.keys(patch).length) update(patch)
  }

  // Fade time: sent when the board connects and whenever it's changed.
  useEffect(() => {
    if (caps.options && connected && sync.active === 'NONE') send(`fade=${prefs.fadeMs}`)
  }, [caps.options, connected, prefs.fadeMs])

  // Changing candle/rainbow options while that mode runs applies them right away.
  const firstOpts = useRef(true)
  useEffect(() => {
    if (firstOpts.current) { firstOpts.current = false; return }
    if (!caps.options || !connected) return
    if (st.current.mode === MODE.CANDLE || st.current.mode === MODE.RAINBOW) sendCurrent()
  }, [prefs.smoothCandle, prefs.rainbowSeconds, prefs.candleHue, prefs.twoCandles])
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
    if (sep || changed) sendCurrent()
  }, [caps.split, connected, st.current.separate])

  // Settings > Linked / Separate.
  useEffect(() => {
    if (prefs.separateLeds !== st.current.separate) update({ separate: prefs.separateLeds })
  }, [prefs.separateLeds])

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
        : ALL_EFFECTS.find((e) => e[0] === s.mode)?.[1] ?? `Scene ${s.scenes.length + 1}`

  return {
    s, caps, fwVersion, connected, isDemo: board.isDemo, ledOn, twoLeds: twoLeds(), sync, prefs,
    editsLed2: editsLed2(), selectedSceneId, sceneSuggestion, canSaveScene: canSaveScene(s.mode),
    setEditLed: (i: number) => update({ editLed: i }),
    setLedLayout: (separate: boolean, edit: number) => update({ separate, editLed: edit }),
    editHue, editSat, editKelvin, editKelvinMode, pickPreset, pickKelvinPreset, setBrightness,
    sendCurrent, sendThrottled, startMode, togglePower, startSleep,
    applyScene, addScene, updateSceneToCurrent, renameScene, deleteScene,
  }
}

export type LedController = ReturnType<typeof useLed>
