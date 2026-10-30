import { conversationSummary, type Conversation, type ConversationSummary } from './core'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open('devkit.ai.chat.v1', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      const conversations = db.objectStoreNames.contains('conversations')
        ? request.transaction!.objectStore('conversations')
        : db.createObjectStore('conversations', { keyPath: 'id' })
      const summaries = db.createObjectStore('summaries', { keyPath: 'id' })
      // One-time cursor migration preserves old records without loading them all at once.
      const cursor = conversations.openCursor()
      cursor.onsuccess = () => {
        if (!cursor.result) return
        summaries.put(conversationSummary(cursor.result.value))
        cursor.result.continue()
      }
    }
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
async function transaction<T>(stores: string[], mode: IDBTransactionMode, operation: (tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(stores, mode)
      const request = operation(tx)
      tx.oncomplete = () => { db.close(); resolve(request.result) }
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? request.error ?? new Error('会话存储失败')) }
    } catch (error) { db.close(); reject(error) }
  })
}
export async function loadConversations(): Promise<ConversationSummary[]> {
  const rows = await transaction(['summaries'], 'readonly', tx => tx.objectStore('summaries').getAll()) as ConversationSummary[]
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}
export async function loadConversation(id: string): Promise<Conversation | undefined> {
  const row = await transaction(['conversations'], 'readonly', tx => tx.objectStore('conversations').get(id)) as Conversation | undefined
  if (!row) return
  return { ...row, messages: row.messages.map(message => message.status === 'generating'
    ? { ...message, status: 'stopped' as const, error: '上次生成被中断，已有内容已保留。' } : message) }
}
export async function saveConversation(conversation: Conversation) {
  // Clone once, when a queued save actually starts; Vue proxies cannot be stored directly.
  const snapshot: Conversation = JSON.parse(JSON.stringify(conversation))
  await transaction(['conversations', 'summaries'], 'readwrite', tx => {
    tx.objectStore('summaries').put(conversationSummary(snapshot))
    return tx.objectStore('conversations').put(snapshot)
  })
}
export async function deleteConversation(id: string) {
  await transaction(['conversations', 'summaries'], 'readwrite', tx => {
    tx.objectStore('summaries').delete(id)
    return tx.objectStore('conversations').delete(id)
  })
}
export async function clearConversations() {
  await transaction(['conversations', 'summaries'], 'readwrite', tx => {
    tx.objectStore('summaries').clear()
    return tx.objectStore('conversations').clear()
  })
}
