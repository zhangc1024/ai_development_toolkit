import { md5, sha1 } from '@noble/hashes/legacy.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { checkSize, inputBytes, outputBytes, KEY_LIMIT, type InputEncoding, type OutputEncoding } from './bytes'
export const algorithms = { MD5: md5, 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-512': sha512 }
export type Algorithm = keyof typeof algorithms
export interface HashOptions { algorithm: Algorithm; inputEncoding: InputEncoding; outputEncoding: OutputEncoding }
export interface HmacOptions extends HashOptions { key: string; keyEncoding: InputEncoding; allowEmptyKey: boolean }
export function hashText(text: string, options: HashOptions): string {
  checkSize(text)
  const algorithm = algorithms[options.algorithm]
  if (!algorithm) throw new Error('不支持的哈希算法')
  return outputBytes(algorithm(inputBytes(text, options.inputEncoding)), options.outputEncoding)
}
export function signHmac(text: string, options: HmacOptions): string {
  checkSize(text); checkSize(options.key, KEY_LIMIT)
  const algorithm = algorithms[options.algorithm]
  if (!algorithm) throw new Error('不支持的 HMAC 算法')
  const key = inputBytes(options.key, options.keyEncoding)
  if (!key.length && !options.allowEmptyKey) throw new Error('请填写密钥，或明确勾选允许空密钥测试')
  const message = inputBytes(text, options.inputEncoding)
  try { return outputBytes(hmac(algorithm, key, message), options.outputEncoding) }
  finally { key.fill(0) }
}
