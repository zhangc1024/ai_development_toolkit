import { _electron } from 'playwright-core'
import { resolve, join } from 'node:path'
import { mkdir, mkdtemp, stat, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base = resolve('output/playwright/ordinary-raw')
await mkdir(base, { recursive: true })
const out = await mkdtemp(join(base, 'run-'))
const source = resolve('output/desktop-p1/public-raw/Nikon-D7000-Lossless.NEF')
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: resolve(process.argv[2] ?? 'release/win-unpacked/DevKitImages.exe'), args: ['--disable-http-cache', '--host-resolver-rules=MAP * ~NOTFOUND', '--proxy-server=http://127.0.0.1:9'], env, timeout: 60_000 })
const result = { files: [] }
try {
 const page = await app.firstWindow(); page.setDefaultTimeout(120_000)
 await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
 await page.context().setOffline(true)
 for (const [name, filename] of [['图片压缩 / 格式转换', 'ordinary-raw.png'], ['照片水印边框', 'ordinary-raw-frame.jpg']]) {
  const target = join(out, filename)
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, target)
  await page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
  if (filename.endsWith('.png')) {
   await page.locator('input[type=file]').first().setInputFiles(source)
   await page.getByRole('heading', { name: '原图预览', exact: true }).waitFor()
   await page.getByLabel(/目标格式/).selectOption('png')
   await page.getByRole('button', { name: '开始处理', exact: true }).click()
   await page.getByRole('button', { name: '下载结果', exact: true }).click()
  } else {
   await page.getByLabel('选择照片', { exact: true }).setInputFiles(source)
   await page.getByLabel('导出尺寸').selectOption('2048')
   await page.getByRole('button', { name: '导出照片', exact: true }).click()
  }
  let found = false
  for (let n = 0; n < 600; n++) { try { found = (await stat(target)).size > 0 } catch {} if (found) break; await page.waitForTimeout(200) }
  assert(found, 'Output missing: ' + filename)
  const dimensions = await app.evaluate(({ nativeImage }, target) => nativeImage.createFromPath(target).getSize(), target)
  assert(dimensions.width > 0 && dimensions.height > 0)
  const bytes = await readFile(target)
  result.files.push({ name: filename, bytes: bytes.length, dimensions, sha256: createHash('sha256').update(bytes).digest('hex') })
 }
 assert(result.files[0].bytes > 4 * 1024 * 1024, 'Representative RAW output must exercise multiple IPC chunks')
 result.passed = true
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1 }
finally { await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2)); await app.close() }
console.log(JSON.stringify(result, null, 2))
