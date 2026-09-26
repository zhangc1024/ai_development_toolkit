import { analyzeSql } from './analyzer'
import { formatSql, type SqlOptions } from './core'
self.onmessage = (event: MessageEvent<{ text: string; options: SqlOptions; formatOnly: boolean }>) => {
  const { text, options, formatOnly } = event.data
  try {
    if (text.length > 100_000) throw new Error('SQL 输入上限为 100,000 字符')
    const output = formatSql(text, options)
    if (formatOnly) { self.postMessage({ output, analysis: [], error: '' }); return }
    try { self.postMessage({ output, analysis: analyzeSql(text), error: '' }) }
    catch (error) { self.postMessage({ output, analysis: [], error: error instanceof Error ? error.message : '分析失败' }) }
  } catch (error) { self.postMessage({ output: '', analysis: [], error: error instanceof Error ? error.message : '格式化失败' }) }
}
