import { reactive, readonly, ref } from 'vue'
import { normalizeBaseUrl } from '../tools/prompt/providers/ollama'

export const AI_SETTINGS_KEY = 'devkit.ai.settings.v1'
export interface AiSettings { version: 1; baseUrl: string; model: string }
type Store = Pick<Storage, 'getItem' | 'setItem'>
const defaults = (): AiSettings => ({ version: 1, baseUrl: 'http://localhost:11434', model: '' })

export function readAiSettings(storage: Store): { settings: AiSettings; warning: string } {
  try {
    const raw = storage.getItem(AI_SETTINGS_KEY)
    const legacy = raw === null
    const value = JSON.parse(raw ?? storage.getItem('devkit.prompt.settings.v1') ?? 'null')
    if (!value || (legacy && value.version === 1 && value.baseUrl === undefined && value.model === undefined)) return { settings: defaults(), warning: '' }
    if (value.version !== 1 || typeof value.baseUrl !== 'string' || typeof value.model !== 'string') {
      throw new Error('invalid settings')
    }
    const settings: AiSettings = { version: 1, baseUrl: normalizeBaseUrl(value.baseUrl), model: value.model.trim() }
    if (legacy) {
      try { storage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings)) }
      catch { return { settings, warning: '旧 AI 配置已读取，但无法保存迁移结果；本次仍可使用。' } }
    }
    return { settings, warning: '' }
  } catch {
    return { settings: defaults(), warning: 'AI 配置读取或迁移失败，请重新配置并保存。' }
  }
}
function restore() {
  try { return readAiSettings(window.localStorage) }
  catch { return { settings: defaults(), warning: '浏览器禁止访问本地配置；本次仍可使用。' } }
}
const initial = restore()
const state = reactive(initial.settings)
export const aiSettings = readonly(state)
export const aiSettingsWarning = ref(initial.warning)
export const aiSettingsOpen = ref(false)
export function openAiSettings() { aiSettingsOpen.value = true }
export function saveAiSettings(value: AiSettings) {
  const next: AiSettings = { version: 1, baseUrl: normalizeBaseUrl(value.baseUrl), model: value.model.trim() }
  if (!next.model) throw new Error('请先检测连接并选择本地文本模型。')
  Object.assign(state, next)
  try {
    window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next))
    aiSettingsWarning.value = ''
  } catch { aiSettingsWarning.value = '配置保存失败，本次可用，刷新后可能丢失。' }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== AI_SETTINGS_KEY && event.key !== null) return
    const restored = restore()
    Object.assign(state, restored.settings)
    aiSettingsWarning.value = restored.warning
  })
}
