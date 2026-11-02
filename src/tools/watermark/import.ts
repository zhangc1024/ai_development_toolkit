import { checkAbort, runWorker } from '../../platform/batch'
import { MAX_PHOTO_BYTES } from '../images/photo-formats'
export const WATERMARK_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'nef']
export const WATERMARK_ACCEPT = WATERMARK_EXTENSIONS.map(extension => '.' + extension).join(',')
export const MAX_WATERMARK_BYTES = MAX_PHOTO_BYTES
export function validateWatermarkInput(file: Pick<File, 'name' | 'size'>) {
  if (!file.size || file.size > MAX_WATERMARK_BYTES) throw Error('图片必须非空且不超过 100 MiB')
  if (!WATERMARK_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) throw Error('请选择 JPG、PNG、WebP、HEIC/HEIF 或 NEF 图片')
}
export async function decodeWatermark(file: File, signal: AbortSignal) {
  validateWatermarkInput(file)
  const buffer = await file.arrayBuffer()
  checkAbort(signal)
  // Reuse the existing isolated photo worker, including validated Nikon HE/HE★ fallback.
  return runWorker<{ bitmap: ImageBitmap; notes: string[] }>(
    () => new Worker(new URL('../photo-frame/photo.worker.ts', import.meta.url), { type: 'module' }),
    { buffer, name: file.name }, signal, 120000, [buffer],
  )
}
