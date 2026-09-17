import { describe, expect, it } from 'vitest'
import { hitMark, localPoint, resultFilename, type Watermark } from '../src/tools/watermark/core'
const mark: Watermark = { id: 1, text: 'test', x: 200, y: 100, size: 36, opacity: 35, angle: 90, color: '#000000' }
describe('watermark geometry and exports', () => {
  it('hit-tests rotated text in image coordinates rather than the screen-aligned rectangle', () => {
    expect(hitMark(mark, 200, 160, 160, 40)).toBe(true)
    expect(hitMark(mark, 260, 100, 160, 40)).toBe(false)
    expect(hitMark(mark, 225, 100, 160, 40, 10)).toBe(true)
  })
  it('inverts arbitrary rotation including negative angles', () => {
    for (const angle of [-180, -45, 0, 35, 90, 180]) {
      const radians = angle * Math.PI / 180
      const point = localPoint({ ...mark, angle }, mark.x + 40 * Math.cos(radians) - 15 * Math.sin(radians), mark.y + 40 * Math.sin(radians) + 15 * Math.cos(radians))
      expect(point.x).toBeCloseTo(40); expect(point.y).toBeCloseTo(15)
    }
  })
  it('keeps drag hit testing invariant across preview scale', () => {
    for (const scale of [.1, .5, 2]) expect(hitMark({ ...mark, x: mark.x * scale, y: mark.y * scale }, 200 * scale, 160 * scale, 160 * scale, 40 * scale)).toBe(true)
  })
  it('always names the result as watermarked with the actual format', () => {
    expect(resultFilename('身份证.jpg', 'png')).toBe('身份证-watermarked.png')
    expect(resultFilename('a/b:proof.jpeg', 'webp')).toBe('a_b_proof-watermarked.webp')
  })
})
