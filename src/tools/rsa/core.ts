import forge from 'node-forge'
import { checkSize, inputBytes, outputBytes, KEY_LIMIT } from '../security/bytes'

export type Padding = 'oaep-sha256' | 'oaep-sha1' | 'pkcs1-v1_5'
export type CipherEncoding = 'base64' | 'hex'
export type KeyFormat = 'pkcs8' | 'pkcs1'
export interface RsaRequest {
  action: 'encrypt' | 'decrypt'
  text: string
  key: string
  padding: Padding
  encoding: CipherEncoding
}
export interface KeyPair { publicKey: string; privateKey: string }
export interface RsaResult { output: string; bits: number; maxBytes: number }
export type WorkerRequest = RsaRequest | { action: 'generate'; bits: number; format: KeyFormat }

function validatePadding(padding: Padding) {
  if (!['oaep-sha256', 'oaep-sha1', 'pkcs1-v1_5'].includes(padding)) throw new Error('不支持的填充方式')
}
function keyInfo(key: forge.pki.rsa.PublicKey | forge.pki.rsa.PrivateKey, padding: Padding) {
  const bits = key.n.bitLength()
  if (![2048, 3072, 4096].includes(bits)) throw new Error('仅支持 2048、3072、4096 位 RSA 密钥')
  const maxBytes = Math.ceil(bits / 8) - (padding === 'pkcs1-v1_5' ? 11 : padding === 'oaep-sha256' ? 66 : 42)
  return { bits, maxBytes }
}
function readKey(pem: string, privateKey: boolean) {
  checkSize(pem, KEY_LIMIT)
  const value = pem.trim()
  if (/ENCRYPTED|Proc-Type:/i.test(value)) throw new Error('暂不支持带密码的私钥，请使用未加密 PEM 私钥')
  const match = /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|PRIVATE KEY|RSA PRIVATE KEY)-----\r?\n([A-Za-z0-9+/=\s]+)\r?\n-----END \1-----$/.exec(value)
  if (!match) throw new Error('密钥必须是完整的 PEM 文本，包含 BEGIN / END 标记；不支持证书或 OpenSSH 格式')
  if (privateKey !== match[1]!.includes('PRIVATE')) throw new Error(privateKey ? '解密需要 RSA 私钥' : '加密需要 RSA 公钥')
  try { return privateKey ? forge.pki.privateKeyFromPem(value) : forge.pki.publicKeyFromPem(value) }
  catch { throw new Error('无法解析 RSA 密钥，请检查 PEM 格式和内容') }
}
function oaepOptions(padding: Padding) {
  const digest = padding === 'oaep-sha256' ? forge.md.sha256 : forge.md.sha1
  return { md: digest.create(), mgf1: { md: digest.create() } }
}
function requireRandom() {
  if (!globalThis.crypto?.getRandomValues) throw new Error('当前浏览器不支持安全随机数，无法执行 RSA 操作')
}
export function processRsa(request: RsaRequest): RsaResult {
  requireRandom()
  const { action, text, padding, encoding } = request
  if (action !== 'encrypt' && action !== 'decrypt') throw new Error('不支持的操作')
  validatePadding(padding)
  if (!['base64', 'hex'].includes(encoding)) throw new Error('不支持的密文编码')
  checkSize(text, 16 * 1024)
  const key = readKey(request.key, action === 'decrypt')
  const info = keyInfo(key, padding)
  if (action === 'encrypt') {
    const bytes = inputBytes(text, 'utf8')
    if (bytes.length > info.maxBytes) throw new Error('明文为 ' + bytes.length + ' 字节，当前密钥与填充最多支持 ' + info.maxBytes + ' 字节；请缩短明文')
    const binary = String.fromCharCode(...bytes)
    const publicKey = key as forge.pki.rsa.PublicKey
    const encrypted = padding === 'pkcs1-v1_5'
      ? publicKey.encrypt(binary, 'RSAES-PKCS1-V1_5')
      : publicKey.encrypt(binary, 'RSA-OAEP', oaepOptions(padding))
    return { ...info, output: outputBytes(Uint8Array.from(encrypted, c => c.charCodeAt(0)), encoding) }
  }
  const bytes = inputBytes(text.replace(/\s/g, ''), encoding)
  if (bytes.length !== Math.ceil(info.bits / 8)) throw new Error('密文长度必须为 ' + Math.ceil(info.bits / 8) + ' 字节，请检查编码、密钥或是否为分段密文')
  let decrypted: string
  try {
    const privateKey = key as forge.pki.rsa.PrivateKey
    const binary = String.fromCharCode(...bytes)
    decrypted = padding === 'pkcs1-v1_5'
      ? privateKey.decrypt(binary, 'RSAES-PKCS1-V1_5')
      : privateKey.decrypt(binary, 'RSA-OAEP', oaepOptions(padding))
  } catch { throw new Error('解密失败，请检查私钥、填充方式及密文是否匹配') }
  try {
    return { ...info, output: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(decrypted, c => c.charCodeAt(0))) }
  } catch { throw new Error('解密结果不是有效的 UTF-8 文本，当前工具不支持二进制明文') }
}
function pem(label: string, data: ArrayBuffer) {
  const body = outputBytes(new Uint8Array(data), 'base64').match(/.{1,64}/g)!.join('\n')
  return '-----BEGIN ' + label + '-----\n' + body + '\n-----END ' + label + '-----\n'
}
export async function generateKeys(bits: number, format: KeyFormat): Promise<KeyPair> {
  if (![2048, 3072, 4096].includes(bits)) throw new Error('不支持的 RSA 密钥长度')
  if (!['pkcs8', 'pkcs1'].includes(format)) throw new Error('不支持的私钥格式')
  if (!globalThis.crypto?.subtle) throw new Error('生成密钥需要 HTTPS 或 localhost，以及支持 Web Crypto 的浏览器')
  const keys = await crypto.subtle.generateKey({
    name: 'RSA-OAEP', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
  }, true, ['encrypt', 'decrypt'])
  const [publicDer, privateDer] = await Promise.all([
    crypto.subtle.exportKey('spki', keys.publicKey), crypto.subtle.exportKey('pkcs8', keys.privateKey),
  ])
  const privatePem = pem('PRIVATE KEY', privateDer)
  return {
    publicKey: pem('PUBLIC KEY', publicDer),
    privateKey: format === 'pkcs1' ? forge.pki.privateKeyToPem(forge.pki.privateKeyFromPem(privatePem)) : privatePem,
  }
}
