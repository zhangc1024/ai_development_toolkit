import { parseTree } from 'jsonc-parser'
import { processJson } from '../json/core'
import { checkSize, fromBase64, toBase64 } from './bytes'
export interface JwtTime { claim: string; value: string; utc: string; note: string }
export interface JwtResult { header: string; payload: string; signature: string; algorithm: string; times: JwtTime[]; warnings: string[]; checkedAt: string }
function decodeObject(segment: string, label: string) {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fromBase64(segment, true)) }
  catch { throw new Error(label + ' 不是规范的 Base64URL / UTF-8') }
  const formatted = processJson(text, 'format')
  if (!formatted.ok || formatted.rootType !== 'object') throw new Error(label + ' 必须是标准 JSON 对象：' + (formatted.ok ? '不接受数组或标量' : formatted.message))
  const tree = parseTree(text)!
  const keys = new Set<string>()
  for (const property of tree.children ?? []) {
    const name = property.children![0]!.value as string
    if (keys.has(name)) throw new Error(label + ' 含重复的顶层字段：' + name)
    keys.add(name)
  }
  return { text: formatted.output!, object: JSON.parse(text) as Record<string, unknown>, tree, source: text }
}
export function parseJwt(input: string, nowMs = Date.now()): JwtResult {
  checkSize(input)
  const token = input.trim().replace(/^Bearer[ \t]+/i, '')
  const parts = token.split('.')
  if (parts.length === 5) throw new Error('这是五段 JWE 加密格式，本工具只解析三段 JWT/JWS')
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error('JWT 必须包含 Header.Payload.Signature 三段')
  const header = decodeObject(parts[0]!, 'Header')
  const payload = decodeObject(parts[1]!, 'Payload')
  const alg = header.object.alg
  if (typeof alg !== 'string' || !alg.length) throw new Error('Header.alg 必须为非空字符串')
  if (header.object.b64 === false) throw new Error('不支持 b64=false 的未编码载荷')
  fromBase64(parts[2]!, true)
  if (!parts[2] && alg !== 'none') throw new Error('此 JWT 缺少签名段')
  if (parts[2] && alg === 'none') throw new Error('alg=none 的 JWT 签名段应为空')
  const warnings = ['未验签：解析结果与时间声明均不证明身份、权限或 Token 真实性。']
  if (alg === 'none') warnings.push('alg=none：此 Token 未附带签名。')
  if (header.object.crit !== undefined) warnings.push('包含 crit 扩展，本工具不验证扩展语义。')
  const times: JwtTime[] = []
  for (const claim of ['iat', 'nbf', 'exp']) {
    const property = payload.tree.children?.find(p => p.children?.[0]?.value === claim)
    if (!property) continue
    const node = property.children![1]!
    const raw = payload.source.slice(node.offset, node.offset + node.length)
    const value = payload.object[claim]
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value * 1000) > 8.64e15) {
      times.push({ claim, value: raw, utc: '无法转换', note: '需要可表示的 NumericDate（秒），不会将字符串或毫秒自动猜测转换' })
      continue
    }
    const date = new Date(value * 1000)
    const now = nowMs / 1000
    const note = claim === 'exp' ? (now >= value ? '按设备时间已过期' : '按设备时间尚未到期')
      : claim === 'nbf' ? (now < value ? '按设备时间尚未生效' : '按设备时间已到生效时间')
      : (value > now ? '签发时间位于设备当前时间之后' : '签发时间声明')
    times.push({ claim, value: raw, utc: date.toISOString(), note })
  }
  if (!Object.hasOwn(payload.object, 'exp')) warnings.push('未提供 exp，无法判断是否到期。')
  return { header: header.text, payload: payload.text, signature: parts[2]!, algorithm: alg, times, warnings, checkedAt: new Date(nowMs).toISOString() }
}
export function jwtSample(now = Date.now()): string {
  const encode = (value: unknown) => toBase64(new TextEncoder().encode(JSON.stringify(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return encode({ alg: 'none', typ: 'JWT' }) + '.' + encode({ sub: 'demo-user', name: '开发者', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 }) + '.'
}
