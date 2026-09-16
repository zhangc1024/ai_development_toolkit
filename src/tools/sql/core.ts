import { format } from 'sql-formatter'
import { checkSize } from '../security/bytes'
export interface SqlOptions { indent: '2' | '4' | 'tab'; keywordCase: 'upper' | 'lower' | 'preserve' }
export function formatSql(text: string, options: SqlOptions): string {
  checkSize(text)
  if (!text.trim()) throw new Error('请先输入 SQL')
  if (!['2', '4', 'tab'].includes(options.indent) || !['upper', 'lower', 'preserve'].includes(options.keywordCase)) throw new Error('不支持的格式化选项')
  try {
    return format(text, {
      language: 'mysql',
      tabWidth: options.indent === '4' ? 4 : 2,
      useTabs: options.indent === 'tab',
      keywordCase: options.keywordCase,
      linesBetweenQueries: 2,
    })
  } catch { throw new Error('SQL 格式化失败：请检查引号、注释是否闭合，以及语法是否受 MySQL 格式化器支持') }
}
