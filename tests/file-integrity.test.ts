import { describe, expect, it, vi } from 'vitest'
import { createHash, webcrypto } from 'node:crypto'
import { algorithms, CHUNK_SIZE, hashFile, identifyHash } from '../src/tools/file-integrity/core'

function expected(bytes: Uint8Array) {
  return Object.fromEntries(algorithms.map(a => [a, createHash(a.toLowerCase().replace('-', '')).update(bytes).digest('hex')]))
}
describe('file integrity', () => {
  it.each([0, 3, 55, 56, 64, 111, 112, 128, CHUNK_SIZE, CHUNK_SIZE + 17])('hashes %i bytes with bounded reads', async size => {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251)
    const file = new Blob([bytes])
    const slice = vi.spyOn(file, 'slice')
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('whole-file reads forbidden'))
    const progress: number[] = []
    const result = await hashFile(file, loaded => progress.push(loaded), webcrypto.subtle as SubtleCrypto)
    expect(result).toEqual(expected(bytes))
    for (const [start, end] of slice.mock.calls) expect(end! - start!).toBeLessThanOrEqual(CHUNK_SIZE)
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(size)
    expect(progress).toEqual([...progress].sort((a,b) => a-b))
  })
  it('uses Web Crypto for all small-file SHA hashes', async () => {
    const digest = vi.fn((a, b) => webcrypto.subtle.digest(a, b))
    await hashFile(new Blob(['abc']), () => {}, { digest } as unknown as SubtleCrypto)
    expect(digest.mock.calls.map(c => c[0])).toEqual(['SHA-1', 'SHA-256', 'SHA-512'])
  })
  it('never uses Web Crypto for large files', async () => {
    const digest = vi.fn()
    const bytes = new Uint8Array(CHUNK_SIZE * 2 + 1)
    expect(await hashFile(new Blob([bytes]), () => {}, { digest } as unknown as SubtleCrypto)).toEqual(expected(bytes))
    expect(digest).not.toHaveBeenCalled()
  })
  it('falls back when Web Crypto rejects', async () => {
    const bytes = new TextEncoder().encode('中文 abc')
    const digest = vi.fn().mockRejectedValue(new Error('unsupported'))
    expect(await hashFile(new Blob([bytes]), () => {}, { digest } as unknown as SubtleCrypto)).toEqual(expected(bytes))
  })
  it('works without Web Crypto', async () => {
    vi.stubGlobal('crypto', undefined)
    try {
      const bytes = new TextEncoder().encode('abc')
      expect(await hashFile(new Blob([bytes]), () => {})).toEqual(expected(bytes))
    } finally { vi.unstubAllGlobals() }
  })
  it('propagates file read failures', async () => {
    const file = new Blob(['abc'])
    vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: async () => { throw new Error('read failed') } } as Blob)
    await expect(hashFile(file, () => {})).rejects.toThrow('read failed')
  })
  it.each([[32, 'MD5'], [40, 'SHA-1'], [64, 'SHA-256'], [128, 'SHA-512']])('identifies %i hex characters', (length, algorithm) => {
    expect(identifyHash('  ' + 'A'.repeat(Number(length)) + '\n')).toBe(algorithm)
  })
  it.each(['', 'g'.repeat(32), 'a'.repeat(31), 'a'.repeat(33), 'a '.repeat(16), 'SHA-256: ' + 'a'.repeat(64)])('rejects invalid hash %s', value => {
    expect(identifyHash(value)).toBeUndefined()
  })
})
