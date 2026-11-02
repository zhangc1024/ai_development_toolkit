import { chromium } from 'playwright-core'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const out = resolve('output/playwright/web-watermark-' + Date.now())
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const result = { checks: [], errors: [] }
try {
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage(); page.setDefaultTimeout(150000)
  page.on('pageerror', e => result.errors.push(e.message))
  await page.goto('http://localhost:4187/tools/watermark/')
  assert.equal(await page.evaluate(() => crossOriginIsolated), true)
  assert.equal(await page.evaluate(() => typeof window.desktopBatch), 'undefined')
  assert.equal(await page.getByRole('button', { name: '文件夹批量处理', exact: true }).count(), 0)
  const input = page.getByLabel('选择水印图片', { exact: true })
  const accepted = await input.getAttribute('accept')
  assert(accepted.includes('.heic') && accepted.includes('.heif') && accepted.includes('.nef'))
  for (const [name, path, note] of [
    ['heic', 'D:/test/IMG_2930.HEIC', 'HEIC'],
    ['nef', join(tmpdir(), 'devkit-example.NEF'), 'RAW 使用相机白平衡'],
    ['he-star', 'D:/test/CHZ_0117.NEF', '内嵌'],
  ]) {
    await input.setInputFiles(path)
    await page.locator('.status-box').filter({ hasText: '图片已就绪' }).waitFor()
    assert((await page.locator('.wm-preview').innerText()).includes(note))
    await page.getByLabel('水印文字', { exact: true }).fill('WEB WATERMARK ' + name)
    await page.getByRole('button', { name: '生成图片', exact: true }).click()
    await page.locator('.status-box').filter({ hasText: '生成完成' }).waitFor()
    assert((await page.locator('.wm-result').innerText()).includes(note))
    const dimensions = await page.locator('.wm-result img').first().evaluate(async image => { await image.decode(); return [image.naturalWidth, image.naturalHeight] })
    assert(dimensions[0] > 1000 && dimensions[1] > 1000)
    if (name === 'he-star') assert.deepEqual(dimensions, [5568, 3712])
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载图片', exact: true }).click()
    const download = await downloadEvent
    assert(download.suggestedFilename().endsWith('-watermarked.jpg'))
    const destination = join(out, name + '.jpg')
    await download.saveAs(destination); assert((await stat(destination)).size > 10000)
    result.checks.push(name + ': browser input, watermarked JPG download, dimensions ' + dimensions.join('x'))
  }
  // Emulate a static host without cross-origin isolation. HEIC still works; RAW reports why it cannot.
  const unisolated = await browser.newContext()
  await unisolated.route('**/*', async route => {
    const response = await route.fetch()
    const headers = response.headers()
    delete headers['cross-origin-opener-policy']; delete headers['cross-origin-embedder-policy']
    await route.fulfill({ response, headers })
  })
  const plain = await unisolated.newPage(); plain.setDefaultTimeout(150000)
  await plain.goto('http://localhost:4187/tools/watermark/')
  assert.equal(await plain.evaluate(() => crossOriginIsolated), false)
  await plain.getByLabel('选择水印图片', { exact: true }).setInputFiles('D:/test/IMG_2930.HEIC')
  await plain.locator('.status-box').filter({ hasText: '图片已就绪' }).waitFor()
  await plain.getByLabel('选择水印图片', { exact: true }).setInputFiles('D:/test/CHZ_0117.NEF')
  await plain.locator('.status-box').filter({ hasText: '跨源隔离' }).waitFor()
  result.checks.push('HEIC without isolation works; NEF without isolation shows actionable configuration error')
  assert.deepEqual(result.errors, [])
  result.passed = true
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1 }
finally { await browser.close(); await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2)) }
console.log(JSON.stringify({ out, ...result }, null, 2))
