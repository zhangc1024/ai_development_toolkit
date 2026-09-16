import { describe, expect, it } from 'vitest'
import { MAX_BYTES, processJson } from '../src/tools/json/core'
describe('严格 JSON 与无损转换', () => {
  it('格式化嵌套对象并保留大整数、小数、指数、转义与键顺序', () => {
    const source = '{"z":9223372036854775807,"a":1.2300,"b":1e+300,"s":"\\u4e2d","n":-0}'
    const formatted = processJson(source, 'format')
    expect(formatted.ok).toBe(true)
    expect(formatted.output).toContain('  "z": 9223372036854775807')
    expect(processJson(formatted.output!, 'minify').output).toBe(source)
  })
  it('只去除字符串外空白', () => {
    expect(processJson(' { "s" : "a b \\n \\"q\\"", "items": [true, null] } ', 'minify').output).toBe('{"s":"a b \\n \\"q\\"","items":[true,null]}')
  })
  it.each(['null', 'true', 'false', '123', '"中文😀"', '[]', '{}'])('接受顶层值 %s', text => {
    expect(processJson(text, 'validate').ok).toBe(true)
  })
  it.each(['', ' ', "{'a':1}", '{"a":1,}', '[1,]', '{"a":/*x*/1}', '{"a":undefined}', '{"a":NaN}', '{"a":Infinity}', '01', '+1', '.5', '{}{}', '"bad\nline"', '{"a":1 "b":2}'])('拒绝非法输入 %s', text => {
    expect(processJson(text, 'validate').ok).toBe(false)
    expect(processJson(text, 'format').output).toBeUndefined()
    expect(processJson(text, 'minify').output).toBeUndefined()
  })
  it('定位错误到行列（包含 CRLF）', () => {
    const result = processJson('{\r\n  "a": }', 'validate')
    expect(result).toMatchObject({ok:false,line:2,column:8,offset:10})
  })
  it('4 空格和 Tab 缩进', () => {
    expect(processJson('{"a":1}', 'format', '4').output).toBe('{\n    "a": 1\n}')
    expect(processJson('{"a":1}', 'format', 'tab').output).toBe('{\n\t"a": 1\n}')
  })
  it('重复键保持原文', () => {
    expect(processJson('{"a":1, "a":2}', 'minify').output).toBe('{"a":1,"a":2}')
  })
  it('校验不生成转换结果', () => {
    expect(processJson('{"a":1}', 'validate')).toMatchObject({ok:true,rootType:'object'})
    expect(processJson('{"a":1}', 'validate').output).toBeUndefined()
  })
  it('拒绝超过字节或深度上限的输入', () => {
    expect(processJson('"' + '中'.repeat(MAX_BYTES / 3) + '"', 'validate').ok).toBe(false)
    expect(processJson('['.repeat(129) + '0' + ']'.repeat(129), 'validate').ok).toBe(false)
    expect(processJson('['.repeat(128) + '0' + ']'.repeat(128), 'validate').ok).toBe(true)
  })
})
