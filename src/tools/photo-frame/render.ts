import { lines, type Layout, type Shooting, type Style, type Visibility } from './core'
export interface Logo { image: CanvasImageSource; width: number; height: number; tint: boolean }
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
function fitText(ctx: Context, text: string, maxWidth: number, size: number, bold = false) {
  let value = text
  const font = (s: number) => (bold ? '600 ' : '400 ') + s + 'px Arial, "Microsoft YaHei", sans-serif'
  ctx.font = font(size)
  if (ctx.measureText(text).width > maxWidth) {
    size *= Math.max(.6, maxWidth / ctx.measureText(text).width)
    ctx.font = font(size)
    while (value.length && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1)
    if (value !== text) value += '…'
  }
  return value
}
function drawLogo(ctx: Context, logo: Logo, x: number, y: number, w: number, h: number, color: string) {
  const s = Math.min(w / logo.width, h / logo.height), dw = logo.width * s, dh = logo.height * s
  if (logo.tint) {
    const temp = new OffscreenCanvas(Math.max(1, Math.ceil(dw)), Math.max(1, Math.ceil(dh)))
    const c = temp.getContext('2d')!
    c.drawImage(logo.image, 0, 0, temp.width, temp.height)
    c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, temp.width, temp.height)
    ctx.drawImage(temp, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  } else ctx.drawImage(logo.image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}
export function render(ctx: Context, photo: CanvasImageSource, source: { width: number; height: number }, geometry: Layout, style: Style, data: Shooting, visible: Visibility, logo?: Logo) {
  const { width: w, height: h, photo: p, footer: f } = geometry, unit = w / 1600
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  if (style.template !== 'white') {
    ctx.save()
    const blur = style.blur * unit, bleed = blur * 3
    const scale = Math.max((w + bleed * 2) / source.width, (h + bleed * 2) / source.height)
    ctx.filter = 'blur(' + blur + 'px)'
    ctx.drawImage(photo, (w - source.width * scale) / 2, (h - source.height * scale) / 2, source.width * scale, source.height * scale)
    ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 0, w, h)
  }
  const radius = Math.min(p.width, p.height) * style.radius / 100
  ctx.save()
  ctx.beginPath(); ctx.roundRect(p.x, p.y, p.width, p.height, radius)
  ctx.shadowColor = 'rgba(0,0,0,' + style.shadow / 120 + ')'; ctx.shadowBlur = 65 * unit * style.shadow / 100; ctx.shadowOffsetY = 15 * unit
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore()
  ctx.save(); ctx.beginPath(); ctx.roundRect(p.x, p.y, p.width, p.height, radius); ctx.clip()
  ctx.drawImage(photo, p.x, p.y, p.width, p.height); ctx.restore()
  const content = lines(data, visible)
  ctx.fillStyle = style.color; ctx.textBaseline = 'middle'
  if (style.template === 'white') {
    const rows = [content.camera, content.exposure, content.time].filter(Boolean)
    const gap = 26 * unit, lh = 40 * unit, size = 32 * unit
    const logoW = logo ? (logo.width / logo.height < 1.5 ? 70 : 160) * unit * style.logoSize / 100 : 0
    const logoH = Math.min(90 * unit * style.logoSize / 100, f.height * .8)
    const maxText = Math.max(1, f.width - logoW - gap * 2)
    const textRows = rows.map((row, i) => {
      const value = fitText(ctx, row, maxText, size, i === 0)
      return { value, font: ctx.font, width: ctx.measureText(value).width }
    })
    const tw = Math.max(0, ...textRows.map(r => r.width))
    const total = logoW + (logo && rows.length ? gap * 2 : 0) + tw
    const x = f.x + f.width - total, cy = f.y + f.height / 2
    if (logo) drawLogo(ctx, logo, x, cy - logoH / 2, logoW, logoH, style.color)
    if (logo && rows.length) {
      ctx.save(); ctx.globalAlpha = .25; ctx.strokeStyle = style.color; ctx.lineWidth = unit
      ctx.beginPath(); ctx.moveTo(x + logoW + gap, cy - 42 * unit); ctx.lineTo(x + logoW + gap, cy + 42 * unit); ctx.stroke(); ctx.restore()
    }
    ctx.textAlign = 'left'
    textRows.forEach((row, i) => { ctx.font = row.font; ctx.fillText(row.value, f.x + f.width - tw, cy + (i - (rows.length - 1) / 2) * lh) })
  } else {
    const logoW = logo ? (logo.width / logo.height < 1.5 ? 55 : 155) * unit * style.logoSize / 100 : 0
    const gap = logo && content.camera ? 28 * unit : 0
    const camera = fitText(ctx, content.camera, Math.max(1, f.width - logoW - gap), 34 * unit)
    const tw = ctx.measureText(camera).width, x = (w - logoW - gap - tw) / 2
    const rows = [content.exposure, content.time].filter(Boolean)
    const hasTop = !!logo || !!camera, topY = f.y + 34 * unit
    if (logo) drawLogo(ctx, logo, x, topY - 25 * unit, logoW, 50 * unit, style.color)
    ctx.textAlign = 'left'; ctx.fillText(camera, x + logoW + gap, topY)
    ctx.textAlign = 'center'
    rows.forEach((row, i) => { const value = fitText(ctx, row, f.width, 27 * unit); ctx.fillText(value, w / 2, f.y + (hasTop ? 76 : 34) * unit + i * 34 * unit) })
  }
}
