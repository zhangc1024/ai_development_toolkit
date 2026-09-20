import { afterEach, expect, it, vi } from 'vitest'
import { loadChatSettings, saveChatSettings, CHAT_SETTINGS_KEY } from '../src/tools/chat/settings'
import { streamChat } from '../src/tools/chat/ollama'
afterEach(() => vi.unstubAllGlobals())
it.each([null, '{}', '{"version":1}', '{"version":1,"thinking":"true"}', '{"version":2,"thinking":true}'])('缺失或无效设置默认关闭: %s', raw => {
  expect(loadChatSettings(() => ({ getItem: () => raw, setItem: vi.fn() })).thinking).toBe(false)
})
it.each([true, false])('保存恢复 thinking=%s，仅保存聊天选项', thinking => {
  let raw: string | null = null
  const storage = { getItem: () => raw, setItem: vi.fn((_key: string, value: string) => { raw = value }) }
  expect(saveChatSettings(thinking, () => storage)).toBe(true)
  expect(storage.setItem).toHaveBeenCalledWith(CHAT_SETTINGS_KEY, JSON.stringify({ version: 1, thinking }))
  expect(loadChatSettings(() => storage)).toEqual({ thinking, warning: '' })
})
it('存储禁止访问时返回提示，不阻止页面使用', () => {
  const unavailable = () => { throw new Error('SecurityError') }
  expect(loadChatSettings(unavailable)).toMatchObject({ thinking: false })
  expect(loadChatSettings(unavailable).warning).not.toBe('')
  expect(saveChatSettings(true, unavailable)).toBe(false)
})
it.each([true, false])('流式聊天传递 think=%s 且忽略思考正文', async thinking => {
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/show')
    ? { capabilities: ['completion', 'thinking'] }
    : { message: { content: '正文', thinking: '不显示' }, done: true })))
  vi.stubGlobal('fetch', mock)
  const update = vi.fn()
  await expect(streamChat('http://localhost', 'local', [{ role: 'user', content: '问题' }], update, undefined, thinking)).resolves.toBe('正文')
  const calls = mock.mock.calls as unknown as [string, RequestInit][]
  expect(JSON.parse(String(calls[1]![1].body))).toMatchObject({ think: thinking, stream: true })
  expect(update).toHaveBeenLastCalledWith('正文')
})
it('无 thinking 能力时不发送聊天正文', async () => {
  const mock = vi.fn(async () => new Response(JSON.stringify({ capabilities: ['completion'] })))
  vi.stubGlobal('fetch', mock)
  await expect(streamChat('http://localhost', 'local', [{ role: 'user', content: '私密问题' }], vi.fn(), undefined, true)).rejects.toThrow('不支持 Thinking')
  expect(mock).toHaveBeenCalledTimes(1)
})
