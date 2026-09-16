import { DateTime } from 'luxon'
export type TimestampUnit = 'seconds' | 'milliseconds'
export interface TimeResult { seconds: string; milliseconds: string; utc: string; zoned: string; zone: string; offset: string }
function zoneCheck(zone: string) {
  if (!DateTime.now().setZone(zone).isValid) throw new Error('时区无效或当前环境不支持该时区')
}
function secondsString(ms: number): string {
  const integer = BigInt(ms)
  const abs = integer < 0n ? -integer : integer
  const fraction = (abs % 1000n).toString().padStart(3, '0').replace(/0+$/, '')
  return (integer < 0n ? '-' : '') + (abs / 1000n).toString() + (fraction ? '.' + fraction : '')
}
function result(ms: number, zone: string): TimeResult {
  zoneCheck(zone)
  const utc = DateTime.fromMillis(ms, { zone: 'UTC' })
  const local = utc.setZone(zone)
  if (!utc.isValid || !local.isValid || utc.year < 1 || utc.year > 9999 || local.year < 1 || local.year > 9999) throw new Error('日期超出支持范围（公元 0001–9999 年）')
  return { seconds: secondsString(ms), milliseconds: ms.toString(), utc: utc.toISO()!, zoned: local.toFormat('yyyy-MM-dd HH:mm:ss.SSS'), zone, offset: local.toFormat('ZZ') }
}
export function fromTimestamp(input: string, unit: TimestampUnit, zone: string): TimeResult {
  const text = input.trim()
  if (text.length > 40) throw new Error('时间戳过长')
  let ms: bigint
  if (unit === 'milliseconds') {
    if (!/^-?\d+$/.test(text)) throw new Error('毫秒时间戳必须为整数')
    ms = BigInt(text)
  } else if (unit === 'seconds') {
    if (!/^-?\d+(?:\.\d{1,3})?$/.test(text)) throw new Error('秒时间戳需为整数或最多 3 位小数，不支持科学计数法')
    const [whole, fraction = ''] = text.replace(/^-/, '').split('.')
    ms = (BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'))) * (text.startsWith('-') ? -1n : 1n)
  } else throw new Error('不支持的时间戳单位')
  if (ms > 8640000000000000n || ms < -8640000000000000n) throw new Error('时间戳超出日期范围')
  return result(Number(ms), zone)
}
export function fromDate(input: string, zone: string): TimeResult {
  zoneCheck(zone)
  const text = input.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(text)
  if (!match) throw new Error('请输入 YYYY-MM-DD HH:mm:ss[.SSS]，也可带 Z 或 ±HH:mm 偏移')
  const [, y, m, d, h, min, s, frac = '', offset] = match
  const values = { year: +y!, month: +m!, day: +d!, hour: +h!, minute: +min!, second: +s!, millisecond: Number(frac.padEnd(3, '0')) }
  if (values.hour > 23 || values.minute > 59 || values.second > 59) throw new Error('时分秒超出范围，不支持闰秒或 24:00')
  if (offset && offset !== 'Z' && (+offset.slice(1, 3) > 23 || +offset.slice(4) > 59)) throw new Error('UTC 偏移超出范围')
  const date = offset ? DateTime.fromISO(text.replace(' ', 'T'), { setZone: true }) : DateTime.fromObject(values, { zone })
  if (!date.isValid || Object.entries(values).some(([key, value]) => date.get(key as keyof typeof values) !== value)) throw new Error('日期无效，或该当地时间处于夏令时跳过的时段')
  if (!offset && date.getPossibleOffsets().length > 1) throw new Error('该当地时间有两个夏令时偏移，请在日期末尾明确添加 ±HH:mm')
  return result(date.toMillis(), zone)
}
export function currentTime(zone: string, now = Date.now()): TimeResult { return result(now, zone) }
