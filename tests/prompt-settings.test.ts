import { describe, expect, it } from 'vitest'
import { defaultSettings, loadSettings, normalizeSettings, saveSettings, SETTINGS_KEY } from '../src/tools/prompt/settings'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return { getItem: (key: string) => key === SETTINGS_KEY ? value : null, setItem: (_key: string, next: string) => { value = next } }
}

describe('提示词配置持久化', () => {
  it('首次使用采用默认设置，默认值不会共享维度数组', () => {
    expect(loadSettings(() => memoryStorage()).settings).toEqual(defaultSettings())
    const settings = defaultSettings()
    settings.selected.length = 0
    expect(defaultSettings().selected).toHaveLength(6)
    expect(settings.enabled).toBe(false)
  })

  it.each(['http://192.168.1.100:11434', 'https://ollama.company.internal'])('保存后可恢复内网地址 %s 与空维度', baseUrl => {
    const storage = memoryStorage()
    const settings = { ...defaultSettings(), mode: 'ollama', category: 'SQL / 数据库', selected: [], enabled: true, baseUrl, model: 'qwen3:8b' }
    expect(saveSettings(settings, () => storage)).toBe(true)
    expect(loadSettings(() => storage)).toEqual({ settings, warning: '' })
  })

  it('只写入允许的配置字段，不写提示词、结果或其他未知字段', () => {
    const storage = memoryStorage()
    const settings = { ...defaultSettings(), input: '私密输入', output: '私密结果', request: '不保存请求状态' }
    saveSettings(settings, () => storage)
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual(defaultSettings())
  })

  it('恢复时校验枚举和类型，维度去重并过滤未知项', () => {
    expect(normalizeSettings({ version: 1, category: 'unknown', mode: 'bad', enabled: 'true', baseUrl: 11434, selected: ['专家角色', '专家角色', null, 'bad'] }))
      .toEqual({ ...defaultSettings(), selected: ['专家角色'] })
  })

  it.each([null, [], 'bad', { version: 2, enabled: true }])('不兼容结构回到默认配置：%j', value => {
    expect(normalizeSettings(value)).toEqual(defaultSettings())
  })

  it('损坏 JSON 返回提示与默认值', () => {
    const result = loadSettings(() => memoryStorage('{broken'))
    expect(result.settings).toEqual(defaultSettings())
    expect(result.warning).not.toBe('')
  })

  it('存储访问被禁止时仍可返回默认值，不抛出异常', () => {
    const unavailable = () => { throw new Error('SecurityError') }
    expect(loadSettings(unavailable).settings).toEqual(defaultSettings())
    expect(loadSettings(unavailable).warning).not.toBe('')
    expect(saveSettings(defaultSettings(), unavailable)).toBe(false)
  })

  it('写入配额不足时返回失败，不影响原配置', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
    expect(saveSettings(defaultSettings(), () => storage)).toBe(false)
  })
})
