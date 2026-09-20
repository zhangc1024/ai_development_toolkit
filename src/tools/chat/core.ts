export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'complete' | 'generating' | 'stopped' | 'error'
  model?: string
  error?: string
}
export interface Conversation { id: string; title: string; updatedAt: number; messages: ChatMessage[] }
export const MAX_INPUT_CHARS = 12000
export const MAX_CONTEXT_CHARS = 24000
export const MAX_CONTEXT_TURNS = 20

/** Keep complete user/assistant pairs; interrupted and failed turns never become context. */
export function buildContext(history: ChatMessage[], input: string) {
  if (!input.trim()) throw new Error('请输入消息。')
  if (input.length > MAX_INPUT_CHARS) throw new Error('单条消息最多 12000 字符。')
  const pairs: ChatMessage[][] = []
  for (let index = 0; index < history.length - 1; index++) {
    const user = history[index]!
    const assistant = history[index + 1]!
    if (user.role === 'user' && assistant.role === 'assistant' && user.status === 'complete' && assistant.status === 'complete') {
      pairs.push([user, assistant]); index++
    }
  }
  let size = input.length
  const kept: ChatMessage[] = []
  for (const pair of pairs.slice().reverse()) {
    const length = pair.reduce((total, message) => total + message.content.length, 0)
    if (kept.length >= MAX_CONTEXT_TURNS * 2 || size + length > MAX_CONTEXT_CHARS) break
    kept.unshift(...pair); size += length
  }
  return {
    messages: [...kept.map(({ role, content }) => ({ role, content })), { role: 'user' as const, content: input }],
    omitted: history.length - kept.length,
  }
}
