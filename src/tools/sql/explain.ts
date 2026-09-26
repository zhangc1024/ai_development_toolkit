export const explainColumns = ['table', 'type', 'possible_keys', 'key', 'rows', 'filtered', 'Extra'] as const
export type ExplainColumn = typeof explainColumns[number]
export interface ExplainRow { values: Record<ExplainColumn, string>; warnings: { field: ExplainColumn; message: string }[] }
function delimited(line: string, separator: string): string[] {
  const cells: string[] = []; let value = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted
    } else if (line[i] === separator && !quoted) { cells.push(value.trim()); value = '' }
    else value += line[i]
  }
  if (quoted) throw new Error('EXPLAIN 表格引号未闭合；请使用单行单元格')
  cells.push(value.trim()); return cells
}
export function parseExplain(text: string): ExplainRow[] {
  if (!text.trim()) throw new Error('请先粘贴 EXPLAIN 结果')
  if (text.length > 100_000) throw new Error('EXPLAIN 输入上限为 100,000 字符')
  let objects: Record<string, unknown>[]
  const input = text.trimStart().replace(/\r?\n\s*$/, '')
  if (input.startsWith('[') || input.startsWith('{')) {
    let data: unknown
    try { data = JSON.parse(input) } catch { throw new Error('EXPLAIN JSON 格式错误') }
    if (!Array.isArray(data)) throw new Error('请粘贴传统 EXPLAIN 行对象数组；暂不支持 FORMAT=JSON / TREE')
    if (!data.length || data.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new Error('EXPLAIN 数组必须包含行对象')
    objects = data
  } else {
    const lines = input.split(/\r?\n/).filter(x => x.trim() && !/^\s*\+[-+]+\+\s*$/.test(x) && !/^\s*\d+ rows? in set/i.test(x))
    const header = lines[0]
    const pipe = header.trim().startsWith('|')
    const sep = pipe ? '|' : header.includes('\t') ? '\t' : ','
    if (!pipe && !header.includes(sep)) throw new Error('请使用带表头的 MySQL 表格、TSV、CSV 或 JSON 行数组')
    const read = (line: string) => pipe ? line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim()) : delimited(line,sep)
    const names = read(header)
    objects = lines.slice(1).filter(x => !/^\s*\|?[\s:|-]+\|?\s*$/.test(x)).map(line => {
      const cells = read(line)
      if (cells.length !== names.length) throw new Error('EXPLAIN 数据列数与表头不一致；CSV 中含逗号的值请加双引号')
      return Object.fromEntries(names.map((name,i) => [name,cells[i]]))
    })
  }
  if (!objects.length) throw new Error('未找到 EXPLAIN 数据行')
  if (objects.length > 500) throw new Error('EXPLAIN 最多分析 500 行')
  return objects.map(obj => {
    const normalized = Object.fromEntries(Object.entries(obj).map(([k,v]) => [k.toLowerCase(),v]))
    if (!['type','possible_keys','key','rows','filtered','extra'].every(k => k in normalized)) throw new Error('EXPLAIN 缺少必要列：type、possible_keys、key、rows、filtered、Extra')
    const values = Object.fromEntries(explainColumns.map(k => {
      const value = normalized[k.toLowerCase()]
      if (value != null && !['string','number'].includes(typeof value)) throw new Error('EXPLAIN 单元格应为文本、数字或 null')
      return [k, value == null ? 'NULL' : String(value)]
    })) as ExplainRow['values']
    for (const column of ['rows','filtered'] as const) {
      const value = values[column]
      if (!/^(NULL|)$/i.test(value) && (!Number.isFinite(Number(value)) || Number(value) < 0 || (column === 'filtered' && Number(value) > 100))) throw new Error(column + ' 必须为有效非负数字' + (column === 'filtered' ? '（0–100）' : ''))
    }
    const warnings: ExplainRow['warnings'] = []
    if (values.type.toUpperCase() === 'ALL') warnings.push({field:'type',message:'ALL：计划使用全表扫描；小表或低选择性场景也可能合理。'})
    if (/^(NULL|)$/i.test(values.key)) warnings.push({field:'key',message:'key 为空：未报告选用索引；请结合访问类型和表规模判断。'})
    if (Number(values.rows) >= 10000) warnings.push({field:'rows',message:'rows ≥ 10,000：估算检查行数较多，不是实际执行行数或耗时。'})
    if (/Using filesort/i.test(values.Extra)) warnings.push({field:'Extra',message:'Using filesort：需要额外排序，不代表一定使用磁盘。'})
    if (/Using temporary/i.test(values.Extra)) warnings.push({field:'Extra',message:'Using temporary：使用临时表，请结合数据规模评估。'})
    return { values, warnings }
  })
}
