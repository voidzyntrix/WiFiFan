// Glow for Windows: the Electron main process.
//
// The UI is the shared Glow app (web/, React; the same app Glow for Android hosts), built into dist/
// and run in a Chromium window. This file gives it what a web page can't do
// on its own, standing in for the Android app's system services:
//
//  - Bluetooth: Chromium's Web Bluetooth asks the app to pick a device; the list is forwarded to
//    the UI, which shows it like the Android "Nearby devices" list (select-bluetooth-device).
//  - Screen sync / Visualizer: screen capture with Windows' system audio loopback
//    (the stand-in for Android's MediaProjection + playback capture).
//  - Auto light: Windows lock/unlock and input-idle time (the stand-in for screen on/off and
//    the keyguard).
//  - Tray: while Music, Visualizer, Screen sync or Auto light runs, closing the window keeps Glow
//    running in the tray (the stand-in for the foreground services and their notifications).
//  - Wi-Fi boards: UDP discovery and TCP links (wifi.cjs).
//  - Network: GitHub release files are fetched here, where browser CORS rules don't apply.
//  - WebSocket API: api.cjs listens on 127.0.0.1; the UI process (web/src/api/bridge.ts) answers.
//  - Headless: the window is hidden (and the UI unmounted by the app) so only the API and the
//    board link keep running; the tray brings the window back.
//  - Updates: the UI's "Update" downloads the new Glow.exe, swaps it in and restarts (updater.cjs).

const {
  app, BrowserWindow, ipcMain, session, desktopCapturer, powerMonitor, powerSaveBlocker,
  Tray, Menu, nativeImage, net, shell, screen, systemPreferences,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { createApiServer } = require('./api.cjs')
const updater = require('./updater.cjs')
const { setupWifi } = require('./wifi.cjs')

// Windows' hardware-overlay compositing (Multi-Plane Overlay) has a long-standing Chromium bug:
// cursors with alpha (the system's grab/gripping hands, and any custom bitmap do this) blend
// half-transparent and wash out over the app (chromium issue 40239916 — "cursor goes white and
// nearly invisible"; the team's hunch: alpha blending gone wrong once the window sits in an MPO
// overlay plane). Visualizer and Screen sync open real video capture, which is what invites the
// overlay plane, but their frames feed analysers — the video itself is never shown. Turning the
// overlay path off costs only that invisible-video promotion, and every cursor keeps its alpha on
// any machine: no per-cursor bitmaps needed, for these and for future custom ones.
if (process.platform === 'win32') app.commandLine.appendSwitch('disable-direct-composition-video-overlays')

const DEV_URL = process.env.GLOW_DEV_URL   // set by scripts/dev.mjs
let win = null
let tray = null
let quitting = false
/** The UI says a sync or Auto light is running: closing the window hides it to the tray. */
let keepRunning = false
let keepAwakeId = null
/** Headless mode: no window, only the API. Remembered in a flag file so a launch can skip the window. */
let headless = false
const headlessFlag = () => path.join(app.getPath('userData'), 'headless')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

// ---------------------------------------------------------------------------
// Bluetooth device picking
// ---------------------------------------------------------------------------

/** The pending requestDevice() callback; one scan at a time. */
let pickCallback = null
/** When the UI asked to reconnect to a known board: pick it as soon as it is heard. */
let autoPickId = null

function finishPick(deviceId) {
  const cb = pickCallback
  pickCallback = null
  autoPickId = null
  if (cb) cb(deviceId || '')
}

function setupBluetooth(contents) {
  contents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    // Chromium calls this again every time the list grows; only the newest callback counts.
    pickCallback = callback
    if (autoPickId && devices.some((d) => d.deviceId === autoPickId)) {
      finishPick(autoPickId)
      return
    }
    contents.send('bt:devices', devices.map((d) => ({ id: d.deviceId, name: d.deviceName || null })))
  })
}

ipcMain.on('bt:pick', (_e, deviceId) => finishPick(deviceId))
ipcMain.on('bt:cancel', () => finishPick(''))
ipcMain.on('bt:autoPick', (_e, deviceId) => { autoPickId = deviceId })

// ---------------------------------------------------------------------------
// Screen and system audio capture
// ---------------------------------------------------------------------------

/** Which display Screen sync looks at (an index into screen.getAllDisplays()). */
let captureDisplay = 0

function setupCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      const displays = screen.getAllDisplays()
      const wanted = displays[captureDisplay]
      const source = sources.find((s) => wanted && s.display_id === String(wanted.id)) || sources[0]
      // 'loopback' is everything Windows plays: the Visualizer's audio.
      callback(request.audioRequested ? { video: source, audio: 'loopback' } : { video: source })
    } catch {
      callback({})
    }
  })
  ipcMain.handle('capture:displays', () =>
    screen.getAllDisplays().map((d, i) => ({ index: i, label: `${d.label || 'Display ' + (i + 1)} (${d.size.width}×${d.size.height})` })))
  ipcMain.on('capture:setDisplay', (_e, index) => { captureDisplay = Number(index) || 0 })
}

// ---------------------------------------------------------------------------
// Auto light: lock state and idle time
// ---------------------------------------------------------------------------

let locked = false

function setupPower() {
  const tell = () => win && win.webContents.send('power:changed', { locked })
  powerMonitor.on('lock-screen', () => { locked = true; tell() })
  powerMonitor.on('unlock-screen', () => { locked = false; tell() })
  powerMonitor.on('suspend', () => { locked = true; tell() })
  powerMonitor.on('resume', () => tell())
  ipcMain.handle('power:state', () => ({
    locked,
    idleSeconds: powerMonitor.getSystemIdleTime(),
  }))
  ipcMain.on('power:keepAwake', (_e, on) => {
    if (on && keepAwakeId === null) keepAwakeId = powerSaveBlocker.start('prevent-display-sleep')
    if (!on && keepAwakeId !== null) { powerSaveBlocker.stop(keepAwakeId); keepAwakeId = null }
  })
}

// ---------------------------------------------------------------------------
// Network (no CORS here)
// ---------------------------------------------------------------------------

async function fetchChecked(url, method = 'GET') {
  const res = await net.fetch(url, {
    method,
    headers: { 'User-Agent': 'Glow-desktop', Accept: 'application/vnd.github+json, application/octet-stream' },
  })
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}`)
  return res
}

function setupNet() {
  ipcMain.handle('net:text', async (_e, url) => (await fetchChecked(url)).text())
  ipcMain.handle('net:bytes', async (_e, url, limit) => {
    const buf = new Uint8Array(await (await fetchChecked(url)).arrayBuffer())
    if (limit && buf.length > limit) throw new Error('Download larger than expected')
    return buf
  })
  ipcMain.handle('net:exists', async (_e, url) => {
    try { await fetchChecked(url, 'HEAD'); return true } catch { return false }
  })
  // Solar: the FoxESS cloud answers JSON POSTs (and nothing else may be reached this way).
  ipcMain.handle('net:post', async (_e, url, headers, body) => {
    if (new URL(url).origin !== 'https://www.foxesscloud.com') throw new Error('That address is not allowed')
    const res = await net.fetch(url, { method: 'POST', headers: { ...headers, 'User-Agent': 'Glow-desktop' }, body })
    if (!res.ok) throw new Error(`FoxESS answered HTTP ${res.status}`)
    return res.text()
  })
  // One-click update: download, swap the exe, restart. Errors reach the UI as the message text.
  ipcMain.handle('update:install', async (e, url, version) => {
    try {
      await updater.install({
        url, version,
        onProgress: (p) => { if (!e.sender.isDestroyed()) e.sender.send('update:progress', p) },
        quit: () => { quitting = true; app.quit() },
      })
    } catch (err) {
      throw new Error(err && err.message ? err.message : String(err))
    }
  })
  // Material You on Windows: the theme grows from the Windows accent colour.
  ipcMain.handle('theme:accent', () => {
    try {
      const c = systemPreferences.getAccentColor()          // RRGGBBAA
      return c ? `#${c.slice(0, 6)}` : null
    } catch { return null }
  })
  ipcMain.on('shell:open', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url) })
}

// ---------------------------------------------------------------------------
// Window and tray
// ---------------------------------------------------------------------------

function iconImage() {
  return nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
}

function showWindow() {
  if (headless) {
    headless = false
    try { fs.rmSync(headlessFlag(), { force: true }) } catch { /* the flag is a convenience */ }
    win?.webContents.send('headless:exit')
  }
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function ensureTray() {
  if (tray) return
  tray = new Tray(iconImage())
  tray.setToolTip('Glow')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Glow', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } },
  ]))
  tray.on('click', () => showWindow())
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#141414',
    title: 'Glow',
    icon: iconImage(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Music, Visualizer, Screen sync and Auto light keep driving the LED with the window hidden.
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => { if (!headless) win.show() })
  setupBluetooth(win.webContents)

  // Links open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', (e) => {
    if ((keepRunning || headless) && !quitting) {
      e.preventDefault()
      win.hide()
      ensureTray()
      tray.displayBalloon?.({ title: 'Glow keeps running', content: 'The LED is still being driven. Quit from the tray icon.' })
    }
  })
  win.on('closed', () => { win = null })

  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.on('app:keepRunning', (_e, on) => {
  keepRunning = !!on
  if (keepRunning) ensureTray()
  else if (tray && win && win.isVisible() && !headless) { tray.destroy(); tray = null }
})

// ---------------------------------------------------------------------------
// WebSocket API and headless mode
// ---------------------------------------------------------------------------

const api = createApiServer({
  onMessage: (id, text) => { if (win && !win.isDestroyed()) win.webContents.send('api:message', { id, text }) },
  onClients: (n) => { if (win && !win.isDestroyed()) win.webContents.send('api:clients', n) },
})
ipcMain.handle('api:listen', (_e, on, port) => (on ? api.start(Number(port) || 8765) : (api.stop(), false)))
ipcMain.on('api:send', (_e, id, text) => api.send(id, String(text)))

ipcMain.on('app:headless', (_e, on) => {
  headless = !!on
  try {
    if (headless) fs.writeFileSync(headlessFlag(), '1')
    else fs.rmSync(headlessFlag(), { force: true })
  } catch { /* the flag is a convenience */ }
  if (headless) { ensureTray(); win?.hide() }
  else { if (!keepRunning && tray) { tray.destroy(); tray = null } win?.show() }
})

app.whenReady().then(() => {
  try { headless = fs.existsSync(headlessFlag()) } catch { headless = false }
  if (headless) ensureTray()
  // Microphone, camera (room light) and the like: the UI only asks when a mode needs them.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))
  setupCapture()
  setupPower()
  setupNet()
  setupWifi(() => win)
  createWindow()
})

app.on('before-quit', () => { quitting = true; api.stop() })
app.on('window-all-closed', () => app.quit())
