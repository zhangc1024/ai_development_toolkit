import { decodeHTMLStrict } from 'entities'

export type EncodingKind = 'url' | 'base64' | 'unicode' | 'html-entity'
export type Direction = 'encode' | 'decode'
export interface EncodingOptions { mode: string; ignoreWhitespace?: boolean }
export interface EncodingResult { ok: boolean; output?: string; message: string }
export const MAX_ENCODING_BYTES = 1024 * 1024

function assertUnicode(text: string) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('存在未配对的 Unicode 高代理项')
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error('存在未配对的 Unicode 低代理项')
  }
}
function url(text: string, direction: Direction, mode: string) {
  if (!['component', 'uri', 'form'].includes(mode)) throw new Error('不支持的 URL 模式')
  try {
    if (direction === 'decode') {
      if (mode === 'uri') return decodeURI(text)
      return decodeURIComponent(mode === 'form' ? text.replace(/\+/g, ' ') : text)
    }
    if (mode === 'uri') return encodeURI(text)
    const encoded = encodeURIComponent(text)
    // application/x-www-form-urlencoded 的单个值；保留字母数字及 * - . _。
    return mode === 'form'
      ? encoded.replace(/[!'()~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+')
      : encoded
  } catch { throw new Error('URL 转换失败：请检查 %XX 是否完整，以及字节序列是否为有效 UTF-8') }
}
function bytesToBase64(bytes: Uint8Array) {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  return btoa(chunks.join(''))
}
function base64(text: string, direction: Direction, options: EncodingOptions) {
  if (!['standard', 'url'].includes(options.mode)) throw new Error('不支持的 Base64 模式')
  const isUrl = options.mode === 'url'
  if (direction === 'encode') {
    const value = bytesToBase64(new TextEncoder().encode(text))
    return isUrl ? value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : value
  }
  const value = options.ignoreWhitespace ? text.replace(/[ \t\r\n]/g, '') : text
  const alphabet = isUrl ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/
  if (!alphabet.test(value)) throw new Error('Base64 包含非法字符或字母表不匹配，请检查模式和空白选项')
  const raw = value.replace(/=+$/, '')
  const padding = (4 - raw.length % 4) % 4
  if (raw.length % 4 === 1 || (value.includes('=') && value !== raw + '='.repeat(padding))) throw new Error('Base64 长度或末尾填充 = 不正确')
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat(padding))
  if (btoa(binary).replace(/=+$/, '') !== normalized) throw new Error('Base64 尾部填充位不规范，无法无歧义解码')
  try {
    // ignoreBOM=true：将 UTF-8 BOM 当作文本内容保留，保证往返不丢字符。
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
  } catch { throw new Error('解码字节不是有效 UTF-8 文本；此工具不处理任意二进制文件') }
}
function unicode(text: string, direction: Direction, mode: string) {
  if (!['non-ascii', 'all'].includes(mode)) throw new Error('不支持的 Unicode 模式')
  if (direction === 'encode') {
    const out: string[] = []
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      out.push(mode === 'all' || code > 126 || code < 32 || code === 92
        ? '\\u' + code.toString(16).padStart(4, '0') : text[i]!)
    }
    return out.join('')
  }
  const out: string[] = []
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && text[i + 1] === '\\') { out.push('\\\\'); i += 2; continue }
    if (text[i] !== '\\' || text[i + 1] !== 'u') { out.push(text[i++]!); continue }
    const start = i
    if (text[i + 2] === '{') {
      const end = text.indexOf('}', i + 3)
      const hex = end < 0 ? '' : text.slice(i + 3, end)
      if (!/^[0-9a-fA-F]{1,6}$/.test(hex) || parseInt(hex, 16) > 0x10ffff || (parseInt(hex, 16) >= 0xd800 && parseInt(hex, 16) <= 0xdfff)) {
        throw new Error('位置 ' + (start + 1) + ' 的 Unicode 码点转义无效')
      }
      out.push(String.fromCodePoint(parseInt(hex, 16))); i = end + 1
    } else {
      const hex = text.slice(i + 2, i + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('位置 ' + (start + 1) + ' 的 Unicode 转义必须包含 4 位十六进制数')
      out.push(String.fromCharCode(parseInt(hex, 16))); i += 6
    }
  }
  const value = out.join('')
  assertUnicode(value)
  return value
}
const special: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function html(text: string, direction: Direction, mode: string) {
  if (!['special', 'ascii'].includes(mode)) throw new Error('不支持的 HTML Entity 模式')
  if (direction === 'decode') return decodeHTMLStrict(text)
  return Array.from(text, c => special[c] ?? (mode === 'ascii' && c.codePointAt(0)! > 127 ? '&#x' + c.codePointAt(0)!.toString(16).toUpperCase() + ';' : c)).join('')
}
/** 纯文本转换，不依赖 DOM，不访问网络，不执行输入内容。 */
export function processEncoding(kind: EncodingKind, text: string, direction: Direction, options: EncodingOptions): EncodingResult {
  try {
    if (new TextEncoder().encode(text).length > MAX_ENCODING_BYTES) throw new Error('输入超过 1 MiB，请缩小内容后重试')
    assertUnicode(text)
    let output: string
    switch (kind) {
      case 'url': output = url(text, direction, options.mode); break
      case 'base64': output = base64(text, direction, options); break
      case 'unicode': output = unicode(text, direction, options.mode); break
      case 'html-entity': output = html(text, direction, options.mode); break
      default: throw new Error('未知编码工具')
    }
    return { ok: true, output, message: direction === 'encode' ? '编码完成' : '解码完成' }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : '转换失败，请检查输入内容' } }
}
