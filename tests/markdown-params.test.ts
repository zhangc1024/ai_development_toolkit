import { describe, expect, it } from 'vitest'
import { autoMap, convertTable, parseMarkdown, splitRow } from '../src/tools/markdown-params/core'
function table(text: string) { return parseMarkdown(text).tables[0]! }
function run(text: string, format: 'json' | 'php' | 'javascript' | 'python' = 'json') {
 const t = table(text); return convertTable(t, autoMap(t.headers), format)
}
describe('Markdown 参数转换器', () => {
 it('自动识别任意顺序和额外字段，转换用户示例', () => {
  const result = run('| 说明 | 默认值 | 参数名 | 格式 | 备注 |\n|---|---|---|---|---|\n|页码|1|page|int|从1开始|\n|搜索词|""|keyword|string|-|\n|启用|true|enabled|bool|-|')
  expect(JSON.parse(result.output)).toEqual({page:1,keyword:'',enabled:true})
 })
 it('根据类型生成默认值', () => {
  const result = run('|name|type|\n|---|---|\n|a|integer|\n|b|number|\n|c|text|\n|d|boolean|\n|e|list|\n|f|json|\n|g|null|')
  expect(JSON.parse(result.output)).toEqual({a:0,b:0,c:'',d:false,e:[],f:{},g:null})
 })
 it('推断默认值并保留带引号的字符串', () => {
  const result = run('|field|default|\n|---|---|\n|a|12|\n|b|true|\n|c|null|\n|d|["x"]|\n|e|{"x":1}|\n|f|hello|\n|g|"001"|')
  expect(JSON.parse(result.output)).toEqual({a:12,b:true,c:null,d:['x'],e:{x:1},f:'hello',g:'001'})
 })
 it('空单元格采用类型默认值', () => {
  expect(JSON.parse(run('|key|type|default|\n|---|---|---|\n|page|int||').output)).toEqual({page:0})
 })
 it('支持手动映射未知表头', () => {
  const t = table('|名称|值|\n|---|---|\n|a|false|')
  expect(autoMap(t.headers).key).toBe(-1)
  expect(JSON.parse(convertTable(t,{key:0,type:-1,default:1},'json').output)).toEqual({a:false})
 })
 it('保留管道转义和行内代码，支持 CRLF', () => {
  expect(splitRow('|a|x\\|y|`int|string`|')).toEqual(['a','x|y','`int|string`'])
  expect(JSON.parse(run('|key|type|default|\r\n|:---|---:|:---:|\r\n|`a`|string|x\\|y|').output)).toEqual({a:'x|y'})
 })
 it('识别多表并跳过代码围栏中的伪表格', () => {
  const parsed = parseMarkdown('# Test\n```markdown\n|key|type|\n|---|---|\n|a|int|\n```\n\n|key|type|\n|---|---|\n|b|bool|\n\n|name|default|\n|---|---|\n|c|1|')
  expect(parsed.tables).toHaveLength(2)
  expect(parsed.blocks[0]!.kind).toBe('heading')
 })
 it.each([
  ['|a|int|abc|','默认值'],
  ['|a|integer|1.5|','不匹配'],
  ['|a|date|2026-01-01|','不支持的类型'],
  ['||int|1|','参数名不能为空'],
  ['|a|int|1|\n|a|int|2|','参数名重复'],
  ['|a|int|1|extra|','列数'],
 ])('阻止无效数据：%s', (rows, message) => {
  expect(() => run('|key|type|default|\n|---|---|---|\n' + rows)).toThrow(message)
 })
 it('缺少映射与冲突映射不生成结果', () => {
  const t=table('|a|b|\n|---|---|\n|x|1|')
  expect(() => convertTable(t,{key:-1,type:-1,default:1},'json')).toThrow('Key')
  expect(() => convertTable(t,{key:0,type:-1,default:-1},'json')).toThrow('至少')
  expect(() => convertTable(t,{key:0,type:0,default:1},'json')).toThrow('不同')
 })
 it('生成 PHP/Python 正确字面量并转义特殊字符串', () => {
  const md='|key|default|\n|---|---|\n|enabled|true|\n|missing|null|\n|text|$name|\n|nested|{"items":[false,null]}|'
  expect(run(md,'php').output).toContain('"text" => "\\$name"')
  expect(run(md,'php').output).toContain('"enabled" => true')
  expect(run(md,'python').output).toContain('"enabled": True')
  expect(run(md,'python').output).toContain('False,\n      None')
 })
 it('长整数在 JSON/Python 中保留原文', () => {
  const md='|key|type|default|\n|---|---|---|\n|id|int|9223372036854775807|'
  expect(run(md).output).toContain('9223372036854775807')
  expect(run(md,'python').output).toContain('9223372036854775807')
 })
 it('特殊键按数据处理，JS 对象不改变原型', () => {
  const md='|key|default|\n|---|---|\n|__proto__|{"polluted":true}|\n|constructor|"value"|'
  expect(Object.keys(JSON.parse(run(md).output))).toEqual(['__proto__','constructor'])
  const js = run(md,'javascript').output
  expect(js).toContain('["__proto__"]:')
  expect(js.startsWith('(')).toBe(true)
 })
 it('无效 JSON 和超限输入明确报错', () => {
  expect(() => run('|key|default|\n|---|---|\n|a|[1,]|')).toThrow('JSON')
  expect(() => parseMarkdown('x'.repeat(100001))).toThrow('100,000')
 })
 it('格式化缩进可选', () => {
  const t=table('|key|type|\n|---|---|\n|a|int|')
  expect(convertTable(t,autoMap(t.headers),'json','4').output).toBe('{\n    "a": 0\n}')
 })
})
