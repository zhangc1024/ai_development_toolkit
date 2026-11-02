import { spawn } from 'node:child_process'
import { mkdir, readdir, stat, writeFile, readFile } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { _electron } from 'playwright-core'
const root = resolve('output/windows-install-test')
const install = join(root, 'app')
if (relative(process.cwd(), install).startsWith('..') || isAbsolute(relative(process.cwd(), install))) throw Error('Installation path escaped workspace')
await mkdir(root, { recursive: true })
const exported = join(root, '用户导出保留.txt')
await writeFile(exported, 'keep exported file')
const results = { install, checks: [] }
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
function run(executable, args, log) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { windowsHide: true, env })
    let text = ''
    child.stdout?.on('data', chunk => { text += chunk })
    child.stderr?.on('data', chunk => { text += chunk })
    const timer = setTimeout(() => { child.kill(); reject(Error('Installer/test timed out; inspect ' + log)) }, 240_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', async code => {
      clearTimeout(timer); await writeFile(join(root, log), text)
      code === 0 ? resolveRun() : reject(Error(log + ': exit ' + code))
    })
  })
}
async function exists(file) { try { await stat(file); return true } catch { return false } }
async function until(fn) {
  for (let n = 0; n < 150; n++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 200)) }
  throw Error('Installed files did not reach expected state')
}
async function launchVersion(expected) {
  const app = await _electron.launch({ executablePath: join(install, 'DevKitImages.exe'), args: ['--disable-http-cache', '--host-resolver-rules=MAP * ~NOTFOUND', '--proxy-server=http://127.0.0.1:9'], env, timeout: 60_000 })
  try {
    const page = await app.firstWindow()
    await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
    const version = await app.evaluate(({ app }) => app.getVersion())
    if (version !== expected) throw Error('Unexpected installed version ' + version)
    await page.context().setOffline(true); await page.reload()
    await page.getByRole('heading', { name: '图片工具', exact: true }).waitFor()
    results.checks.push('installed ' + expected + ' launches offline')
  } finally { await app.close() }
}
try {
  if (await exists(join(install, 'DevKitImages.exe'))) {
    const previous = JSON.parse(await readFile(join(root, 'result.json'), 'utf8'))
    if (!previous.passed || previous.install !== install) throw Error('Existing install is not a verified test installation')
    const oldUninstaller = (await readdir(install)).find(name => /^Uninstall.*\.exe$/i.test(name))
    if (!oldUninstaller) throw Error('Owned test uninstall entry missing')
    await run(join(install, oldUninstaller), ['/S'], 'reset-owned-install.log')
    await until(async () => !(await exists(join(install, 'DevKitImages.exe'))))
  }
  await run(resolve('release/DevKit-Images-0.1.0-win-x64.exe'), ['/S', '/D=' + install], 'install.log')
  await until(() => exists(join(install, 'DevKitImages.exe')))
  await launchVersion('0.1.0')
  await run(process.execPath, ['scripts/desktop-suite.mjs', join(install, 'DevKitImages.exe')], 'installed-suite.log')
  results.checks.push('all eight tool workflows on installed executable')
  await run(resolve('output/desktop-upgrade/DevKit-Images-0.1.1-upgrade-test.exe'), ['/S', '/D=' + install], 'upgrade.log')
  await launchVersion('0.1.1')
  if ((await readFile(exported, 'utf8')) !== 'keep exported file') throw Error('Export altered by upgrade')
  results.checks.push('upgrade preserves exported files')
  const uninstallName = (await readdir(install)).find(name => /^Uninstall.*\.exe$/i.test(name))
  if (!uninstallName) throw Error('Uninstaller missing')
  await run(join(install, uninstallName), ['/S'], 'uninstall.log')
  await until(async () => !(await exists(join(install, 'DevKitImages.exe'))))
  if ((await readFile(exported, 'utf8')) !== 'keep exported file') throw Error('Export removed by uninstall')
  results.checks.push('uninstall removes executable and preserves export')
  await run(resolve('release/DevKit-Images-0.1.0-win-x64.exe'), ['/S', '/D=' + install], 'reinstall.log')
  await until(() => exists(join(install, 'DevKitImages.exe')))
  await launchVersion('0.1.0')
  results.checks.push('reinstall completed; 0.1.0 internal app remains installed at test path')
  results.passed = true
} catch (error) { results.passed = false; results.error = error.stack; process.exitCode = 1 }
finally { await writeFile(join(root, 'result.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2)) }
