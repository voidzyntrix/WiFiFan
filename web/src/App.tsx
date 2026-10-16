// The app shell, the same on every platform: theme (Material You), background and glass, which screen
// shows (devices / a device's own control screen / settings), the app's own dialogs, toasts, and app
// updates. It knows devices only through the connection manager and the device types' interface.

import { useEffect, useMemo, useRef, useState } from 'react'
import { connection, displayName, useConnection } from './devices/connection'
import { DEVICE_TYPES, deviceType } from './devices/registry'
import type { SavedDevice } from './devices/types'
import { APP_VERSION, platform } from './platform'
import { compareVersions } from './lib/color'
import { settings, useSettings, type Background } from './settings/store'
import { checkAppUpdate, installAppUpdate, useAppUpdate, type AppUpdateState } from './ui/appUpdate'
import { useAmbient } from './ui/ambient'
import { BackgroundLayer } from './ui/backgrounds/Backgrounds'
import { GlassLayer } from './ui/backgrounds/Glass'
import { ActionsDialog, Dialog, DialogClosing, NameDialog, PillButton, ProgressBar } from './ui/components/Controls'
import { DevicesScreen } from './ui/screens/DevicesScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { applyTheme, useSystemAccent, useSystemDark } from './ui/theme'
import { toast, useToasts } from './ui/toast'
import { WHATS_NEW } from './ui/whatsNew'
import { Swap, pulse, useExit, useFlip, useLeavingList } from './ui/motion'

const UPDATE_CHECK_MS = 5000

type DialogState =
  | { kind: 'rename'; device: SavedDevice }
  | { kind: 'deviceMenu'; device: SavedDevice }
  | { kind: 'setup'; typeId: string; ssid?: string }
  | { kind: 'reset'; device: SavedDevice }
  | { kind: 'whatsNew' }
  | { kind: 'update' }
  | null

/** The background follows the light; only this component listens to it, so a rainbow redraws the canvas, not the app. */
function Backdrop(props: { background: Background; tint: string; imageDim: number }) {
  const ambient = useAmbient()
  return <BackgroundLayer background={props.background} active={ambient.active} hue={ambient.hue} sat={ambient.sat} tint={props.tint} imageDim={props.imageDim} />
}

export function App() {
  const prefs = useSettings()
  const systemDark = useSystemDark()
  const systemAccent = useSystemAccent()
  const conn = useConnection()
  const app = useAppUpdate()
  const toasts = useToasts()
  const [showSettings, setShowSettings] = useState(false)
  // A connected device can be left for the device list without disconnecting.
  const [deviceOpen, setDeviceOpen] = useState(true)
  const [dialog, setDialog] = useState<DialogState>(null)
  const connected = conn.phase === 'connected' && !!conn.device

  const colors = useMemo(() => applyTheme(prefs, systemDark, systemAccent), [prefs, systemDark, systemAccent])

  // Backslash: the demo device (the controls without a device) on or off, in release builds too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return
      if (e.target instanceof Element && e.target.closest('input, textarea')) return
      e.preventDefault()
      const c = connection.get()
      if (c.demo) { connection.disconnect(); toast('Demo off') }
      else if (c.phase === 'idle') { connection.startDemo(); toast('Demo on. Press \\ again to leave it.') }
      else toast('Disconnect first to use the demo.')
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

  // A device that connects opens.
  useEffect(() => { if (connected) setDeviceOpen(true) }, [connected])

  useEffect(() => { platform.keepAwake(prefs.keepScreenOn) }, [prefs.keepScreenOn])
  useEffect(() => {
    document.title = connected && conn.device ? `Glow · ${displayName(conn.device)}` : 'Glow'
  }, [connected, conn.device])

  // App update checks at launch, then every few seconds, quietly (the release feed has no rate limit).
  useEffect(() => {
    void checkAppUpdate(true)
    const timer = window.setInterval(() => void checkAppUpdate(true), UPDATE_CHECK_MS)
    return () => window.clearInterval(timer)
  }, [])

  // "What's new" once after an update; a fresh install only remembers its version.
  useEffect(() => {
    const seen = settings.get().lastSeenVersion
    if (seen != null && compareVersions(APP_VERSION, seen) > 0) setDialog({ kind: 'whatsNew' })
    if (seen == null || compareVersions(APP_VERSION, seen) > 0) settings.set({ lastSeenVersion: APP_VERSION })
  }, [])

  // The update prompt waits until Settings and other dialogs are closed; each offer once a run.
  const offer = app.kind === 'available' ? app.release.version : ''
  const [offered, setOffered] = useState('')
  useEffect(() => {
    if (prefs.updatePrompts && offer && offer !== offered && !showSettings && !dialog) {
      setOffered(offer)
      setDialog({ kind: 'update' })
    }
  }, [offer, prefs.updatePrompts, showSettings, dialog])

  const mainScreen = showSettings ? 'settings' : connected && deviceOpen ? 'control' : 'devices'

  // A screen leaves (fades, shrinks away) before the next one comes in.
  const [screen, setScreen] = useState(mainScreen)
  // Material shared axis: deeper (devices > a device > settings) slides in from the right, back from the left
  const depth: Record<string, number> = { devices: 0, control: 1, settings: 2 }
  const dirRef = useRef('forward')   // kept after the swap, so the screen that arrives slides in from the same side
  if (mainScreen !== screen) dirRef.current = depth[mainScreen] > depth[screen] ? 'forward' : 'back'
  const dir = dirRef.current
  useEffect(() => {
    if (mainScreen === screen) return
    const t = window.setTimeout(() => setScreen(mainScreen), 120)
    return () => window.clearTimeout(t)
  }, [mainScreen, screen])

  // Android's back button: close a dialog, leave Settings, leave the control screen, stop a scan.
  const back = useRef<() => boolean>(() => false)
  back.current = () => {
    if (dialog) { if (dialog.kind !== 'reset' || !resetting) setDialog(null); return true }
    if (showSettings) { setShowSettings(false); return true }
    if (connected && deviceOpen) { setDeviceOpen(false); return true }
    if (conn.phase === 'scanning') { connection.cancelScan(); return true }
    return false
  }
  useEffect(() => platform.onBack(() => back.current()), [])

  // Dialogs and toasts animate out too; the glass layer fades away when it is switched off.
  const dialogs = useLeavingList(dialog ? [dialog] : [], (d) => d.kind + ('device' in d ? d.device.id : ''))
  const toastList = useLeavingList(toasts, (t) => String(t.id))
  const toastBox = useRef<HTMLDivElement>(null)
  useFlip(toastBox)
  const glassOn = prefs.design === 'GLASS' && prefs.refractiveGlass && !prefs.lightEffects
  const glass = useExit(glassOn, 500)

  const type = conn.device ? deviceType(conn.device.type) : undefined
  const Control = type?.ControlScreen
  const [resetting, setResetting] = useState(false)
  const doReset = async (device: SavedDevice) => {
    setResetting(true)
    const ok = await connection.reset(device)
    setResetting(false)
    if (ok) setDialog(null)
  }

  return (
    <>
      {prefs.design === 'GLASS' && (
        <div className="backdrop">
          <Backdrop background={prefs.background} tint={colors.onBg} imageDim={prefs.imageDim} />
        </div>
      )}
      {glass.mounted && <GlassLayer bg={colors.bg} leaving={glass.leaving} />}
      {/* refractive glass without WebGL: a CSS backdrop filter (no rim bend) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="refract" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="1" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="28" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <main className={'app' + (mainScreen !== screen ? ' leaving' : '') + (screen === 'settings' ? ' scrolls' : '')} key={screen} data-dir={dir}>
        {screen === 'settings' ? (
          <SettingsScreen onBack={() => setShowSettings(false)} onWhatsNew={() => setDialog({ kind: 'whatsNew' })} />
        ) : screen === 'control' && Control && conn.device ? (
          <Control
            device={conn.device}
            onBack={() => setDeviceOpen(false)}
            onSettings={() => setShowSettings(true)}
            onDisconnect={() => connection.disconnect()}
            onRename={() => conn.device && setDialog({ kind: 'rename', device: conn.device })}
            onReset={conn.session?.reset ? () => conn.device && setDialog({ kind: 'reset', device: conn.device }) : undefined}
          />
        ) : (
          <DevicesScreen
            onSettings={() => setShowSettings(true)}
            onOpen={(d) => {
              if (connected && conn.device?.id === d.id) setDeviceOpen(true)
              else void connection.connect(d)
            }}
            onMenu={(d) => setDialog({ kind: 'deviceMenu', device: d })}
            onSetup={(typeId, ssid) => { connection.cancelScan(); setDialog({ kind: 'setup', typeId, ssid }) }}
          />
        )}
      </main>

      {dialogs.map(({ item: d, key, leaving }) => (
        <DialogClosing.Provider key={key} value={leaving}>
          {d.kind === 'rename' && (
            <NameDialog
              title="Name this device"
              subtitle={`Shown in Glow only. Leave it empty to use the name it advertises${d.device.advertised ? ` (${d.device.advertised})` : ''}.`}
              initial={d.device.name ?? ''}
              placeholder={d.device.advertised ?? deviceType(d.device.type)?.label ?? 'Device'}
              allowEmpty
              onDismiss={() => setDialog(null)}
              onSave={(n) => { connection.rename(d.device.id, n); setDialog(null) }}
            />
          )}
          {d.kind === 'deviceMenu' && (
            <ActionsDialog
              title={displayName(d.device)}
              subtitle={`${deviceType(d.device.type)?.label ?? 'Device'} · ${d.device.id}`}
              actions={[
                ['Rename', () => setDialog({ kind: 'rename', device: d.device })],
                ...(deviceType(d.device.type)?.transport === 'wifi'
                  ? [['Reset device', () => setDialog({ kind: 'reset', device: d.device })] as [string, () => void]]
                  : []),
                ['Forget', () => { connection.forget(d.device.id); setDialog(null) }],
              ]}
              onDismiss={() => setDialog(null)}
            />
          )}
          {d.kind === 'setup' && (() => {
            const Setup = DEVICE_TYPES.find((t) => t.id === d.typeId)?.Setup
            return Setup && (
              <Setup
                ssid={d.ssid}
                onDismiss={() => setDialog(null)}
                onDone={(device) => { setDialog(null); void connection.connect(device) }}
              />
            )
          })()}
          {d.kind === 'reset' && (
            <Dialog onDismiss={() => { if (!resetting) setDialog(null) }}>
              <h2 className="dialog-title">Reset {displayName(d.device)}?</h2>
              <div className="dialog-sub">
                It forgets its Wi-Fi network and opens its own setup network again, and Glow forgets it.
                Set it up again to use it.
              </div>
              <Swap k={resetting ? 'busy' : 'ask'} className="stack">
                {resetting ? <ProgressBar fraction={null} /> : (
                  <div className="dialog-buttons">
                    <PillButton text="Cancel" onClick={() => setDialog(null)} />
                    <PillButton text="Reset" highlighted onClick={() => void doReset(d.device)} />
                  </div>
                )}
              </Swap>
            </Dialog>
          )}
          {d.kind === 'whatsNew' && (
            <Dialog onDismiss={() => setDialog(null)} wide>
              <h2 className="dialog-title">What's new</h2>
              <div className="dialog-sub">{platform.name} v{APP_VERSION}</div>
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
          {d.kind === 'update' && <UpdateDialog app={app} onLater={() => setDialog(null)} />}
        </DialogClosing.Provider>
      ))}

      <div ref={toastBox} className="toasts" aria-live="polite">
        {toastList.map(({ item: t, key, leaving }) => <div key={key} data-flip={key} className={'toast' + (leaving ? ' leaving' : '')}>{t.text}</div>)}
      </div>
    </>
  )
}

/** "Update available": one click (download, swap in, restart or let Android install it). */
function UpdateDialog(props: { app: AppUpdateState; onLater: () => void }) {
  const { app } = props
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
                : app.kind === 'restarting' ? `Installing v${app.version}…` : ''}
            </div>
            <ProgressBar fraction={app.kind === 'downloading' ? app.fraction : 1} />
          </>
        ) : (
          <>
            {release && <div className="dialog-sub">{platform.name} v{release.version}</div>}
            {app.kind === 'error' && <div className="dialog-sub">{app.message}</div>}
            <div className="dialog-buttons">
              <PillButton text="Later" onClick={props.onLater} />
              {release && <PillButton text={app.kind === 'error' ? 'Try again' : 'Update now'} highlighted onClick={() => void installAppUpdate(release)} />}
            </div>
          </>
        )}
      </Swap>
    </Dialog>
  )
}
