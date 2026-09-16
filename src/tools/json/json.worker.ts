import { processJson } from './core'
self.onmessage = (event) => {
  const { text, action, indent } = event.data
  try { self.postMessage(processJson(text, action, indent)) }
  catch { self.postMessage({ ok: false, message: '处理失败，请减少内容或嵌套层级后重试' }) }
}
