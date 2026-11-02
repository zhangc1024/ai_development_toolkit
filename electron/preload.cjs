const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktopBatch', Object.freeze(Object.fromEntries(
  ['input', 'output', 'read', 'begin', 'append', 'finish', 'cancel', 'release', 'open'].map(method => [method, (...args) => ipcRenderer.invoke('batch:' + method, ...args)]),
)))
contextBridge.exposeInMainWorld('desktopRuntime', Object.freeze({
  electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform,
  version: process.argv.find(value => value.startsWith('--devkit-version='))?.split('=')[1] ?? '0.1.0',
}))
contextBridge.exposeInMainWorld('desktopFiles', Object.freeze({
  begin: (name, size) => ipcRenderer.invoke('files:begin', name, size),
  append: (id, sequence, bytes) => ipcRenderer.invoke('files:append', id, sequence, bytes),
  finish: id => ipcRenderer.invoke('files:finish', id),
  cancel: id => ipcRenderer.invoke('files:cancel', id),
}))
contextBridge.exposeInMainWorld('desktopClipboard', Object.freeze({ writeText: text => ipcRenderer.invoke('clipboard:write', text) }))
