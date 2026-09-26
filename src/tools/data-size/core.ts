export const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB'] as const
export type SizeUnit = typeof sizeUnits[number]
export type SizeBase = 1000 | 1024

export interface SizeResult {
  unit: SizeUnit
  value: string
  display: string
  approximate: boolean
}

const MAX_FRACTION_DIGITS = 24

/** 使用整数分子和分母换算，避免输入或中间结果经过 Number 丢失精度。 */
export function convertSize(input: string, source: SizeUnit, base: SizeBase): SizeResult[] {
  const raw = input.trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) throw new Error('请输入非负数值')
  const [integer = '0', fraction = ''] = raw.split('.')
  if (integer.length > 30 || fraction.length > 18) throw new Error('最多输入 30 位整数和 18 位小数')
  const digits = BigInt((integer || '0') + fraction)
  const scale = 10n ** BigInt(fraction.length)
  const bytes = digits * BigInt(base) ** BigInt(sizeUnits.indexOf(source))
  return sizeUnits.map((unit, index) => {
    const denominator = scale * BigInt(base) ** BigInt(index)
    const whole = bytes / denominator
    let remainder = bytes % denominator
    let decimals = ''
    for (let i = 0; i < MAX_FRACTION_DIGITS && remainder !== 0n; i++) {
      remainder *= 10n
      decimals += String(remainder / denominator)
      remainder %= denominator
    }
    let value = whole.toString() + (decimals ? '.' + decimals.replace(/0+$/, '') : '')
    const approximate = remainder !== 0n
    if (approximate && remainder * 2n >= denominator) {
      const rounded = (BigInt(whole.toString() + decimals) + 1n).toString().padStart(decimals.length + 1, '0')
      const integerPart = rounded.slice(0, -decimals.length)
      const fractionPart = rounded.slice(-decimals.length).replace(/0+$/, '')
      value = integerPart + (fractionPart ? '.' + fractionPart : '')
    }
    const [integerPart, fractionPart] = value.split('.')
    const display = integerPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fractionPart ? '.' + fractionPart : '')
    return { unit, value, display, approximate }
  })
}

