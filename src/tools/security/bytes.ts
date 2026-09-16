export type InputEncoding = 'utf8' | 'hex' | 'base64'
export type OutputEncoding = 'hex' | 'HEX' | 'base64'
export const TEXT_LIMIT = 1024 * 1024
export const KEY_LIMIT = 64 * 1024
export function checkSize(text: string, limit = TEXT_LIMIT) {
  if (new TextEncoder().encode(text).length > limit) throw new Error('输入超过 ' + (limit / 1024) + ' KiB 限制')
}
export function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  return btoa(chunks.join(''))
}
export function fromBase64(text: string, url = false): Uint8Array {
  const alphabet = url ? /^[A-Za-z0-9_-]*$/ : /^[A-Za-z0-9+/]*={0,2}$/
  if (!alphabet.test(text)) throw new Error(url ? 'JWT 分段必须是无填充 Base64URL' : 'Base64 不能包含空白、URL 字母表或中间填充')
  const raw = text.replace(/=+$/, '')
  const pad = (4 - raw.length % 4) % 4
  if (raw.length % 4 === 1 || (text.includes('=') && text !== raw + '='.repeat(pad))) throw new Error('Base64 长度或填充不正确')
  const standard = raw.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(standard + '='.repeat(pad))
  if (btoa(decoded).replace(/=+$/, '') !== standard) throw new Error('Base64 尾部填充位不规范')
  return Uint8Array.from(decoded, c => c.charCodeAt(0))
}
export function inputBytes(text: string, encoding: InputEncoding): Uint8Array {
  if (encoding === 'hex') {
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(text)) throw new Error('Hex 必须为偶数位十六进制，不带 0x、空格或分隔符')
    return Uint8Array.from(text.match(/../g) ?? [], value => parseInt(value, 16))
  }
  if (encoding === 'base64') return fromBase64(text)
  if (encoding !== 'utf8') throw new Error('不支持的输入编码')
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('输入包含未配对的 Unicode 代理项')
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('输入包含未配对的 Unicode 代理项')
  }
  return new TextEncoder().encode(text)
}
export function outputBytes(bytes: Uint8Array, encoding: OutputEncoding): string {
  if (encoding === 'base64') return toBase64(bytes)
  const value = Array.from(bytes, c => c.toString(16).padStart(2, '0')).join('')
  if (encoding === 'hex') return value
  if (encoding === 'HEX') return value.toUpperCase()
  throw new Error('不支持的输出编码')
}
