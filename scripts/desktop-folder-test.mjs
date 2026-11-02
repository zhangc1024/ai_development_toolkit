import { _electron } from 'playwright-core'
import { mkdir, writeFile, readFile, readdir, copyFile, mkdtemp } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const out = resolve(process.env.DESKTOP_TEST_OUTPUT || 'output/playwright', 'folder-batch-' + Date.now())
const profile = await mkdtemp(join(tmpdir(), 'devkit-folder-profile-'))
const source = join(out, '输入'), destination = join(out, '输出')
await mkdir(join(source, '子目录'), { recursive: true })
await mkdir(destination, { recursive: true })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: process.argv[2], args: [...(process.argv.includes('--packaged') ? [] : [resolve('.')]), '--user-data-dir=' + profile], cwd: dirname(process.argv[2]), env, timeout: 60000 })
const result = { checks: [], errors: [] }
let page
try {
  page = await app.firstWindow(); page.setDefaultTimeout(30000)
  await page.setViewportSize({ width: 1440, height: 1024 })
  page.on('pageerror', e => result.errors.push(e.message))
  await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
  const fixtures = await page.evaluate(() => {
    const make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#87b8d8'; x.fillRect(0,0,w,h); x.fillStyle = '#286045'; x.fillRect(w/5,h/3,w/2,h/3); return c.toDataURL('image/png').split(',')[1] }
    return [make(640, 480), make(480, 640)]
  })
  await writeFile(join(source, '横图.png'), Buffer.from(fixtures[0], 'base64'))
  await writeFile(join(source, '子目录', '竖图.png'), Buffer.from(fixtures[1], 'base64'))
  await writeFile(join(source, '损坏.png'), 'not a picture')
  await writeFile(join(source, '说明.txt'), 'skip')
  async function folders(folder, input = source) {
    await mkdir(folder, { recursive: true })
    await app.evaluate(({ dialog }, selections) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selections.shift()] }) }, [input, folder])
    await page.getByRole('button', { name: '文件夹批量处理', exact: true }).click()
    await page.getByLabel('包含子文件夹', { exact: false }).check()
    await page.getByRole('button', { name: '选择输入文件夹', exact: true }).click()
    await page.getByRole('button', { name: '选择输出文件夹', exact: true }).click()
    await page.waitForFunction(folder => document.querySelectorAll('.folder-location')[1]?.getAttribute('title') === folder, folder)
    await page.getByRole('button', { name: '查看清单', exact: true }).click()
  }
  async function run() {
    await page.getByRole('button', { name: '开始批量处理', exact: true }).click()
    await page.locator('.folder-batch').getByText('本轮处理结束。', { exact: false }).waitFor()
    assert.match(await page.locator('.folder-batch [role=status]').innerText(), /成功 2 · 失败 1 · 跳过 1/)
  }
  await page.getByRole('navigation').getByRole('link', { name: '图片压缩 / 格式转换', exact: true }).click()
  await folders(join(destination, '压缩'))
  await writeFile(join(out, 'compression-before.txt'), await page.locator('body').ariaSnapshot())
  await page.getByLabel('目标格式').selectOption('jpg')
  await run()
  assert.deepEqual((await readdir(join(destination, '压缩'))).sort(), ['子目录', '横图-compressed.jpg'].sort())
  const imageSize = async path => app.evaluate(({ nativeImage }, file) => nativeImage.createFromPath(file).getSize(), path)
  assert.deepEqual(await imageSize(join(destination, '压缩', '子目录', '竖图-compressed.jpg')), { width: 480, height: 640 })
  await page.getByRole('button', { name: '仅重试失败项', exact: false }).click()
  await page.locator('.folder-batch').getByText('本轮处理结束。', { exact: false }).waitFor()
  assert.equal((await readdir(join(destination, '压缩'))).length, 2)
  await page.getByLabel('同名结果', { exact: false }).selectOption('skip')
  await page.getByRole('button', { name: '开始批量处理', exact: true }).click()
  await page.locator('.folder-batch').getByText('本轮处理结束。', { exact: false }).waitFor()
  assert.match(await page.locator('.folder-batch [role=status]').innerText(), /成功 0 · 失败 1 · 跳过 3/)
  await page.getByRole('button', { name: '收起清单', exact: true }).click()
  await page.screenshot({ path: join(out, 'compression.png'), fullPage: false })
  result.checks.push('compression, nested paths, invalid image isolation, retry, collision skip')
  await page.getByRole('navigation').getByRole('link', { name: '图片加水印', exact: true }).click()
  await folders(join(destination, '水印'))
  await page.locator('.folder-batch tbody tr').filter({ hasText: '横图.png' }).getByRole('button', { name: '预览', exact: true }).click()
  await page.getByLabel('水印文字', { exact: true }).fill('批量水印测试')
  await page.getByLabel('文字透明度', { exact: true }).fill('100')
  await page.getByLabel('文字透明度', { exact: true }).press('Tab')
  await writeFile(join(out, 'watermark-before.txt'), await page.locator('body').ariaSnapshot())
  await page.getByRole('button', { name: '收起清单', exact: true }).click()
  await page.screenshot({ path: join(out, 'watermark-ready.png'), fullPage: false })
  await page.getByRole('button', { name: '查看清单', exact: true }).click()
  await run()
  assert.deepEqual(await imageSize(join(destination, '水印', '横图-watermarked.jpg')), { width: 640, height: 480 })
  assert.deepEqual(await imageSize(join(destination, '水印', '子目录', '竖图-watermarked.jpg')), { width: 480, height: 640 })
  await page.getByRole('button', { name: '收起清单', exact: true }).click()
  await page.screenshot({ path: join(out, 'watermark.png'), fullPage: false })
  await page.setViewportSize({ width: 800, height: 900 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: join(out, 'watermark-800.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 1024 })
  result.checks.push('watermark landscape and portrait, sample preview')
  await page.getByRole('navigation').getByRole('link', { name: '照片水印边框', exact: true }).click()
  await folders(join(destination, '边框'))
  await run()
  const framed = await imageSize(join(destination, '边框', '横图-frame.jpg'))
  assert(framed.width > 640 || framed.height > 480)
  await page.getByRole('button', { name: '收起清单', exact: true }).click()
  await page.screenshot({ path: join(out, 'frame.png'), fullPage: false })
  result.checks.push('frame batch without sample, metadata absent, valid export')
  // Cancel immediately after starting: no task remains active and original inputs are intact.
  await page.getByRole('button', { name: '开始批量处理', exact: true }).click()
  await page.getByRole('button', { name: '取消批量处理', exact: true }).click()
  await page.getByRole('button', { name: '取消批量处理', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await readFile(join(source, '横图.png'), 'base64'), fixtures[0])
  result.checks.push('cancel and original preservation')
  if (process.env.DESKTOP_SAMPLE_DIR) {
    const rawInput = join(out, 'raw-input'), rawOutput = join(destination, 'RAW')
    await mkdir(rawInput, { recursive: true })
    for (const name of ['CHZ_0117.NEF', 'CHZ_0120.NEF', 'IMG_2930.HEIC']) await copyFile(join(process.env.DESKTOP_SAMPLE_DIR, name), join(rawInput, name))
    await page.getByRole('navigation').getByRole('link', { name: '图片压缩 / 格式转换', exact: true }).click()
    await folders(rawOutput, rawInput)
    await page.getByLabel('目标格式').selectOption('jpg')
    await page.getByLabel('压缩档位').selectOption('balanced')
    await page.getByRole('button', { name: '开始批量处理', exact: true }).click()
    await page.locator('.folder-batch').getByText('本轮处理结束。', { exact: false }).waitFor({ timeout: 180000 })
    assert.match(await page.locator('.folder-batch [role=status]').innerText(), /成功 3 · 失败 0/)
    for (const name of ['CHZ_0117', 'CHZ_0120']) assert.deepEqual(await imageSize(join(rawOutput, name + '-compressed.jpg')), { width: 5568, height: 3712 })
    result.checks.push('actual Nikon HE-star NEF and HEIC folder conversion')
  }
  assert.deepEqual(result.errors, [])
  result.passed = true
} catch (error) {
  result.passed = false; result.error = error.stack; process.exitCode = 1
  if (page) { result.screen = await page.locator('body').innerText(); await page.screenshot({ path: join(out, 'failure.png'), fullPage: true }).catch(() => {}) }
} finally { await app.close(); await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2)) }
console.log(JSON.stringify({ out, ...result }, null, 2))
