import { describe, expect, it } from 'vitest'
import { MAX_WATERMARK_BYTES, validateWatermarkInput } from '../src/tools/watermark/import'
describe('watermark photo inputs', () => {
  it('accepts uppercase NEF larger than the former 10 MiB limit', () => {
    expect(() => validateWatermarkInput({ name: 'DSC_0001.NEF', size: 32 * 1024 * 1024 })).not.toThrow()
  })
  it('retains existing supported image inputs', () => {
    for (const name of ['photo.jpg', 'photo.jpeg', 'photo.png', 'photo.webp', 'photo.HEIC', 'photo.heif']) expect(() => validateWatermarkInput({ name, size: 100 })).not.toThrow()
  })
  it('rejects empty and oversized files before decoding', () => {
    for (const size of [0, MAX_WATERMARK_BYTES + 1]) expect(() => validateWatermarkInput({ name: 'photo.nef', size })).toThrow('100 MiB')
  })
  it('does not advertise unrelated RAW or executable inputs as NEF support', () => {
    for (const name of ['photo.arw', 'photo.nef.exe', 'photo.zip']) expect(() => validateWatermarkInput({ name, size: 100 })).toThrow('NEF')
  })
})
