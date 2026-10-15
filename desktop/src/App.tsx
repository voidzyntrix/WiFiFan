// The app shell: theme, background, which screen shows (boards / board / settings), dialogs,
// toasts, and the desktop wiring (tray while something runs, keep the display awake, updates).

import { useEffect, useMemo, useRef, useState } from 'react'
import { ble, useBle } from './ble/ble'
import { desktop, APP_VERSION } from './desktop'
import { compareVersions, hsvCss } from './led/color'
import { MODE } from './model/modes'
import type { Scene } from './model/scenes'
import { settings, useSettings, type PairedBoard } from './settings/store'
import { useAutoStatus } from './auto/autoLight'
import { checkFirmware, useOta, type OtaState } from './ota/ota'
import { checkAppUpdate, installAppUpdate, useAppUpdate, type AppUpdateState } from './ui/appUpdate'
import { BackgroundLayer } from './ui/backgrounds/Backgrounds'
import { GlassLayer } from './ui/backgrounds/Glass'
import { ActionsDialog, Dialog, NameDialog, PillButton, ProgressBar } from './ui/components/Controls'
import { ConnectScreen } from './ui/screens/ConnectScreen'
import { HomeScreen, previewOf } from './ui/screens/HomeScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { useLed } from './ui/screens/useLed'
import { applyTheme, useSystemDark } from './ui/theme'
import { toast, useToasts } from './ui/toast'
import { WHATS_NEW } from './ui/whatsNew'
import { sound } from './ui/sound'
import { Swap, pulse, useExit, useFlip, useLeavingList } from './ui/motion'

/** Modes whose preview moves, so the clock only ticks when something animates. */
const ANIMATED = [MODE.RAINBOW, MODE.CANDLE, MODE.BREATHE, MODE.OCEAN, MODE.PARTY, MODE.AURORA, MODE.CHASE]

type DialogState =
  | { kind: 'renameBoard'; board: PairedBoard }
  | { kind: 'boardMenu'; board: PairedBoard }
  | { kind: 'sleep' }
  | { kind: 'addScene' }
  | { kind: 'sceneMenu'; scene: Scene }
  | { kind: 'renameScene'; scene: Scene }
  | { kind: 'whatsNew' }
  | { kind: 'update' }
  | null

export function App() {
  const prefs = useSettings()
  const systemDark = useSystemDark()
  const conn = useBle()
  const c = useLed()
  const auto = useAutoStatus()
  const ota = useOta()
  const app = useAppUpdate()
  const toasts = useToasts()
  const [showSettings, setShowSettings] = useState(false)
  // A connected board can be left for the board grid without disconnecting.
  const [boardOpen, setBoardOpen] = useState(true)
  const [dialog, setDialog] = useState<DialogState>(null)
  const connected = conn.state === 'connected'

  const colors = useMemo(() => applyTheme(prefs, systemDark), [prefs, systemDark])

  // Backslash: the Demo board (the controls without a board) on or off, in release builds too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return
      if (e.target instanceof Element && e.target.closest('input, textarea')) return
      e.preventDefault()
      if (ble.isDemo) { ble.disconnect(); toast('Demo board off') }
      else if (ble.snapshot.state === 'disconnected') { ble.startDemo(); toast('Demo board on. Press \\ again to leave it.') }
      else toast('Disconnect from your board first to use the Demo board.')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The first colours are set without the eased transition the theme otherwise has.
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('booting')))
    return () => cancelAnimationFrame(raf)
  }, [])
  // The font can't ease between two faces: the screen fades through the change instead.
  const firstFont = useRef(true)
  useEffect(() => {
    if (firstFont.current) { firstFont.current = false; return }
    pulse(document.querySelector('main.app'))
  }, [prefs.monoFont])

  // The preview clock (and the rainbow sliders): ~30 fps while something animates.
  const [t, setT] = useState(0)
  const animating = connected && c.ledOn && (ANIMATED.includes(c.s.mode as 1) || c.sync.active !== 'NONE')
  useEffect(() => {
    if (!animating) return
    let raf = 0, last = 0
    const loop = (now: number) => {
      if (now - last > 33) { last = now; setT(now / 1000) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animating])
  const preview = previewOf(c, t)
  const rainbowHue = ((t / 4) % 1) * 360

  // A board that connects opens.
  useEffect(() => { if (connected) setBoardOpen(true) }, [connected])

  // Desktop: keep running in the tray while something drives the LED; keep the display awake.
  const background = connected && (c.sync.active !== 'NONE' || auto.running)
  useEffect(() => { desktop?.keepRunning(background) }, [background])
  useEffect(() => { desktop?.power.keepAwake(prefs.keepScreenOn) }, [prefs.keepScreenOn])
  useEffect(() => {
    const name = conn.deviceId ? prefs.boardNames[conn.deviceId] ?? conn.deviceName : null
    document.title = connected && name ? `Glow · ${name}` : 'Glow'
  }, [connected, conn.deviceId, conn.deviceName, prefs.boardNames])

  // Update checks at launch, on connect, then every 10 minutes, quietly.
  useEffect(() => {
    void checkAppUpdate(true)
    const timer = window.setInterval(() => {
      void checkAppUpdate(true)
      if (ble.snapshot.firmwareVersion) void checkFirmware(ble.snapshot.firmwareVersion, true)
    }, 10 * 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { if (connected && conn.firmwareVersion) void checkFirmware(conn.firmwareVersion) }, [connected, conn.firmwareVersion])

  // "What's new" once after an update; a fresh install only remembers its version.
  useEffect(() => {
    const seen = settings.get().lastSeenVersion
    if (seen != null && compareVersions(APP_VERSION, seen) > 0) setDialog({ kind: 'whatsNew' })
    if (seen == null || compareVersions(APP_VERSION, seen) > 0) settings.set({ lastSeenVersion: APP_VERSION })
  }, [])

  // The update prompt waits until Settings and other dialogs are closed; each offer once a run.
  const offer = [app.kind === 'available' ? `app ${app.release.version}` : '', ota.kind === 'available' ? `fw ${ota.release.version}` : ''].join('|')
  const [offered, setOffered] = useState('|')
  useEffect(() => {
    if (prefs.updatePrompts && offer !== '|' && offer !== offered && !showSettings && !dialog) {
      setOffered(offer)
      setDialog({ kind: 'update' })
    }
  }, [offer, prefs.updatePrompts, showSettings, dialog])

  const boardName = (b: PairedBoard) => prefs.boardNames[b.id] ?? b.bleName ?? 'LED board'
  const setBoardName = (id: string, name: string) => {
    const names = { ...prefs.boardNames }
    if (name.trim()) names[id] = name.trim()
    else delete names[id]
    settings.set({ boardNames: names })
  }
  const currentBoard: PairedBoard | null = conn.deviceId ? { id: conn.deviceId, bleName: conn.deviceName } : null
  const boardTitle = currentBoard ? boardName(currentBoard) : 'Connected'

  const liquid = connected && c.ledOn ? hsvCss(preview.hue, Math.min(1, Math.max(0, preview.sat))) : colors.primary
  const mainScreen = showSettings ? 'settings' : connected && boardOpen ? 'home' : 'connect'

  // A screen leaves (fades, shrinks away) before the next one comes in.
  const [screen, setScreen] = useState(mainScreen)
  useEffect(() => {
    if (mainScreen === screen) return
    const t = window.setTimeout(() => setScreen(mainScreen), 220)
    return () => window.clearTimeout(t)
  }, [mainScreen, screen])

  // Dialogs and toasts animate out too; the glass layer fades away when it is switched off.
  const dialogs = useLeavingList(dialog ? [dialog] : [], (d) => d.kind + ('board' in d ? d.board.id : 'scene' in d ? d.scene.id : ''))
  const toastList = useLeavingList(toasts, (t) => String(t.id))
  const toastBox = useRef<HTMLDivElement>(null)
  useFlip(toastBox)
  const glass = useExit(prefs.refractiveGlass, 500)

  return (
    <>
      <div className="backdrop">
        <BackgroundLayer
          background={prefs.background}
          active={connected && c.ledOn}
          hue={preview.hue}
          sat={preview.sat}
          tint={colors.onBg}
          liquid={liquid}
          imageDim={prefs.imageDim}
        />
      </div>
      {glass.mounted && <GlassLayer bg={colors.bg} leaving={glass.leaving} />}
      {/* refractive glass without WebGL: a CSS backdrop filter (no rim bend) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="refract" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="1" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="28" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <main className={'app' + (mainScreen !== screen ? ' leaving' : '')} key={screen}>
        {screen === 'settings' ? (
          <SettingsScreen onBack={() => setShowSettings(false)} onWhatsNew={() => setDialog({ kind: 'whatsNew' })} />
        ) : screen === 'home' ? (
          <HomeScreen
            c={c}
            preview={preview}
            rainbowHue={rainbowHue}
            boardTitle={boardTitle}
            onRename={() => currentBoard && setDialog({ kind: 'renameBoard', board: currentBoard })}
            onSettings={() => setShowSettings(true)}
            onBack={() => setBoardOpen(false)}
            onDisconnect={() => ble.disconnect()}
            onSleepMenu={() => setDialog({ kind: 'sleep' })}
            onAddScene={() => {
              if (c.canSaveScene) setDialog({ kind: 'addScene' })
              else toast("Music, Visualizer and Screen sync can't be saved as scenes.")
            }}
            onSceneMenu={(scene) => setDialog({ kind: 'sceneMenu', scene })}
          />
        ) : (
          <ConnectScreen
            paired={prefs.pairedBoards}
            names={prefs.boardNames}
            onSettings={() => setShowSettings(true)}
            onOpenBoard={(b) => {
              if (connected && conn.deviceId === b.id) setBoardOpen(true)
              else void ble.connectKnown(b.id, b.bleName)
            }}
            onBoardMenu={(b) => setDialog({ kind: 'boardMenu', board: b })}
            onAdd={() => {
              if (conn.state !== 'disconnected') ble.disconnect()
              void ble.findAndConnect()
            }}
          />
        )}
      </main>

      {dialogs.map(({ item: d, key, leaving }) => (
        <div key={key} className={'dialog-host' + (leaving ? ' closing' : '')}>
        {d.kind === 'renameBoard' && (
          <NameDialog
            title="Name this board"
            subtitle={`Shown in Glow only. Leave it empty to use the Bluetooth name${d.board.bleName ? ` (${d.board.bleName})` : ''}.`}
            initial={prefs.boardNames[d.board.id] ?? ''}
            placeholder={d.board.bleName ?? 'LED board'}
            allowEmpty
            onDismiss={() => setDialog(null)}
            onSave={(n) => { setBoardName(d.board.id, n); setDialog(null) }}
          />
        )}
        {d.kind === 'boardMenu' && (
          <ActionsDialog
            title={boardName(d.board)}
            subtitle={d.board.id}
            actions={[
              ['Rename', () => setDialog({ kind: 'renameBoard', board: d.board })],
              ['Forget', () => {
                if (conn.deviceId === d.board.id) ble.disconnect()
                settings.set({ pairedBoards: prefs.pairedBoards.filter((b) => b.id !== d.board.id) })
                setBoardName(d.board.id, '')
                setDialog(null)
              }],
            ]}
            onDismiss={() => setDialog(null)}
          />
        )}
        {d.kind === 'sleep' && (
          <ActionsDialog
            title="Sleep timer"
            subtitle={c.s.sleepEndsAt ? `Running: off in about ${Math.floor((c.s.sleepEndsAt - Date.now()) / 60_000) + 1} min` : 'The light fades slowly to off'}
            actions={([
              ['15 minutes', () => { setDialog(null); c.startSleep(15) }],
              ['30 minutes', () => { setDialog(null); c.startSleep(30) }],
              ['1 hour', () => { setDialog(null); c.startSleep(60) }],
            ] as [string, () => void][]).concat(c.s.sleepEndsAt ? [['Stop the timer', () => { setDialog(null); c.startSleep(0) }]] : [])}
            onDismiss={() => setDialog(null)}
          />
        )}
        {d.kind === 'addScene' && (
          <NameDialog
            title="Save scene"
            subtitle="Saves the mode, colour and brightness you have now."
            initial=""
            placeholder={c.sceneSuggestion}
            allowEmpty
            onDismiss={() => setDialog(null)}
            onSave={(n) => { c.addScene(n || c.sceneSuggestion); setDialog(null); sound.confirm() }}
          />
        )}
        {d.kind === 'sceneMenu' && (
          <ActionsDialog
            title={d.scene.name}
            subtitle="Scene"
            actions={([
              ['Rename', () => setDialog({ kind: 'renameScene', scene: d.scene })],
            ] as [string, () => void][])
              .concat(c.canSaveScene ? [['Update to the current light', () => { c.updateSceneToCurrent(d.scene); setDialog(null); sound.confirm() }]] : [])
              .concat([['Delete', () => { c.deleteScene(d.scene); setDialog(null) }]])}
            onDismiss={() => setDialog(null)}
          />
        )}
        {d.kind === 'renameScene' && (
          <NameDialog
            title="Rename scene"
            initial={d.scene.name}
            placeholder={d.scene.name}
            onDismiss={() => setDialog(null)}
            onSave={(n) => { c.renameScene(d.scene, n); setDialog(null) }}
          />
        )}
        {d.kind === 'whatsNew' && (
          <Dialog onDismiss={() => setDialog(null)} wide>
            <h2 className="dialog-title">What's new</h2>
            <div className="dialog-sub">Glow for Windows v{APP_VERSION}</div>
            <div className="whats-new">
              {WHATS_NEW.map((w) => (
                <div key={w.version}>
                  <h3>v{w.version}</h3>
                  <ul>{w.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </div>
              ))}
            </div>
            <PillButton text="Got it" highlighted onClick={() => setDialog(null)} />
          </Dialog>
        )}
        {d.kind === 'update' && (
          <UpdateDialog
            app={app}
            ota={ota}
            onLater={() => setDialog(null)}
            onSettings={() => {
              setDialog(null)
              settings.set({ collapsed: { ...settings.get().collapsed, firmware: false } })
              setShowSettings(true)
            }}
          />
        )}
        </div>
      ))}

      <div ref={toastBox} className="toasts" aria-live="polite">
        {toastList.map(({ item: t, key, leaving }) => <div key={key} data-flip={key} className={'toast' + (leaving ? ' leaving' : '')}>{t.text}</div>)}
      </div>
    </>
  )
}

/** "Update available": Glow's own update is one click (download, swap, restart); firmware lives in Settings. */
function UpdateDialog(props: { app: AppUpdateState; ota: OtaState; onLater: () => void; onSettings: () => void }) {
  const { app, ota } = props
  const installing = app.kind === 'downloading' || app.kind === 'restarting'
  const release = app.kind === 'available' || app.kind === 'error' ? app.release : undefined
  return (
    <Dialog onDismiss={props.onLater}>
      <h2 className="dialog-title">{installing ? 'Updating Glow' : 'Update available'}</h2>
      <Swap k={installing ? 'busy' : 'offer'} className="stack">
        {installing ? (
          <>
            <div className="dialog-sub">
              {app.kind === 'downloading'
                ? `Downloading v${app.version}…${app.fraction != null ? ` ${Math.floor(app.fraction * 100)} %` : ''}`
                : app.kind === 'restarting' ? `Installing v${app.version}. Glow restarts by itself…` : ''}
            </div>
            <ProgressBar fraction={app.kind === 'downloading' ? app.fraction : 1} />
          </>
        ) : (
          <>
            {release && <div className="dialog-sub">Glow for Windows v{release.version}</div>}
            {ota.kind === 'available' && <div className="dialog-sub">Board firmware v{ota.release.version}</div>}
            {app.kind === 'error' && <div className="dialog-sub">{app.message}</div>}
            <div className="dialog-buttons">
              <PillButton text="Later" onClick={props.onLater} />
              {release
                ? <PillButton text={app.kind === 'error' ? 'Try again' : 'Update now'} highlighted onClick={() => void installAppUpdate(release)} />
                : <PillButton text="Open Settings" highlighted onClick={props.onSettings} />}
            </div>
          </>
        )}
      </Swap>
    </Dialog>
  )
}
