import { _electron } from 'playwright-core'
import { mkdir, mkdtemp, writeFile, readFile, copyFile, stat } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const out = resolve('output/playwright/watermark-nef-' + Date.now())
await mkdir(out, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'devkit-nef-profile-'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: process.argv[2], cwd: dirname(process.argv[2]), args: [...(process.argv.includes('--packaged') ? [] : [resolve('.')]), '--user-data-dir=' + profile], env, timeout: 60000 })
const result = { checks: [], errors: [] }; let page
try {
  page = await app.firstWindow(); page.setDefaultTimeout(150000)
  page.on('pageerror', e => result.errors.push(e.message))
  await page.getByRole('navigation').getByRole('link', { name: '图片加水印', exact: true }).click()
  const input = page.getByLabel('选择水印图片', { exact: true })
  await input.setInputFiles('D:/test/CHZ_0117.NEF')
  await page.locator('.status-box').filter({ hasText: '图片已就绪' }).waitFor()
  assert.match(await page.locator('.wm-preview').innerText(), /内嵌.*JPEG/)
  assert.match(await page.locator('.wm-preview').innerText(), /5568 × 3712/)
  await page.getByLabel('水印文字', { exact: true }).fill('NEF WATERMARK TEST')
  await page.getByLabel('文字透明度', { exact: true }).fill('100')
  await page.getByLabel('文字透明度', { exact: true }).press('Tab')
  async function generate(expectedNote = /内嵌.*JPEG/) {
    await page.getByRole('button', { name: '生成图片', exact: true }).click()
    await page.locator('.status-box').filter({ hasText: '生成完成' }).waitFor()
    assert.match(await page.locator('.wm-result').innerText(), expectedNote)
    return page.locator('.wm-result img').first().evaluate(async img => {
      const bitmap = await createImageBitmap(await (await fetch(img.src)).blob())
      const c = document.createElement('canvas'); c.width = 400; c.height = 160
      c.getContext('2d').drawImage(bitmap, bitmap.width/2-200, bitmap.height/2-80,400,160,0,0,400,160)
      const pixels = Array.from(c.getContext('2d').getImageData(0,0,400,160).data)
      bitmap.close(); return pixels
    })
  }
  const dark = await generate()
  const target = join(out, 'single-nef-watermarked.jpg')
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, target)
  await page.getByRole('button', { name: '下载图片', exact: true }).click()
  await page.locator('.status-box').filter({ hasText: '已保存' }).waitFor()
  assert((await stat(target)).size > 10000)
  assert.deepEqual(await app.evaluate(({ nativeImage }, path) => nativeImage.createFromPath(path).getSize(), target), { width: 5568, height: 3712 })
  await page.getByRole('button', { name: '白色', exact: true }).click()
  const white = await generate()
  assert(dark.filter((value, index) => Math.abs(value - white[index]) > 40).length > 1000, 'Changing watermark color must change exported image pixels')
  result.checks.push('HE-star NEF imports at full embedded resolution, JPG export, watermark pixel verification')
  await input.setInputFiles(join(tmpdir(), 'devkit-example.NEF'))
  await page.locator('.status-box').filter({ hasText: '图片已就绪' }).waitFor()
  assert.match(await page.locator('.wm-preview').innerText(), /RAW 使用相机白平衡/)
  result.checks.push('ordinary NEF full RAW decode, >10 MiB')
  await input.setInputFiles('D:/test/IMG_2930.HEIC')
  await page.locator('.status-box').filter({ hasText: '图片已就绪' }).waitFor()
  assert.match(await page.locator('.wm-preview').innerText(), /HEIC/)
  await generate(/HEIC/)
  result.checks.push('HEIC single import and watermarked JPG export')
  const folder = join(out, 'input'), output = join(out, 'output')
  await mkdir(folder); await mkdir(output)
  for (const name of ['CHZ_0117.NEF', 'CHZ_0120.NEF', 'IMG_2930.HEIC']) await copyFile(join('D:/test', name), join(folder, name))
  await writeFile(join(folder, 'broken.NEF'), 'broken')
  await app.evaluate(({ dialog }, selections) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selections.shift()] }) }, [folder, output])
  await page.getByRole('button', { name: '文件夹批量处理', exact: true }).click()
  await page.getByRole('button', { name: '选择输入文件夹', exact: true }).click()
  await page.getByRole('button', { name: '选择输出文件夹', exact: true }).click()
  await page.getByRole('button', { name: '开始批量处理', exact: true }).click()
  await page.locator('.folder-batch [role=status]').filter({ hasText: '本轮处理结束' }).waitFor()
  assert.match(await page.locator('.folder-batch [role=status]').innerText(), /成功 3 · 失败 1/)
  await page.getByRole('button', { name: '查看清单', exact: true }).click()
  assert.match(await page.locator('.batch-list').innerText(), /内嵌.*JPEG/)
  for (const name of ['CHZ_0117', 'CHZ_0120']) assert.deepEqual(await app.evaluate(({ nativeImage }, path) => nativeImage.createFromPath(path).getSize(), join(output, name + '-watermarked.jpg')), { width: 5568, height: 3712 })
  assert((await stat(join(output, 'IMG_2930-watermarked.jpg'))).size > 10000)
  assert.deepEqual(await readFile(join(folder, 'CHZ_0117.NEF')), await readFile('D:/test/CHZ_0117.NEF'))
  result.checks.push('folder NEF batch, bad RAW isolation, source unchanged, per-file compatibility notes')
  await page.getByRole('button', { name: '单图', exact: true }).click()
  await page.getByRole('button', { name: '清空图片与水印', exact: true }).click()
  await input.setInputFiles(join(tmpdir(), 'devkit-example.NEF'))
  await page.getByRole('button', { name: '取消读取', exact: true }).click()
  await page.locator('.status-box').filter({ hasText: '已取消' }).waitFor()
  assert.equal(await page.locator('.wm-preview').count(), 0)
  result.checks.push('cancel RAW loading before preview')
  assert.deepEqual(result.errors, [])
  result.passed = true
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1; if (page) result.screen = await page.locator('body').innerText() }
finally { await app.close(); await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2)) }
console.log(JSON.stringify({ out, ...result }, null, 2))
