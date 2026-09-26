import { describe, expect, it } from 'vitest'
import { convertSize } from './core'

describe('data size conversion', () => {
  it('converts the design example with the binary base', () => {
    expect(convertSize('1.5', 'GB', 1024).map(row => row.value)).toEqual([
      '1610612736', '1572864', '1536', '1.5', '0.00146484375',
    ])
  })
  it('switches to the decimal base', () => {
    expect(convertSize('1.5', 'GB', 1000).map(row => row.value)).toEqual([
      '1500000000', '1500000', '1500', '1.5', '0.0015',
    ])
  })
  it('retains small and large values without floating point loss', () => {
    expect(convertSize('1', 'B', 1024)[4]).toMatchObject({
      value: '0.000000000000909494701773',
      approximate: true,
    })
    expect(convertSize('9007199254740993', 'B', 1000)[0]?.value).toBe('9007199254740993')
  })
  it('rejects negative, malformed, and overly precise values', () => {
    for (const input of ['-1', '1e6', '1,000', '1.2.3', '1.' + '0'.repeat(19)]) {
      expect(() => convertSize(input, 'B', 1024)).toThrow()
    }
  })
})

