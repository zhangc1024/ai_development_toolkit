import { afterEach, expect, it, vi } from 'vitest'
import { defaultSettings, normalizeSettings, saveSettings, loadSettings } from '../src/tools/prompt/settings'
import { optimizePrompt } from '../src/tools/prompt/optimizer'
import { chat } from '../src/tools/prompt/providers/ollama'

afterEach(() => vi.unstubAllGlobals())
it('默认、旧配置和错误类型均关闭 thinking', () => {
  expect(defaultSettings().thinking).toBe(false)
  expect(normalizeSettings({ version: 1 }).thinking).toBe(false)
  expect(normalizeSettings({ version: 1, thinking: 'true' }).thinking).toBe(false)
})
it.each([true, false])('thinking=%s 保存和恢复', thinking => {
  let value: string | null = null
  const storage = () => ({ getItem: () => value, setItem: (_key: string, next: string) => { value = next } })
  expect(saveSettings({ ...defaultSettings(), thinking }, storage)).toBe(true)
  expect(loadSettings(storage).settings.thinking).toBe(thinking)
})
it.each([true, false])('优化入口传递顶层 think=%s，正文忽略思考字段', async thinking => {
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/show')
    ? { capabilities: ['completion', 'thinking'] }
    : { done: true, message: { content: '最终提示词', thinking: '不应输出' } })))
  vi.stubGlobal('fetch', mock)
  const result = await optimizePrompt('写代码', { ...defaultSettings(), mode: 'ollama', enabled: true, model: 'qwen3:8b', thinking })
  expect(result.text).toBe('最终提示词')
  const calls = mock.mock.calls as unknown as [string, RequestInit][]
  expect(JSON.parse(String(calls[1]![1].body))).toMatchObject({ stream: false, think: thinking })
})
it('直接调用默认也显式发送 think:false，支持非思考模型', async () => {
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/show')
    ? { capabilities: ['completion'] } : { message: { content: '结果' }, done: true })))
  vi.stubGlobal('fetch', mock)
  await chat('http://localhost', 'model', 'system', 'user')
  const calls = mock.mock.calls as unknown as [string, RequestInit][]
  expect(JSON.parse(String(calls[1]![1].body)).think).toBe(false)
})
it('不支持 thinking 的模型开启时明确报错，不发送正文', async () => {
  const mock = vi.fn(async () => new Response(JSON.stringify({ capabilities: ['completion'] })))
  vi.stubGlobal('fetch', mock)
  await expect(optimizePrompt('私密内容', { ...defaultSettings(), mode: 'ollama', enabled: true, model: 'plain', thinking: true })).rejects.toThrow('不支持 Thinking')
  expect(mock).toHaveBeenCalledTimes(1)
})
