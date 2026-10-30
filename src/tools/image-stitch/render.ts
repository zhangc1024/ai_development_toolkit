import { imagePlacement, type Layout, type Options, type Size } from './core'
import { canvasBlob, type Prepared } from '../moments-grid/images'

export function createCanvas(canvas: HTMLCanvasElement, layout: Size, background: string, scale = 1) {
  canvas.width = Math.max(1, Math.round(layout.width * scale)); canvas.height = Math.max(1, Math.round(layout.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw Error('当前浏览器无法创建画布，请尝试减小尺寸或更换浏览器')
  ctx.scale(scale, scale); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, layout.width, layout.height) }
  return ctx
}
export function paint(ctx: CanvasRenderingContext2D, source: CanvasImageSource, size: Size, cell: Layout['cells'][number], fit: Options['fit'], sourceSize: Size = size) {
  const p = imagePlacement(size, cell, fit)
  const rx = sourceSize.width / size.width, ry = sourceSize.height / size.height
  ctx.drawImage(source, p.sx * rx, p.sy * ry, p.sw * rx, p.sh * ry, p.dx, p.dy, p.dw, p.dh)
}
export async function exportImage(images: Prepared[], layout: Layout, fit: Options['fit'], background: string, type: string, signal: AbortSignal, progress: (value: number) => void) {
  const canvas = document.createElement('canvas')
  try {
    const ctx = createCanvas(canvas, layout, background === 'transparent' && type === 'image/jpeg' ? '#ffffff' : background)
    for (let i = 0; i < images.length; i++) {
      signal.throwIfAborted()
      const item = images[i]!, url = URL.createObjectURL(item.file), image = new Image()
      try {
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(Error('原图解码失败，请重新添加图片')); image.src = url })
        signal.throwIfAborted()
        if (image.naturalWidth !== item.width || image.naturalHeight !== item.height) throw Error('图片方向读取不一致，请更换浏览器重试')
        paint(ctx, image, { width: image.naturalWidth, height: image.naturalHeight }, layout.cells[i]!, fit)
      } finally { image.src = ''; URL.revokeObjectURL(url) }
      progress(i + 1)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    signal.throwIfAborted()
    const blob = await canvasBlob(canvas, type, 0.92)
    signal.throwIfAborted()
    return blob
  } finally { canvas.width = canvas.height = 0 }
}
