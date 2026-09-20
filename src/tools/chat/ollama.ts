import { cancelled, checkAbort, inspectModel, normalizeBaseUrl } from '../prompt/providers/ollama'
export interface WireMessage { role: 'user' | 'assistant'; content: string }
export const STREAM_TIMEOUT = 120000
export const MAX_RESPONSE_CHARS = 100000

export async function streamChat(baseUrl: string, model: string, messages: WireMessage[], onText: (text: string) => void, signal?: AbortSignal, thinking = false) {
  checkAbort(signal)
  const details = await inspectModel(baseUrl, model, signal)
  if (thinking && !(details.capabilities as unknown[]).includes('thinking')) {
    throw new Error('所选模型不支持 Thinking，请关闭深度思考开关或更换模型。')
  }
  checkAbort(signal)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout>
  const refreshTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => { timedOut = true; controller.abort() }, STREAM_TIMEOUT)
  }
  refreshTimeout()
  let text = ''
  let done = false
  function consume(line: string) {
    if (!line.trim()) return
    const data = JSON.parse(line)
    if (!data || typeof data !== 'object' || data.error) throw new Error('Ollama 返回错误，请检查模型与服务日志。')
    if (data.remote_host || data.remote_model || (typeof data.model === 'string' && /(?:^|[-:])cloud(?:$|[-:])/i.test(data.model))) throw new Error('服务报告使用远程推理，已停止生成。')
    if (data.message?.content !== undefined && typeof data.message.content !== 'string') throw new Error('模型返回了无效内容。')
    const content = data.message?.content ?? ''
    if (text.length + content.length > MAX_RESPONSE_CHARS) throw new Error('回复超过 100000 字符，已停止生成。')
    text += content
    if (content) onText(text)
    if (data.done === true) {
      if (data.done_reason === 'length') throw new Error('模型输出被截断，请缩短问题或调整服务上下文。')
      done = true
    }
  }
  try {
    const response = await fetch(normalizeBaseUrl(baseUrl) + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, think: thinking }),
      signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
    })
    if (!response.ok) throw new Error('Ollama HTTP ' + response.status + '，请检查服务、模型和 OLLAMA_ORIGINS 配置。')
    if (!response.body) throw new Error('浏览器无法读取流式响应。')
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!done) {
      const chunk = await reader.read()
      checkAbort(signal)
      if (chunk.done) {
        buffer += decoder.decode()
        if (buffer.trim()) consume(buffer)
        break
      }
      refreshTimeout()
      buffer += decoder.decode(chunk.value, { stream: true })
      let newline: number
      while (!done && (newline = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
      }
      if (buffer.length > 1000000) throw new Error('流式响应格式异常，已停止读取。')
    }
    if (!done) throw new Error('连接提前结束，回复未完成。')
    if (!text.trim()) throw new Error('模型未返回正文，请更换模型后重试。')
    return text
  } catch (error) {
    if (signal?.aborted) throw cancelled()
    if (timedOut) throw new Error('超过 120 秒没有收到模型数据，请检查服务或选择较小模型。')
    if (error instanceof TypeError) throw new Error('无法连接 Ollama，请检查地址、CORS、本地网络权限及 HTTPS 限制。')
    if (error instanceof SyntaxError) throw new Error('流式响应不是有效 JSON，请确认地址指向 Ollama。')
    throw error
  } finally {
    clearTimeout(timer!)
    signal?.removeEventListener('abort', abort)
    await reader?.cancel().catch(() => {})
    controller.abort()
  }
}
