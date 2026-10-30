import { decodePhoto } from '../images/photo-decode'
import { RAW_EXTENSIONS } from '../images/photo-formats'
import { normalize, readMetadata } from './metadata'
import { emptyShooting } from './core'
self.onmessage = async ({ data }: MessageEvent<{ buffer: ArrayBuffer; name: string }>) => {
  let bitmap: ImageBitmap | undefined
  try {
    const decoded = await decodePhoto(data.buffer, data.name, { allowEmbeddedRawPreview: true })
    bitmap = decoded.bitmap
    let shooting = emptyShooting()
    const notes: string[] = decoded.embeddedPreview ? [...decoded.notes] : []
    try { shooting = decoded.shooting ? normalize(decoded.shooting as unknown as Record<string, unknown>) : await readMetadata(data.buffer, decoded.format) }
    catch { notes.push('未能读取拍摄信息，可手动填写；照片仍可使用。') }
    if (!decoded.embeddedPreview && RAW_EXTENSIONS.includes(decoded.format as typeof RAW_EXTENSIONS[number])) notes.push('RAW 使用相机白平衡转换为 8 位 sRGB，观感可能与相机直出不同。')
    if (decoded.format === 'heic') notes.push('HEIC 使用主图转换，不保留 HDR、景深或 Live Photo。')
    self.postMessage({ bitmap, shooting, notes }, { transfer: [bitmap] })
    bitmap = undefined
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '照片解码失败' }) }
  finally { bitmap?.close() }
}
