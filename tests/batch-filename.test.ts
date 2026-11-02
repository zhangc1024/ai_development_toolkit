import { describe, expect, it } from 'vitest'
import { batchFilename } from '../src/platform/batch'
describe('batch output filenames', () => {
  it('preserves normal names, processing suffix and output extension', () => {
    expect(batchFilename('旅行.原图.NEF', 'watermarked', 'jpg')).toBe('旅行.原图-watermarked.jpg')
  })
  it.each(['compressed', 'watermarked', 'frame'])('bounds long %s names for native saving', suffix => {
    const name = batchFilename('a'.repeat(232) + '.png', suffix, 'jpg')
    expect(name.length).toBeLessThanOrEqual(240)
    expect(name.endsWith('-' + suffix + '.jpg')).toBe(true)
  })
  it('does not leave a partial emoji at the truncation boundary', () => {
    const name = batchFilename('😀'.repeat(125) + '.png', 'watermarked', 'jpg')
    expect(name.length).toBeLessThanOrEqual(240)
    expect(name).not.toMatch(/[\uD800-\uDBFF]-/)
  })
})
