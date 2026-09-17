import type { ImageFormat } from '../images/compression'

export interface Crop { x: number; y: number; zoom: number }
export interface Rect { x: number; y: number; size: number }
export const INITIAL_CROP: Crop = { x: 0.5, y: 0.5, zoom: 1 }
export const OUTPUT_SIZE = 1080
export function constrainCrop(width: number, height: number, crop: Crop): Crop {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) throw Error('图片尺寸无效')
  const zoom = Math.max(1, Math.min(6, Number.isFinite(crop.zoom) ? crop.zoom : 1))
  const size = Math.min(width, height) / zoom
  const clamp = (n: number, half: number) => Math.max(half, Math.min(1 - half, Number.isFinite(n) ? n : 0.5))
  return { x: clamp(crop.x, size / width / 2), y: clamp(crop.y, size / height / 2), zoom }
}
export function cropRect(width: number, height: number, input: Crop): Rect {
  const crop = constrainCrop(width, height, input)
  const size = Math.min(width, height) / crop.zoom
  return { x: crop.x * width - size / 2, y: crop.y * height - size / 2, size }
}
export function tileRects(width: number, height: number, crop: Crop): Rect[] {
  const area = cropRect(width, height, crop), size = area.size / 3
  return Array.from({ length: 9 }, (_, i) => ({ x: area.x + i % 3 * size, y: area.y + Math.floor(i / 3) * size, size }))
}
/** Map an old viewport point to a new one, keeping the source pixel under the fingers. */
export function moveCrop(width: number, height: number, crop: Crop, from: { x: number; y: number }, to: { x: number; y: number }, zoom = crop.zoom): Crop {
  const before = cropRect(width, height, crop)
  const next = constrainCrop(width, height, { ...crop, zoom })
  const size = Math.min(width, height) / next.zoom
  return constrainCrop(width, height, {
    x: (before.x + from.x * before.size + (0.5 - to.x) * size) / width,
    y: (before.y + from.y * before.size + (0.5 - to.y) * size) / height,
    zoom: next.zoom,
  })
}
export function outputFormat(mime: string): ImageFormat {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  throw Error('浏览器返回了不支持的图片格式')
}
export function tileFilename(index: number, format: ImageFormat = 'jpg') {
  if (!Number.isInteger(index) || index < 0 || index > 8) throw Error('图片序号无效')
  return 'moment-grid-' + String(index + 1).padStart(2, '0') + '.' + format
}
