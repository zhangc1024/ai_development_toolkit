import { beforeAll, describe, expect, it } from 'vitest'
import { constants, createPrivateKey, createPublicKey, generateKeyPairSync, privateDecrypt, publicEncrypt } from 'node:crypto'
import { generateKeys, processRsa, type KeyPair, type Padding, type CipherEncoding } from '../src/tools/rsa/core'

let pair: KeyPair
beforeAll(async () => { pair = await generateKeys(2048, 'pkcs8') })
function encrypt(text: string, padding: Padding = 'oaep-sha256', encoding: CipherEncoding = 'base64', key = pair.publicKey) {
  return processRsa({ action: 'encrypt', text, key, padding, encoding })
}
function decrypt(text: string, padding: Padding = 'oaep-sha256', encoding: CipherEncoding = 'base64', key = pair.privateKey) {
  return processRsa({ action: 'decrypt', text, key, padding, encoding })
}
describe('RSA 与原生 Node/OpenSSL 互通', () => {
  for (const padding of ['oaep-sha256', 'oaep-sha1', 'pkcs1-v1_5'] as const) {
    for (const encoding of ['base64', 'hex'] as const) {
      it(padding + ' / ' + encoding + ' 中文、emoji 与换行往返', () => {
        const text = '中文 RSA 🔑\r\n保留空格 '
        const cipher = encrypt(text, padding, encoding).output
        expect(decrypt(cipher, padding, encoding).output).toBe(text)
        expect(encrypt(text, padding, encoding).output).not.toBe(cipher)
        const fromNode = publicEncrypt({
          key: pair.publicKey,
          padding: padding === 'pkcs1-v1_5' ? constants.RSA_PKCS1_PADDING : constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: padding === 'oaep-sha256' ? 'sha256' : 'sha1',
        }, Buffer.from(text)).toString(encoding)
        expect(decrypt(fromNode, padding, encoding).output).toBe(text)
        if (padding !== 'pkcs1-v1_5') {
          expect(privateDecrypt({ key: pair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: padding === 'oaep-sha256' ? 'sha256' : 'sha1' }, Buffer.from(cipher, encoding)).toString()).toBe(text)
        } else {
          // 原生 OpenSSL 执行私钥运算，独立检查 v1.5 编码结构。
          const block = privateDecrypt({ key: pair.privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(cipher, encoding))
          expect(block.subarray(0, 2)).toEqual(Buffer.from([0, 2]))
          const separator = block.indexOf(0, 2)
          expect(separator).toBeGreaterThanOrEqual(10)
          expect(block.subarray(separator + 1).toString()).toBe(text)
        }
      })
    }
  }
  it('支持 PKCS#1 公钥和私钥', () => {
    const pub = createPublicKey(pair.publicKey).export({ format: 'pem', type: 'pkcs1' }).toString()
    const priv = createPrivateKey(pair.privateKey).export({ format: 'pem', type: 'pkcs1' }).toString()
    expect(decrypt(encrypt('兼容', 'oaep-sha256', 'base64', pub).output, 'oaep-sha256', 'base64', priv).output).toBe('兼容')
  })
  for (const bits of [2048, 3072, 4096]) {
    it('生成 ' + bits + ' 位 PKCS#1 私钥并与公钥配对', async () => {
      const keys = await generateKeys(bits, 'pkcs1')
      const priv = createPrivateKey(keys.privateKey)
      expect(priv.asymmetricKeyDetails?.modulusLength).toBe(bits)
      expect(priv.asymmetricKeyDetails?.publicExponent).toBe(65537n)
      expect(keys.privateKey).toContain('BEGIN RSA PRIVATE KEY')
      expect(createPublicKey(priv).export({ format: 'pem', type: 'spki' }).toString()).toBe(keys.publicKey)
    }, 30000)
  }
})
describe('RSA 边界与错误', () => {
  for (const [padding, limit] of [['oaep-sha256', 190], ['oaep-sha1', 214], ['pkcs1-v1_5', 245]] as const) {
    it(padding + ' 精确限制明文字节数', () => {
      expect(decrypt(encrypt('a'.repeat(limit), padding).output, padding).output).toBe('a'.repeat(limit))
      expect(() => encrypt('a'.repeat(limit + 1), padding)).toThrow('最多支持 ' + limit)
      expect(() => encrypt('中'.repeat(100), padding)).toThrow('300 字节')
    })
  }
  it('保留空明文与 BOM', () => {
    for (const text of ['', '\ufeff正文']) expect(decrypt(encrypt(text).output).output).toBe(text)
  })
  it('忽略密文空白', () => {
    expect(decrypt(encrypt('空白').output.match(/.{1,40}/g)!.join('\n ')).output).toBe('空白')
  })
  it('拒绝格式错误、错误用途和加密私钥', () => {
    expect(() => encrypt('x', 'oaep-sha256', 'base64', 'bad')).toThrow('完整的 PEM')
    expect(() => encrypt('x', 'oaep-sha256', 'base64', pair.privateKey)).toThrow('需要 RSA 公钥')
    expect(() => decrypt('x', 'oaep-sha256', 'base64', pair.publicKey)).toThrow('需要 RSA 私钥')
    expect(() => decrypt('x', 'oaep-sha256', 'base64', '-----BEGIN ENCRYPTED PRIVATE KEY-----')).toThrow('带密码')
    expect(() => encrypt('x', 'oaep-sha256', 'base64', 'x'.repeat(65537))).toThrow('64 KiB')
  })
  it('拒绝非 RSA 及不支持的密钥位数', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(() => encrypt('x', 'oaep-sha256', 'base64', ec)).toThrow('无法解析 RSA')
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(() => encrypt('x', 'oaep-sha256', 'base64', weak)).toThrow('仅支持')
  })
  it('拒绝错误编码、错误密钥、填充不匹配及篡改密文', async () => {
    expect(() => decrypt('%%%')).toThrow('Base64')
    expect(() => decrypt('abc', 'oaep-sha256', 'hex')).toThrow('Hex')
    expect(() => decrypt('YQ==')).toThrow('256 字节')
    expect(() => decrypt('a'.repeat(16385))).toThrow('16 KiB')
    const cipher = encrypt('hello').output
    expect(() => decrypt(cipher, 'oaep-sha1')).toThrow('解密失败')
    const other = await generateKeys(2048, 'pkcs8')
    expect(() => decrypt(cipher, 'oaep-sha256', 'base64', other.privateKey)).toThrow('解密失败')
    const corrupted = Buffer.from(cipher, 'base64'); corrupted[10] ^= 1
    expect(() => decrypt(corrupted.toString('base64'))).toThrow('解密失败')
  })
  it('拒绝二进制明文和非法 Unicode', () => {
    const binary = publicEncrypt({ key: pair.publicKey, oaepHash: 'sha256' }, Buffer.from([0xff]))
    expect(() => decrypt(binary.toString('base64'))).toThrow('UTF-8')
    expect(() => encrypt('\ud800')).toThrow('代理项')
  })
  it('校验生成参数', async () => {
    await expect(generateKeys(1024, 'pkcs8')).rejects.toThrow('长度')
    await expect(generateKeys(2048, 'bad' as 'pkcs8')).rejects.toThrow('格式')
  })
})
