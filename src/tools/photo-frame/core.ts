import { resolvePhone, type PhoneBrand } from './devices'
export type Template = 'white' | 'portrait' | 'landscape'
export type Brand = 'nikon' | 'canon' | 'sony' | 'fujifilm' | 'leica' | PhoneBrand
export const fields = [['make', '品牌'], ['model', '设备型号'], ['focal', '焦距'], ['aperture', '光圈'], ['shutter', '快门'], ['iso', 'ISO'], ['time', '拍摄时间']] as const
export type Field = typeof fields[number][0]
export type Shooting = Record<Field, string>
export type Visibility = Record<Field, boolean>
export interface Style { template: Template; padding: number; photoSize: number; radius: number; shadow: number; blur: number; logoSize: number; color: string }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Layout { width: number; height: number; photo: Rect; footer: Rect }
export const emptyShooting = (): Shooting => ({ make: '', model: '', focal: '', aperture: '', shutter: '', iso: '', time: '' })
export const visibility = (): Visibility => ({ make: false, model: true, focal: true, aperture: true, shutter: true, iso: true, time: true })
export function defaults(template: Template): Style {
  return { template, padding: template === 'white' ? 0 : template === 'landscape' ? 4 : 8, photoSize: 100, radius: template === 'white' ? 0 : 3, shadow: template === 'white' ? 0 : 40, blur: 40, logoSize: 100, color: template === 'white' ? '#171717' : '#ffffff' }
}
export function brandFor(make: string, model = ''): Brand | '' {
  return (['nikon', 'canon', 'sony', 'fujifilm', 'leica'] as Brand[]).find(b => make.toLowerCase().includes(b)) || resolvePhone(make, model).brand
}
export function lines(data: Shooting, visible: Visibility) {
  const get = (key: Field) => visible[key] ? data[key].trim() : ''
  return { camera: [get('make'), get('model')].filter(Boolean).join(' '), exposure: (['focal', 'aperture', 'shutter', 'iso'] as Field[]).map(get).filter(Boolean).join('  '), time: get('time') }
}
export function layout(width: number, height: number, style: Style, longEdge: number | 'original'): Layout {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw Error('图片尺寸无效')
  if (!['white', 'portrait', 'landscape'].includes(style.template)) throw Error('模板无效')
  for (const [key, min, max] of [['padding', 0, 20], ['photoSize', 40, 100], ['radius', 0, 12], ['shadow', 0, 100], ['blur', 0, 100], ['logoSize', 50, 180]] as const) {
    if (!Number.isFinite(style[key]) || style[key] < min || style[key] > max) throw Error('样式参数超出范围')
  }
  let w = 1600, h: number, photo: Rect, footer: Rect
  const pad = w * style.padding / 100
  if (style.template === 'white') {
    const pw = (w - pad * 2) * style.photoSize / 100, ph = pw * height / width
    photo = { x: (w - pw) / 2, y: pad, width: pw, height: ph }
    const fh = Math.max(180, pad)
    h = pad + ph + fh; footer = { x: w * .04, y: pad + ph, width: w * .92, height: fh }
  } else {
    h = style.template === 'portrait' ? w * 16 / 9 : w * 2 / 3
    const fh = 140, ratio = Math.min((w - pad * 2) / width, (h - pad * (style.template === 'landscape' ? 1 : 2) - fh) / height) * style.photoSize / 100
    const pw = width * ratio, ph = height * ratio
    photo = { x: (w - pw) / 2, y: (h - ph - fh) / 2, width: pw, height: ph }
    footer = { x: w * .04, y: photo.y + ph + 12, width: w * .92, height: fh - 12 }
  }
  const native = Math.min(width / photo.width, height / photo.height)
  if (longEdge !== 'original' && (!Number.isFinite(longEdge) || longEdge < 1)) throw Error('导出尺寸无效')
  const scale = longEdge === 'original' ? native : Math.min(native, longEdge / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale))
  if (w > 16384 || h > 16384 || w * h > 32000000) throw Error('成品超过 3200 万像素或单边 16384 px，请降低导出尺寸')
  const rect = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale })
  return { width: w, height: h, photo: rect(photo), footer: rect(footer) }
}
