import { emptyShooting, type Shooting } from './core'
import { resolvePhone } from './devices'
import { detectPhoto } from '../images/photo-formats'
let heicDetectionReady = false
function numeric(value: unknown) {
  const n = Array.isArray(value) && value.length === 2 ? Number(value[0]) / Number(value[1]) : Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
function text(value: unknown) { return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, 160) : '' }
export function timeText(value: unknown) {
  if (typeof value === 'string') {
    const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value)
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate() && Number(m[4]) < 24 && Number(m[5]) < 60 && Number(m[6]) < 60) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6]
  }
  if (value instanceof Date && Number.isFinite(value.getTime()) && value.getUTCFullYear() > 1970) return value.toISOString().slice(0, 19).replace('T', ' ')
  return ''
}
export function normalize(data: Record<string, unknown> = {}): Shooting {
  const result = emptyShooting()
  const device = resolvePhone(text(data.Make ?? data.camera_make), text(data.Model ?? data.camera_model))
  result.make = device.make; result.model = device.model
  const focal = numeric(data.FocalLength ?? data.focal_len), aperture = numeric(data.FNumber ?? data.aperture)
  const shutter = numeric(data.ExposureTime ?? data.shutter), iso = numeric(data.ISO ?? data.ISOSpeedRatings ?? data.iso_speed)
  if (focal) result.focal = Number(focal.toFixed(1)) + 'mm'
  if (aperture) result.aperture = 'F' + Number(aperture.toFixed(1))
  if (shutter) result.shutter = shutter <= .5 ? '1/' + Math.round(1 / shutter) + 's' : Number(shutter.toFixed(2)) + 's'
  if (iso) result.iso = 'ISO' + Math.round(iso)
  result.time = timeText(data.DateTimeOriginal ?? data.CreateDate ?? data.timestamp)
  return result
}
export function webpExif(buffer: ArrayBuffer): ArrayBuffer | undefined {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer)
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return
  const end = view.getUint32(4, true) + 8
  if (end > bytes.length) throw Error('WebP 元数据长度无效')
  for (let at = 12; at + 8 <= end;) {
    const length = view.getUint32(at + 4, true), start = at + 8
    if (start + length > end) throw Error('WebP 元数据块不完整')
    if (tag(at) === 'EXIF') {
      const skip = tag(start) === 'Exif' && bytes[start + 4] === 0 && bytes[start + 5] === 0 ? 6 : 0
      return buffer.slice(start + skip, start + length)
    }
    at = start + length + (length % 2)
  }
}
export async function readMetadata(buffer: ArrayBuffer, format: string) {
  const { default: exifr } = await import('exifr')
  if (format === 'heic' && !heicDetectionReady) {
    // exifr 7.1.3 rejects ftyp boxes over 50 bytes; newer iPhone files use 52.
    // Extend its public parser registry using our validated format detection.
    // Keep the original container and its absolute EXIF offsets unchanged.
    const HeicParser = exifr.fileParsers.get('heic')
    exifr.fileParsers.set('heic', class extends HeicParser {
      static canHandle(file: { toUint8(): Uint8Array }) {
        try { return detectPhoto(file.toUint8()) === 'heic' }
        catch { return false }
      }
    })
    heicDetectionReady = true
  }
  const input = format === 'webp' ? webpExif(buffer) : buffer
  if (!input) return emptyShooting()
  return normalize(await exifr.parse(input, { reviveValues: false, pick: ['Make', 'Model', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'ISOSpeedRatings', 'DateTimeOriginal', 'CreateDate'] }) || {})
}
