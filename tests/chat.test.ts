import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildContext, type ChatMessage } from '../src/tools/chat/core'
import { streamChat, STREAM_TIMEOUT } from '../src/tools/chat/ollama'
import { AI_SETTINGS_KEY, readAiSettings } from '../src/ai/settings'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
function message(role: 'user' | 'assistant', content: string, status: ChatMessage['status'] = 'complete'): ChatMessage {
  return { id: Math.random().toString(), role, content, status }
}
describe('聊天上下文', () => {
  it('携带完整多轮历史与当前输入，不发送存储元数据', () => {
    expect(buildContext([message('user', '你好'), message('assistant', '你好呀')], '接着聊')).toEqual({
      messages: [{ role: 'user', content: '你好' }, { role: 'assistant', content: '你好呀' }, { role: 'user', content: '接着聊' }], omitted: 0,
    })
  })
  it('中断轮次整体排除，保留其后的完整轮次', () => {
    const result = buildContext([message('user', '失败问题'), message('assistant', '部分回复', 'stopped'), message('user', '正常问题'), message('assistant', '完整回复')], '继续')
    expect(result.omitted).toBe(2)
    expect(result.messages.map(item => item.content)).toEqual(['正常问题', '完整回复', '继续'])
  })
  it('按完整轮次限制长度，超长历史不截断单条内容', () => {
    const history = [message('user', 'a'.repeat(12000)), message('assistant', 'b'.repeat(12000)), message('user', '最近'), message('assistant', '回复')]
    expect(buildContext(history, '继续').omitted).toBe(2)
  })
  it('最多保留近期20轮', () => {
    const history = Array.from({ length: 22 }, (_, n) => [message('user', String(n)), message('assistant', '回复')]).flat()
    expect(buildContext(history, '继续').messages).toHaveLength(41)
    expect(buildContext(history, '继续').omitted).toBe(4)
  })
  it('空白和超长输入明确报错', () => {
    expect(() => buildContext([], ' ')).toThrow('请输入')
    expect(() => buildContext([], 'a'.repeat(12001))).toThrow('12000')
  })
})
describe('共用配置迁移', () => {
  function storage(values: Record<string, string>) {
    return { getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value } }
  }
  it('迁移旧提示词配置，仅保存地址和模型，不迁移提示词', () => {
    const values: Record<string, string> = { 'devkit.prompt.settings.v1': JSON.stringify({ version: 1, baseUrl: 'http://192.168.1.8:11434/', model: 'local', input: 'private' }) }
    expect(readAiSettings(storage(values)).settings).toEqual({ version: 1, baseUrl: 'http://192.168.1.8:11434', model: 'local' })
    expect(values[AI_SETTINGS_KEY]).not.toContain('private')
  })
  it('共用配置优先于旧配置，支持内网域名', () => {
    const values = { [AI_SETTINGS_KEY]: JSON.stringify({ version: 1, baseUrl: 'https://ollama.internal', model: 'new' }), 'devkit.prompt.settings.v1': JSON.stringify({ version: 1, baseUrl: 'http://localhost:11434', model: 'old' }) }
    expect(readAiSettings(storage(values)).settings.model).toBe('new')
  })
  it('仅有新版提示词选项时不错误提示迁移失败', () => {
    const values = { 'devkit.prompt.settings.v1': JSON.stringify({ version: 1, enabled: false }) }
    expect(readAiSettings(storage(values)).warning).toBe('')
  })
  it('迁移存储失败时仍保留本次可用的旧配置', () => {
    const store = { getItem: (key: string) => key === AI_SETTINGS_KEY ? null : JSON.stringify({ version: 1, baseUrl: 'http://localhost:11434', model: 'local' }), setItem: () => { throw new Error('quota') } }
    expect(readAiSettings(store).settings.model).toBe('local')
    expect(readAiSettings(store).warning).not.toBe('')
  })
  it('损坏配置不静默恢复旧服务', () => {
    expect(readAiSettings(storage({ [AI_SETTINGS_KEY]: '{bad' })).warning).not.toBe('')
  })
})
function mockStream(body: string, split = 3) {
  const bytes = new TextEncoder().encode(body)
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split))
    controller.close()
  } }))
}
function mockFetch(response: () => Response) {
  const mock = vi.fn(async (url: string) => url.endsWith('/show')
    ? new Response(JSON.stringify({ capabilities: ['completion'] })) : response())
  vi.stubGlobal('fetch', mock)
  return mock
}
describe('Ollama 流式聊天', () => {
  it('支持跨 UTF8 字节块、CRLF、末尾无换行；只展示正文', async () => {
    const mock = mockFetch(() => mockStream('{"message":{"content":"你好","thinking":"隐藏"}}\r\n{"message":{"content":"世界"},"done":true}'))
    const onText = vi.fn()
    await expect(streamChat('http://localhost:11434', 'local', [{ role: 'user', content: '问题' }], onText)).resolves.toBe('你好世界')
    expect(onText).toHaveBeenLastCalledWith('你好世界')
    const calls = mock.mock.calls as unknown as [string, RequestInit][]
    expect(JSON.parse(String(calls[1]![1].body))).toEqual({ model: 'local', stream: true, think: false, messages: [{ role: 'user', content: '问题' }] })
  })
  it.each([
    ['{"message":{"content":"半句"}}\n', '未完成'],
    ['{"error":"model failed"}\n', '返回错误'],
    ['not-json\n', '有效 JSON'],
    ['{"done":true,"message":{"content":""}}\n', '未返回正文'],
    ['{"done":true,"done_reason":"length","message":{"content":"部分"}}\n', '截断'],
  ])('异常流不可标记为成功', async (body, error) => {
    mockFetch(() => mockStream(body))
    await expect(streamChat('http://localhost', 'local', [], vi.fn())).rejects.toThrow(error)
  })
  it('远程模型校验失败时不发送聊天正文', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ remote_host: 'cloud', capabilities: ['completion'] })))
    vi.stubGlobal('fetch', mock)
    await expect(streamChat('http://localhost', 'local', [], vi.fn())).rejects.toThrow('远程')
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('取消读取中的流', async () => {
    const controller = new AbortController()
    let markReading!: () => void
    const reading = new Promise<void>(resolve => { markReading = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/show')) return new Response(JSON.stringify({ capabilities: ['completion'] }))
      return new Response(new ReadableStream({ start(stream) {
        init.signal!.addEventListener('abort', () => stream.error(new DOMException('aborted', 'AbortError')))
        markReading()
      } }))
    }))
    const result = streamChat('http://localhost', 'local', [], vi.fn(), controller.signal)
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await reading; controller.abort(); await assertion
  })
  it('流长时间无数据后超时', async () => {
    vi.useFakeTimers()
    let markReading!: () => void
    const reading = new Promise<void>(resolve => { markReading = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/show')) return new Response(JSON.stringify({ capabilities: ['completion'] }))
      return new Response(new ReadableStream({ start(stream) {
        init.signal!.addEventListener('abort', () => stream.error(new DOMException('aborted', 'AbortError')))
        markReading()
      } }))
    }))
    const result = streamChat('http://localhost', 'local', [], vi.fn())
    const assertion = expect(result).rejects.toThrow('120 秒')
    await reading; await vi.advanceTimersByTimeAsync(STREAM_TIMEOUT); await assertion
  })
})
