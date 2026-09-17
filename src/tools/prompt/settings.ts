export const dimensions = ['专家角色', '任务目标', '背景上下文', '分析步骤', '输出格式', '限制条件', '示例要求']
export const categories = ['自动识别', '通用', '编程开发', 'SQL / 数据库', '代码解释', 'Bug 排查', '产品需求', '文本写作', '翻译', '数据分析', '图片生成提示词']
export const SETTINGS_KEY = 'devkit.prompt.settings.v1'

export type OutputLanguage = 'zh' | 'en'

export interface PromptSettings {
  version: 1
  category: string
  selected: string[]
  mode: string
  enabled: boolean
  thinking: boolean
  baseUrl: string
  model: string
  language: OutputLanguage
}

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageProvider = () => SettingsStorage
const browserStorage: StorageProvider = () => window.localStorage

export function defaultSettings(): PromptSettings {
  return { version: 1, category: '自动识别', selected: dimensions.slice(0, 6), mode: 'auto', enabled: false, thinking: false, baseUrl: 'http://localhost:11434', model: '', language: 'zh' }
}

/** Only persist these settings; never serialize page state or prompt contents. */
export function normalizeSettings(value: unknown): PromptSettings {
  const defaults = defaultSettings()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const item = value as Record<string, unknown>
  if (item.version !== 1) return defaults
  return {
    version: 1,
    language: item.language === 'en' ? 'en' : 'zh',
    category: typeof item.category === 'string' && categories.includes(item.category) ? item.category : defaults.category,
    selected: Array.isArray(item.selected) ? [...new Set(item.selected.filter((v): v is string => typeof v === 'string' && dimensions.includes(v)))] : defaults.selected,
    mode: typeof item.mode === 'string' && ['auto', 'static', 'ollama'].includes(item.mode) ? item.mode : defaults.mode,
    thinking: typeof item.thinking === 'boolean' ? item.thinking : false,
    enabled: typeof item.enabled === 'boolean' ? item.enabled : defaults.enabled,
    model: typeof item.model === 'string' ? item.model : defaults.model,
    baseUrl: typeof item.baseUrl === 'string' ? item.baseUrl : defaults.baseUrl,
  }
}

export function loadSettings(storage: StorageProvider = browserStorage): { settings: PromptSettings; warning: string } {
  try {
    const raw = storage().getItem(SETTINGS_KEY)
    if (raw === null) return { settings: defaultSettings(), warning: '' }
    return { settings: normalizeSettings(JSON.parse(raw)), warning: '' }
  } catch {
    return { settings: defaultSettings(), warning: '无法读取已保存的配置，已使用默认选项；页面仍可使用。' }
  }
}

export function saveSettings(settings: PromptSettings, storage: StorageProvider = browserStorage): boolean {
  try {
    storage().setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
    return true
  } catch { return false }
}
