import type { ImageFormat } from './compression'
export const ZIP_LIMITS = { archiveBytes: 50 * 1024 * 1024, entries: 500, expandedBytes: 200 * 1024 * 1024, outputBytes: 210 * 1024 * 1024 }
export type ZipLimits = typeof ZIP_LIMITS
export interface ZipRow { path: string; size: number; directory: boolean; status: 'pending' | 'processed' | 'kept' | 'failed'; reason: string; outputPath?: string; outputSize?: number; image?: boolean }
export function safeZipPath(filename: string, directory: boolean) {
  const path = filename.replace(/\\/g, '/')
  if (!path || path.length > 1024 || path.startsWith('/') || /[\u0000-\u001f\u007f:*?"<>|]/.test(path)) throw Error('压缩包包含不安全或过长的路径')
  const parts = (directory && path.endsWith('/') ? path.slice(0, -1) : path).split('/')
  if (parts.length > 64 || parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('压缩包包含不安全的文件路径：' + filename)
  return parts.join('/') + (directory ? '/' : '')
}
const key = (path: string) => path.replace(/\/$/, '').normalize('NFC').toLowerCase()
export function validateZipPaths(rows: Pick<ZipRow, 'path' | 'directory'>[]) {
  const names = new Map<string, boolean>()
  for (const row of rows) {
    const name = key(row.path)
    if (names.has(name)) throw Error('压缩包存在重复或大小写冲突的路径：' + row.path)
    names.set(name, row.directory)
  }
  for (const row of rows) {
    const parts = key(row.path).split('/')
    for (let i = 1; i < parts.length; i++) {
      if (names.get(parts.slice(0, i).join('/')) === false) throw Error('文件与文件夹路径冲突：' + row.path)
    }
  }
}
export function createZipNamer(paths: string[]) {
  const reserved = new Set<string>()
  for (const path of paths) {
    const parts = key(path).split('/')
    for (let i = 1; i <= parts.length; i++) reserved.add(parts.slice(0, i).join('/'))
  }
  return (original: string, format: ImageFormat) => {
    const slash = original.lastIndexOf('/'), dot = original.lastIndexOf('.')
    const base = dot > slash ? original.slice(0, dot) : original
    let name = base + '.' + format, n = 2
    if (key(name) === key(original)) return original
    while (reserved.has(key(name))) name = base + '-' + n++ + '.' + format
    reserved.add(key(name)); return name
  }
}
export function supportedImageCandidate(path: string, bytes: Uint8Array) {
  return /\.(png|jpe?g|webp)$/i.test(path) ||
    (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP')
}
export function looksLikeImage(path: string, bytes?: Uint8Array) {
  return /\.(png|jpe?g|webp|gif|avif|heic|heif|bmp|tiff?|svg|ico|apng)$/i.test(path) ||
    (!!bytes && (supportedImageCandidate(path, bytes) || String.fromCharCode(...bytes.subarray(0, 3)) === 'GIF'))
}
export function checkedSize(size: number, max: number) {
  if (!Number.isSafeInteger(size) || size < 0 || size > max) throw Error('ZIP 解压后总大小超过限制，或条目大小无效')
}

export function zipErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const messages: Record<string, string> = {
    'Unsafe filename': 'ZIP 包含不安全的文件路径',
    'Invalid CRC32': 'ZIP 文件校验失败，数据可能已损坏',
    'Invalid signature': 'ZIP 文件校验失败，数据可能已损坏',
    'Invalid compressed data': 'ZIP 压缩数据损坏',
    'Invalid uncompressed size': 'ZIP 实际解压大小与声明不符',
    'File contains encrypted entry': '暂不支持加密 ZIP，请先解除密码',
    'Encryption method not supported': '暂不支持加密 ZIP',
    'Encrypted central directory is not supported': '暂不支持加密 ZIP 文件目录',
    'Split zip file': '暂不支持分卷 ZIP',
    'Overlapping entry found': 'ZIP 条目数据重叠，无法安全读取',
    'Entry data out of bounds': 'ZIP 数据越界或文件已截断',
    'Ambiguous archive': 'ZIP 文件结构存在冲突或重复条目',
    'File format is not recognized': '不是有效的 ZIP 文件',
    'End of central directory not found': 'ZIP 文件不完整，找不到目录信息',
    'Central directory header not found': 'ZIP 文件目录损坏',
    'Local file header not found': 'ZIP 文件条目损坏',
  }
  return messages[message] ?? message
}
