// The bridge between the UI and electron/main.cjs: everything the UI may ask of the desktop.
// The UI sees it as `window.glow` (typed and wrapped in web/src/platform/index.ts).

const { contextBridge, ipcRenderer } = require('electron')

function listen(channel, fn) {
  const handler = (_e, data) => fn(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('glow', {
  platform: process.platform,
  bluetooth: {
    onDevices: (fn) => listen('bt:devices', fn),
    pick: (id) => ipcRenderer.send('bt:pick', id),
    cancel: () => ipcRenderer.send('bt:cancel'),
    autoPick: (id) => ipcRenderer.send('bt:autoPick', id),
  },
  wifi: {
    discover: (on) => ipcRenderer.send('wifi:discover', on),
    onFound: (fn) => listen('wifi:found', fn),
    connect: (host, port) => ipcRenderer.invoke('wifi:connect', host, port),
    write: (id, data) => ipcRenderer.invoke('wifi:write', id, data),
    close: (id) => ipcRenderer.send('wifi:close', id),
    onData: (fn) => listen('wifi:data', (d) => fn(d.id, d.data)),
    onClosed: (fn) => listen('wifi:closed', fn),
  },
  capture: {
    displays: () => ipcRenderer.invoke('capture:displays'),
    setDisplay: (index) => ipcRenderer.send('capture:setDisplay', index),
  },
  power: {
    state: () => ipcRenderer.invoke('power:state'),
    onChanged: (fn) => listen('power:changed', fn),
    keepAwake: (on) => ipcRenderer.send('power:keepAwake', on),
  },
  net: {
    text: (url) => ipcRenderer.invoke('net:text', url),
    bytes: (url, limit) => ipcRenderer.invoke('net:bytes', url, limit),
    exists: (url) => ipcRenderer.invoke('net:exists', url),
  },
  update: {
    install: (url, version) => ipcRenderer.invoke('update:install', url, version),
    onProgress: (fn) => listen('update:progress', fn),
  },
  theme: {
    accent: () => ipcRenderer.invoke('theme:accent'),
  },
  openExternal: (url) => ipcRenderer.send('shell:open', url),
  keepRunning: (on) => ipcRenderer.send('app:keepRunning', on),
})
