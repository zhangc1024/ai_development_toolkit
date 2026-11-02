const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { SaveSessions, validName } = require('./files.cjs')
const within = (root, target) => { const rel = path.relative(root, target); return !rel || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)) }
const MAX_BYTES = 100 * 1024 * 1024
// Every path originates in a native directory selection. Renderer requests use opaque IDs.
class BatchFiles {
  constructor(choose, installRoot, open = async () => {}) {
    this.choose = choose; this.installRoot = installRoot; this.openFolder = open
    this.inputs = new Map(); this.outputs = new Map(); this.epochs = new Map(); this.pending = false
    this.targets = new Map()
    this.saves = new SaveSessions(async owner => this.targets.get(owner)?.target, fs, 120000, async entry => {
      const request = this.targets.get(entry.owner)
      if (!request) throw Error('批量任务已失效')
      await this.safeDirectory(request.root, path.dirname(entry.target), false)
      if (entry.cancelled) { await fs.unlink(entry.temp); return { status: 'cancelled' } }
      const ext = path.extname(entry.target), stem = entry.target.slice(0, entry.target.length - ext.length)
      for (let i = 0; i < 10000; i++) {
        const target = i ? stem + ' (' + i + ')' + ext : entry.target
        try {
          // Exclusive creation works on Windows removable disks as well as NTFS.
          // The destination is reserved with wx; never replace a pre-existing result.
          const reservation = await fs.open(target, 'wx')
          await reservation.close()
          if (entry.cancelled) { await fs.unlink(target); await fs.unlink(entry.temp); return { status: 'cancelled' } }
          try { await fs.rename(entry.temp, target) }
          catch (error) { await fs.unlink(target).catch(() => {}); throw error }
          return { status: 'saved', path: path.relative(request.root, target) }
        } catch (error) {
          if (error.code !== 'EEXIST') throw error
          if (request.conflict === 'skip') { await fs.unlink(entry.temp); return { status: 'skipped', path: path.relative(request.root, target) } }
        }
      }
      throw Error('同名文件过多')
    })
  }
  epoch(owner) { return this.epochs.get(owner) ?? 0 }
  owned(map, owner, id) { const item = map.get(owner); if (!item || item.id !== id) throw Error('文件夹选择已失效，请重新选择'); return item }
  async selected(owner, label) {
    const folder = await this.choose(owner, label)
    return folder ? fs.realpath(folder) : null
  }
  async input(owner, recursive) {
    if (this.pending || this.saves.sessions.size) throw Error('已有文件操作正在进行')
    const epoch = this.epoch(owner)
    this.pending = true
    try {
      const root = await this.selected(owner, '选择输入文件夹')
      if (!root || epoch !== this.epoch(owner)) return null
      const entries = [], files = new Map()
      let visited = 0
      const walk = async directory => {
        const dir = await fs.opendir(directory)
        for await (const child of dir) {
          if (epoch !== this.epoch(owner)) throw Error('已取消')
          if (++visited > 50000) throw Error('目录超过 50000 个条目，请选择更小的文件夹')
          const full = path.join(directory, child.name), relative = path.relative(root, full)
          const stat = await fs.lstat(full)
          if (stat.isSymbolicLink()) { entries.push({ id: randomUUID(), name: child.name, relative, size: 0, reason: '跳过链接或目录联接' }); continue }
          if (stat.isDirectory()) { if (recursive === true) await walk(full); continue }
          if (!stat.isFile()) continue
          const item = { id: randomUUID(), name: child.name, relative, size: stat.size }
          entries.push(item); files.set(item.id, { ...item, full, mtime: stat.mtimeMs, ino: stat.ino })
          if (entries.length > 10000) throw Error('文件超过 10000 个，请分批选择文件夹')
        }
      }
      await walk(root)
      entries.sort((a, b) => a.relative.localeCompare(b.relative, 'zh-CN', { numeric: true }))
      const input = { id: randomUUID(), path: root, entries, files }
      this.inputs.set(owner, input); this.outputs.delete(owner)
      return { id: input.id, path: root, entries }
    } finally { this.pending = false }
  }
  async output(owner, inputId) {
    const input = this.owned(this.inputs, owner, inputId)
    if (this.pending || this.saves.sessions.size) throw Error('已有文件操作正在进行')
    this.pending = true
    const epoch = this.epoch(owner)
    try {
      const root = await this.selected(owner, '选择输出文件夹')
      if (!root || epoch !== this.epoch(owner)) return null
      if (path.relative(root, input.path) === '') throw Error('输出文件夹不能与输入文件夹相同')
      if (within(await fs.realpath(this.installRoot), root)) throw Error('请使用应用安装目录以外的输出文件夹')
      const output = { id: randomUUID(), path: root, excluded: [...input.files.values()].filter(file => within(root, file.full)).map(file => file.id) }
      this.outputs.set(owner, output)
      return output
    } finally { this.pending = false }
  }
  async safeDirectory(root, directory, create) {
    const relative = path.relative(root, directory)
    if (!within(root, directory) || await fs.realpath(root) !== root) throw Error('目录已改变，请重新选择')
    let current = root
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part)
      if (create) await fs.mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error })
      const stat = await fs.lstat(current)
      if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(current) !== current) throw Error('不允许写入链接目录')
    }
  }
  async read(owner, inputId, fileId) {
    const input = this.owned(this.inputs, owner, inputId), file = input.files.get(fileId)
    if (!file) throw Error('无效的输入文件')
    await this.safeDirectory(input.path, path.dirname(file.full), false)
    const stat = await fs.lstat(file.full)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size || stat.mtimeMs !== file.mtime || stat.ino !== file.ino) throw Error('源文件已改变，请重新扫描')
    if (!stat.size || stat.size > MAX_BYTES) throw Error('图片必须非空且不超过 100 MiB')
    return new Uint8Array(await fs.readFile(file.full))
  }
  async begin(owner, inputId, outputId, fileId, name, size, conflict) {
    if (this.saves.sessions.size || this.saves.pending.size || this.targets.size) return { status: 'failed', message: '已有保存任务' }
    const input = this.owned(this.inputs, owner, inputId), output = this.owned(this.outputs, owner, outputId), file = input.files.get(fileId)
    if (!file || !validName(name) || !['skip', 'rename'].includes(conflict)) throw Error('无效的输出参数')
    if (within(output.path, file.full)) throw Error('不处理输出目录内的文件')
    const epoch = this.epoch(owner)
    const parent = path.join(output.path, path.dirname(file.relative))
    await this.safeDirectory(output.path, parent, true)
    if (epoch !== this.epoch(owner)) return { status: 'cancelled' }
    this.targets.set(owner, { target: path.join(parent, name), root: output.path, conflict })
    const result = await this.saves.begin(owner, name, size)
    if (result.status !== 'ready') this.targets.delete(owner)
    return result
  }
  append(owner, ...args) { return this.saves.append(owner, ...args) }
  async finish(owner, id) { try { return await this.saves.finish(owner, id) } finally { this.targets.delete(owner) } }
  async cancel(owner) { this.epochs.set(owner, this.epoch(owner) + 1); await this.saves.invalidate(owner); this.targets.delete(owner) }
  async release(owner) { await this.cancel(owner); this.inputs.delete(owner); this.outputs.delete(owner) }
  async open(owner, id) { const output = this.owned(this.outputs, owner, id); await this.safeDirectory(output.path, output.path, false); const error = await this.openFolder(output.path); if (error) throw Error(error) }
  async dispose() { for (const owner of new Set([...this.inputs.keys(), ...this.outputs.keys()])) await this.release(owner); await this.saves.dispose() }
}
module.exports = { BatchFiles, within }
