const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { SaveSessions, validName, MAX_CHUNK } = require('../electron/files.cjs')
async function fixture(run, override = {}, timeout) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-save-test-'))
  const target = path.join(root, '中文 目标.bin')
  await fs.writeFile(target, 'original')
  const sessions = new SaveSessions(async () => target, { ...fs, ...override }, timeout)
  try { await run(sessions, target, root) }
  finally { await sessions.dispose(); assert.deepEqual((await fs.readdir(root)).filter(name => name.endsWith('.tmp')), []); await fs.rm(root, { recursive: true, force: true }) }
}
test('chunked write replaces target only at finish, preserving exact bytes and Chinese path', () => fixture(async (s, target) => {
  const data = Buffer.alloc(MAX_CHUNK + 17, 31)
  const begin = await s.begin('owner', '结果.bin', data.length)
  assert.equal(begin.status, 'ready')
  await s.append('owner', begin.id, 0, data.subarray(0, MAX_CHUNK))
  assert.equal((await fs.readFile(target)).toString(), 'original')
  await s.append('owner', begin.id, 1, data.subarray(MAX_CHUNK))
  assert.equal((await s.finish('owner', begin.id)).status, 'saved')
  assert.deepEqual(await fs.readFile(target), data)
}))
test('cancel, incomplete finish, wrong sequence and oversized chunks never alter original', async () => {
  for (const mode of ['cancel', 'incomplete', 'sequence', 'oversize']) await fixture(async (s, target) => {
    const b = await s.begin('owner', 'file.bin', 5)
    if (mode === 'cancel') await s.cancel('owner', b.id)
    if (mode === 'incomplete') await s.finish('owner', b.id)
    if (mode === 'sequence') await s.append('owner', b.id, 2, Buffer.alloc(2))
    if (mode === 'oversize') await s.append('owner', b.id, 0, Buffer.alloc(MAX_CHUNK + 1))
    assert.equal((await fs.readFile(target)).toString(), 'original')
    assert.equal(s.sessions.size, 0)
  })
})
test('foreign owners cannot write, finish or cancel another session', () => fixture(async (s, target) => {
  const b = await s.begin('a', 'file.bin', 1)
  assert.equal((await s.append('b', b.id, 0, Buffer.from('x'))).status, 'failed')
  await s.cancel('b', b.id)
  assert.equal(s.sessions.size, 1)
  assert.equal((await s.finish('b', b.id)).status, 'failed')
  await s.invalidate('a')
  assert.equal((await fs.readFile(target)).toString(), 'original')
}))
test('rename failure or disk-full write protects existing file and removes temporary file', async () => {
  for (const override of [
    { rename: async () => { throw Object.assign(Error(), { code: 'EPERM' }) } },
    { open: async (...args) => { const file = await fs.open(...args); return { close: () => file.close(), sync: () => file.sync(), write: async () => { throw Object.assign(Error(), { code: 'ENOSPC' }) } } } },
  ]) await fixture(async (s, target) => {
    const b = await s.begin('a', 'file.bin', 1)
    const append = await s.append('a', b.id, 0, Buffer.from('x'))
    const result = append.status === 'saved' ? await s.finish('a', b.id) : append
    assert.equal(result.status, 'failed')
    assert.equal((await fs.readFile(target)).toString(), 'original')
    assert.equal(s.sessions.size, 0)
  }, override)
})
test('partial OS writes are completed before acknowledging a chunk', () => fixture(async (s, target) => {
  const b = await s.begin('a', 'file.bin', 5)
  await s.append('a', b.id, 0, Buffer.from('hello'))
  assert.equal((await s.finish('a', b.id)).status, 'saved')
  assert.equal((await fs.readFile(target)).toString(), 'hello')
}, { open: async (...args) => { const file = await fs.open(...args); return { close: () => file.close(), sync: () => file.sync(), write: (buffer, offset, length, position) => file.write(buffer, offset, Math.min(length, 2), position) } } }))
test('only one dialog/session may be active; invalidate during dialog creates no session', async () => {
  let resolve
  const s = new SaveSessions(() => new Promise(done => { resolve = done }))
  const first = s.begin('a', 'file.bin', 1)
  assert.equal((await s.begin('b', 'file.bin', 1)).status, 'cancelled')
  await s.invalidate('a')
  resolve(path.join(os.tmpdir(), 'never-written.bin'))
  assert.equal((await first).status, 'cancelled')
  assert.equal(s.sessions.size, 0)
})
test('idle timeout cancels unfinished session', () => fixture(async (s, target) => {
  await s.begin('a', 'file.bin', 1)
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(s.sessions.size, 0)
  assert.equal((await fs.readFile(target)).toString(), 'original')
}, {}, 15))
test('invalid filenames and sizes are rejected before any dialog', async () => {
  let calls = 0
  const s = new SaveSessions(async () => { calls++; return null })
  for (const name of ['../file', 'C:\\file', 'NUL.png', 'file.', 'a/b', '']) assert.equal(validName(name), false)
  assert.equal((await s.begin('a', 'file.bin', NaN)).status, 'failed')
  assert.equal((await s.begin('a', 'file.bin', 3 * 1024 ** 3)).status, 'failed')
  assert.equal(calls, 0)
})

test('window invalidation during an in-flight write cancels commit and cleans temporary output', async () => {
  let entered, release
  const started = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  await fixture(async (s, target) => {
    const b = await s.begin('window', 'file.bin', 1)
    const writing = s.append('window', b.id, 0, Buffer.from('x'))
    await started
    const cancelled = s.invalidate('window')
    release()
    await writing; await cancelled
    assert.equal((await fs.readFile(target)).toString(), 'original')
    assert.equal(s.sessions.size, 0)
  }, { open: async (...args) => { const file = await fs.open(...args); return { close: () => file.close(), sync: () => file.sync(), write: async (...args) => { entered(); await gate; return file.write(...args) } } } })
})
