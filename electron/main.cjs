const { app, BrowserWindow, Menu, protocol, session, ipcMain, dialog, clipboard, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { SaveSessions } = require('./files.cjs')
const { BatchFiles } = require('./batch.cjs')
const batches = new BatchFiles(async (owner, title) => {
  const window = BrowserWindow.getAllWindows().find(item => String(item.webContents.id) === owner.split(':')[0])
  if (!window || window.isDestroyed()) return null
  const result = await dialog.showOpenDialog(window, { title, properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
}, path.dirname(app.getPath('exe')), folder => shell.openPath(folder))
const saves = new SaveSessions(async (owner, name) => {
  const window = BrowserWindow.getAllWindows().find(item => String(item.webContents.id) === owner.split(':')[0])
  if (!window || window.isDestroyed()) return null
  const result = await dialog.showSaveDialog(window, { defaultPath: name, properties: ['showOverwriteConfirmation', 'createDirectory'] })
  if (result.canceled || !result.filePath) return null
  const installRoot = await fs.realpath(path.dirname(app.getPath('exe')))
  const parent = await fs.realpath(path.dirname(result.filePath))
  const relative = path.relative(installRoot, parent)
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    await dialog.showMessageBox(window, { type: 'info', message: '请将导出文件保存到应用安装目录以外', detail: '这样升级和卸载不会删除导出的图片。' })
    return null
  }
  return result.filePath
})
function caller(event) {
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame || !allowedNavigation(frame.url)) throw Error('Untrusted frame')
  return event.sender.id + ':' + frame.routingId
}

const { createHandler, isToolRoute } = require('./protocol.cjs')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
const devArgument = process.argv.find(argument => argument.startsWith('--desktop-dev-url='))
const devUrl = !app.isPackaged && devArgument ? devArgument.slice('--desktop-dev-url='.length) : null
if (devUrl && devUrl !== 'http://127.0.0.1:5179') throw Error('Unsupported desktop development origin')
function allowedNavigation(value) {
  try {
    const url = new URL(value)
    const allowedOrigin = devUrl ? url.origin === devUrl : url.protocol === 'app:' && url.host === 'bundle'
    return allowedOrigin && !url.username && !url.password && isToolRoute(url.pathname)
  } catch { return false }
}
function createWindow() {
  const window = new BrowserWindow({
    width: 1200, height: 850, minWidth: 800, minHeight: 600, title: 'DevKit 图片工具 · 内测版',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, additionalArguments: ['--devkit-version=' + app.getVersion()] },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (!allowedNavigation(url)) event.preventDefault() })
  window.webContents.on('will-redirect', (event, url) => { if (!allowedNavigation(url)) event.preventDefault() })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  let owner
  window.webContents.on('did-finish-load', () => { owner = window.webContents.id + ':' + window.webContents.mainFrame.routingId })
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace && owner) void Promise.all([saves.invalidate(owner), batches.release(owner)]) })
  window.webContents.on('render-process-gone', async (_event, details) => {
    if (owner) await Promise.all([saves.invalidate(owner), batches.release(owner)])
    if (window.isDestroyed() || exiting || details.reason === 'clean-exit') return
    const result = await dialog.showMessageBox(window, { type: 'error', message: '图片处理页面意外关闭', detail: '未保存的结果已丢弃。可以重新加载后重试。', buttons: ['重新加载', '退出'], defaultId: 0, cancelId: 1 })
    if (!window.isDestroyed()) result.response === 0 ? window.webContents.reload() : window.close()
  })
  window.on('closed', () => { if (owner) void Promise.all([saves.invalidate(owner), batches.release(owner)]) })
  window.loadURL(devUrl ?? 'app://bundle/')
  return window
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  for (const method of ['input', 'output', 'read', 'begin', 'append', 'finish', 'cancel', 'release', 'open']) {
    ipcMain.handle('batch:' + method, (event, ...args) => batches[method](caller(event), ...args))
  }
  for (const [channel, action] of Object.entries({
    'files:begin': (owner, name, size) => saves.begin(owner, name, size),
    'files:append': (owner, id, sequence, bytes) => saves.append(owner, id, sequence, bytes),
    'files:finish': (owner, id) => saves.finish(owner, id),
    'files:cancel': (owner, id) => saves.cancel(owner, id),
  })) ipcMain.handle(channel, async (event, ...args) => {
    try { return await action(caller(event), ...args) }
    catch { return { status: 'failed', message: '保存请求无效' } }
  })
  ipcMain.handle('clipboard:write', async (event, text) => {
    caller(event)
    if (typeof text !== 'string' || text.length > 16 * 1024 * 1024) throw Error('Invalid clipboard text')
    await clipboard.writeText(text)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await clipboard.readText() === text) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw Error('系统剪贴板不可用，请手动选择文本复制')
  })
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'clipboard-sanitized-write' && !!contents && allowedNavigation(contents.mainFrame.url)))
  session.defaultSession.setPermissionCheckHandler((contents, permission) => permission === 'clipboard-sanitized-write' && !!contents && allowedNavigation(contents.mainFrame.url))
  // Production must stay local, including subresources, workers and redirects.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = /^(app:\/\/bundle\/|blob:|data:)/.test(details.url)
    if (devUrl) allowed ||= details.url.startsWith(devUrl + '/') || details.url.startsWith('ws://127.0.0.1:5179/')
    callback({ cancel: !allowed })
  })
  protocol.handle('app', createHandler(path.join(app.getAppPath(), 'dist-desktop')))
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})
let exiting = false
app.on('before-quit', event => { if (!exiting) { event.preventDefault(); exiting = true; void Promise.all([saves.dispose(), batches.dispose()]).finally(() => app.quit()) } })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
