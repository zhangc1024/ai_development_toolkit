export const CONNECT_TIMEOUT = 5000
export const GENERATE_TIMEOUT = 120000

export function normalizeBaseUrl(value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('请输入完整的 HTTP(S) Ollama 地址。') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('服务地址仅支持 HTTP(S)，不能包含账号、密码、查询参数或片段。')
  }
  return url.href.replace(/\/+$/, '')
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ollama 返回了无效的数据结构。')
  return value as Record<string, unknown>
}
export function cancelled(): DOMException { return new DOMException('已取消', 'AbortError') }
export function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw cancelled() }

export async function requestJson(baseUrl: string, path: string, body?: unknown, signal?: AbortSignal, timeout = CONNECT_TIMEOUT): Promise<Record<string, unknown>> {
  checkAbort(signal)
  const address = normalizeBaseUrl(baseUrl)
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  try {
    const response = await fetch(address + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
    })
    if (!response.ok) {
      const reason = response.status === 404 ? '接口或模型不存在，请刷新模型列表。'
        : response.status === 403 ? '访问被拒绝，请检查 OLLAMA_ORIGINS 和服务权限。'
        : response.status === 401 ? '服务要求认证；此工具不支持 API Key，请联系管理员。'
        : response.status >= 500 ? '模型加载或服务运行失败，请查看 Ollama 日志。' : '请检查服务配置。'
      throw new Error('Ollama HTTP ' + response.status + '：' + reason)
    }
    const data = record(await response.json())
    checkAbort(signal)
    if (data.error) throw new Error('Ollama 返回错误，请检查模型和服务日志。')
    return data
  } catch (error) {
    if (signal?.aborted) throw cancelled()
    if (timedOut) throw new Error('Ollama 请求超时（' + timeout / 1000 + ' 秒），请检查服务或选择较小模型。')
    if (error instanceof TypeError) throw new Error('无法访问 Ollama，请检查地址、服务启动、CORS、浏览器本地网络权限及 HTTPS 限制。')
    if (error instanceof SyntaxError) throw new Error('服务返回的不是有效 JSON，请确认地址指向 Ollama。')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
function remote(data: Record<string, unknown>, name: string) {
  return Boolean(data.remote_host || data.remote_model || /(?:^|[-:])cloud(?:$|[-:])/i.test(name))
}
export async function inspectModel(baseUrl: string, model: string, signal?: AbortSignal) {
  if (!model) throw new Error('请先检测连接并选择本地模型。')
  const data = await requestJson(baseUrl, '/api/show', { model }, signal)
  if (remote(data, model)) throw new Error('该模型使用远程推理，请选择服务器本地运行的模型。')
  if (!Array.isArray(data.capabilities) || !data.capabilities.includes('completion')) {
    throw new Error('无法确认模型支持文本生成，请选择生成模型或升级 Ollama。')
  }
  return data
}
export interface ModelList { models: string[]; skipped: number }
export async function listModels(baseUrl: string, signal?: AbortSignal): Promise<ModelList> {
  const data = await requestJson(baseUrl, '/api/tags', undefined, signal)
  if (!Array.isArray(data.models)) throw new Error('模型列表格式不正确。')
  const names = [...new Set(data.models.map(item => record(item)).filter(item =>
    typeof item.name === 'string' && !remote(item, item.name)
  ).map(item => item.name as string))]
  const accepted = new Set<string>()
  let next = 0
  // Bounded concurrency; inspecting metadata never sends prompt contents.
  await Promise.all(Array.from({ length: Math.min(3, names.length) }, async () => {
    while (next < names.length) {
      checkAbort(signal)
      const name = names[next++]!
      try { await inspectModel(baseUrl, name, signal); accepted.add(name) }
      catch { checkAbort(signal) }
    }
  }))
  checkAbort(signal)
  return { models: names.filter(name => accepted.has(name)), skipped: data.models.length - accepted.size }
}
export async function chat(baseUrl: string, model: string, system: string, user: string, signal?: AbortSignal, thinking = false): Promise<string> {
  // Recheck at generation time in case a saved model was replaced by a remote alias.
  const details = await inspectModel(baseUrl, model, signal)
  if (thinking && !(details.capabilities as unknown[]).includes('thinking')) {
    throw new Error('所选模型不支持 Thinking，请关闭深度思考开关或更换模型。')
  }
  const data = await requestJson(baseUrl, '/api/chat', {
    model, stream: false, think: thinking,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }, signal, GENERATE_TIMEOUT)
  if (remote(data, model)) throw new Error('服务报告使用了远程模型，请检查服务器配置。')
  const message = record(data.message)
  if (typeof message.content !== 'string' || !message.content.trim()) throw new Error('模型返回内容为空，请更换模型或重试。')
  if (data.done === false || data.done_reason === 'length') throw new Error('模型输出未完成，请缩短输入或调整服务器上下文配置。')
  return message.content.trim()
}
