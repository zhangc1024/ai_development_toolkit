import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveCategory, templates } from '../src/tools/prompt/categories'
import { buildStaticPrompt } from '../src/tools/prompt/builder'
import { defaultSettings } from '../src/tools/prompt/settings'
import { optimizePrompt } from '../src/tools/prompt/optimizer'
import { chat, listModels, normalizeBaseUrl, requestJson } from '../src/tools/prompt/providers/ollama'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const settings = () => ({ ...defaultSettings(), mode: 'ollama', enabled: true, model: 'local:8b' })
function fakeFetch(handler: (url: string, body: Record<string, any>, init: RequestInit) => Promise<Response> | Response) {
  const mock = vi.fn((url: string, init: RequestInit = {}) => handler(url, init.body ? JSON.parse(String(init.body)) : {}, init))
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('分类模板', () => {
  it.each([
    ['解释 python 函数代码', '代码解释'], ['PHP error 日志', 'Bug 排查'],
    ['翻译 SQL 文档', '翻译'], ['生成图片提示词', '图片生成提示词'],
    ['优化这个 prompt', '通用'], ['mysql 查询优化', 'SQL / 数据库'],
    ['写一个 PHP 接口', '编程开发'], ['产品需求 PRD', '产品需求'],
    ['数据分析和趋势', '数据分析'], ['润色邮件', '文本写作'],
  ])('%s → %s', (input, category) => expect(resolveCategory(input)).toBe(category))
  it('手动类别优先，包括通用', () => {
    expect(resolveCategory('mysql', '翻译')).toBe('翻译')
    expect(resolveCategory('mysql', '通用')).toBe('通用')
  })
  it.each(Object.keys(templates))('%s 模板保留原文和缺失信息占位', category => {
    const out = buildStaticPrompt(' 原文\n😀 ', ['专家角色', '背景上下文', '分析步骤', '输出格式'], category)
    expect(out).toContain(' 原文\n😀 ')
    expect(out).toContain('［请按需补充')
    expect(out).toContain(templates[category]!.role)
    expect(buildStaticPrompt('原文', [], category)).toBe('原文')
  })
})
describe('Ollama 请求边界', () => {
  it.each(['http://localhost:11434', 'http://192.168.1.4:11434', 'https://ollama.office.internal/proxy', 'http://[::1]:11434'])('允许本机/内网地址 %s', url => {
    expect(normalizeBaseUrl(url + '/')).toBe(url)
  })
  it.each(['file:///tmp/a', 'ftp://host', 'host:11434', 'https://user:pass@host', 'http://host?token=x', 'http://host#x'])('拒绝不适用地址 %s', url => {
    expect(() => normalizeBaseUrl(url)).toThrow()
  })
  it('模型列表过滤远程、embedding和详情失败，保留生成模型', async () => {
    fakeFetch((url, body) => {
      if (url.endsWith('/tags')) return response({ models: [{ name: 'local' }, { name: 'embed' }, { name: 'broken' }, { name: 'remote', remote_host: 'cloud' }, { name: 'x:cloud' }] })
      if (body.model === 'broken') return response({}, 500)
      return response({ capabilities: body.model === 'embed' ? ['embedding'] : ['completion'] })
    })
    expect(await listModels('http://localhost')).toEqual({ models: ['local'], skipped: 4 })
  })
  it('空模型列表可识别', async () => {
    fakeFetch(() => response({ models: [] }))
    expect(await listModels('http://localhost')).toEqual({ models: [], skipped: 0 })
  })
  it.each([{ remote_model: 'cloud', capabilities: ['completion'] }, { capabilities: ['embedding'] }, {}])('发送正文前拦截不合适模型 %j', async detail => {
    const mock = fakeFetch(() => response(detail))
    await expect(chat('http://localhost', 'x', 'system', 'PRIVATE')).rejects.toThrow()
    expect(mock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mock.mock.calls)).not.toContain('PRIVATE')
  })
  it('正确构造非流式请求，不发送凭据且不跟随重定向', async () => {
    const mock = fakeFetch(url => url.endsWith('/show') ? response({ capabilities: ['completion'] }) : response({ message: { content: '结果', thinking: '不输出的思考' }, done: true }))
    expect(await chat('http://localhost', 'x', 'system', 'prompt')).toBe('结果')
    const init = mock.mock.calls[1]![1]!
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('error')
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: false, messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'prompt' }] })
  })
  it.each([{ message: { content: '' } }, { message: { content: 'cut' }, done_reason: 'length' }, { message: { content: 'cut' }, done: false }, {}])('拒绝空/截断/无效响应 %j', async data => {
    fakeFetch(url => response(url.endsWith('/show') ? { capabilities: ['completion'] } : data))
    await expect(chat('http://localhost', 'x', 's', 'u')).rejects.toThrow()
  })
  it.each([401, 403, 404, 500])('HTTP %s 返回有意义的错误', async status => {
    fakeFetch(() => response({}, status))
    await expect(requestJson('http://localhost', '/api/tags')).rejects.toThrow(String(status))
  })
  it('网络访问错误不会误报为服务一定未启动', async () => {
    fakeFetch(() => { throw new TypeError('Failed to fetch') })
    await expect(requestJson('http://localhost', '/api/tags')).rejects.toThrow('CORS')
  })
  it('超时终止请求', async () => {
    vi.useFakeTimers()
    fakeFetch((_url, _body, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))
    }))
    const promise = requestJson('http://localhost', '/api/tags', undefined, undefined, 20)
    const assertion = expect(promise).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(21)
    await assertion
  })
})
describe('统一优化模式', () => {
  it.each([['static', true], ['static', false], ['auto', false]] as const)('%s enabled=%s 不联网', async (mode, enabled) => {
    const mock = fakeFetch(() => { throw new Error('unexpected') })
    const result = await optimizePrompt('mysql 查询', { ...settings(), mode, enabled })
    expect(result.source).toBe('静态规则 · SQL / 数据库')
    expect(mock).not.toHaveBeenCalled()
  })
  it('空维度原样返回，模型模式也不联网', async () => {
    const mock = fakeFetch(() => { throw new Error('unexpected') })
    expect((await optimizePrompt(' 原文 ', { ...settings(), selected: [] })).text).toBe(' 原文 ')
    expect(mock).not.toHaveBeenCalled()
  })
  it('自动模式失败明确降级，手动模式失败抛出错误', async () => {
    fakeFetch(() => { throw new TypeError('offline') })
    const result = await optimizePrompt('任务', { ...settings(), mode: 'auto' })
    expect(result.warning).toContain('已使用静态规则')
    expect(result.source).toContain('静态规则')
    await expect(optimizePrompt('任务', settings())).rejects.toThrow('无法访问')
  })
  it('手动模型未启用或无模型时不请求', async () => {
    const mock = fakeFetch(() => { throw new Error('unexpected') })
    await expect(optimizePrompt('任务', { ...settings(), enabled: false })).rejects.toThrow('启用')
    await expect(optimizePrompt('任务', { ...settings(), model: '' })).rejects.toThrow('选择')
    expect(mock).not.toHaveBeenCalled()
  })
  it('模型收到所选维度和原文，返回实际来源', async () => {
    const mock = fakeFetch(url => response(url.endsWith('/show') ? { capabilities: ['completion'] } : { message: { content: '优化后的提示词' }, done: true }))
    const result = await optimizePrompt('解释 python 函数', { ...settings(), selected: ['专家角色'] })
    const body = JSON.parse(String(mock.mock.calls[1]![1]!.body))
    expect(body.messages[0].content).toContain('本次优化维度：专家角色')
    expect(body.messages[0].content).not.toContain('本次优化维度：专家角色、')
    expect(body.messages[1].content).toContain('解释 python 函数')
    expect(result.source).toContain('local:8b')
    expect(result.category).toBe('代码解释')
  })
  it('生成过程中主动取消不降级', async () => {
    const controller = new AbortController()
    fakeFetch((url, _body, init) => url.endsWith('/show') ? response({ capabilities: ['completion'] }) : new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))
      controller.abort()
    }))
    await expect(optimizePrompt('任务', { ...settings(), mode: 'auto' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('已取消请求、空输入和超长输入不联网', async () => {
    const mock = fakeFetch(() => response({}))
    const controller = new AbortController(); controller.abort()
    await expect(optimizePrompt('任务', settings(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(optimizePrompt('  ', settings())).rejects.toThrow('输入')
    await expect(optimizePrompt('a'.repeat(12001), settings())).rejects.toThrow('12000')
    expect(mock).not.toHaveBeenCalled()
  })
})
