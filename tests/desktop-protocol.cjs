const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createHandler, resolveResource, isToolRoute, headers } = require('../electron/protocol.cjs')
let root
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-protocol-'))
  await fs.writeFile(path.join(root, 'desktop.html'), '<h1>Desktop</h1>')
  await fs.mkdir(path.join(root, 'assets'))
  await fs.writeFile(path.join(root, 'assets/module.js'), 'export default 1')
  await fs.writeFile(path.join(root, 'assets/module.wasm'), Buffer.from([0, 97, 115, 109]))
})
after(async () => { await fs.rm(root, { recursive: true, force: true }) })
test('only the eight known tool routes and home are navigation targets', () => {
  assert.equal(isToolRoute('/'), true)
  assert.equal(isToolRoute('/tools/photo-frame/'), true)
  assert.equal(isToolRoute('/tools/ai-chat/'), false)
  assert.equal(isToolRoute('/assets/module.js'), false)
})
test('home and tool refresh map to desktop HTML', async () => {
  for (const route of ['/', '/tools/image-base64/', '/tools/photo-frame']) {
    const response = await createHandler(root)({ method: 'GET', url: 'app://bundle' + route })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/html/)
    assert.equal(await response.text(), '<h1>Desktop</h1>')
  }
})
test('missing modules and unknown routes never fall back to HTML', async () => {
  for (const route of ['/assets/missing.js', '/missing.wasm', '/tools/ai-chat/', '/desktop.html']) {
    const response = await createHandler(root)({ method: 'GET', url: 'app://bundle' + route })
    assert.equal(response.status, 404)
    assert.doesNotMatch(await response.text(), /<h1>/)
  }
})
test('correct module and WASM MIME, isolation and CSP headers', async () => {
  for (const [route, type] of [['/assets/module.js', 'text/javascript; charset=utf-8'], ['/assets/module.wasm', 'application/wasm']]) {
    const response = await createHandler(root)({ method: 'GET', url: 'app://bundle' + route })
    assert.equal(response.headers.get('content-type'), type)
    for (const [key, value] of Object.entries(headers)) assert.equal(response.headers.get(key), value)
    assert.doesNotMatch(response.headers.get('content-security-policy'), /'unsafe-eval'/)
  }
})
test('rejects foreign origin, credentials, port and write methods', async () => {
  for (const url of ['https://bundle/', 'app://foreign/', 'app://user@bundle/', 'app://bundle:123/']) assert.equal((await resolveResource(root, { method: 'GET', url })).status, 403)
  assert.equal((await resolveResource(root, { method: 'POST', url: 'app://bundle/' })).status, 405)
})
test('rejects traversal, encoded separators, double encoding and malformed paths', async () => {
  for (const route of ['/../package.json', '/%2e%2e/assets/module.js', '/%2e%2e%2fsecret', '/%252e%252e/secret', '/C%3a/secret', '/%00', '/%ZZ', '/%5csecret']) {
    assert.equal((await resolveResource(root, { method: 'GET', url: 'app://bundle' + route })).status, 403, route)
  }
})
test('HEAD retains metadata without returning bytes', async () => {
  const response = await createHandler(root)({ method: 'HEAD', url: 'app://bundle/assets/module.wasm' })
  assert.equal(response.status, 200)
  assert.equal((await response.arrayBuffer()).byteLength, 0)
})
test('symlink cannot escape the resource root', { skip: process.platform === 'win32' ? 'symlink creation requires separate Windows privilege' : false }, async () => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-outside-'))
  try {
    await fs.writeFile(path.join(outside, 'secret'), 'private')
    await fs.symlink(outside, path.join(root, 'outside'))
    assert.equal((await resolveResource(root, { method: 'GET', url: 'app://bundle/outside/secret' })).status, 403)
  } finally { await fs.rm(outside, { recursive: true, force: true }) }
})

test('dynamic evaluation exception is scoped to explicit RAW consumer workers', async () => {
  for (const filename of ['raw-probe.worker-abc123.js', 'compress.worker-abc123.js', 'photo.worker-abc123.js', 'probe.worker-abc123.js', 'desktop-abc123.js']) {
    await fs.writeFile(path.join(root, 'assets', filename), '')
    const response = await createHandler(root)({ method: 'GET', url: 'app://bundle/assets/' + filename })
    assert.equal(response.headers.get('content-security-policy').includes("'unsafe-eval'"), /^(raw-probe|compress|photo)\.worker-/.test(filename))
  }
})
