export const CHAT_SETTINGS_KEY = 'devkit.chat.settings.v1'
type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageProvider = () => SettingsStorage
const browserStorage: StorageProvider = () => window.localStorage

export function loadChatSettings(storage: StorageProvider = browserStorage): { thinking: boolean; warning: string } {
  try {
    const value = JSON.parse(storage().getItem(CHAT_SETTINGS_KEY) ?? 'null')
    return { thinking: value?.version === 1 && value.thinking === true, warning: '' }
  } catch {
    return { thinking: false, warning: '无法读取聊天选项，Thinking 已恢复默认关闭。' }
  }
}
export function saveChatSettings(thinking: boolean, storage: StorageProvider = browserStorage): boolean {
  try {
    storage().setItem(CHAT_SETTINGS_KEY, JSON.stringify({ version: 1, thinking }))
    return true
  } catch { return false }
}
