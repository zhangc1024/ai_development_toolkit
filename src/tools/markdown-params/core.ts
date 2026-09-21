import { convertLiteral } from '../literals/core'

export interface Table { headers: string[]; rows: { cells: string[]; line: number }[]; line: number }
export type Block = { kind: 'heading'; text: string; level: number } | { kind: 'text' | 'code'; text: string } | { kind: 'table'; table: Table }
export interface Mapping { key: number; type: number; default: number }
export type OutputFormat = 'json' | 'php' | 'javascript' | 'python'
export const INPUT_LIMIT = 100_000

// 只在代码片段之外拆分管道，保留转义管道与 JSON 字符串中的反斜杠。
export function splitRow(line: string): string[] {
 const cells: string[] = []; let cell = '', ticks = 0
 const text = line.trim()
 for (let i = 0; i < text.length; i++) {
  const c = text[i]!
  if (c === '\\' && text[i + 1] === '|') { cell += '|'; i++; continue }
  if (c === '`') {
   let n = 1; while (text[i + n] === '`') n++
   if (!ticks) ticks = n; else if (ticks === n) ticks = 0
   cell += '`'.repeat(n); i += n - 1; continue
  }
  if (c === '|' && !ticks) { cells.push(cell.trim()); cell = '' } else cell += c
 }
 cells.push(cell.trim())
 if (text.startsWith('|')) cells.shift()
 if (text.endsWith('|') && cells.at(-1) === '') cells.pop()
 return cells
}
export function plainCell(value: string): string {
 const text = value.trim()
 const code = /^(`+)([\s\S]*?)\1$/.exec(text)
 if (code) return code[2]!.trim()
 return text.replace(/^\*\*(.*?)\*\*$/, '$1')
}
export function parseMarkdown(input: string): { tables: Table[]; blocks: Block[] } {
 if (input.length > INPUT_LIMIT) throw Error('内容超过 100,000 字符，请缩小文档后再转换。')
 const lines = input.replace(/\r\n?/g, '\n').split('\n'), tables: Table[] = [], blocks: Block[] = []
 for (let i = 0; i < lines.length; i++) {
  const line = lines[i]!, fence = /^\s*(`{3,}|~{3,})/.exec(line)
  if (fence) {
   const code: string[] = [], marker = fence[1]!
   while (++i < lines.length && !new RegExp('^\\s*' + marker[0] + '{' + marker.length + ',}\\s*$').test(lines[i]!)) code.push(lines[i]!)
   blocks.push({ kind: 'code', text: code.join('\n') }); continue
  }
  const headers = splitRow(line), separators = splitRow(lines[i + 1] ?? '')
  if (headers.length && line.includes('|') && headers.length === separators.length && separators.every(s => /^:?-{3,}:?$/.test(s))) {
   const table: Table = { headers: headers.map(plainCell), rows: [], line: i + 1 }
   i += 2
   for (; i < lines.length && lines[i]!.trim() && lines[i]!.includes('|'); i++) {
    if (!/^\s*[`~]{3}/.test(lines[i]!)) table.rows.push({ cells: splitRow(lines[i]!), line: i + 1 })
    else break
   }
   i--; tables.push(table); blocks.push({ kind: 'table', table }); continue
  }
  const heading = /^(#{1,6})\s+(.+)$/.exec(line)
  if (heading) blocks.push({ kind: 'heading', text: heading[2]!, level: heading[1]!.length })
  else if (line.trim()) blocks.push({ kind: 'text', text: line })
 }
 return { tables, blocks }
}
export function autoMap(headers: string[]): Mapping {
 const names = headers.map(s => plainCell(s).toLowerCase().replace(/[\s_-]/g, ''))
 const find = (aliases: string[]) => names.findIndex(s => aliases.includes(s))
 return { key: find(['key', '参数', '参数名', 'field', 'name']), type: find(['类型', '格式', 'type', 'format']), default: find(['默认值', '默认', 'default', 'defaultvalue']) }
}
const aliases: Record<string, string> = { int: 'integer', integer: 'integer', number: 'number', float: 'number', double: 'number', string: 'string', text: 'string', bool: 'boolean', boolean: 'boolean', array: 'array', list: 'array', object: 'object', json: 'object', null: 'null' }
const defaults: Record<string, string> = { integer: '0', number: '0', string: '""', boolean: 'false', array: '[]', object: '{}', null: 'null' }
function kind(value: unknown): string { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value }
function valueFor(raw: string, typeName: string): { json: string; type: string } {
 const name = plainCell(typeName).toLowerCase(), type = name ? aliases[name] : ''
 if (name && !type) throw Error('不支持的类型「' + name + '」')
 const text = plainCell(raw)
 if (!text) return { json: defaults[type || 'string']!, type: type || 'string' }
 if (type === 'string') {
  if (text.startsWith('"')) {
   const parsed = JSON.parse(text)
   if (typeof parsed !== 'string') throw Error('字符串默认值需要文本或 JSON 字符串')
   return { json: text, type }
  }
  return { json: JSON.stringify(text), type }
 }
 let parsed: unknown
 try { parsed = JSON.parse(text) }
 catch {
  if (type) throw Error('默认值与 ' + type + ' 类型不匹配；数组和对象请使用 JSON 语法')
  if (/^[\[{" ]/.test(text)) throw Error('默认值不是有效的 JSON，请检查括号、引号和逗号')
  return { json: JSON.stringify(text), type: 'string' }
 }
 const actual = kind(parsed)
 if (type && (type === 'integer' ? actual !== 'number' || !Number.isInteger(parsed) : actual !== type)) throw Error('默认值与 ' + type + ' 类型不匹配')
 if (typeof parsed === 'number' && !Number.isFinite(parsed)) throw Error('数字超出可表示范围')
 // 使用已有字面量解析器校验并保留数字原文，不经 JSON.stringify 数字重编码。
 convertLiteral(text, 'json', 'json')
 return { json: text, type: type || actual }
}
export function convertTable(table: Table, mapping: Mapping, format: OutputFormat, indent: '2' | '4' = '2') {
 if (mapping.key < 0 || mapping.key >= table.headers.length) throw Error('请选择 Key 字段。')
 if (mapping.type < 0 && mapping.default < 0) throw Error('请至少选择类型字段或默认值字段。')
 const selected = Object.values(mapping).filter(n => n >= 0)
 if (new Set(selected).size !== selected.length) throw Error('Key、类型和默认值必须映射到不同的列。')
 if (selected.some(n => n >= table.headers.length)) throw Error('字段映射已失效，请重新选择。')
 const seen = new Set<string>(), types = new Set<string>(), entries: string[] = []
 for (const row of table.rows) {
  try {
   if (row.cells.length !== table.headers.length) throw Error('列数与表头不一致，请检查管道分隔符')
   const key = plainCell(row.cells[mapping.key]!)
   if (!key) throw Error('参数名不能为空')
   if (seen.has(key)) throw Error('参数名重复：' + key)
   seen.add(key)
   const value = valueFor(mapping.default < 0 ? '' : row.cells[mapping.default]!, mapping.type < 0 ? '' : row.cells[mapping.type]!)
   types.add(value.type); entries.push(JSON.stringify(key) + ':' + value.json)
  } catch (error) { throw Error('第 ' + row.line + ' 行：' + (error instanceof Error ? error.message : String(error))) }
 }
 const json = '{' + entries.join(',') + '}'
 const result = convertLiteral(json, 'json', format === 'javascript' ? 'json' : format, { indent, emptyPhp: 'map' })
 // JS 的 __proto__ 使用计算属性，避免对象字面量改变原型。
 const output = format === 'javascript' ? '(' + result.output.replace(/^(\s*)"__proto__":/gm, '$1["__proto__"]:') + ')' : result.output
 const warnings = [...result.warnings]
 if (format === 'javascript') warnings.push('JavaScript 数字采用双精度；超长整数建议在表中标为 string。')
 return { output, count: table.rows.length, types: [...types], warnings }
}
