import { _electron } from 'playwright-core'
import { resolve, join } from 'node:path'
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = resolve('output/playwright/desktop-boundaries')
await mkdir(base, { recursive: true })
const out = await mkdtemp(join(base, 'run-'))
const env = { ...process.env, Path: '', PATH: '' }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: resolve('release/win-unpacked/DevKitImages.exe'), args: ['--disable-http-cache', '--host-resolver-rules=MAP * ~NOTFOUND', '--proxy-server=http://127.0.0.1:9'], env, timeout: 60_000 })
const result = { layout: [] }
let target
try {
 const page = await app.firstWindow(); page.setDefaultTimeout(30_000)
 await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
 result.emptyPathLaunch = true
 await app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /DoubleExposureTool-.*\.js/.test(details.url) || !/^(app:\/\/bundle\/|blob:|data:)/.test(details.url) })))
 await page.getByRole('navigation').getByRole('link', { name: '双重曝光', exact: true }).click()
 await page.getByRole('heading', { name: '工具加载失败', exact: true }).waitFor()
 await app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(app:\/\/bundle\/|blob:|data:)/.test(details.url) })))
 await page.getByRole('button', { name: '重试', exact: true }).click()
 await page.locator('.exposure-tool h2').waitFor()
 result.loadFailureRecovery = true
 await page.goto('app://bundle/tools/missing-tool/')
 await page.getByRole('link', { name: '返回首页', exact: true }).click()
 await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
 result.unknownRouteRecovery = true
 const names = ['图片 ↔ Base64', '二维码识别', '图片加水印', '一图切九格', '图片拼接', '双重曝光', '图片压缩 / 格式转换', '照片水印边框']
 for (const zoom of [1, 1.25, 1.5, 2]) {
  await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), zoom)
  for (const name of names) {
   await page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
   await page.locator('input[type=file]').first().waitFor({ state: 'attached' })
   const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
   result.layout.push({ zoom, name, ...layout })
   assert(layout.content <= layout.width + 1, name + ' overflow at ' + zoom)
  }
 }
 await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
 await page.getByRole('navigation').getByRole('link', { name: '首页', exact: true }).click()
 const longDirectory = join(out, '长路径'.repeat(25), '测试目录'.repeat(20))
 await mkdir(longDirectory, { recursive: true })
 const longTarget = join(longDirectory, '中文 结果.bin')
 await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, longTarget)
 const saved = await page.evaluate(async () => {
  const b = await window.desktopFiles.begin('中文 结果.bin', 3)
  if (b.status !== 'ready') return b
  await window.desktopFiles.append(b.id, 0, new Uint8Array([1, 2, 3]))
  return window.desktopFiles.finish(b.id)
 })
 assert.equal(saved.status, 'saved')
 assert.deepEqual([...await readFile(longTarget)], [1, 2, 3])
 result.longPathCharacters = longTarget.length
 target = join(out, '退出不得覆盖.bin')
 await writeFile(target, 'original')
 await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, target)
 const pending = await page.evaluate(async () => {
  const b = await window.desktopFiles.begin('退出不得覆盖.bin', 8 * 1024 * 1024)
  if (b.status !== 'ready') return b
  return window.desktopFiles.append(b.id, 0, new Uint8Array(4 * 1024 * 1024).fill(17))
 })
 assert.equal(pending.status, 'saved')
 assert((await readdir(out)).some(name => name.startsWith('.devkit-save-')))
 result.pendingWriteCreated = true
 result.passed = true
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1 }
finally {
 await app.close()
 if (result.pendingWriteCreated) {
  assert.equal((await readFile(target)).toString(), 'original')
  assert.equal((await readdir(out)).some(name => name.startsWith('.devkit-save-')), false)
  result.closeCleansSession = true
 }
 await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2))
}
console.log(JSON.stringify(result, null, 2))
