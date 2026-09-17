import { afterEach, expect, it, vi } from 'vitest'
import { buildStaticPrompt } from '../src/tools/prompt/builder'
import { defaultSettings, dimensions, categories, normalizeSettings, saveSettings, loadSettings } from '../src/tools/prompt/settings'
import { optimizePrompt, systemPrompt } from '../src/tools/prompt/optimizer'

afterEach(() => vi.unstubAllGlobals())
it.each(categories.filter(item => item !== '自动识别'))('%s 提供完整英文模板并保留原文', category => {
  const original = '  用户的原始需求 😀\n '
  const text = buildStaticPrompt(original, dimensions, category, 'en')
  expect(text).toContain('Original request:\n' + original)
  expect(text).toContain('Role:')
  expect(text).toContain('Constraints:')
  expect(text).toContain('Examples:')
  expect(text.replace(original, '')).not.toMatch(/[\u3400-\u9fff]/)
})
it('无维度不翻译，未选择的英文模块不添加', () => {
  expect(buildStaticPrompt(' 原文 ', [], '通用', 'en')).toBe(' 原文 ')
  const text = buildStaticPrompt('任务', ['任务目标'], '通用', 'en')
  expect(text).toContain('Task:')
  expect(text).not.toContain('Role:')
})
it('默认和旧配置保持中文，英语配置可往返保存，无效语言回退', () => {
  expect(defaultSettings().language).toBe('zh')
  expect(normalizeSettings({ version: 1, mode: 'static' }).language).toBe('zh')
  expect(normalizeSettings({ ...defaultSettings(), language: 'invalid' }).language).toBe('zh')
  let value: string | null = null
  const storage = () => ({ getItem: () => value, setItem: (_key: string, text: string) => { value = text } })
  saveSettings({ ...defaultSettings(), language: 'en' }, storage)
  expect(loadSettings(storage).settings.language).toBe('en')
})
it('模型指令遵循语言选择，不改变原任务的目标语言', () => {
  expect(systemPrompt(['专家角色'], '翻译', 'en')).toContain('Write the optimized prompt in English')
  expect(systemPrompt(['专家角色'], '翻译', 'en')).toContain('不改变原任务指定的翻译目标语言')
  expect(systemPrompt(['专家角色'], '通用', 'zh')).toContain('请用中文输出')
})
it('英文设置传到实际模型请求，自动降级也使用英文', async () => {
  const settings = { ...defaultSettings(), language: 'en' as const, enabled: true, model: 'local', mode: 'auto' }
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/show')) return new Response(JSON.stringify({ capabilities: ['completion'] }))
    const body = JSON.parse(String(init?.body))
    expect(body.messages[0].content).toContain('Write the optimized prompt in English')
    return new Response(JSON.stringify({ done: true, message: { content: 'English result' } }))
  })
  vi.stubGlobal('fetch', mock)
  expect((await optimizePrompt('优化 SQL', settings)).text).toBe('English result')
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  const result = await optimizePrompt('优化 SQL', settings)
  expect(result.warning).toContain('已使用静态规则')
  expect(result.text).toContain('Role:')
  expect(result.text).toContain('database design and performance engineer')
})
