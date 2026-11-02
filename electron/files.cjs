const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const MAX_CHUNK = 4 * 1024 * 1024
const MAX_SIZE = 2 * 1024 * 1024 * 1024
const failed = (message = '保存失败，请检查目标权限、占用状态和可用空间') => ({ status: 'failed', message })
function validName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 240 && !/[\\/:*?"<>|\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
}
class SaveSessions {
  constructor(choose, io = fs, timeout = 120_000, commit) {
    this.commit = commit
    this.choose = choose; this.io = io; this.timeout = timeout
    this.sessions = new Map(); this.owners = new Map(); this.pending = new Set(); this.epochs = new Map()
  }
  async begin(owner, name, size) {
    if (!validName(name) || !Number.isSafeInteger(size) || size < 0 || size > MAX_SIZE) return failed('无效的保存参数')
    if (this.pending.size || this.sessions.size) return { status: 'cancelled' }
    const epoch = this.epochs.get(owner) ?? 0
    this.pending.add(owner)
    let handle, temp
    try {
      const target = await this.choose(owner, name)
      if (!target || (this.epochs.get(owner) ?? 0) !== epoch) return { status: 'cancelled' }
      if (typeof target !== 'string' || !path.isAbsolute(target)) return failed()
      const id = randomUUID()
      temp = path.join(path.dirname(target), '.devkit-save-' + id + '.tmp')
      handle = await this.io.open(temp, 'wx', 0o600)
      if ((this.epochs.get(owner) ?? 0) !== epoch) { await handle.close(); await this.io.unlink(temp); return { status: 'cancelled' } }
      const entry = { id, owner, target, temp, handle, size, written: 0, sequence: 0, operation: null, cancelled: false }
      this.sessions.set(id, entry); this.owners.set(owner, id); this.touch(entry)
      return { status: 'ready', id }
    } catch {
      await handle?.close().catch(() => {})
      if (temp) await this.io.unlink(temp).catch(() => {})
      return failed()
    } finally { this.pending.delete(owner) }
  }
  touch(entry) {
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => { void this.cancel(entry.owner, entry.id) }, this.timeout)
    entry.timer.unref?.()
  }
  owned(owner, id) { const entry = this.sessions.get(id); return entry?.owner === owner ? entry : undefined }
  async operate(owner, id, operation) {
    const entry = this.owned(owner, id)
    if (!entry || entry.cancelled || entry.operation) return failed('保存会话无效或正在写入')
    clearTimeout(entry.timer)
    entry.operation = Promise.resolve().then(() => operation(entry))
    try { return await entry.operation }
    catch { await this.cleanup(entry); return failed() }
    finally { entry.operation = null; if (this.sessions.has(id)) this.touch(entry) }
  }
  append(owner, id, sequence, bytes) {
    return this.operate(owner, id, async entry => {
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_CHUNK || sequence !== entry.sequence || entry.written + bytes.byteLength > entry.size) {
        await this.cleanup(entry); return failed('保存分块无效')
      }
      let offset = 0
      while (offset < bytes.byteLength) {
        if (entry.cancelled) return { status: 'cancelled' }
        const result = await entry.handle.write(bytes, offset, bytes.byteLength - offset, entry.written + offset)
        if (!result.bytesWritten) throw Error('Short write')
        offset += result.bytesWritten
      }
      entry.written += bytes.byteLength; entry.sequence++
      return { status: 'saved' }
    })
  }
  finish(owner, id) {
    return this.operate(owner, id, async entry => {
      if (entry.written !== entry.size || entry.cancelled) { await this.cleanup(entry); return failed('保存数据不完整') }
      await entry.handle.sync()
      await entry.handle.close(); entry.handle = null
      if (entry.cancelled) { await this.cleanup(entry); return { status: 'cancelled' } }
      // Same-directory atomic rename. Never unlink the original target first.
      const result = this.commit ? await this.commit(entry) : (await this.io.rename(entry.temp, entry.target), { status: 'saved' })
      this.forget(entry)
      return result
    })
  }
  forget(entry) {
    clearTimeout(entry.timer)
    this.sessions.delete(entry.id); this.owners.delete(entry.owner)
  }
  async cleanup(entry) {
    await entry.handle?.close().catch(() => {}); entry.handle = null
    await this.io.unlink(entry.temp).catch(() => {})
    this.forget(entry)
  }
  async cancel(owner, id) {
    const entry = this.owned(owner, id)
    if (!entry) return { status: 'cancelled' }
    entry.cancelled = true
    await entry.operation?.catch(() => {})
    if (this.sessions.has(id)) await this.cleanup(entry)
    return { status: 'cancelled' }
  }
  async invalidate(owner) {
    this.epochs.set(owner, (this.epochs.get(owner) ?? 0) + 1)
    const id = this.owners.get(owner)
    if (id) await this.cancel(owner, id)
  }
  async dispose() {
    for (const owner of new Set([...this.pending, ...this.owners.keys()])) await this.invalidate(owner)
  }
}
module.exports = { SaveSessions, validName, MAX_CHUNK }
