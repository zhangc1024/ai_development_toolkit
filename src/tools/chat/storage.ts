import type { Conversation } from './core'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open('devkit.ai.chat.v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('conversations', { keyPath: 'id' })
    request.onsuccess = () => {
      const db = request.result
      if (blocked) { db.close(); return }
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => { blocked = true; reject(new Error('会话数据库被其他页面占用，请关闭旧页面后重试。')) }
  })
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('conversations', mode)
    const request = operation(tx.objectStore('conversations'))
    tx.oncomplete = () => { db.close(); resolve(request.result) }
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? request.error ?? new Error('会话存储失败')) }
  })
}
export async function loadConversations(): Promise<Conversation[]> {
  const rows = await transaction('readonly', store => store.getAll()) as Conversation[]
  return rows.map(row => ({
    ...row,
    messages: row.messages.map(message => message.status === 'generating'
      ? { ...message, status: 'stopped' as const, error: '上次生成被中断，已有内容已保留。' } : message),
  })).sort((a, b) => b.updatedAt - a.updatedAt)
}
export async function saveConversation(conversation: Conversation) {
  // Vue proxies cannot be structured-cloned by IndexedDB.
  const snapshot: Conversation = JSON.parse(JSON.stringify(conversation))
  await transaction('readwrite', store => store.put(snapshot))
}
export async function deleteConversation(id: string) { await transaction('readwrite', store => store.delete(id)) }
export async function clearConversations() { await transaction('readwrite', store => store.clear()) }
