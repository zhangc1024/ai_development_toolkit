import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildContext, conversationSummary, MAX_INPUT_CHARS, type Conversation } from '../src/tools/chat/core'
import { createWriteQueue } from '../src/tools/chat/write-queue'

// Run the actual SFC setup code with controlled storage latency and lifecycle hooks.
// This tests event handlers, refs and watchers without substituting a copy of their logic.
const source = readFileSync(new URL('../src/tools/chat/ChatTool.vue', import.meta.url), 'utf8')
const script = source.split('<script setup lang="ts">')[1]!.split('</script>')[0]!.replace(/^import .*$/gm, '')
const code = ts.transpile(script + '\nreturn { newConversation, selectConversation, removeCurrent, clearAll, send, persist, current, conversations, activeId, input, loading, deleting, storageFailed, notice };', { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
const cleanups: (() => void)[] = []
const row = (id: string): Conversation => ({ id, title: id, updatedAt: 1, messages: [] })
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
async function harness(overrides: Record<string, unknown> = {}) {
  const db = new Map([['a', row('a')], ['b', row('b')]])
  const queue = createWriteQueue()
  let mount!: () => Promise<void>, unmount!: () => void
  const env = {
    // Node 24 CJS namespaces add a non-identifier 'module.exports' marker.
    ...Object.fromEntries(Object.entries(vue).filter(([name]) => /^[$A-Z_a-z][$\w]*$/.test(name))), onMounted: (fn: typeof mount) => { mount = fn }, onBeforeUnmount: (fn: typeof unmount) => { unmount = fn },
    loadChatSettings: () => ({ thinking: false }), saveChatSettings: () => true,
    aiSettings: vue.reactive({ model: 'local', baseUrl: 'http://localhost:11434' }),
    buildContext, conversationSummary, MAX_INPUT_CHARS, chatWrites: queue, confirm: vi.fn(() => true),
    loadConversations: vi.fn(async () => [...db.values()].map(conversationSummary)),
    loadConversation: vi.fn(async (id: string) => structuredClone(db.get(id))),
    saveConversation: vi.fn(async (c: Conversation) => { db.set(c.id, JSON.parse(JSON.stringify(c))) }),
    deleteConversation: vi.fn(async (id: string) => { db.delete(id) }),
    clearConversations: vi.fn(async () => { db.clear() }),
    streamChat: vi.fn(async (_base: string, _model: string, _messages: unknown, onText: (text: string) => void) => { onText('完整回复'); return '完整回复' }),
    ...overrides,
  }
  const scope = vue.effectScope()
  const chat = scope.run(() => new Function(...Object.keys(env), code)(...Object.values(env)))
  const dispose = () => { unmount(); scope.stop() }
  cleanups.push(dispose)
  await mount()
  return { chat, db, queue, env, dispose }
}
beforeEach(() => vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() }))
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.unstubAllGlobals() })
describe('聊天交互并发回归', () => {
  it('清空执行中拒绝新建、发送、切换及重复删除，完成后恢复可用', async () => {
    const started = deferred(), gate = deferred()
    const clear = vi.fn(async () => { started.resolve(); await gate.promise })
    const { chat, env, queue } = await harness({ clearConversations: clear })
    const clearing = chat.clearAll(); await started.promise
    chat.input.value = '不能发送'
    await chat.newConversation(); await chat.send(); await chat.selectConversation(row('b'))
    await chat.clearAll(); await chat.removeCurrent()
    expect(chat.current.value.id).toBe('a')
    expect(chat.deleting.value).toBe(true)
    expect(env.streamChat).not.toHaveBeenCalled()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(env.deleteConversation).not.toHaveBeenCalled()
    gate.resolve(); await clearing; await queue.flush()
    expect(chat.deleting.value).toBe(false)
    expect(chat.conversations.value).toHaveLength(1)
    expect(chat.current.value.id).not.toBe('a')
    await chat.newConversation(); await queue.flush()
    expect(chat.conversations.value).toHaveLength(2)
  })
  it('保存完成后才删除，删除失败保留当前会话并解除锁定', async () => {
    const started = deferred(), gate = deferred(), order: string[] = []
    const { chat, queue } = await harness({
      saveConversation: async () => { started.resolve(); await gate.promise; order.push('save') },
      deleteConversation: async () => { order.push('delete'); throw Error('blocked') },
    })
    chat.persist(chat.current.value); await started.promise
    const removing = chat.removeCurrent()
    await chat.newConversation()
    expect(order).toEqual([])
    gate.resolve(); await removing; await queue.flush()
    expect(order).toEqual(['save', 'delete'])
    expect(chat.current.value.id).toBe('a')
    expect(chat.conversations.value).toHaveLength(2)
    expect(chat.deleting.value).toBe(false)
    expect(chat.storageFailed.value).toBe(true)
  })
  it('只加载当前会话正文，切换后释放前一会话正文', async () => {
    const { chat, env } = await harness()
    expect(env.loadConversation).toHaveBeenCalledTimes(1)
    expect(env.loadConversation).toHaveBeenLastCalledWith('a')
    expect(chat.conversations.value.every((c: object) => !('messages' in c))).toBe(true)
    await chat.selectConversation(row('b'))
    expect(env.loadConversation).toHaveBeenLastCalledWith('b')
    expect(chat.current.value.id).toBe('b')
    expect(chat.activeId.value).toBe('b')
  })
  it('保存失败时不丢弃当前会话；重试成功后允许切换', async () => {
    const save = vi.fn().mockRejectedValueOnce(Error('quota')).mockResolvedValue(undefined)
    const { chat, queue } = await harness({ saveConversation: save })
    chat.current.value.messages.push({ id: 'unsaved', role: 'user', status: 'complete', content: '未保存消息' })
    chat.persist(chat.current.value); await queue.flush()
    await chat.selectConversation(row('b')); await chat.newConversation()
    expect(chat.current.value.id).toBe('a')
    expect(chat.current.value.messages[0].content).toBe('未保存消息')
    chat.persist(chat.current.value); await queue.flush()
    await chat.selectConversation(row('b'))
    expect(chat.current.value.id).toBe('b')
  })
  it('流式回复结束时保存完整正文和完成状态，并刷新摘要', async () => {
    const { chat, db, queue } = await harness()
    chat.input.value = '一个问题'; await chat.send(); await queue.flush()
    expect(db.get('a')!.messages).toMatchObject([{ content: '一个问题' }, { content: '完整回复', status: 'complete' }])
    expect(chat.conversations.value[0].title).toBe('一个问题')
    expect(chat.conversations.value[0].messages).toBeUndefined()
  })
  it('离开页面后等待中的清空不会创建新会话', async () => {
    const started = deferred(), gate = deferred()
    const { chat, env, queue, dispose } = await harness({ clearConversations: async () => { started.resolve(); await gate.promise } })
    const clearing = chat.clearAll(); await started.promise; dispose()
    gate.resolve(); await clearing; await queue.flush()
    expect(env.saveConversation).not.toHaveBeenCalled()
  })
})
