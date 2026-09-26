import { md5, sha1 } from '@noble/hashes/legacy.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export const algorithms = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as const
export type Algorithm = typeof algorithms[number]
export type Hashes = Record<Algorithm, string>
export type WorkerResult = { type: 'progress'; loaded: number } | { type: 'done'; hashes: Hashes } | { type: 'error'; message: string }
export const CHUNK_SIZE = 2 * 1024 * 1024
// Web Crypto 不支持增量摘要，只有不超过一个分片的小文件使用原生接口。
export const WEB_CRYPTO_LIMIT = CHUNK_SIZE

export function identifyHash(input: string): Algorithm | undefined {
  const value = input.trim()
  if (!/^[0-9a-f]+$/i.test(value)) return
  return ({ 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 128: 'SHA-512' } as Record<number, Algorithm>)[value.length]
}

export async function hashFile(file: Blob, progress: (loaded: number) => void, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<Hashes> {
  const states = { MD5: md5.create(), 'SHA-1': sha1.create(), 'SHA-256': sha256.create(), 'SHA-512': sha512.create() }
  const native = file.size <= WEB_CRYPTO_LIMIT && !!subtle
  let smallBuffer: ArrayBuffer = new ArrayBuffer(0)
  try {
    progress(0)
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      const buffer = await file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size)).arrayBuffer()
      const chunk = new Uint8Array(buffer)
      states.MD5.update(chunk)
      if (native) smallBuffer = buffer
      else for (const algorithm of algorithms.slice(1)) states[algorithm].update(chunk)
      progress(Math.min(offset + CHUNK_SIZE, file.size))
    }
    const hashes = {} as Hashes
    hashes.MD5 = bytesToHex(states.MD5.digest())
    for (const algorithm of algorithms.slice(1)) {
      if (native) {
        try {
          hashes[algorithm] = bytesToHex(new Uint8Array(await subtle!.digest(algorithm, smallBuffer)))
          continue
        } catch {
          // 不支持原生算法或不允许调用时，在本地回退。
          states[algorithm].update(new Uint8Array(smallBuffer))
        }
      }
      hashes[algorithm] = bytesToHex(states[algorithm].digest())
    }
    return hashes
  } finally {
    for (const state of Object.values(states)) state.destroy()
  }
}
