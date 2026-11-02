export type Mode = 'vertical' | 'horizontal' | 'grid'
export interface Size { width: number; height: number }
export interface Options { mode: Mode; size: number; columns: number; gap: number; padding: number; fit: 'contain' | 'cover' }
export interface Rect extends Size { x: number; y: number }
export interface Layout extends Size { cells: Rect[]; columns: number; rows: number }
export const MAX_IMAGES = 50
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024
export function layoutImages(images: Size[], options: Options): Layout {
  if (images.length < 2 || images.length > MAX_IMAGES) throw Error('请添加 2–50 张图片')
  const { mode, size, columns, gap, padding, fit } = options
  if (!['vertical', 'horizontal', 'grid'].includes(mode) || !['contain', 'cover'].includes(fit)) throw Error('拼接方式无效')
  for (const [value, min, max, label] of [[size, 1, 8192, '图片尺寸'], [columns, 1, 10, '列数'], [gap, 0, 500, '间距'], [padding, 0, 500, '外边距']] as const) {
    if (!Number.isInteger(value) || value < min || value > max) throw Error(`${label}须为 ${min}–${max} 的整数`)
  }
  if (images.some(image => !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0)) throw Error('图片尺寸无效')
  const cols = mode === 'grid' ? Math.min(columns, images.length) : mode === 'vertical' ? 1 : images.length
  const rows = Math.ceil(images.length / cols)
  let cursor = padding
  const cells = images.map((image, index) => {
    if (mode === 'grid') return { x: padding + index % cols * (size + gap), y: padding + Math.floor(index / cols) * (size + gap), width: size, height: size }
    const width = mode === 'vertical' ? size : Math.max(1, Math.round(size * image.width / image.height))
    const height = mode === 'horizontal' ? size : Math.max(1, Math.round(size * image.height / image.width))
    const cell = { x: mode === 'horizontal' ? cursor : padding, y: mode === 'vertical' ? cursor : padding, width, height }
    cursor += (mode === 'horizontal' ? width : height) + gap
    return cell
  })
  const width = Math.max(...cells.map(cell => cell.x + cell.width)) + padding
  const height = Math.max(...cells.map(cell => cell.y + cell.height)) + padding
  if (width > 16384 || height > 16384 || width * height > 64000000) throw Error('合并尺寸过大（最多 6400 万像素、单边 16384 px），请减小图片尺寸、间距或图片数量')
  return { width, height, cells, columns: cols, rows }
}
/** Centered source crop and destination rectangle, shared by preview and export. */
export function imagePlacement(source: Size, cell: Rect, fit: Options['fit']) {
  const ratio = fit === 'cover' ? Math.max(cell.width / source.width, cell.height / source.height) : Math.min(cell.width / source.width, cell.height / source.height)
  const width = Math.min(cell.width, source.width * ratio), height = Math.min(cell.height, source.height * ratio)
  const sw = width / ratio, sh = height / ratio
  return { sx: (source.width - sw) / 2, sy: (source.height - sh) / 2, sw, sh, dx: cell.x + (cell.width - width) / 2, dy: cell.y + (cell.height - height) / 2, dw: width, dh: height }
}
