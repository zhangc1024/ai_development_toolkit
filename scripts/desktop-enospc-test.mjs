import { _electron } from 'playwright-core'
import { resolve } from 'node:path'
import { writeFile, readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const directory = '\\\\wsl.localhost\\Ubuntu\\data\\www\\ai_development_toolkit\\output\\desktop-enospc'
const target = directory + '\\original.bin'
await writeFile(target, 'original')
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: resolve('release/win-unpacked/DevKitImages.exe'), env, timeout: 60_000 })
const result = { filesystem: '1 MiB tmpfs via Windows WSL UNC; 4 MiB chunk' }
try {
 const page = await app.firstWindow()
 await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
 await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, target)
 const status = await page.evaluate(async () => {
  const begin = await window.desktopFiles.begin('space-test.bin', 5 * 1024 * 1024)
  if (begin.status !== 'ready') return begin
  return window.desktopFiles.append(begin.id, 0, new Uint8Array(4 * 1024 * 1024).fill(21))
 })
 assert.equal(status.status, 'failed')
 assert.equal((await readFile(target)).toString(), 'original')
 assert.equal((await readdir(directory)).some(name => name.startsWith('.devkit-save-')), false)
 result.passed = true; result.status = status
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1 }
finally { await app.close(); await writeFile('output/desktop-p1/enospc-result.json', JSON.stringify(result, null, 2)) }
console.log(JSON.stringify(result, null, 2))
