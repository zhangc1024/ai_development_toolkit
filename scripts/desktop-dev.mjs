import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import electron from 'electron'

const server = await createServer({ configFile: 'vite.desktop.config.ts' })
let child
let closing = false
async function close(code = 0) {
  if (closing) return
  closing = true
  child?.kill()
  await server.close()
  process.exitCode = code
}
try {
  await server.listen()
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  child = spawn(electron, ['.', '--desktop-dev-url=http://127.0.0.1:5179'], { stdio: 'inherit', env: environment })
  child.once('error', async error => { console.error(error.message); await close(1) })
  child.once('exit', async code => close(code ?? 0))
  process.once('SIGINT', () => close())
  process.once('SIGTERM', () => close())
} catch (error) { console.error(error); await close(1) }
