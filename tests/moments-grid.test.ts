import { describe, expect, it } from 'vitest'
import { constrainCrop, outputFormat, cropRect, INITIAL_CROP, moveCrop, tileFilename, tileRects } from '../src/tools/moments-grid/core'

describe('single photo nine-grid geometry', () => {
  it('centres landscape and portrait crops', () => {
    expect(cropRect(4000, 3000, INITIAL_CROP)).toEqual({ x: 500, y: 0, size: 3000 })
    expect(cropRect(3000, 4000, INITIAL_CROP)).toEqual({ x: 0, y: 500, size: 3000 })
  })
  it('covers the crop exactly in row-major order, including fractional cell boundaries', () => {
    const rect = cropRect(4001, 3001, { x: 0.62, y: 0.43, zoom: 1.7 })
    const tiles = tileRects(4001, 3001, { x: 0.62, y: 0.43, zoom: 1.7 })
    expect(tiles).toHaveLength(9)
    expect(tiles[0].x).toBe(rect.x)
    expect(tiles[0].y).toBe(rect.y)
    expect(tiles[2].x + tiles[2].size).toBeCloseTo(rect.x + rect.size)
    expect(tiles[8].y + tiles[8].size).toBeCloseTo(rect.y + rect.size)
    expect(tiles.reduce((a, t) => a + t.size ** 2, 0)).toBeCloseTo(rect.size ** 2)
    for (let i = 0; i < 9; i++) {
      if (i % 3 < 2) expect(tiles[i].x + tiles[i].size).toBeCloseTo(tiles[i + 1].x)
      if (i < 6) expect(tiles[i].y + tiles[i].size).toBeCloseTo(tiles[i + 3].y)
    }
  })
  it('never exposes empty pixels after excessive movement or zoom', () => {
    for (const [width, height] of [[4000, 3000], [3000, 4000], [1, 9000], [9000, 1]]) {
      for (const zoom of [-3, 1, 2, 99, NaN]) {
        for (const x of [-100, 0.5, 100, NaN]) {
          const area = cropRect(width, height, { x, y: x, zoom })
          expect(area.x).toBeGreaterThanOrEqual(-1e-9)
          expect(area.y).toBeGreaterThanOrEqual(-1e-9)
          expect(area.x + area.size).toBeLessThanOrEqual(width + 1e-9)
          expect(area.y + area.size).toBeLessThanOrEqual(height + 1e-9)
        }
      }
    }
  })
  it('keeps the touched source pixel anchored during pinch and translation', () => {
    const crop = { x: 0.5, y: 0.5, zoom: 2 }, from = { x: 0.3, y: 0.4 }, to = { x: 0.4, y: 0.6 }
    const before = cropRect(4000, 3000, crop)
    const after = cropRect(4000, 3000, moveCrop(4000, 3000, crop, from, to, 3))
    expect(before.x + from.x * before.size).toBeCloseTo(after.x + to.x * after.size)
    expect(before.y + from.y * before.size).toBeCloseTo(after.y + to.y * after.size)
  })
  it('uses scale-independent geometry for export', () => {
    const crop = { x: 0.65, y: 0.6, zoom: 2 }
    const preview = tileRects(1200, 900, crop), original = tileRects(4000, 3000, crop)
    original.forEach((tile, i) => {
      expect(preview[i].x / 0.3).toBeCloseTo(tile.x)
      expect(preview[i].y / 0.3).toBeCloseTo(tile.y)
      expect(preview[i].size / 0.3).toBeCloseTo(tile.size)
    })
  })
  it('rejects invalid geometry and produces ordered JPEG filenames', () => {
    expect(() => constrainCrop(0, 100, INITIAL_CROP)).toThrow()
    expect(() => constrainCrop(Infinity, 100, INITIAL_CROP)).toThrow()
    expect(Array.from({ length: 9 }, (_, i) => tileFilename(i))).toEqual([
      'moment-grid-01.jpg', 'moment-grid-02.jpg', 'moment-grid-03.jpg',
      'moment-grid-04.jpg', 'moment-grid-05.jpg', 'moment-grid-06.jpg',
      'moment-grid-07.jpg', 'moment-grid-08.jpg', 'moment-grid-09.jpg',
    ])
    expect(() => tileFilename(9)).toThrow()
  })
})

describe('output format and filename consistency', () => {
  it('names PNG, JPEG and WebP using the actual encoded MIME', () => {
    for (const [mime, ext] of [['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]) {
      expect(tileFilename(0, outputFormat(mime))).toBe('moment-grid-01.' + ext)
      expect(tileFilename(8, outputFormat(mime))).toBe('moment-grid-09.' + ext)
    }
    expect(() => outputFormat('image/unknown')).toThrow()
  })
})
