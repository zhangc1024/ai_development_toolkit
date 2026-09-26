// 轻量词法扫描：隔离注释、字面量和括号层级，避免用全文正则误判条件。
export interface Token { text: string; kind: 'word' | 'identifier' | 'string' | 'symbol' | 'number'; depth: number; start: number; end: number }
export interface SqlAnalysis {
  type: string; tables: string[]; fields: string; joins: string[]; where: string; groupBy: string; orderBy: string; limit: string
  risks: string[]; indexes: { source: string; fields: string[] }[]
}
export const SQL_LIMIT = 100_000
export function tokenize(sql: string): Token[] {
  if (sql.length > SQL_LIMIT) throw new Error('SQL 输入上限为 100,000 字符，请缩小内容')
  const tokens: Token[] = []
  let i = 0, depth = 0
  while (i < sql.length) {
    const start = i, c = sql[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '#' || (sql.slice(i, i + 2) === '--' && (!sql[i + 2] || /\s/.test(sql[i + 2])))) {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (sql.slice(i, i + 2) === '/*') {
      const end = sql.indexOf('*/', i + 2)
      if (end < 0) throw new Error('块注释未闭合')
      if (sql[i + 2] === '!') throw new Error('暂不分析 MySQL 可执行注释')
      i = end + 2; continue
    }
    let kind: Token['kind'] = 'symbol'
    if (c === "'" || c === '"' || c === '`') {
      kind = c === '`' ? 'identifier' : 'string'
      i++
      let closed = false
      while (i < sql.length) {
        if (sql[i] === '\\' && c !== '`') { i += 2; continue }
        if (sql[i] === c) { if (sql[i + 1] === c) { i += 2; continue }; i++; closed = true; break }
        i++
      }
      if (!closed) throw new Error('引号未闭合')
    } else if (/[a-zA-Z_$\u0080-\uffff]/.test(c)) {
      kind = 'word'; i++
      while (i < sql.length && /[\w$\u0080-\uffff]/.test(sql[i])) i++
    } else if (/[0-9]/.test(c)) {
      kind = 'number'; i++
      while (i < sql.length && /[0-9.]/.test(sql[i])) i++
    } else { i++ }
    if (c === ')') { depth--; if (depth < 0) throw new Error('括号不匹配') }
    tokens.push({ text: sql.slice(start, i), kind, depth, start, end: i })
    if (c === '(') { depth++; if (depth > 100) throw new Error('括号嵌套过深') }
  }
  if (depth) throw new Error('括号未闭合')
  return tokens
}
const is = (t: Token | undefined, value: string) => t?.kind === 'word' && t.text.toUpperCase() === value
const identifier = (t: Token | undefined) => !!t && (t.kind === 'word' || t.kind === 'identifier')
const keywords = new Set('AND OR NOT IS NULL TRUE FALSE IN LIKE BETWEEN REGEXP RLIKE ESCAPE ASC DESC COLLATE BINARY INTERVAL DAY MONTH YEAR HOUR MINUTE SECOND AS CASE WHEN THEN ELSE END DISTINCT DIV MOD USING ON'.split(' '))
function fieldsOf(tokens: Token[]): string[] {
  const fields: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!identifier(t) || (t.kind === 'word' && keywords.has(t.text.toUpperCase()))) continue
    if (tokens[i - 1]?.text === ':' || tokens[i - 1]?.text === '@' || is(tokens[i - 1], 'COLLATE')) continue
    let name = t.text
    while (tokens[i + 1]?.text === '.' && identifier(tokens[i + 2])) { name += '.' + tokens[i + 2].text; i += 2 }
    if (tokens[i + 1]?.text === '(') continue
    fields.push(name)
  }
  return [...new Set(fields)]
}
export function analyzeSql(sql: string): SqlAnalysis[] {
  const tokens = tokenize(sql)
  if (!tokens.length) throw new Error('请先输入 SELECT / INSERT / UPDATE / DELETE SQL')
  const statements: Token[][] = [[]]
  for (const token of tokens) {
    if (token.text === ';' && token.depth === 0) { if (statements.at(-1)!.length) statements.push([]) }
    else statements.at(-1)!.push(token)
  }
  return statements.filter(s => s.length).map(t => {
    const type = t[0].text.toUpperCase()
    if (t[0].kind !== 'word' || !['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(type)) throw new Error('基础分析仅支持 SELECT / INSERT / UPDATE / DELETE')
    if (t.some((x, i) => is(x, 'UNION') || (i > 0 && is(x, 'SELECT')))) throw new Error('暂不分析子查询、UNION 或 INSERT SELECT；可单独格式化 SQL')
    if (['=', '>', '<', ',', '+', '-', '/', '.'].includes(t.at(-1)!.text) || ['AND', 'OR', 'NOT', 'LIKE', 'JOIN', 'ON', 'SET'].some(w => is(t.at(-1), w))) throw new Error('SQL 末尾不完整，请检查条件或表达式')
    const top = t.filter(x => x.depth === 0)
    const pos = (word: string) => top.findIndex(x => is(x, word))
    const whereAt = pos('WHERE'), groupAt = top.findIndex((x,i) => is(x,'GROUP') && is(top[i+1],'BY'))
    const orderAt = top.findIndex((x,i) => is(x,'ORDER') && is(top[i+1],'BY')), limitAt = pos('LIMIT')
    const ends = [whereAt, groupAt, orderAt, limitAt, pos('HAVING'), pos('FOR'), pos('RETURNING')].filter(i => i >= 0)
    const clause = (at: number, skip = 1) => {
      if (at < 0) return []
      const end = Math.min(...ends.filter(i => i > at), top.length)
      const startOffset = top[at + skip]?.start ?? Infinity
      const endOffset = top[end]?.start ?? Infinity
      return t.filter(x => x.start >= startOffset && x.start < endOffset)
    }
    const raw = (part: Token[]) => part.length ? sql.slice(part[0].start, part.at(-1)!.end).trim() : ''
    const where = clause(whereAt), group = clause(groupAt,2), order = clause(orderAt,2), limit = clause(limitAt)
    for (const [at, part] of [[whereAt,where],[groupAt,group],[orderAt,order],[limitAt,limit]] as const) {
      if (at >= 0 && !part.length) throw new Error('条件或子句不完整，请检查 SQL')
    }
    const fromAt = pos('FROM')
    const selectFields = type === 'SELECT' ? t.filter(x => x.start >= t[0].end && x.start < (top[fromAt]?.start ?? top[Math.min(...ends, top.length)]?.start ?? Infinity)) : []
    if (type === 'SELECT' && !selectFields.length) throw new Error('SELECT 缺少字段')
    if (type === 'UPDATE' && (pos('SET') < 0 || !top[pos('SET') + 1])) throw new Error('UPDATE 缺少 SET 赋值')
    if (type === 'DELETE' && fromAt < 0) throw new Error('DELETE 缺少 FROM')
    if (type === 'INSERT' && !top.some(x => is(x,'VALUES') || is(x,'VALUE') || is(x,'SET'))) throw new Error('INSERT 缺少 VALUES 或 SET')
    const tables: string[] = []
    const takeTable = (i: number) => {
      if (!identifier(top[i]) || ['WHERE','SET','VALUES','VALUE','GROUP','ORDER','LIMIT','JOIN','ON'].some(w => is(top[i],w))) throw new Error('缺少有效表名')
      let name = top[i].text
      if (top[i + 1]?.text === '.' && identifier(top[i + 2])) name += '.' + top[i + 2].text
      tables.push(name)
    }
    for (let i = 0; i < top.length; i++) {
      if (is(top[i],'FROM') || is(top[i],'JOIN') || is(top[i],'STRAIGHT_JOIN') || is(top[i],'INTO')) takeTable(i + 1)
    }
    if (type === 'UPDATE') {
      let start = 1
      while (is(top[start],'LOW_PRIORITY') || is(top[start],'IGNORE')) start++
      takeTable(start)
      for (let i = start + 1; i < pos('SET'); i++) if (top[i].text === ',') takeTable(i + 1)
    }
    if (type === 'INSERT' && pos('INTO') < 0) takeTable(1)
    // 逗号连接的表只在 FROM 区域识别，避免把 SELECT 字段或 SET 赋值当成表。
    if (fromAt >= 0) {
      const end = Math.min(...ends.filter(i => i > fromAt), top.length)
      for (let i = fromAt + 1; i < end; i++) if (top[i].text === ',') takeTable(i + 1)
    }
    const joins: Token[][] = []
    for (let i = 0; i < top.length; i++) if (is(top[i],'ON') || is(top[i],'USING')) {
      if (type === 'INSERT') continue
      let end = i + 1
      while (end < top.length && !['JOIN','LEFT','RIGHT','INNER','CROSS','STRAIGHT_JOIN','WHERE','GROUP','ORDER','LIMIT','HAVING','SET'].some(w => is(top[end],w))) end++
      const condition = t.filter(x => x.start >= top[i].end && x.start < (top[end]?.start ?? Infinity))
      if (!condition.length) throw new Error('JOIN 条件不完整')
      joins.push(condition)
    }
    const risks: string[] = []
    if (selectFields.some((x,i) => x.text === '*' && x.depth === 0 && (i === 0 || selectFields[i-1].text === ',' || selectFields[i-1].text === '.' || is(selectFields[i-1],'DISTINCT') || is(selectFields[i-1],'ALL')))) risks.push('SELECT * / 表.*：可能读取不必要的列，建议按需求列出字段。')
    if (['UPDATE','DELETE'].includes(type) && whereAt < 0) risks.push(type + ' 未发现 WHERE：可能影响大量数据，请核实操作范围；LIMIT 也不能替代业务条件。')
    if (where.some((x,i) => is(x,'LIKE') && where[i+1]?.kind === 'string' && where[i+1].text[1] === '%')) risks.push('LIKE 以 % 开头：普通 B-tree 索引可能难以用于前缀定位，请结合查询需求和执行计划评估。')
    const offsetAt = limit.findIndex(x => is(x,'OFFSET'))
    const offset = offsetAt >= 0 ? Number(limit[offsetAt+1]?.text) : limit[1]?.text === ',' ? Number(limit[0]?.text) : 0
    if (offset >= 10000) risks.push('LIMIT offset ≥ 10,000：深分页可能扫描并跳过较多记录，可评估基于游标的分页。')
    if (where.some((x,i) => identifier(x) && !keywords.has(x.text.toUpperCase()) && where[i+1]?.text === '(' && fieldsOf(where.slice(i+2, where.findIndex((y,j) => j > i+1 && y.text === ')' && y.depth === x.depth))).length)) risks.push('WHERE 中字段被函数包裹：可能影响普通索引定位，可评估等价范围条件或适用的函数索引。')
    if (where.filter(x => is(x,'OR')).length >= 3) risks.push('WHERE 中 OR ≥ 3 个：建议检查选择性与执行计划，必要时评估等价改写。')
    if (order.length || group.length) risks.push('存在 ORDER BY / GROUP BY：是否利用索引取决于字段顺序、过滤条件与索引定义，请结合 EXPLAIN 检查排序或临时表。')
    return { type, tables: [...new Set(tables)], fields: raw(selectFields), joins: joins.map(raw), where: raw(where), groupBy: raw(group), orderBy: raw(order), limit: raw(limit), risks,
      indexes: [{source:'WHERE',fields:fieldsOf(where)},{source:'JOIN',fields:fieldsOf(joins.flat())},{source:'ORDER BY',fields:fieldsOf(order)},{source:'GROUP BY',fields:fieldsOf(group)}] }
  })
}
