import { _electron } from 'playwright-core'
import { readFile, writeFile, mkdir, mkdtemp, stat, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
const base = resolve('output/playwright/desktop-suite')
await mkdir(base, { recursive: true })
const out = await mkdtemp(join(base, 'run-'))
const exe = resolve(process.argv[2] ?? 'release/win-unpacked/DevKitImages.exe')
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: exe, args: ['--disable-http-cache', '--host-resolver-rules=MAP * ~NOTFOUND', '--proxy-server=http://127.0.0.1:9'], env, timeout: 60_000 })
const result = { executable: exe, checks: [], files: [], memory: [], observedPeakWorkingSetKiB: 0 }
let sampling = false
const sampler = setInterval(async () => {
  if (sampling) return
  sampling = true
  try { const memory = await app.evaluate(({ app }) => app.getAppMetrics().reduce((sum, item) => sum + item.memory.workingSetSize, 0)); result.observedPeakWorkingSetKiB = Math.max(result.observedPeakWorkingSetKiB, memory) } catch {}
  finally { sampling = false }
}, 500)
const png = resolve('output/desktop-p0/samples/色块 中文.png')
const qr = resolve('output/desktop-p0/samples/二维码.png')
const zip = resolve('output/desktop-p0/samples/混合样本.zip')
async function until(fn, timeout = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { if (await fn()) return; await new Promise(done => setTimeout(done, 100)) }
  throw Error('Condition timed out')
}
let page
async function route(name) {
  await page.getByRole('navigation', { name: '图片工具导航' }).getByRole('link', { name, exact: true }).click()
  console.log('Tool: ' + name)
}
async function save(button, name, type = 'image') {
  const target = join(out, name)
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, target)
  let prior
  try { prior = createHash('sha256').update(await readFile(target)).digest('hex') } catch {}
  const started = Date.now()
  await button.click()
  await until(async () => { try { const bytes = await readFile(target); return bytes.length > 0 && createHash('sha256').update(bytes).digest('hex') !== prior } catch { return false } })
  const bytes = await readFile(target)
  const file = { name, bytes: bytes.length, ms: Date.now() - started, sha256: createHash('sha256').update(bytes).digest('hex') }
  if (type === 'image') {
    file.dimensions = await page.evaluate(async b64 => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))]))
      const dimensions = [bitmap.width, bitmap.height]; bitmap.close(); return dimensions
    }, bytes.toString('base64'))
    assert(file.dimensions[0] > 0)
  }
  if (type === 'zip') {
    const archive = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false })
    const entries = await archive.getEntries()
    file.entries = entries.map(entry => entry.filename)
    for (const entry of entries) if (!entry.directory) await entry.getData(new Uint8ArrayWriter(), { checkSignature: true })
    await archive.close()
  }
  if (type === 'tiff') {
    const { default: utif } = await import('utif')
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const ifds = utif.decode(data); utif.decodeImage(data, ifds[0]); file.dimensions = [ifds[0].width, ifds[0].height]
    assert.equal(utif.toRGBA8(ifds[0]).length, file.dimensions[0] * file.dimensions[1] * 4)
  }
  if (type === 'bmp') { assert.equal(bytes.toString('ascii', 0, 2), 'BM'); file.dimensions = [bytes.readInt32LE(18), Math.abs(bytes.readInt32LE(22))] }
  await until(() => button.isEnabled())
  result.files.push(file)
  console.log('Saved: ' + name)
  return bytes
}
try {
  page = await app.firstWindow(); page.setDefaultTimeout(90_000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
  assert.equal(await page.getByRole('navigation').getByRole('link').count(), 9)
  result.checks.push('8 tool entries; no AI settings')
  await page.context().setOffline(true)
  await route('图片 ↔ Base64')
  await page.getByLabel('选择图片', { exact: true }).setInputFiles(png)
  await writeFile(join(out, '字节往返.png'), 'original to replace')
  const restored = await save(page.getByRole('button', { name: '下载图片', exact: true }), '字节往返.png')
  assert.deepEqual(restored, await readFile(png))
  await save(page.getByRole('button', { name: '下载编码', exact: true }), 'Base64 编码.txt', 'text')
  await page.getByRole('button', { name: '复制编码', exact: true }).click()
  await page.locator('[role=status]').filter({ hasText: '已复制' }).waitFor()
  const clipboardExpected = await page.getByLabel('图片 Base64 结果').inputValue()
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), clipboardExpected)
  result.clipboard = { nativeRoundTrip: true, applicationButton: true }
  await app.evaluate(({ dialog }) => { dialog.testCalls = 0; dialog.showSaveDialog = async () => { dialog.testCalls++; return { canceled: true } } })
  await page.getByRole('button', { name: '下载图片', exact: true }).click()
  await until(() => app.evaluate(({ dialog }) => dialog.testCalls === 1))
  await until(() => page.getByRole('button', { name: '下载图片', exact: true }).isEnabled())
  assert.equal(await page.locator('.status-box.error').count(), 0)
  const sentinel = join(out, '取消不得覆盖.png'); await writeFile(sentinel, 'original')
  await app.evaluate(({ dialog }, filePath) => {
    globalThis.resolveSave = null
    dialog.showSaveDialog = () => new Promise(resolve => { globalThis.resolveSave = () => resolve({ canceled: false, filePath }) })
  }, sentinel)
  await page.getByRole('button', { name: '下载图片', exact: true }).click()
  await until(() => app.evaluate(() => typeof globalThis.resolveSave === 'function'))
  await route('二维码识别')
  await app.evaluate(() => globalThis.resolveSave())
  await page.waitForTimeout(300)
  assert.equal((await readFile(sentinel)).toString(), 'original')
  result.checks.push('native save IPC, exact bytes, clipboard, cancel, navigation cancels pending save')
  await page.getByLabel('选择图片', { exact: true }).setInputFiles(qr)
  await page.getByLabel('二维码识别内容').waitFor()
  assert.match(await page.getByLabel('二维码识别内容').inputValue(), /DevKit P0/)
  await save(page.getByRole('button', { name: '下载文本', exact: true }), '二维码.txt', 'text')
  await route('图片加水印')
  await page.getByLabel('选择水印图片').setInputFiles(png)
  await page.getByLabel('水印文字', { exact: true }).fill('内测 中文水印')
  await page.getByRole('button', { name: '生成图片', exact: true }).click()
  await save(page.getByRole('button', { name: '下载图片', exact: true }), '水印.jpg')
  await route('一图切九格')
  await page.getByLabel('选择照片文件').setInputFiles(png)
  await page.getByRole('button', { name: '生成 9 张图片' }).click()
  await save(page.getByRole('button', { name: '下载 01', exact: true }), '九格01.png')
  await page.getByRole('button', { name: '查看第 2 张图片', exact: true }).click()
  await save(page.getByRole('dialog').getByRole('button', { name: '下载图片', exact: true }), '九格弹窗02.png')
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '打包 ZIP', exact: true }).click()
  await save(page.getByRole('button', { name: '下载 ZIP', exact: true }), '九格.zip', 'zip')
  assert.equal(result.files.at(-1).entries.length, 9)
  await route('图片拼接')
  await page.getByLabel('选择拼接图片').setInputFiles([png, qr])
  await save(page.getByRole('button', { name: '下载图片', exact: true }), '拼接.png')
  await route('双重曝光')
  await page.locator('.upload input[type=file]').nth(0).setInputFiles(png)
  await page.locator('.upload input[type=file]').nth(1).setInputFiles(qr)
  await page.getByLabel('导出长边').selectOption('1200')
  await save(page.getByRole('button', { name: '导出图片', exact: true }), '双重曝光.png')
  await route('图片压缩 / 格式转换')
  await page.locator('input[type=file]').first().setInputFiles(png)
  await page.getByRole('heading', { name: '原图预览', exact: true }).waitFor()
  for (const format of ['png', 'jpg', 'webp', 'avif', 'tiff', 'bmp']) {
    await page.getByLabel(/目标格式/).selectOption(format)
    await page.getByRole('button', { name: '开始处理', exact: true }).click()
    await save(page.getByRole('button', { name: '下载结果', exact: true }), '压缩.' + format, format === 'tiff' || format === 'bmp' ? format : 'image')
  }
  await page.locator('input[type=file]').first().setInputFiles(zip)
  await page.getByRole('button', { name: /开始处理 ZIP/ }).click()
  await save(page.getByRole('button', { name: '下载结果 ZIP', exact: true }), '混合处理.zip', 'zip')
  await route('照片水印边框')
  await page.getByLabel('选择照片', { exact: true }).setInputFiles(png)
  await page.getByLabel('品牌 LOGO', { exact: true }).selectOption('nikon')
  await page.getByLabel('导出尺寸').selectOption('2048')
  await save(page.getByRole('button', { name: '导出照片', exact: true }), '照片边框.jpg')
  if (process.env.DESKTOP_SAMPLE_DIR) {
    await page.getByLabel('选择照片', { exact: true }).setInputFiles(join(process.env.DESKTOP_SAMPLE_DIR, 'IMG_2930.HEIC'))
    await save(page.getByRole('button', { name: '导出照片', exact: true }), 'HEIC边框.jpg')
    await page.getByLabel('选择照片', { exact: true }).setInputFiles(join(process.env.DESKTOP_SAMPLE_DIR, 'CHZ_0117.NEF'))
    await save(page.getByRole('button', { name: '导出照片', exact: true }), 'HEstar边框.jpg')
    assert.match(await page.locator('.frame-tool').innerText(), /内嵌的相机 JPEG/)
  }
  const names = ['图片 ↔ Base64', '二维码识别', '图片加水印', '一图切九格', '图片拼接', '双重曝光', '图片压缩 / 格式转换', '照片水印边框']
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const name of names) { await route(name); await page.locator('input[type=file]').first().waitFor({ state: 'attached' }) }
    result.memory.push(await app.evaluate(({ app }) => app.getAppMetrics().reduce((sum, item) => sum + item.memory.workingSetSize, 0)))
  }
  result.checks.push('24 navigation cycles without page errors; memory is observational, not a leak proof')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 800, height: 600 }))
  await page.waitForTimeout(200)
  result.layout = await page.evaluate(() => ({ innerWidth, scrollWidth: document.documentElement.scrollWidth, dpr: devicePixelRatio }))
  assert(result.layout.scrollWidth <= result.layout.innerWidth + 1)
  await page.getByRole('navigation').getByRole('link', { name: '首页', exact: true }).click()
  await page.screenshot({ path: join(out, '首页.png'), fullPage: true })
  result.pageErrors = errors; assert.deepEqual(errors, [])
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
  const oldPid = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getOSProcessId())
  const crashed = page.waitForEvent('crash', { timeout: 30_000 })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer())
  await crashed
  await until(() => app.evaluate(({ BrowserWindow }, oldPid) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    return contents.getOSProcessId() > 0 && contents.getOSProcessId() !== oldPid && !contents.isLoading()
  }, oldPid))
  const recoveredHeading = await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("document.querySelector('h1')?.textContent"))
  assert.equal(recoveredHeading, '图片工具')
  result.checks.push('renderer crash recovers after explicit reload choice')
  assert.deepEqual((await readdir(out)).filter(name => name.startsWith('.devkit-save-')), [])
  result.passed = true
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1 }
finally {
  clearInterval(sampler)
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2))
  await app.close()
}
console.log(JSON.stringify(result, null, 2))
