import { describe, expect, it, vi } from 'vitest'
import { imagePlacement, layoutImages, type Options } from '../src/tools/image-stitch/core'

const base: Options = { mode: 'grid', size: 100, columns: 3, gap: 10, padding: 20, fit: 'contain' }
const portrait = { width: 100, height: 200 }, landscape = { width: 200, height: 100 }
describe('image stitching geometry', () => {
  it('stacks proportional images vertically with exactly one gap', () => {
    const result = layoutImages([portrait, landscape], { ...base, mode: 'vertical' })
    expect(result).toMatchObject({ width: 140, height: 300, columns: 1, rows: 2 })
    expect(result.cells).toEqual([{ x: 20, y: 20, width: 100, height: 200 }, { x: 20, y: 230, width: 100, height: 50 }])
  })
  it('places proportional images horizontally and respects input order', () => {
    const result = layoutImages([portrait, landscape], { ...base, mode: 'horizontal' })
    expect(result).toMatchObject({ width: 300, height: 140, columns: 2, rows: 1 })
    expect(result.cells[1]).toEqual({ x: 80, y: 20, width: 200, height: 100 })
    expect(layoutImages([landscape, portrait], { ...base, mode: 'horizontal' }).cells[1]!.x).toBe(230)
  })
  it('keeps incomplete grid rows and clips column count to image count', () => {
    const result = layoutImages(Array(5).fill(portrait), base)
    expect(result).toMatchObject({ width: 360, height: 250, columns: 3, rows: 2 })
    expect(result.cells[4]).toEqual({ x: 130, y: 130, width: 100, height: 100 })
    expect(layoutImages([portrait, portrait], base).width).toBe(250)
  })
  it('allows touching images without gaps or padding', () => {
    expect(layoutImages([portrait, landscape], { ...base, mode: 'vertical', gap: 0, padding: 0 })).toMatchObject({ width: 100, height: 250 })
  })
  it('centers the complete image without stretching', () => {
    expect(imagePlacement(landscape, { x: 20, y: 20, width: 100, height: 100 }, 'contain')).toEqual({ sx: 0, sy: 0, sw: 200, sh: 100, dx: 20, dy: 45, dw: 100, dh: 50 })
  })
  it('crops the source center to fill the cell', () => {
    expect(imagePlacement(landscape, { x: 20, y: 20, width: 100, height: 100 }, 'cover')).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100, dx: 20, dy: 20, dw: 100, dh: 100 })
  })
  it('rejects invalid counts, dimensions and editable numeric values', () => {
    for (const images of [[], [portrait], Array(51).fill(portrait), [portrait, { width: 0, height: 1 }]]) expect(() => layoutImages(images, base)).toThrow()
    for (const change of [{ size: NaN }, { gap: -1 }, { gap: 0.5 }, { columns: 0 }, { padding: 501 }, { size: 8193 }]) expect(() => layoutImages([portrait, landscape], { ...base, ...change })).toThrow()
  })
  it('can combine two 25 MP photographs at their original dimensions', () => {
    const result = layoutImages([{ width: 5000, height: 5000 }, { width: 5000, height: 5000 }], { ...base, mode: 'horizontal', size: 5000, gap: 0, padding: 0 })
    expect(result).toMatchObject({ width: 10000, height: 5000 })
  })
  it('bounds canvas area and sides before allocation', () => {
    expect(() => layoutImages(Array(50).fill(portrait), { ...base, size: 1000, mode: 'vertical' })).toThrow('合并尺寸过大')
    expect(() => layoutImages([portrait, portrait], { ...base, size: 6000 })).toThrow('合并尺寸过大')
    expect(layoutImages(Array(50).fill(portrait), { ...base, size: 100, columns: 10 }).cells).toHaveLength(50)
  })
})

// Exercise the same drawImage boundary used by both preview and export.
import { paint } from '../src/tools/image-stitch/render'
describe('preview uses original image geometry', () => {
  it.each(['contain', 'cover'] as const)('keeps destination and normalized crop identical for %s', fit => {
    const original = { width: 16000, height: 10 }, preview = { width: 640, height: 1 }
    const cell = { x: 20, y: 30, width: 600, height: 600 }
    const drawImage = vi.fn(), ctx = { drawImage } as unknown as CanvasRenderingContext2D
    const source = {} as CanvasImageSource
    paint(ctx, source, original, cell, fit)
    const exported = drawImage.mock.calls[0]!
    paint(ctx, source, original, cell, fit, preview)
    const displayed = drawImage.mock.calls[1]!
    expect(displayed.slice(5)).toEqual(exported.slice(5))
    expect(displayed[1] / preview.width).toBeCloseTo(exported[1] / original.width)
    expect(displayed[2] / preview.height).toBeCloseTo(exported[2] / original.height)
    expect(displayed[3] / preview.width).toBeCloseTo(exported[3] / original.width)
    expect(displayed[4] / preview.height).toBeCloseTo(exported[4] / original.height)
    if (fit === 'contain') expect(displayed[8]).toBe(0.375)
  })
})
