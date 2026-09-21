import { imageType, validateDimensions } from './core'
import { detectPhoto, validatePhotoDimensions } from './photo-formats'
export type ImageFormat = 'png' | 'jpg' | 'webp' | 'avif' | 'tiff' | 'bmp'
export type TargetFormat = 'original' | ImageFormat
export type CompressionLevel = 'preserve' | 'light' | 'balanced' | 'strong'
export const MIME: Record<ImageFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', tiff: 'image/tiff', bmp: 'image/bmp' }
export const LEVELS = [
  { id: 'preserve', name: '保真优先', hint: '原格式尽量无损优化；JPG/WebP 原格式保真档保留原文件，避免再次损失画质。' },
  { id: 'light', name: '轻度压缩', hint: '允许细微画质变化，以不容易看出差异为目标。' },
  { id: 'balanced', name: '均衡压缩', hint: '进一步减小体积，可能损失部分细节。' },
  { id: 'strong', name: '强力压缩', hint: '优先减小体积，可能出现明显画质变化。' },
] as const
export const QUALITY = {
  preserve: { jpeg: 98, webp: 100, pngMin: 100, pngTarget: 100 },
  light: { jpeg: 92, webp: 92, pngMin: 90, pngTarget: 100 },
  balanced: { jpeg: 82, webp: 80, pngMin: 70, pngTarget: 90 },
  strong: { jpeg: 65, webp: 60, pngMin: 45, pngTarget: 70 },
} as const
export const TIMEOUT_MS = 60000
/** Inspect container before allocating a decoded bitmap. Browser decoder validates compressed payload. */
export function inspectImage(bytes: Uint8Array, photo = false): { format: ImageFormat; width: number; height: number } {
  const type = photo ? { ext: detectPhoto(bytes) } : imageType(bytes)
  const validate = photo ? validatePhotoDimensions : validateDimensions
  if (type.ext === 'gif') throw Error('仅支持静态 PNG、JPG、WebP，不支持 GIF 或动画')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  let width = 0, height = 0
  const invalid = () => { throw Error('图片文件结构不完整或不受支持') }
  if (type.ext === 'png') {
    let offset = 8, ended = false, seenData = false
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset), name = tag(offset + 4)
      if (offset + 12 + size > bytes.length) invalid()
      if (offset === 8 && (name !== 'IHDR' || size !== 13)) invalid()
      if (name === 'IHDR') {
        if (offset !== 8 || size !== 13) invalid()
        width = view.getUint32(offset + 8); height = view.getUint32(offset + 12)
      }
      if (name === 'acTL' || name === 'fcTL' || name === 'fdAT') throw Error('暂不支持 APNG 动画，请使用静态 PNG')
      if (name === 'IDAT') seenData = true
      offset += size + 12
      if (name === 'IEND') { if (size !== 0 || offset !== bytes.length) invalid(); ended = true; break }
    }
    if (!ended || !seenData) invalid()
  } else if (type.ext === 'webp') {
    if (bytes.length < 20 || view.getUint32(4, true) + 8 !== bytes.length) invalid()
    let offset = 12, seenData = false
    while (offset + 8 <= bytes.length) {
      const name = tag(offset), size = view.getUint32(offset + 4, true), start = offset + 8
      if (start + size + (size % 2) > bytes.length) invalid()
      if (name === 'ANIM' || name === 'ANMF' || (name === 'VP8X' && size >= 1 && (bytes[start] & 2))) throw Error('暂不支持动态 WebP，请使用静态图片')
      if (name === 'VP8X') {
        if (size !== 10) invalid()
        width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16)
        height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16)
      }
      if (name === 'VP8 ') {
        if (size < 10 || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 1 || bytes[start + 5] !== 0x2a) invalid()
        const w = view.getUint16(start + 6, true) & 0x3fff, h = view.getUint16(start + 8, true) & 0x3fff
        validate(w, h)
        if (!width) { width = w; height = h }
        seenData = true
      }
      if (name === 'VP8L') {
        if (size < 5 || bytes[start] !== 0x2f) invalid()
        const bits = view.getUint32(start + 1, true)
        const w = (bits & 0x3fff) + 1, h = ((bits >>> 14) & 0x3fff) + 1
        validate(w, h)
        if (!width) { width = w; height = h }
        seenData = true
      }
      offset = start + size + (size % 2)
    }
    if (!seenData || offset !== bytes.length) invalid()
  } else {
    let offset = 2
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) invalid()
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) invalid()
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) invalid()
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (size < 8) invalid()
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5)
        validate(width, height)
      }
      // MPO multi-picture JPEG is not silently flattened.
      if (marker === 0xe2 && size >= 6 && tag(offset + 2) === 'MPF\0') throw Error('暂不支持多图片 JPEG / MPO')
      offset += size
    }
  }
  validate(width, height)
  return { format: type.ext as ImageFormat, width, height }
}
export function selectOutput(original: ArrayBuffer, encoded: ArrayBuffer, target: TargetFormat) {
  const keptOriginal = target === 'original' && encoded.byteLength >= original.byteLength
  return { buffer: keptOriginal ? original : encoded, keptOriginal }
}
export function outputFilename(name: string, format: ImageFormat, keptOriginal: boolean) {
  const base = name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'image'
  return base + (keptOriginal ? '-original.' : '-compressed.') + format
}
