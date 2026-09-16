import type { WorkRequest, WorkResult } from './types'
self.onmessage = async (event: MessageEvent<WorkRequest>) => {
  const { kind, text, options } = event.data
  let response: WorkResult
  try {
    if (kind === 'jwt') {
      const { parseJwt } = await import('../security/jwt')
      const jwt = parseJwt(text)
      response = { ok: true, message: '解析完成（未验签）', jwt,
        output: 'Header\n' + jwt.header + '\n\nPayload\n' + jwt.payload + '\n\nSignature (Base64URL)\n' + (jwt.signature || '（空）') + '\n\n未验签；以上内容不证明 Token 真实性。' }
    } else if (kind === 'sql') {
      const { formatSql } = await import('../sql/core')
      response = { ok: true, message: '格式化完成（未执行 SQL）', output: formatSql(text, options) }
    } else {
      const { hashText, signHmac } = await import('../security/crypto')
      response = { ok: true, message: kind === 'hash' ? '哈希计算完成' : 'HMAC 计算完成', output: kind === 'hash' ? hashText(text, options) : signHmac(text, options) }
    }
  } catch (error) { response = { ok: false, message: error instanceof Error ? error.message : '处理失败，请检查输入' } }
  self.postMessage(response)
}
