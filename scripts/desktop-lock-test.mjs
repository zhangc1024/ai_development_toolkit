import { _electron } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const out = resolve('output/desktop-native-lock')
await mkdir(out, { recursive: true })
const target = join(out, '占用不得覆盖.png')
await writeFile(target, 'original')
const holder = spawn(join(out, 'file-lock.exe'), [target], { windowsHide: true })
const exit = new Promise(resolve => holder.once('exit', resolve))
await new Promise((resolve, reject) => { holder.stdout.once('data', data => String(data).includes('LOCKED') ? resolve() : reject(Error('Unexpected lock helper output'))); holder.once('error', reject) })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: resolve('release/win-unpacked/DevKitImages.exe'), env, timeout: 60_000 })
const result = {}
try {
 const page = await app.firstWindow()
 await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
 await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, target)
 await page.getByRole('navigation').getByRole('link', { name: '图片 ↔ Base64', exact: true }).click()
 await page.getByLabel('选择图片', { exact: true }).setInputFiles(resolve('output/desktop-p0/samples/色块 中文.png'))
 await page.getByRole('button', { name: '下载图片', exact: true }).click()
 await page.locator('.status-box.error').filter({ hasText: '保存失败' }).waitFor()
 holder.stdin.end('\n')
 await exit
 assert.equal((await readFile(target)).toString(), 'original')
 assert.equal((await readdir(out)).some(name => name.startsWith('.devkit-save-')), false)
 result.passed = true
 result.checks = ['real FileShare.None lock prevents replacement', 'original bytes preserved', 'temporary file removed', 'UI reports failure']
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1 }
finally {
 holder.stdin.end('\n')
 await app.close()
 await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2))
}
console.log(JSON.stringify(result, null, 2))
