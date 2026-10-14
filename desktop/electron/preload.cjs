// The bridge between the UI and electron/main.cjs: everything the UI may ask of the desktop.
// The UI sees it as `window.glow` (typed in src/desktop.ts).

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
  openExternal: (url) => ipcRenderer.send('shell:open', url),
  keepRunning: (on) => ipcRenderer.send('app:keepRunning', on),
})
