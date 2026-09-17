export interface Watermark {
  id: number; text: string; x: number; y: number; size: number; opacity: number; angle: number; color: string
}
export const PRESETS = [
  { name: '黑色', value: '#000000' }, { name: '白色', value: '#ffffff' },
  { name: '红色', value: '#ff0000' }, { name: '黄色', value: '#ffff00' },
] as const
export const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif'
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
/** Opaque hex / concrete named colors only; opacity has its own control. */
export function resolveColor(value: string, context: CanvasRenderingContext2D): string | undefined {
  const input = value.trim()
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(input)) return input.toLowerCase()
  if (!/^[a-z]+$/i.test(input) || /^(transparent|currentcolor|inherit|initial|unset|revert)$/i.test(input)) return
  context.fillStyle = '#010203'; context.fillStyle = input
  const first = context.fillStyle
  context.fillStyle = '#040506'; context.fillStyle = input
  const second = context.fillStyle
  if (first === second && /^#[\da-f]{6}$/i.test(first) && CSS.supports('color', input) && !/^(canvas|canvastext|linktext|visitedtext|activetext|buttonface|buttontext|buttonborder|field|fieldtext|highlight|highlighttext|selecteditem|selecteditemtext|mark|marktext|graytext|accentcolor|accentcolortext)$/i.test(input)) return first
}
export function localPoint(mark: Watermark, x: number, y: number) {
  const radians = mark.angle * Math.PI / 180, dx = x - mark.x, dy = y - mark.y
  return { x: dx * Math.cos(radians) + dy * Math.sin(radians), y: -dx * Math.sin(radians) + dy * Math.cos(radians) }
}
export function hitMark(mark: Watermark, x: number, y: number, width: number, height: number, padding = 0) {
  const point = localPoint(mark, x, y)
  return Math.abs(point.x) <= width / 2 + padding && Math.abs(point.y) <= height / 2 + padding
}
export function dimensions(context: CanvasRenderingContext2D, mark: Watermark) {
  context.font = mark.size + 'px ' + FONT
  const lines = mark.text.split('\n')
  return { lines, width: Math.max(mark.size, ...lines.map(line => context.measureText(line).width)), height: lines.length * mark.size * 1.4 }
}
/** Shared pixel geometry for preview/export. Selection chrome never enters the export. */
export function paint(context: CanvasRenderingContext2D, image: ImageBitmap, marks: Watermark[], width: number, selected?: number) {
  const scale = width / image.width
  context.clearRect(0, 0, context.canvas.width, context.canvas.height)
  context.save(); context.scale(scale, scale); context.drawImage(image, 0, 0)
  for (const mark of marks) {
    const box = dimensions(context, mark)
    context.save(); context.translate(mark.x, mark.y); context.rotate(mark.angle * Math.PI / 180)
    context.font = mark.size + 'px ' + FONT; context.textAlign = 'center'; context.textBaseline = 'middle'
    context.fillStyle = mark.color; context.globalAlpha = mark.opacity / 100
    box.lines.forEach((line, index) => context.fillText(line, 0, (index - (box.lines.length - 1) / 2) * mark.size * 1.4))
    if (mark.id === selected) {
      context.globalAlpha = 1; context.strokeStyle = '#7561d9'; context.lineWidth = 1.5 / scale
      const pad = 7 / scale, x = box.width / 2 + pad, y = box.height / 2 + pad
      context.setLineDash([5 / scale, 3 / scale]); context.strokeRect(-x, -y, 2 * x, 2 * y); context.setLineDash([])
      context.fillStyle = '#fff'
      for (const [a, b] of [[-x, -y], [x, -y], [x, y], [-x, y]]) {
        context.fillRect(a - 3 / scale, b - 3 / scale, 6 / scale, 6 / scale)
        context.strokeRect(a - 3 / scale, b - 3 / scale, 6 / scale, 6 / scale)
      }
    }
    context.restore()
  }
  context.restore()
}
export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== type) reject(Error('当前浏览器不支持该格式导出，请选择 PNG'))
    else resolve(blob)
  }, type, quality))
}
export function resultFilename(name: string, format: string) {
  return (name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'image') + '-watermarked.' + format
}
