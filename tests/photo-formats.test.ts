import { describe, it, expect } from 'vitest'
import { detectPhoto, validatePhotoDimensions, RAW_EXTENSIONS, MAX_PHOTO_BYTES } from '../src/tools/images/photo-formats'
import { encodeBmp } from '../src/tools/images/photo-encode'
import { inspectImage } from '../src/tools/images/compression'
function ftyp(brand: string, compatible = '') {
  const bytes = new Uint8Array(16 + compatible.length)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set(new TextEncoder().encode('ftyp' + brand), 4)
  bytes.set(new TextEncoder().encode(compatible), 16)
  return bytes
}
describe('photo input formats and limits', () => {
  it('detects HEIC, generic HEIF and AVIF by compatible brands, not file extension', () => {
    expect(detectPhoto(ftyp('heic'), 'wrong.jpg')).toBe('heic')
    expect(detectPhoto(ftyp('mif1', 'avif'), 'wrong.heic')).toBe('avif')
    expect(detectPhoto(ftyp('mif1'))).toBe('heic')
    expect(() => detectPhoto(new TextEncoder().encode('not an image'), 'photo.heic')).toThrow()
  })
  it('rejects truncated brand boxes and sequences', () => {
    expect(() => detectPhoto(ftyp('heic').subarray(0, 14))).toThrow()
    expect(() => detectPhoto(ftyp('avif','avis'))).toThrow(/序列/)
    expect(() => detectPhoto(ftyp('heic','msf1'))).toThrow(/序列/)
    const forged=ftyp('heic'); new DataView(forged.buffer).setUint32(0, 10000)
    expect(() => detectPhoto(forged)).toThrow(/文件头/)
  })
  it('routes named camera formats to RAW decoder while genuine JPEG magic wins', () => {
    for (const ext of RAW_EXTENSIONS) expect(detectPhoto(new Uint8Array([1]), 'camera.'+ext.toUpperCase())).toBe(ext)
    expect(detectPhoto(new Uint8Array([255,216,255]),'camera.NEF')).toBe('jpg')
  })
  it('rejects empty and oversized photos', () => {
    expect(() => detectPhoto(new Uint8Array())).toThrow()
    expect(() => detectPhoto(new Uint8Array(MAX_PHOTO_BYTES+1), 'photo.NEF')).toThrow(/100 MiB/)
  })
  it('accepts 48 MP photos and rejects invalid or excessive dimensions', () => {
    expect(() => validatePhotoDimensions(8000,6000)).not.toThrow()
    for (const [w,h] of [[0,1],[-1,1],[NaN,1],[1.5,2],[16385,1],[9000,8000]]) expect(() => validatePhotoDimensions(w,h)).toThrow()
  })
  it('photo mode allows 48 MP PNG while legacy tools retain 16 MP boundary', () => {
    const bytes=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'))
    const view=new DataView(bytes.buffer); view.setUint32(16,8000); view.setUint32(20,6000)
    expect(inspectImage(bytes,true).width).toBe(8000)
    expect(() => inspectImage(bytes)).toThrow(/尺寸/)
  })
})
describe('BMP export bytes', () => {
  it('writes BGR, bottom-up rows and aligned padding with accurate file size', () => {
    const pixels={width:1,height:2,data:new Uint8ClampedArray([255,0,0,255,0,0,255,255])} as ImageData
    const buffer=encodeBmp(pixels), view=new DataView(buffer)
    expect(detectPhoto(new Uint8Array(buffer))).toBe('bmp')
    expect(view.getUint32(2,true)).toBe(62)
    expect(view.getUint32(10,true)).toBe(54)
    expect(view.getUint16(28,true)).toBe(24)
    expect([...new Uint8Array(buffer).slice(54)]).toEqual([255,0,0,0,0,0,255,0])
  })
})
