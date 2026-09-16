import { applyEdits, createScanner, format, parseTree, printParseErrorCode, type ParseError } from 'jsonc-parser'

export const MAX_BYTES = 1024 * 1024
export const MAX_DEPTH = 128
export type Action = 'format' | 'minify' | 'validate'
export interface Result { ok: boolean; output?: string; message: string; offset?: number; line?: number; column?: number; rootType?: string }
const messages: Record<string, string> = {
  InvalidSymbol: '存在无效符号，请使用标准 JSON 语法',
  InvalidNumberFormat: '数字格式不正确',
  PropertyNameExpected: '对象属性名必须使用双引号',
  ValueExpected: '此处缺少 JSON 值',
  ColonExpected: '属性名后缺少冒号',
  CommaExpected: '成员之间缺少逗号',
  CloseBraceExpected: '缺少右花括号 }',
  CloseBracketExpected: '缺少右方括号 ]',
  EndOfFileExpected: 'JSON 值后存在多余内容',
  InvalidCommentToken: '标准 JSON 不允许注释',
  UnexpectedEndOfComment: '注释没有结束；标准 JSON 不允许注释',
  UnexpectedEndOfString: '字符串缺少结束双引号',
  UnexpectedEndOfNumber: '数字不完整',
  InvalidUnicode: 'Unicode 转义不正确',
  InvalidEscapeCharacter: '字符串包含无效转义',
  InvalidCharacter: '字符串包含未转义的控制字符',
}
function failure(text: string, message: string, offset = 0): Result {
  const lines = text.slice(0, offset).split(/\r\n|\r|\n/)
  return { ok: false, message, offset, line: lines.length, column: lines.at(-1)!.length + 1 }
}
/** 输出来自原始 token；不把解析得到的 JS number 再序列化。 */
export function processJson(text: string, action: Action, indent: '2' | '4' | 'tab' = '2'): Result {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return failure(text, '输入超过 1 MiB，请缩小内容后重试')
  if (!text.trim()) return failure(text, '请先输入 JSON 内容')
  const scanner = createScanner(text, true)
  const tokens: string[] = []
  let depth = 0
  for (scanner.scan(); scanner.getTokenLength() > 0; scanner.scan()) {
    const raw = text.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength())
    if (raw === '{' || raw === '[') depth++
    if (depth > MAX_DEPTH) return failure(text, '嵌套层级超过 128 层', scanner.getTokenOffset())
    if (raw === '}' || raw === ']') depth--
    tokens.push(raw)
  }
  const errors: ParseError[] = []
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false })
  if (errors.length) {
    const error = errors[0]!
    const code = printParseErrorCode(error.error)
    return failure(text, messages[code] ?? 'JSON 语法不正确', error.offset)
  }
  if (!tree) return failure(text, '请先输入 JSON 内容')
  if (action === 'validate') return { ok: true, message: '校验通过，符合标准 JSON 语法', rootType: tree.type }
  const output = action === 'minify'
    ? tokens.join('')
    : applyEdits(text, format(text, undefined, { insertSpaces: indent !== 'tab', tabSize: indent === '4' ? 4 : 2, eol: '\n' })).trim()
  return { ok: true, output, message: action === 'format' ? '格式化完成' : '压缩完成', rootType: tree.type }
}
