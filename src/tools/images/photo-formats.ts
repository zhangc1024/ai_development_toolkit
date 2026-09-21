export const MAX_PHOTO_BYTES = 100 * 1024 * 1024
export const RAW_EXTENSIONS = ['nef', 'nrw', 'cr2', 'cr3', 'arw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw'] as const
export type RawFormat = typeof RAW_EXTENSIONS[number]
export type PhotoFormat = 'png' | 'jpg' | 'webp' | 'avif' | 'tiff' | 'bmp' | 'heic' | RawFormat
export const PHOTO_ACCEPT = '.png,.jpg,.jpeg,.webp,.avif,.tif,.tiff,.bmp,.heic,.heif,' + RAW_EXTENSIONS.map(x => '.' + x).join(',') + ',.zip'
export function validatePhotoDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 64000000 || width > 16384 || height > 16384) throw Error('图片尺寸超过限制：最多 6400 万像素，任一边不超过 16384')
}
export function detectPhoto(bytes: Uint8Array, name = ''): PhotoFormat {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw Error('图片必须非空且不超过 100 MiB')
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes[0] === 137 && text(1, 4) === 'PNG') return 'png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'webp'
  const ext = name.split('.').pop()?.toLowerCase()
  // RAW 扩展名只选择解码器；实际内容仍由 LibRaw 校验。
  if (RAW_EXTENSIONS.includes(ext as RawFormat)) return ext as RawFormat
  if (text(4, 8) === 'ftyp' && bytes.length >= 16) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    if (size < 16 || size > bytes.length || size % 4) throw Error('无效的 HEIF/AVIF 文件头')
    const brands = [text(8, 12)]
    for (let i = 16; i < size; i += 4) brands.push(text(i, i + 4))
    if (brands.includes('avis') || brands.includes('msf1')) throw Error('暂不支持 HEIF/AVIF 图像序列')
    if (brands.includes('avif')) return 'avif'
    if (brands.some(b => ['heic', 'heix', 'mif1'].includes(b))) return 'heic'
  }
  if (text(0, 2) === 'BM') return 'bmp'
  if ((bytes[0] === 73 && bytes[1] === 73 && bytes[2] === 42 && bytes[3] === 0) || (bytes[0] === 77 && bytes[1] === 77 && bytes[2] === 0 && bytes[3] === 42)) return 'tiff'
  throw Error('不支持此图片格式；请选择 PNG/JPG/WebP、HEIC/HEIF、AVIF、TIFF、BMP 或支持的相机 RAW')
}
