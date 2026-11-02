const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { BatchFiles } = require('../electron/batch.cjs')
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-folder-'))
  const input = path.join(root, '输入'), output = path.join(root, '输出'), install = path.join(root, 'app')
  for (const dir of [input, output, install, path.join(input, '子目录')]) await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(input, '照片.jpg'), 'original')
  await fs.writeFile(path.join(input, '子目录', '照片.jpg'), 'nested')
  const selections = [input, output]
  const batch = new BatchFiles(async () => selections.shift(), install)
  try { await run({ batch, input, output, install, selections, root }) }
  finally { await batch.dispose(); await fs.rm(root, { recursive: true, force: true }) }
}
async function save(batch, input, output, entry, conflict = 'rename') {
  const begin = await batch.begin('a', input.id, output.id, entry.id, '照片-compressed.jpg', 6, conflict)
  assert.equal(begin.status, 'ready')
  assert.equal((await batch.append('a', begin.id, 0, Buffer.from('result'))).status, 'saved')
  return batch.finish('a', begin.id)
}
test('recursive scan, Chinese paths, serial save and collision policies preserve originals', () => fixture(async ({ batch, input: inputPath, output: outputPath }) => {
  const input = await batch.input('a', true), output = await batch.output('a', input.id)
  assert.equal(input.entries.length, 2)
  const entry = input.entries.find(item => item.relative.includes(path.sep))
  assert.equal((await save(batch, input, output, entry)).status, 'saved')
  assert.equal((await save(batch, input, output, entry)).path, path.join('子目录', '照片-compressed (1).jpg'))
  assert.equal((await save(batch, input, output, entry, 'skip')).status, 'skipped')
  assert.equal(await fs.readFile(path.join(inputPath, entry.relative), 'utf8'), 'nested')
  assert.equal(await fs.readFile(path.join(outputPath, '子目录', '照片-compressed.jpg'), 'utf8'), 'result')
  assert.equal((await fs.readdir(path.join(outputPath, '子目录'))).length, 2)
}))
test('non-recursive scan and ownership validation', () => fixture(async ({ batch }) => {
  const input = await batch.input('a', false)
  assert.equal(input.entries.length, 1)
  assert.equal(Buffer.from(await batch.read('a', input.id, input.entries[0].id)).toString(), 'original')
  await assert.rejects(() => batch.read('b', input.id, input.entries[0].id))
  await assert.rejects(() => batch.read('a', input.id, '../outside'))
}))
test('reject same input/output and installation folder', () => fixture(async ({ batch, selections, input: root, install }) => {
  const input = await batch.input('a', false)
  selections.splice(0, selections.length, root, install)
  await assert.rejects(() => batch.output('a', input.id), /不能/)
  await assert.rejects(() => batch.output('a', input.id), /安装/)
}))
test('nested output is excluded, and cannot become input for a save', () => fixture(async ({ batch, selections, input: root }) => {
  const input = await batch.input('a', true)
  selections.splice(0, selections.length, path.join(root, '子目录'))
  const output = await batch.output('a', input.id)
  assert.equal(output.excluded.length, 1)
  await assert.rejects(() => batch.begin('a', input.id, output.id, output.excluded[0], 'x.jpg', 1, 'rename'), /输出目录/)
}))
test('source modified after scan is rejected', () => fixture(async ({ batch, input: root }) => {
  const input = await batch.input('a', false)
  await fs.writeFile(path.join(root, '照片.jpg'), 'changed file')
  await assert.rejects(() => batch.read('a', input.id, input.entries[0].id), /已改变/)
}))
test('cancel removes partial files, retains selection and allows retry', () => fixture(async ({ batch, output: root }) => {
  const input = await batch.input('a', false), output = await batch.output('a', input.id), entry = input.entries[0]
  const begin = await batch.begin('a', input.id, output.id, entry.id, 'x.jpg', 6, 'rename')
  await batch.append('a', begin.id, 0, Buffer.from('abc'))
  await batch.cancel('a')
  assert.deepEqual(await fs.readdir(root), [])
  assert.equal((await save(batch, input, output, entry)).status, 'saved')
  await batch.release('a')
  await assert.rejects(() => batch.read('a', input.id, entry.id))
}))
test('output directory changed into a symlink is rejected', () => fixture(async ({ batch, output: root, input: original }) => {
  const input = await batch.input('a', true), output = await batch.output('a', input.id)
  await fs.symlink(path.join(original, '子目录'), path.join(root, '子目录'), 'junction')
  const entry = input.entries.find(item => item.relative.includes(path.sep))
  await assert.rejects(() => batch.begin('a', input.id, output.id, entry.id, 'x.jpg', 1, 'rename'), /链接/)
}))
test('invalid names and out-of-order writes never create completed output', () => fixture(async ({ batch, output: root }) => {
  const input = await batch.input('a', false), output = await batch.output('a', input.id), entry = input.entries[0]
  await assert.rejects(() => batch.begin('a', input.id, output.id, entry.id, '../x.jpg', 1, 'rename'))
  const begin = await batch.begin('a', input.id, output.id, entry.id, 'x.jpg', 1, 'rename')
  assert.equal((await batch.append('a', begin.id, 3, Buffer.from('x'))).status, 'failed')
  await batch.cancel('a')
  assert.deepEqual(await fs.readdir(root), [])
}))
test('cancel while directory chooser is pending does not install stale selection', () => fixture(async ({ batch, input: root }) => {
  let resolve
  batch.choose = () => new Promise(done => { resolve = done })
  const pending = batch.input('a', false)
  await batch.release('a'); resolve(root)
  assert.equal(await pending, null)
  assert.equal(batch.inputs.size, 0)
}))
