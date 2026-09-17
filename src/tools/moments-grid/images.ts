import { inspectImage, MIME, type ImageFormat } from '../images/compression'
import { MAX_IMAGE_BYTES, validateDimensions } from '../images/core'
import { cropRect, tileRects, tileFilename, outputFormat, OUTPUT_SIZE, type Crop } from './core'

interface Decoded { source: CanvasImageSource; width: number; height: number; close: () => void }
export interface Prepared { file: Blob; name: string; format: ImageFormat; width: number; height: number; preview: HTMLCanvasElement }
export interface Tile { blob: Blob; thumbnail: Blob; name: string }
export function checkAbort(signal: AbortSignal) { signal.throwIfAborted() }
export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('图片生成失败，请重试')), type, quality))
}
function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw Error('当前浏览器无法使用 Canvas，请更换浏览器')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* Older browsers can still decode through an HTML image. */ }
  }
  const url = URL.createObjectURL(file), image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(Error('这张图片读取失败，请更换后重试'))
      image.src = url
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; URL.revokeObjectURL(url) } }
  } catch (error) { URL.revokeObjectURL(url); throw error }
}
export async function prepareImage(file: File, signal: AbortSignal): Promise<Prepared> {
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error('请选择非空且不超过 10 MiB 的 JPG、PNG 或 WebP 图片')
  const bytes = new Uint8Array(await file.arrayBuffer())
  checkAbort(signal)
  const info = inspectImage(bytes)
  const original = new Blob([bytes], { type: MIME[info.format] })
  const decoded = await decode(original)
  let preview: HTMLCanvasElement | undefined
  try {
    checkAbort(signal)
    validateDimensions(decoded.width, decoded.height)
    const ratio = Math.min(1, 1200 / Math.max(decoded.width, decoded.height))
    preview = document.createElement('canvas')
    preview.width = Math.max(1, Math.round(decoded.width * ratio))
    preview.height = Math.max(1, Math.round(decoded.height * ratio))
    context(preview).drawImage(decoded.source, 0, 0, preview.width, preview.height)
    return { file: original, name: file.name, format: info.format, width: decoded.width, height: decoded.height, preview }
  } catch (error) { if (preview) preview.width = preview.height = 0; throw error }
  finally { decoded.close() }
}
export function drawPreview(canvas: HTMLCanvasElement, image: Prepared, crop: Crop) {
  const ctx = context(canvas), rect = cropRect(image.width, image.height, crop)
  // Use original dimensions for geometry to avoid rounding drift in the downsampled preview.
  const rx = image.preview.width / image.width, ry = image.preview.height / image.height
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image.preview, rect.x * rx, rect.y * ry, rect.size * rx, rect.size * ry, 0, 0, canvas.width, canvas.height)
}
export async function exportTiles(image: Prepared, crop: Crop, signal: AbortSignal, progress: (count: number) => void): Promise<Tile[]> {
  const decoded = await decode(image.file), canvas = document.createElement('canvas')
  const result: Tile[] = []
  try {
    checkAbort(signal)
    if (decoded.width !== image.width || decoded.height !== image.height) throw Error('图片方向读取不一致，请更换浏览器重试')
    const rects = tileRects(image.width, image.height, crop)
    for (let i = 0; i < rects.length; i++) {
      checkAbort(signal)
      const rect = rects[i]
      canvas.width = canvas.height = OUTPUT_SIZE
      let ctx = context(canvas)
      if (image.format === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE) }
      ctx.drawImage(decoded.source, rect.x, rect.y, rect.size, rect.size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      const blob = await canvasBlob(canvas, MIME[image.format])
      // Some browsers fall back to PNG for unsupported encoders; name the actual bytes.
      const format = outputFormat(blob.type)
      checkAbort(signal)
      // Same canvas is reused for the small result thumbnail; never retain nine HD canvases.
      canvas.width = canvas.height = 240
      ctx = context(canvas)
      if (format === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 240, 240) }
      ctx.drawImage(decoded.source, rect.x, rect.y, rect.size, rect.size, 0, 0, 240, 240)
      const thumbnail = await canvasBlob(canvas, MIME[format])
      checkAbort(signal)
      result.push({ blob, thumbnail, name: tileFilename(i, format) })
      progress(i + 1)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    return result
  } finally { decoded.close(); canvas.width = canvas.height = 0 }
}
export async function packTiles(tiles: Tile[], signal: AbortSignal): Promise<Blob> {
  const { BlobReader, BlobWriter, ZipWriter } = await import('@zip.js/zip.js')
  checkAbort(signal)
  const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false, level: 0 })
  try {
    for (const tile of tiles) {
      checkAbort(signal)
      await writer.add(tile.name, new BlobReader(tile.blob), { signal })
    }
  } catch (error) {
    await writer.close().catch(() => undefined)
    throw error
  }
  const result = await writer.close()
  checkAbort(signal)
  return result
}
