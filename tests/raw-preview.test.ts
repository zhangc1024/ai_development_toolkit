import { describe, expect, it } from 'vitest'
import { embeddedOrientation, nikonHighEfficiency, orientationTransform } from '../src/tools/images/raw-preview'

describe('Nikon high-efficiency NEF compatibility', () => {
  it('recognizes real Z50II HE and HE* MakerNote values before pixel decoding', () => {
    expect(nikonHighEfficiency({ camera_make: 'Nikon', nikon: { NEFCompression: 13 } })).toBe('HE')
    expect(nikonHighEfficiency({ camera_make: 'NIKON CORPORATION', nikon: { NEFCompression: 14 } })).toBe('HE★')
  })
  it('does not change normal lossless/lossy NEF or another maker', () => {
    for (const NEFCompression of [1, 2, 3, 4, 5, 6, 10]) {
      expect(nikonHighEfficiency({ camera_make: 'Nikon', nikon: { NEFCompression } })).toBeUndefined()
    }
    expect(nikonHighEfficiency({ camera_make: 'Sony', nikon: { NEFCompression: 13 } })).toBeUndefined()
    expect(nikonHighEfficiency({ camera_make: 'Nikon' })).toBeUndefined()
  })
})

describe('embedded JPEG orientation', () => {
  it('maps LibRaw rotation codes to EXIF orientation', () => {
    expect(embeddedOrientation(5)).toBe(8)
    expect(embeddedOrientation(6)).toBe(6)
    expect(embeddedOrientation(3)).toBe(3)
    expect(embeddedOrientation(0)).toBe(1)
    expect(embeddedOrientation(99)).toBe(1)
  })
  it('does not apply a second rotation when JPEG carries its own EXIF orientation', () => {
    for (const jpegOrientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(embeddedOrientation(6, jpegOrientation)).toBe(1)
    }
    expect(embeddedOrientation(6, 0)).toBe(6)
    expect(embeddedOrientation(6, 9)).toBe(6)
  })
  for (let orientation = 1; orientation <= 8; orientation++) {
    it('maps all source corners into the destination bounds for orientation ' + orientation, () => {
      const t = orientationTransform(80, 40, orientation)
      const [a, b, c, d, e, f] = t.matrix
      const mapped = [[0, 0], [80, 0], [0, 40], [80, 40]].map(([x, y]) => [a * x! + c * y! + e, b * x! + d * y! + f])
      expect([...new Set(mapped.map(p => p[0]))].sort((a, b) => a! - b!)).toEqual([0, t.width])
      expect([...new Set(mapped.map(p => p[1]))].sort((a, b) => a! - b!)).toEqual([0, t.height])
      expect(t.width * t.height).toBe(3200)
    })
  }
})
