// Exact model codes only: unknown codes are preserved rather than guessed by prefix.
// Sources: Google Play supported_devices.csv and Huawei support (see docs/PHOTO_FRAME.md).
export const phoneBrands = [
  { id: 'apple', name: '苹果 Apple', text: 'Apple', alias: /^(?:apple\b|苹果)/i },
  { id: 'huawei', name: '华为 HUAWEI', text: 'HUAWEI', alias: /^(?:huawei\b|华为)/i },
  { id: 'honor', name: '荣耀 HONOR', text: 'HONOR', alias: /^(?:honor\b|荣耀)/i },
  { id: 'xiaomi', name: '小米 Xiaomi', text: 'Xiaomi', alias: /^(?:xiaomi\b|小米)/i },
  { id: 'redmi', name: '红米 Redmi', text: 'Redmi', alias: /^(?:redmi\b|红米)/i },
  { id: 'poco', name: 'POCO', text: 'POCO', alias: /^poco\b/i },
  { id: 'samsung', name: '三星 Samsung', text: 'SAMSUNG', alias: /^(?:samsung\b|三星)/i },
  { id: 'oppo', name: 'OPPO', text: 'OPPO', alias: /^oppo\b/i },
  { id: 'vivo', name: 'vivo', text: 'vivo', alias: /^vivo\b/i },
  { id: 'iqoo', name: 'iQOO', text: 'iQOO', alias: /^iqoo\b/i },
  { id: 'oneplus', name: '一加 OnePlus', text: 'OnePlus', alias: /^(?:oneplus\b|一加)/i },
  { id: 'realme', name: '真我 realme', text: 'realme', alias: /^(?:realme\b|真我)/i },
  { id: 'google', name: '谷歌 Google', text: 'Google', alias: /^(?:google\b|谷歌)/i },
  { id: 'nothing', name: 'Nothing', text: 'Nothing', alias: /^nothing\b/i },
  { id: 'motorola', name: '摩托罗拉 Motorola', text: 'motorola', alias: /^(?:motorola\b|摩托罗拉)/i },
] as const
export type PhoneBrand = typeof phoneBrands[number]['id']
type ModelGroup = readonly [PhoneBrand, string, string]
// Each row is [brand, display name, space-separated verified model codes].
const modelGroups: readonly ModelGroup[] = [
  ['honor', 'HONOR Magic6', 'BVL-AN00'],
  ['honor', 'HONOR Magic6 Pro', 'BVL-AN16 BVL-N49'],
  ['honor', 'HONOR Magic7', 'PTP-N29'],
  ['honor', 'HONOR Magic7 Pro', 'PTP-N49'],
  ['huawei', 'HUAWEI Mate 20 Pro', 'LYA-AL00 LYA-AL10 LYA-L09 LYA-L29 LYA-TL00'],
  ['huawei', 'HUAWEI P30 Pro', 'HW-02L VOG-AL00 VOG-AL10 VOG-L04 VOG-L09 VOG-L29 VOG-TL00'],
  ['nothing', 'Nothing Phone (2)', 'A065 AIN065'],
  ['oneplus', 'OnePlus 12', 'CPH2573 CPH2581 CPH2583 PJD110'],
  ['oneplus', 'OnePlus 13', 'CPH2649 CPH2653 CPH2655 PJZ110'],
  ['oppo', 'OPPO Find X6', 'PGFM10'],
  ['oppo', 'OPPO Find X6 Pro', 'PGEM10'],
  ['oppo', 'OPPO Find X7', 'PHZ110'],
  ['oppo', 'OPPO Find X7 Ultra', 'PHY110'],
  ['oppo', 'OPPO Find X8', 'CPH2651 PKB110'],
  ['oppo', 'OPPO Find X8 Pro', 'CPH2659 PKC110'],
  ['oppo', 'OPPO Find X8 Ultra', 'PKJ110'],
  ['poco', 'POCO F6', '24069PC21G 24069PC21I'],
  ['redmi', 'Redmi Note 13 Pro 5G', '2312CRAD3C 2312DRA50C 2312DRA50G 2312DRA50I XIG05'],
  ['samsung', 'Galaxy S23', 'SC-51D SCG19 SM-S9110 SM-S911B SM-S911C SM-S911N SM-S911U SM-S911U1 SM-S911W'],
  ['samsung', 'Galaxy S23 Ultra', 'SC-52D SCG20 SM-S9180 SM-S918B SM-S918N SM-S918Q SM-S918U SM-S918U1 SM-S918W'],
  ['samsung', 'Galaxy S24', 'SC-51E SCG25 SM-S9210 SM-S921B SM-S921E SM-S921N SM-S921Q SM-S921U SM-S921U1 SM-S921W'],
  ['samsung', 'Galaxy S24 Ultra', 'SC-52E SCG26 SM-S9280 SM-S928B SM-S928N SM-S928Q SM-S928U SM-S928U1 SM-S928W'],
  ['samsung', 'Galaxy S25', 'SC-51F SCG31 SM-S9310 SM-S931B SM-S931N SM-S931Q SM-S931U SM-S931U1 SM-S931W SM-S931Z'],
  ['samsung', 'Galaxy S25 Ultra', 'SC-52F SCG32 SM-S9380 SM-S938B SM-S938N SM-S938Q SM-S938U SM-S938U1 SM-S938W SM-S938Z'],
  ['vivo', 'vivo X100', 'V2308 V2309A'],
  ['vivo', 'vivo X100 Pro', 'V2309 V2324A'],
  ['vivo', 'vivo X200 Pro', 'V2405A V2413'],
  ['vivo', 'vivo X200 Ultra', 'V2454A V2454DA'],
  ['iqoo', 'iQOO 12', 'I2220 V2307A'],
  ['iqoo', 'iQOO 13', 'I2401 V2408A'],
  ['vivo', 'vivo X200', 'V2415 V2415A'],
  ['vivo', 'vivo X200 Pro mini', 'V2419A'],
  ['vivo', 'vivo X90', 'V2241A'],
  ['vivo', 'vivo X90 Pro', 'V2242A'],
  ['vivo', 'vivo X90 Pro+', 'V2227A'],
  ['xiaomi', 'Xiaomi 14', '23127PN0CC 23127PN0CG'],
  ['xiaomi', 'Xiaomi 14 Ultra', '24030PN60G 24031PN0DC'],
  ['xiaomi', 'Xiaomi 15', '24129PN74C 24129PN74G 24129PN74I'],
  ['xiaomi', 'Xiaomi 15 Ultra', '25010PN30C 25010PN30G 25010PN30I 25019PNF3C'],
  ['realme', 'realme GT 6', 'RMX3851'],
  ['realme', 'realme GT 7 Pro', 'RMX5011'],
  ['realme', 'realme GT5 Pro', 'RMX3888'],
  ['realme', 'realme GT6', 'RMX3800'],
  ['realme', 'realme GT7 Pro', 'RMX5010'],
  ['huawei', 'HUAWEI Mate 60', 'BRA-AL00'],
  ['huawei', 'HUAWEI Mate 60 Pro', 'ALN-AL00 ALN-AL80'],
  ['huawei', 'HUAWEI Mate 70', 'CLS-AL00 CLS-AL30'],
  ['huawei', 'HUAWEI Mate 70 Pro', 'PLR-AL00 PLR-AL30'],
  ['huawei', 'HUAWEI Pura 70 Pro', 'HBN-AL00'],
  ['huawei', 'HUAWEI Pura 70 Pro+', 'HBN-AL10 HBN-AL80'],
  ['huawei', 'HUAWEI Pura 70 Ultra', 'HBP-AL00'],
  ['huawei', 'HUAWEI Pura 80', 'HED-AL00'],
  ['huawei', 'HUAWEI Pura 80 Pro', 'LMR-AL00'],
]
const models = new Map<string, { brand: PhoneBrand; model: string }>()
for (const [brand, model, codes] of modelGroups) {
  for (const code of codes.split(' ')) models.set(code.toUpperCase(), { brand, model })
}
function namedBrand(value: string) { return phoneBrands.find(b => b.alias.test(value))?.id || '' }
function compatible(make: PhoneBrand | '', model: PhoneBrand) {
  return !make || make === model || (make === 'xiaomi' && (model === 'redmi' || model === 'poco')) || (make === 'vivo' && model === 'iqoo')
}
export function resolvePhone(make: string, model: string): { make: string; model: string; brand: PhoneBrand | '' } {
  const manufacturer = namedBrand(make)
  // An explicit unknown/camera manufacturer must not be overridden by a coincidental code.
  if (make && !manufacturer) return { make, model, brand: '' }
  const code = model.replace(/^(?:samsung|xiaomi|redmi|poco|huawei|honor|oppo|vivo|iqoo|oneplus|realme|nothing)\s+/i, '').toUpperCase()
  const known = models.get(code)
  const inferred = known?.brand || namedBrand(model) || (/^(?:iPhone|iPad)\b/i.test(model) ? 'apple' : /^Pixel\b/i.test(model) ? 'google' : /^Galaxy\b/i.test(model) ? 'samsung' : '')
  const brand = inferred && compatible(manufacturer, inferred) ? inferred : manufacturer
  if (!brand) return { make, model, brand: '' }
  return { make: phoneBrands.find(b => b.id === brand)!.text, model: known?.brand === brand ? known.model : model, brand }
}
