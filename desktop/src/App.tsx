// The app shell: theme, background, which screen shows (boards / board / settings), dialogs,
// toasts, and the desktop wiring (tray while something runs, keep the display awake, updates).

import { useEffect, useMemo, useState } from 'react'
import { ble, useBle } from './ble/ble'
import { desktop, APP_VERSION } from './desktop'
import { compareVersions, hsvCss } from './led/color'
import { MODE } from './model/modes'
import type { Scene } from './model/scenes'
import { settings, useSettings, type PairedBoard } from './settings/store'
import { useAutoStatus } from './auto/autoLight'
import { checkFirmware, useOta } from './ota/ota'
import { checkAppUpdate, useAppUpdate } from './ui/appUpdate'
import { BackgroundLayer } from './ui/backgrounds/Backgrounds'
import { GlassLayer } from './ui/backgrounds/Glass'
import { ActionsDialog, Dialog, NameDialog, PillButton } from './ui/components/Controls'
import { ConnectScreen } from './ui/screens/ConnectScreen'
import { HomeScreen, previewOf } from './ui/screens/HomeScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { useLed } from './ui/screens/useLed'
import { applyTheme, useSystemDark } from './ui/theme'
import { toast, useToasts } from './ui/toast'
import { WHATS_NEW } from './ui/whatsNew'
import { sound } from './ui/sound'

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
      {prefs.refractiveGlass && <GlassLayer bg={colors.bg} />}
      {/* refractive glass without WebGL: a CSS backdrop filter (no rim bend) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="refract" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="1" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="28" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <main className="app" key={mainScreen}>
        {mainScreen === 'settings' ? (
          <SettingsScreen onBack={() => setShowSettings(false)} onWhatsNew={() => setDialog({ kind: 'whatsNew' })} />
        ) : mainScreen === 'home' ? (
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

      {dialog?.kind === 'renameBoard' && (
        <NameDialog
          title="Name this board"
          subtitle={`Shown in Glow only. Leave it empty to use the Bluetooth name${dialog.board.bleName ? ` (${dialog.board.bleName})` : ''}.`}
          initial={prefs.boardNames[dialog.board.id] ?? ''}
          placeholder={dialog.board.bleName ?? 'LED board'}
          allowEmpty
          onDismiss={() => setDialog(null)}
          onSave={(n) => { setBoardName(dialog.board.id, n); setDialog(null) }}
        />
      )}
      {dialog?.kind === 'boardMenu' && (
        <ActionsDialog
          title={boardName(dialog.board)}
          subtitle={dialog.board.id}
          actions={[
            ['Rename', () => setDialog({ kind: 'renameBoard', board: dialog.board })],
            ['Forget', () => {
              if (conn.deviceId === dialog.board.id) ble.disconnect()
              settings.set({ pairedBoards: prefs.pairedBoards.filter((b) => b.id !== dialog.board.id) })
              setBoardName(dialog.board.id, '')
              setDialog(null)
            }],
          ]}
          onDismiss={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'sleep' && (
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
      {dialog?.kind === 'addScene' && (
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
      {dialog?.kind === 'sceneMenu' && (
        <ActionsDialog
          title={dialog.scene.name}
          subtitle="Scene"
          actions={([
            ['Rename', () => setDialog({ kind: 'renameScene', scene: dialog.scene })],
          ] as [string, () => void][])
            .concat(c.canSaveScene ? [['Update to the current light', () => { c.updateSceneToCurrent(dialog.scene); setDialog(null); sound.confirm() }]] : [])
            .concat([['Delete', () => { c.deleteScene(dialog.scene); setDialog(null) }]])}
          onDismiss={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'renameScene' && (
        <NameDialog
          title="Rename scene"
          initial={dialog.scene.name}
          placeholder={dialog.scene.name}
          onDismiss={() => setDialog(null)}
          onSave={(n) => { c.renameScene(dialog.scene, n); setDialog(null) }}
        />
      )}
      {dialog?.kind === 'whatsNew' && (
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
      {dialog?.kind === 'update' && (
        <Dialog onDismiss={() => setDialog(null)}>
          <h2 className="dialog-title">Update available</h2>
          {app.kind === 'available' && <div className="dialog-sub">Glow for Windows v{app.release.version}</div>}
          {ota.kind === 'available' && <div className="dialog-sub">Board firmware v{ota.release.version}</div>}
          <div className="dialog-buttons">
            <PillButton text="Later" onClick={() => setDialog(null)} />
            <PillButton text="Open Settings" highlighted onClick={() => {
              setDialog(null)
              settings.set({ collapsed: { ...settings.get().collapsed, firmware: false } })
              setShowSettings(true)
            }} />
          </div>
        </Dialog>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
    </>
  )
}
