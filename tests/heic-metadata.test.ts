import { describe, expect, it } from 'vitest'
import { readMetadata } from '../src/tools/photo-frame/metadata'

const join = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let at = 0
  for (const part of parts) { bytes.set(part, at); at += part.length }
  return bytes
}
const text = (value: string) => new TextEncoder().encode(value)
const u16 = (value: number) => { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value); return bytes }
const u32 = (value: number) => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value); return bytes }
const box = (type: string, content: Uint8Array) => join(u32(content.length + 8), text(type), content)

// Minimal HEIF metadata container. No user photo, location, pixels or identifying data.
function heic(brands: string[], major = 'heic', extendedMdat = false, withExif = true) {
  const ftyp = box('ftyp', join(text(major), u32(0), text(brands.join(''))))
  const make = text('Apple\0'), model = text('iPhone 16 Pro Max\0')
  const tiff = new Uint8Array(38 + make.length + model.length), view = new DataView(tiff.buffer)
  tiff.set([73, 73]); view.setUint16(2, 42, true); view.setUint32(4, 8, true); view.setUint16(8, 2, true)
  for (const [at, tag, value, offset] of [[10, 271, make, 38], [22, 272, model, 38 + make.length]] as const) {
    view.setUint16(at, tag, true); view.setUint16(at + 2, 2, true)
    view.setUint32(at + 4, value.length, true); view.setUint32(at + 8, offset, true); tiff.set(value, offset)
  }
  const exif = join(u32(6), text('Exif\0\0'), tiff)
  const iinf = box('iinf', join(u32(0), u16(1), box('infe', join(u32(0x02000000), u16(1), u16(0), text(withExif ? 'Exif' : 'mime'), text('metadata\0')))))
  const makeMeta = (offset: number) => box('meta', join(u32(0), iinf, box('iloc', join(u32(0), new Uint8Array([0x44, 0]), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(exif.length)))))
  const meta = makeMeta(ftyp.length + makeMeta(0).length + (extendedMdat ? 16 : 8))
  const mdat = extendedMdat ? join(u32(1), text('mdat'), u32(0), u32(exif.length + 16), exif) : box('mdat', exif)
  return join(ftyp, meta, mdat).buffer as ArrayBuffer
}

describe('HEIC metadata compatibility', () => {
  it('reads the 52-byte ftyp used by newer iPhone HEIC files without modifying the input', async () => {
    const buffer = heic(['mif1', 'MiHB', 'MiHA', 'heix', 'MiHE', 'MiPr', 'heic', 'miaf', 'tmap'], 'heic', true)
    const original = new Uint8Array(buffer).slice()
    expect(new DataView(buffer).getUint32(0)).toBe(52)
    expect(await readMetadata(buffer, 'heic')).toMatchObject({ make: 'Apple', model: 'iPhone 16 Pro Max' })
    expect(new Uint8Array(buffer)).toEqual(original)
  })
  it('keeps older HEIC containers working', async () => {
    expect(await readMetadata(heic(['mif1', 'heic', 'miaf']), 'heic')).toMatchObject({ make: 'Apple', model: 'iPhone 16 Pro Max' })
  })
  it.each(['heix', 'mif1'])('recognizes %s HEIF headers through the existing format detector', async major => {
    expect(await readMetadata(heic(['mif1', 'heix'], major), 'heic')).toMatchObject({ make: 'Apple', model: 'iPhone 16 Pro Max' })
  })
  it('returns empty metadata when the container has no EXIF item', async () => {
    expect(await readMetadata(heic(['mif1', 'heic'], 'heic', false, false), 'heic')).toMatchObject({ make: '', model: '' })
  })
  it('rejects truncated and invalid ftyp sizes instead of guessing', async () => {
    for (const size of [12, 51, 0xffffffff]) {
      const buffer = heic(['mif1', 'heic'])
      new DataView(buffer).setUint32(0, size)
      await expect(readMetadata(buffer, 'heic')).rejects.toThrow()
    }
    await expect(readMetadata(new ArrayBuffer(0), 'heic')).rejects.toThrow()
  })
})
