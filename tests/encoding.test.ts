import { describe, expect, it } from 'vitest'
import { MAX_ENCODING_BYTES, processEncoding, type EncodingKind } from '../src/tools/encoding/core'
const convert = (kind: EncodingKind, text: string, direction: 'encode' | 'decode', mode: string, ignoreWhitespace = false) => processEncoding(kind, text, direction, {mode, ignoreWhitespace})
describe('编码转换无损往返', () => {
  it.each([
    ['url','component'],['url','uri'],['url','form'],['base64','standard'],['base64','url'],
    ['unicode','non-ascii'],['unicode','all'],['html-entity','special'],['html-entity','ascii'],
  ] as const)('%s / %s 保留中文 emoji 空白和 BOM', (kind, mode) => {
    const input = '\ufeff  中文 😀\n\r\t&<>"\'\\u4e2d\\n +%/?=#  '
    const encoded = convert(kind,input,'encode',mode)
    expect(encoded.ok).toBe(true)
    expect(convert(kind,encoded.output!,'decode',mode)).toMatchObject({ok:true,output:input})
  })
  it.each(['url','base64','unicode','html-entity'] as const)('%s 空文本可转换',kind=>{
    const mode={url:'component',base64:'standard',unicode:'all','html-entity':'special'}[kind]
    expect(convert(kind,'','encode',mode)).toMatchObject({ok:true,output:''})
    expect(convert(kind,'','decode',mode)).toMatchObject({ok:true,output:''})
  })
})
describe('URL 模式',()=>{
  it('参数模式编码分隔符并保留解码的加号',()=>{
    expect(convert('url','a b+c&x=1','encode','component').output).toBe('a%20b%2Bc%26x%3D1')
    expect(convert('url','a+b','decode','component').output).toBe('a+b')
  })
  it('完整 URI 保留分隔符及其已编码形式',()=>{
    expect(convert('url','https://a.test/中文?q=a b','encode','uri').output).toBe('https://a.test/%E4%B8%AD%E6%96%87?q=a%20b')
    expect(convert('url','%2F%3F%23%26','decode','uri').output).toBe('%2F%3F%23%26')
  })
  it('表单值处理加号、空格和额外符号',()=>{
    expect(convert('url',"a b+c!~'()",'encode','form').output).toBe('a+b%2Bc%21%7E%27%28%29')
    expect(convert('url','a+b%2Bc','decode','form').output).toBe('a b+c')
  })
  it('只解码一层',()=>expect(convert('url','%2520','decode','component').output).toBe('%20'))
  it.each(['%', '%2', '%GG', '%FF', '%E4%B8', '%ED%A0%80'])('拒绝 %s',text=>expect(convert('url',text,'decode','component').ok).toBe(false))
})
describe('Base64',()=>{
  it('标准向量与中文',()=>{
    expect(convert('base64','foo','encode','standard').output).toBe('Zm9v')
    expect(convert('base64','中文','encode','standard').output).toBe('5Lit5paH')
    expect(convert('base64','Zg','decode','standard').output).toBe('f')
    expect(convert('base64','Zg==','decode','standard').output).toBe('f')
  })
  it('URL 字母表与无填充',()=>{
    const source='😀?'
    const result=convert('base64',source,'encode','url')
    expect(result.output).toBe('8J-YgD8')
    expect(convert('base64',result.output!,'decode','url').output).toBe(source)
    expect(convert('base64',result.output!,'decode','standard').ok).toBe(false)
  })
  it('仅按选项忽略 ASCII 空白',()=>{
    expect(convert('base64',' Zg==\r\n','decode','standard').ok).toBe(false)
    expect(convert('base64',' Zg==\r\n','decode','standard',true).output).toBe('f')
    expect(convert('base64','\u00a0Zg==','decode','standard',true).ok).toBe(false)
  })
  it.each(['A','Zg=','Zg===','Z=g=','Zg==x','Zh==','Zm9=','!!!!','/w=='])('拒绝错误填充/非 UTF-8 %s',text=>expect(convert('base64',text,'decode','standard').ok).toBe(false))
})
describe('Unicode',()=>{
  it('非 ASCII 模式和全部模式',()=>{
    expect(convert('unicode','A中😀\n\\','encode','non-ascii').output).toBe('A\\u4e2d\\ud83d\\ude00\\u000a\\u005c')
    expect(convert('unicode','A','encode','all').output).toBe('\\u0041')
  })
  it('支持两种语法且只解码一层',()=>{
    expect(convert('unicode','\\u4e2d\\ud83d\\ude00\\u{1f600}','decode','all').output).toBe('中😀😀')
    expect(convert('unicode','\\u005cu4e2d','decode','all').output).toBe('\\u4e2d')
    expect(convert('unicode','\\n\\t\\\\u4e2d','decode','all').output).toBe('\\n\\t\\\\u4e2d')
  })
  it.each(['\\u','\\u123','\\uZZZZ','\\u{110000}','\\u{}','\\u{d800}','\\ud800','\\udc00','\\ud800A','\\u{abc'])('拒绝错误转义 %s',text=>expect(convert('unicode',text,'decode','all').ok).toBe(false))
})
describe('HTML Entity',()=>{
  it('编码五类字符；可选非 ASCII 数字实体',()=>{
    expect(convert('html-entity','<>&"\'中文😀','encode','special').output).toBe('&lt;&gt;&amp;&quot;&#39;中文😀')
    expect(convert('html-entity','中😀','encode','ascii').output).toBe('&#x4E2D;&#x1F600;')
  })
  it('命名/数字实体，未知和缺分号保留，单层解码',()=>{
    expect(convert('html-entity','&copy; &#20013; &#x1F600; &amp;lt; &unknown; &amp','decode','special').output).toBe('© 中 😀 &lt; &unknown; &amp')
  })
  it('非法数字码点遵循 HTML 规则',()=>{
    expect(convert('html-entity','&#0;&#xD800;&#x110000;','decode','special').output).toBe('\ufffd\ufffd\ufffd')
  })
  it('标签作为纯字符串输出',()=>{
    expect(convert('html-entity','&lt;script&gt;alert(1)&lt;/script&gt;','decode','special').output).toBe('<script>alert(1)</script>')
  })
})
describe('资源和 Unicode 输入保护',()=>{
  it('UTF-8 字节容量限制',()=>expect(convert('url','中'.repeat(Math.ceil(MAX_ENCODING_BYTES/3)),'encode','component').ok).toBe(false))
  it('允许最大边界输入',()=>expect(convert('base64','a'.repeat(MAX_ENCODING_BYTES),'encode','standard').ok).toBe(true))
  it.each(['\ud800','\udc00'])('拒绝孤立代理项',value=>expect(convert('base64',value,'encode','standard').ok).toBe(false))
})
