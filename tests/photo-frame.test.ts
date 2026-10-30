import { describe, expect, it } from 'vitest'
import { brandFor, defaults, emptyShooting, layout, lines, visibility, type Template } from '../src/tools/photo-frame/core'
import { normalize, readMetadata, timeText, webpExif } from '../src/tools/photo-frame/metadata'

describe('photo frame geometry', () => {
  for (const template of ['white', 'portrait', 'landscape'] as Template[]) {
    for (const [w, h] of [[6000, 4000], [4000, 6000], [3000, 3000], [1, 16000], [16000, 1]]) {
      it(template + ' contains ' + w + 'x' + h + ' without stretching or upscaling', () => {
        const g = layout(w!, h!, defaults(template), 4096)
        expect(g.width).toBeLessThanOrEqual(4096); expect(g.height).toBeLessThanOrEqual(4096)
        expect(g.photo.width / g.photo.height).toBeCloseTo(w! / h!, 5)
        expect(g.photo.width).toBeLessThanOrEqual(w! + .01); expect(g.photo.height).toBeLessThanOrEqual(h! + .01)
        expect(g.photo.x).toBeGreaterThanOrEqual(0); expect(g.photo.y).toBeGreaterThanOrEqual(0)
        expect(g.photo.x + g.photo.width).toBeLessThanOrEqual(g.width + 1)
        expect(g.footer.y + g.footer.height).toBeLessThanOrEqual(g.height + 1)
      })
    }
  }
  it('uses fixed portrait and landscape aspect ratios', () => {
    const portrait = layout(6000, 4000, defaults('portrait'), 4096)
    const landscape = layout(6000, 4000, defaults('landscape'), 4096)
    expect(portrait.width / portrait.height).toBeCloseTo(9 / 16, 3)
    expect(landscape.width / landscape.height).toBeCloseTo(3 / 2, 3)
  })
  it('original mode retains the source subject resolution', () => {
    const g = layout(1600, 1000, defaults('white'), 'original')
    expect(g.photo.width).toBe(1600); expect(g.photo.height).toBe(1000)
  })
  it('rejects oversize exports, non-finite and invalid controls', () => {
    expect(() => layout(8000, 8000, defaults('white'), 'original')).toThrow('3200')
    expect(() => layout(0, 10, defaults('white'), 4096)).toThrow()
    expect(() => layout(100, 100, { ...defaults('portrait'), padding: NaN }, 4096)).toThrow()
    expect(() => layout(100, 100, defaults('white'), Infinity)).toThrow()
  })
  it('preview and export geometry is proportional at all style extremes', () => {
    for (const template of ['white', 'portrait', 'landscape'] as Template[]) {
      const s = { ...defaults(template), padding: 20, photoSize: 40, radius: 12, logoSize: 180 }
      const a = layout(6000, 4000, s, 4096), b = layout(6000, 4000, s, 1024)
      expect(a.photo.width / b.photo.width).toBeCloseTo(4)
      expect(a.footer.y / b.footer.y).toBeCloseTo(4)
    }
  })
})

describe('phone metadata', () => {
  it.each([
    ['Apple', 'iPhone 16 Pro Max', 'Apple', 'iPhone 16 Pro Max', 'apple'],
    ['HUAWEI', 'HUAWEI VOG-AL00', 'HUAWEI', 'HUAWEI P30 Pro', 'huawei'],
    ['HUAWEI', 'HBN-AL00', 'HUAWEI', 'HUAWEI Pura 70 Pro', 'huawei'],
    ['HONOR', 'BVL-AN16', 'HONOR', 'HONOR Magic6 Pro', 'honor'],
    ['Xiaomi', '23127PN0CC', 'Xiaomi', 'Xiaomi 14', 'xiaomi'],
    ['Xiaomi', '25010PN30G', 'Xiaomi', 'Xiaomi 15 Ultra', 'xiaomi'],
    ['Xiaomi', '2312DRA50G', 'Redmi', 'Redmi Note 13 Pro 5G', 'redmi'],
    ['Xiaomi', '24069PC21G', 'POCO', 'POCO F6', 'poco'],
    ['samsung', 'SM-S928B', 'SAMSUNG', 'Galaxy S24 Ultra', 'samsung'],
    ['Samsung', 'SM-S9380', 'SAMSUNG', 'Galaxy S25 Ultra', 'samsung'],
    ['OPPO', 'PHY110', 'OPPO', 'OPPO Find X7 Ultra', 'oppo'],
    ['OPPO', 'PHZ110', 'OPPO', 'OPPO Find X7', 'oppo'],
    ['vivo', 'V2309A', 'vivo', 'vivo X100', 'vivo'],
    ['vivo', 'V2405A', 'vivo', 'vivo X200 Pro', 'vivo'],
    ['vivo', 'V2408A', 'iQOO', 'iQOO 13', 'iqoo'],
    ['OnePlus', 'CPH2581', 'OnePlus', 'OnePlus 12', 'oneplus'],
    ['realme', 'RMX3851', 'realme', 'realme GT 6', 'realme'],
    ['Google', 'Pixel 9 Pro', 'Google', 'Pixel 9 Pro', 'google'],
    ['Nothing', 'A065', 'Nothing', 'Nothing Phone (2)', 'nothing'],
    ['motorola', 'motorola edge 50 ultra', 'motorola', 'motorola edge 50 ultra', 'motorola'],
  ])('resolves %s / %s', (make, model, expectedMake, expectedModel, brand) => {
    const result = normalize({ Make: make, Model: model })
    expect(result.make).toBe(expectedMake); expect(result.model).toBe(expectedModel)
    expect(brandFor(result.make, result.model)).toBe(brand)
  })
  it.each([
    ['iPhone 15 Pro', 'Apple', 'iPhone 15 Pro'],
    ['Pixel 8 Pro', 'Google', 'Pixel 8 Pro'],
    ['SM-S928B', 'SAMSUNG', 'Galaxy S24 Ultra'],
    ['vivo V2309A', 'vivo', 'vivo X100'],
  ])('infers a missing manufacturer only from a known model %s', (model, make, expected) => {
    expect(normalize({ Model: model })).toMatchObject({ make, model: expected })
    expect(brandFor('', model)).not.toBe('')
  })
  it('cleans NULs, whitespace and case before resolving phone codes', () => {
    expect(normalize({ Make: ' samsung\0 ', Model: ' sm-s928b\0 ' })).toMatchObject({ make: 'SAMSUNG', model: 'Galaxy S24 Ultra' })
    expect(normalize({ camera_make: 'vivo', camera_model: 'V2309A' })).toMatchObject({ make: 'vivo', model: 'vivo X100' })
    expect(brandFor('vivo Mobile Communication Co., Ltd.')).toBe('vivo')
    expect(brandFor('三星')).toBe('samsung')
  })
  it('preserves unknown, conflicting, ambiguous and missing metadata', () => {
    for (const [make, model] of [
      ['Xiaomi', '99999UNKNOWN'], ['samsung', 'SM-S928B-UNKNOWN'], ['Canon', 'SM-S928B'],
      ['unknown', 'V2309A'], ['OPPO', 'V2309A'], ['', 'X100'], ['', 'A999'],
      ['HUAWEI', 'LMR-AL10'],
    ]) {
      expect(normalize({ Make: make, Model: model }).model).toBe(model)
    }
    expect(normalize({ Make: 'Apple' }).model).toBe('')
    expect(normalize({ Model: 'X100' }).make).toBe('')
    expect(normalize({ Make: 'Canon', Model: 'SM-S928B' }).make).toBe('Canon')
    expect(brandFor('pineapple')).toBe('')
    expect(brandFor('notvivo')).toBe('')
    expect(normalize()).toEqual(emptyShooting())
  })
})

describe('shooting metadata', () => {
  it('normalizes camera metadata without inventing missing fields', () => {
    expect(normalize()).toEqual(emptyShooting())
    expect(normalize({ Make: 'NIKON CORPORATION', Model: 'NIKON D5300', FocalLength: [82, 1], FNumber: 5.6, ExposureTime: [1, 100], ISO: 100, DateTimeOriginal: '2025:12:16 01:12:43' })).toEqual({ make: 'NIKON CORPORATION', model: 'NIKON D5300', focal: '82mm', aperture: 'F5.6', shutter: '1/100s', iso: 'ISO100', time: '2025-12-16 01:12:43' })
  })
  it('normalizes RAW fields and rejects invalid numeric/date values', () => {
    expect(normalize({ camera_make: 'Sony', shutter: .8, aperture: -1, focal_len: Infinity, iso_speed: 0 }).shutter).toBe('0.8s')
    expect(normalize({ ExposureTime: [1, 0], FNumber: NaN }).aperture).toBe('')
    expect(timeText('2025:02:30 00:00:00')).toBe('')
    expect(timeText('2025:12:01 25:00:00')).toBe('')
    expect(timeText(new Date(NaN))).toBe('')
    expect(timeText(new Date('2025-07-20T09:18:32Z'))).toBe('2025-07-20 09:18:32')
    expect(timeText('2025:05:03 20:41:31')).toBe('2025-05-03 20:41:31')
  })
  it('matches known brands and never defaults an unknown brand to Nikon', () => {
    expect(brandFor('NIKON CORPORATION')).toBe('nikon')
    expect(brandFor('FUJIFILM')).toBe('fujifilm')
    expect(brandFor('Apple')).toBe('apple')
    expect(brandFor('unknown')).toBe('')
  })
  it('hides empty and unchecked fields without leftover separators', () => {
    const data = { ...emptyShooting(), focal: '82mm', iso: 'ISO100', model: 'NIKON D5300' }
    expect(lines(data, { ...visibility(), iso: false })).toEqual({ camera: 'NIKON D5300', exposure: '82mm', time: '' })
    expect(lines(emptyShooting(), visibility())).toEqual({ camera: '', exposure: '', time: '' })
  })
  function riff(payload: number[], prefix = false) {
    const content = prefix ? [69,120,105,102,0,0,...payload] : payload
    const b = new Uint8Array(20 + content.length + content.length % 2), v = new DataView(b.buffer)
    b.set([82,73,70,70],0); v.setUint32(4,b.length-8,true); b.set([87,69,66,80,69,88,73,70],8); v.setUint32(16,content.length,true); b.set(content,20)
    return b.buffer
  }
  it('extracts WebP EXIF with and without preamble, including odd padding', () => {
    expect([...new Uint8Array(webpExif(riff([73,73,42,0,9]))!)]).toEqual([73,73,42,0,9])
    expect([...new Uint8Array(webpExif(riff([77,77,0,42],true))!)]).toEqual([77,77,0,42])
    expect(webpExif(new ArrayBuffer(0))).toBeUndefined()
  })
  it('passes extracted WebP TIFF data through the real EXIF parser', async () => {
    const tiff = new Uint8Array(32), v = new DataView(tiff.buffer)
    tiff.set([73, 73]); v.setUint16(2, 42, true); v.setUint32(4, 8, true)
    v.setUint16(8, 1, true); v.setUint16(10, 271, true); v.setUint16(12, 2, true)
    v.setUint32(14, 6, true); v.setUint32(18, 26, true)
    tiff.set([78, 105, 107, 111, 110, 0], 26)
    const result = await readMetadata(riff([...tiff], true), 'webp')
    expect(result.make).toBe('Nikon')
    expect(result.time).toBe('')
  })
  it('resolves phone model codes from a real EXIF payload', async () => {
    const make = new TextEncoder().encode('samsung\0'), model = new TextEncoder().encode('SM-S928B\0')
    const tiff = new Uint8Array(38 + make.length + model.length), v = new DataView(tiff.buffer)
    tiff.set([73, 73]); v.setUint16(2, 42, true); v.setUint32(4, 8, true); v.setUint16(8, 2, true)
    for (const [at, tag, value, offset] of [[10, 271, make, 38], [22, 272, model, 38 + make.length]] as const) {
      v.setUint16(at, tag, true); v.setUint16(at + 2, 2, true)
      v.setUint32(at + 4, value.length, true); v.setUint32(at + 8, offset, true)
      tiff.set(value, offset)
    }
    expect(await readMetadata(riff([...tiff], true), 'webp')).toMatchObject({ make: 'SAMSUNG', model: 'Galaxy S24 Ultra', time: '' })
  })
  it('rejects truncated RIFF chunks', () => {
    const b = riff([1,2]); new DataView(b).setUint32(16,500,true)
    expect(() => webpExif(b)).toThrow('不完整')
  })
})
