import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { reactive } from 'vue'
import { loadConversations, loadConversation, saveConversation, deleteConversation, clearConversations } from '../src/tools/chat/storage'
import type { Conversation } from '../src/tools/chat/core'

const row = (id: string, updatedAt = 1): Conversation => ({ id, title: id, updatedAt, messages: [{ id: 'reply', role: 'assistant', content: '保留正文', status: 'generating' }] })
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function seedLegacy(rows: Conversation[]) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('devkit.ai.chat.v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('conversations', { keyPath: 'id' })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('conversations', 'readwrite')
      rows.forEach(value => tx.objectStore('conversations').put(value))
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })
}
describe('聊天历史存储', () => {
  it('迁移旧数据库，摘要不含正文，单独读取时恢复中断状态', async () => {
    await seedLegacy([row('old'), row('recent', 2)])
    expect(await loadConversations()).toEqual([{ id: 'recent', title: 'recent', updatedAt: 2 }, { id: 'old', title: 'old', updatedAt: 1 }])
    expect(await loadConversation('old')).toMatchObject({ messages: [{ content: '保留正文', status: 'stopped' }] })
    expect(await loadConversation('missing')).toBeUndefined()
  })
  it('列表仅查询摘要；正文按 id 读取，不对正文执行 getAll', async () => {
    await saveConversation(row('a')); await saveConversation(row('b'))
    const stores: string[] = []
    const original = IDBObjectStore.prototype.getAll
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (...args) {
      stores.push(this.name); return original.apply(this, args)
    })
    expect(await loadConversations()).toHaveLength(2)
    await loadConversation('b')
    expect(stores).toEqual(['summaries'])
  })
  it('保存 Vue 会话时在异步打开数据库前获取一次稳定快照', async () => {
    const conversation = reactive(row('a'))
    const saving = saveConversation(conversation)
    conversation.messages[0]!.content = '之后的新内容'
    await saving
    expect((await loadConversation('a'))!.messages[0]!.content).toBe('保留正文')
    conversation.title = '新标题'; await saveConversation(conversation)
    expect(await loadConversations()).toEqual([{ id: 'a', title: '新标题', updatedAt: 1 }])
  })
  it('删除与清空同时更新摘要和正文', async () => {
    await saveConversation(row('a')); await saveConversation(row('b'))
    await deleteConversation('a')
    expect(await loadConversation('a')).toBeUndefined()
    expect((await loadConversations()).map(value => value.id)).toEqual(['b'])
    await clearConversations()
    expect(await loadConversations()).toEqual([])
    expect(await loadConversation('b')).toBeUndefined()
  })
  it('摘要写入失败时整笔保存回滚，原正文仍在', async () => {
    await saveConversation(row('a'))
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
      const request = put.apply(this, args)
      if (this.name === 'summaries') this.transaction.abort()
      return request
    })
    await expect(saveConversation({ ...row('a'), title: '不应写入' })).rejects.toBeDefined()
    expect((await loadConversation('a'))!.title).toBe('a')
    expect((await loadConversations())[0]!.title).toBe('a')
  })
})
