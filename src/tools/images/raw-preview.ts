import type { Metadata } from 'libraw-wasm'
import { inspectImage } from './compression'
import { validatePhotoDimensions } from './photo-formats'

/** Nikon MakerNote 0x0093: 13 = HE, 14 = HE*. These need the proprietary decoder. */
export function nikonHighEfficiency(metadata: Pick<Metadata, 'camera_make' | 'nikon'>): 'HE' | 'HE★' | undefined {
  if (!/nikon/i.test(metadata.camera_make)) return
  if (metadata.nikon?.NEFCompression === 13) return 'HE'
  if (metadata.nikon?.NEFCompression === 14) return 'HE★'
}

/** LibRaw flip codes use different numbers than EXIF Orientation. */
export function embeddedOrientation(flip: number, jpegOrientation?: number): number {
  // Browser createImageBitmap applies the JPEG's own EXIF once.
  if (jpegOrientation && jpegOrientation >= 1 && jpegOrientation <= 8) return 1
  return [1, 2, 4, 3, 5, 8, 6, 7][flip] ?? 1
}

export function orientationTransform(width: number, height: number, orientation: number) {
  const matrices: Record<number, [number, number, number, number, number, number]> = {
    1: [1, 0, 0, 1, 0, 0], 2: [-1, 0, 0, 1, width, 0], 3: [-1, 0, 0, -1, width, height],
    4: [1, 0, 0, -1, 0, height], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, height, 0],
    7: [0, -1, -1, 0, height, width], 8: [0, -1, 1, 0, 0, width],
  }
  return { width: orientation >= 5 ? height : width, height: orientation >= 5 ? width : height, matrix: matrices[orientation] ?? matrices[1]! }
}

export interface RawThumbnail { format: string; data: Uint8Array; width: number; height: number }
export async function decodeEmbeddedJpeg(thumbnail: RawThumbnail | undefined, flip: number): Promise<ImageBitmap> {
  if (!thumbnail || thumbnail.format !== 'jpeg' || !thumbnail.data?.length) throw Error('没有可用的内嵌 JPEG，请先使用 Nikon NX Studio 导出 JPG 后添加水印')
  // Copy away from WASM memory before any asynchronous work; validate the JPEG's actual dimensions.
  const bytes = new Uint8Array(thumbnail.data)
  const info = inspectImage(bytes, true)
  if (info.format !== 'jpg') throw Error('内嵌 JPEG 无效，请使用 Nikon NX Studio 导出 JPG 后添加水印')
  validatePhotoDimensions(info.width, info.height)
  const { default: exifr } = await import('exifr')
  const tags = await exifr.parse(bytes, { pick: ['Orientation'], translateValues: false })
  const orientation = embeddedOrientation(flip, tags?.Orientation)
  let bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { imageOrientation: 'from-image' })
  try {
    validatePhotoDimensions(bitmap.width, bitmap.height)
    if (orientation !== 1) {
      const transform = orientationTransform(bitmap.width, bitmap.height, orientation)
      const canvas = new OffscreenCanvas(transform.width, transform.height)
      try {
        const context = canvas.getContext('2d')
        if (!context) throw Error('无法处理内嵌 JPEG 的照片方向')
        context.setTransform(...transform.matrix); context.drawImage(bitmap, 0, 0)
        const oriented = await createImageBitmap(canvas)
        bitmap.close(); bitmap = oriented
      } finally { canvas.width = canvas.height = 1 }
    }
    return bitmap
  } catch (e) { bitmap.close(); throw e }
}
