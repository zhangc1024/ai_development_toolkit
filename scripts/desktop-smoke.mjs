import { _electron } from 'playwright-core'
import electron from 'electron'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

// Run on Windows: node scripts/desktop-smoke.mjs [release/win-unpacked/DevKitImages.exe]
// Optional DESKTOP_SAMPLE_DIR points to user-authorized local test files, never bundled.
const development = process.argv[2] === '--dev'
const packaged = !development && process.argv[2]
const server = development ? await (await import('vite')).createServer({ configFile: 'vite.desktop.config.ts' }) : null
if (server) await server.listen()
const out = resolve('output/playwright/desktop-p1')
await mkdir(out, { recursive: true })
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
let application
try { application = await _electron.launch({ executablePath: packaged ? resolve(packaged) : electron, args: packaged ? ['--disable-http-cache', '--host-resolver-rules=MAP * ~NOTFOUND', '--proxy-server=http://127.0.0.1:9'] : development ? ['.', '--desktop-dev-url=http://127.0.0.1:5179'] : ['.'], env: environment, timeout: 60_000 }) } catch (error) { await server?.close(); throw error }
const results = { mode: packaged ? 'packaged' : development ? 'development' : 'preview', checks: {}, samples: [] }
try {
  console.log('Electron connected')
  const page = await application.firstWindow()
  page.setDefaultTimeout(130_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('heading', { name: '图片工具' }).waitFor()
  results.runtime = await application.evaluate(({ app }) => ({ electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, packaged: app.isPackaged }))
  results.preferences = await application.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return { nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox, webSecurity: preferences.webSecurity }
  })
  assert.deepEqual(results.preferences, { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true })
  results.checks.nodeGlobals = await page.evaluate(() => ({ require: typeof globalThis.require, process: typeof globalThis.process, isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer }))
  assert.equal(results.checks.nodeGlobals.require, 'undefined')
  assert.equal(results.checks.nodeGlobals.process, 'undefined')
  assert.equal(results.checks.nodeGlobals.isolated, true)
  if (!development) await page.context().setOffline(true)
  await page.reload()
  await page.getByRole('heading', { name: '图片工具' }).waitFor()
  results.checks.offlineReload = !development
  await page.getByText('兼容性诊断', { exact: true }).click()
  await page.getByRole('button', { name: '运行资源诊断' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid=desktop-probe]')?.textContent?.includes('}'))
  console.log('Resource probe completed')
  results.checks.probe = JSON.parse(await page.getByTestId('desktop-probe').textContent())
  assert.equal(results.checks.probe.worker?.rawModule, true, JSON.stringify(results.checks.probe))
  assert.equal(results.checks.probe.worker?.heicModule, true)
  assert.equal(results.checks.probe.worker.dynamicEvalBlocked, true)
  assert.deepEqual(results.checks.probe.worker.avifDimensions, [4, 4])
  assert.equal(results.checks.probe.worker.isolated, true)
  results.checks.rendererEvalBlocked = results.checks.probe.rendererEvalBlocked
  assert.equal(results.checks.rendererEvalBlocked, true)
  results.checks.popupBlocked = await page.evaluate(() => window.open('https://example.com/') === null)
  assert.equal(results.checks.popupBlocked, true)
  results.checks.resources = await page.evaluate(async () => {
    const missing = await fetch('/assets/absent.wasm')
    const traversal = await fetch('/%2e%2e%2fpackage.json')
    let remoteBlocked = false
    try { await fetch('https://example.com/desktop-probe') } catch { remoteBlocked = true }
    const unknown = await fetch('/tools/ai-chat/')
    return { missing: missing.status, missingType: missing.headers.get('content-type'), traversal: traversal.status, unknown: unknown.status, remoteBlocked }
  })
  assert.equal(results.checks.resources.missing, 404)
  if (!development) assert.equal(results.checks.resources.traversal, 403)
  assert.equal(results.checks.resources.unknown, 404)
  assert.equal(results.checks.resources.remoteBlocked, true)
  if (process.env.DESKTOP_SAMPLE_DIR) {
    const { readdir } = await import('node:fs/promises')
    for (const name of await readdir(process.env.DESKTOP_SAMPLE_DIR)) {
      if (!/\.(nef|arw|heic)$/i.test(name)) continue
      console.log('Decoding sample: ' + name)
      await page.getByTestId('desktop-probe').evaluate(element => { element.textContent = '' })
      await page.getByLabel('验证解码样本').setInputFiles(resolve(process.env.DESKTOP_SAMPLE_DIR, name))
      await page.waitForFunction(() => document.querySelector('[data-testid=desktop-probe]')?.textContent?.includes('}'), { timeout: 130_000 })
      results.samples.push({ name, result: JSON.parse(await page.getByTestId('desktop-probe').textContent()) })
      if (/\.(nef|arw)$/i.test(name) && results.samples.at(-1).result.error?.includes('高效率')) {
        await page.getByLabel('允许内嵌 JPEG 兼容预览').check()
        await page.getByLabel('验证解码样本').setInputFiles([])
        console.log('Decoding sample: ' + name)
      await page.getByTestId('desktop-probe').evaluate(element => { element.textContent = '' })
        await page.getByLabel('验证解码样本').setInputFiles(resolve(process.env.DESKTOP_SAMPLE_DIR, name))
        await page.waitForFunction(() => document.querySelector('[data-testid=desktop-probe]')?.textContent?.includes('}'))
        results.samples.push({ name, mode: 'embedded-preview', result: JSON.parse(await page.getByTestId('desktop-probe').textContent()) })
        await page.getByLabel('允许内嵌 JPEG 兼容预览').uncheck()
      }
    }
  }
  console.log('Sample checks completed; testing Base64 and navigation')
  await page.getByRole('button', { name: '打开图片 ↔ Base64' }).click()
  await page.getByRole('heading', { name: '图片 ↔ Base64', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: '图片 ↔ Base64', exact: true }).waitFor()
  await page.getByLabel('选择图片', { exact: true }).setInputFiles(resolve('output/desktop-p0/samples/色块 中文.png'))
  const original = await readFile('output/desktop-p0/samples/色块 中文.png')
  const encoded = await page.getByLabel('图片 Base64 结果').inputValue()
  assert.equal(encoded.split(',')[1], original.toString('base64'))
  results.checks.base64Bytes = true
  results.checks.routeRefresh = true
  await page.screenshot({ path: resolve(out, results.mode + '.png'), fullPage: true })
  await page.goBack()
  await page.getByRole('heading', { name: '图片工具' }).waitFor()
  results.checks.back = await page.getByRole('heading', { name: '图片工具' }).isVisible()
  await page.goForward()
  await page.getByRole('heading', { name: '图片 ↔ Base64', exact: true }).waitFor()
  results.checks.forward = await page.getByRole('heading', { name: '图片 ↔ Base64', exact: true }).isVisible()
  assert.equal(results.checks.back, true)
  assert.equal(results.checks.forward, true)
  results.checks.noPageErrors = errors
  assert.deepEqual(errors, [])
  for (const sample of results.samples) {
    if (sample.result.error) {
      assert.match(sample.result.error, /高效率 HE/)
      const fallback = results.samples.find(other => other.name === sample.name && other.mode === 'embedded-preview')
      assert.equal(fallback?.result.embeddedPreview, true)
    } else {
      assert.deepEqual(sample.result.pngDimensions, [sample.result.width, sample.result.height])
      assert.deepEqual(sample.result.pngSignature, [137, 80, 78, 71, 13, 10, 26, 10])
    }
  }
  const initialUrl = page.url()
  await page.evaluate(() => { location.href = 'https://example.com/' })
  await page.waitForTimeout(300)
  assert.equal(page.url(), initialUrl)
  results.checks.externalNavigationBlocked = true
  results.p1Gate = { ordinaryRawDecoded: results.samples.some(sample => /\.(nef|arw)$/i.test(sample.name) && !sample.result.error && !sample.result.embeddedPreview), note: 'Successful module probes and HE embedded previews do not complete the ordinary RAW gate.' }
  results.passed = true
} catch (error) { results.passed = false; results.error = error.message; process.exitCode = 1 }
finally {
  await writeFile(resolve(out, results.mode + '.json'), JSON.stringify(results, null, 2) + '\n')
  await application.close()
  await server?.close()
}
console.log(JSON.stringify(results, null, 2))
