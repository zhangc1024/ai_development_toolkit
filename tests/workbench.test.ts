import { describe, it, expect } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import { hashText, signHmac, type Algorithm } from '../src/tools/security/crypto'
import { inputBytes, toBase64 } from '../src/tools/security/bytes'
import { parseJwt } from '../src/tools/security/jwt'
import { fromDate, fromTimestamp } from '../src/tools/timestamp/core'
import { formatSql } from '../src/tools/sql/core'
const pairs = [['MD5','md5'],['SHA-1','sha1'],['SHA-256','sha256'],['SHA-512','sha512']] as const
describe('哈希与 HMAC 独立实现对照', () => {
  it.each(pairs)('%s 摘要符合 Node crypto', (algorithm, native) => {
    for (const text of ['', 'abc', '中文😀\r\n', '\ufeff test ']) expect(hashText(text,{algorithm,inputEncoding:'utf8',outputEncoding:'hex'})).toBe(createHash(native).update(text,'utf8').digest('hex'))
  })
  it.each(pairs)('%s HMAC 短/长密钥符合 Node crypto', (algorithm,native) => {
    for (const key of ['key','密钥😀','x'.repeat(200)]) expect(signHmac('中文 message\n',{algorithm,inputEncoding:'utf8',outputEncoding:'base64',key,keyEncoding:'utf8',allowEmptyKey:false})).toBe(createHmac(native,key).update('中文 message\n').digest('base64'))
  })
  it('MD5 与 HMAC-SHA256 已知向量',()=>{
    expect(hashText('abc',{algorithm:'MD5',inputEncoding:'utf8',outputEncoding:'hex'})).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(signHmac('The quick brown fox jumps over the lazy dog',{algorithm:'SHA-256',inputEncoding:'utf8',outputEncoding:'hex',key:'key',keyEncoding:'utf8',allowEmptyKey:false})).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  })
  it('Hex/Base64 按二进制计算',()=>{
    const options={algorithm:'SHA-256' as Algorithm,outputEncoding:'HEX' as const}
    const expected=createHash('sha256').update(Buffer.from([0,255])).digest('hex').toUpperCase()
    expect(hashText('00ff',{...options,inputEncoding:'hex'})).toBe(expected)
    expect(hashText('AP8=',{...options,inputEncoding:'base64'})).toBe(expected)
    expect(signHmac('00ff',{...options,inputEncoding:'hex',key:'/w==',keyEncoding:'base64',allowEmptyKey:false})).toBe(createHmac('sha256',Buffer.from([255])).update(Buffer.from([0,255])).digest('hex').toUpperCase())
  })
  it('空密钥必须显式允许',()=>{
    const options={algorithm:'SHA-256' as const,inputEncoding:'utf8' as const,outputEncoding:'hex' as const,key:'',keyEncoding:'utf8' as const,allowEmptyKey:false}
    expect(()=>signHmac('',options)).toThrow('空密钥')
    expect(signHmac('',{...options,allowEmptyKey:true})).toBe(createHmac('sha256','').digest('hex'))
  })
  it.each(['f','0xff','ff ff','zz'])('拒绝非法 Hex %s',text=>expect(()=>inputBytes(text,'hex')).toThrow())
  it.each(['Zh==','Zg=',' Zg==','_w=='])('拒绝非法 Base64 %s',text=>expect(()=>inputBytes(text,'base64')).toThrow())
  it('拒绝代理项和超大输入/密钥',()=>{
    expect(()=>inputBytes('\ud800','utf8')).toThrow()
    expect(()=>hashText('a'.repeat(1048577),{algorithm:'MD5',inputEncoding:'utf8',outputEncoding:'hex'})).toThrow()
    expect(()=>signHmac('a',{algorithm:'SHA-256',inputEncoding:'utf8',outputEncoding:'hex',key:'a'.repeat(65537),keyEncoding:'utf8',allowEmptyKey:false})).toThrow()
  })
})
const enc=(text:string)=>toBase64(new TextEncoder().encode(text)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const token=(header:string,payload:string,signature='')=>enc(header)+'.'+enc(payload)+'.'+signature
describe('JWT 仅解析',()=>{
  it('保留大整数、解析 Bearer 前缀和时间边界',()=>{
    const result=parseJwt('Bearer '+token('{"alg":"none"}','{"order":9223372036854775807,"iat":50,"nbf":101,"exp":100}'),100000)
    expect(result.payload).toContain('9223372036854775807')
    expect(result.times.find(t=>t.claim==='exp')?.note).toContain('已过期')
    expect(result.times.find(t=>t.claim==='nbf')?.note).toContain('尚未生效')
    expect(result.warnings[0]).toContain('未验签')
  })
  it('签名仅展示，缺少到期时间有提示',()=>{
    expect(parseJwt(token('{"alg":"HS256"}','{"sub":"x"}','c2ln')).signature).toBe('c2ln')
    expect(parseJwt(token('{"alg":"HS256"}','{}','c2ln')).warnings.some(w=>w.includes('未提供 exp'))).toBe(true)
  })
  it('非法 NumericDate 字符串及过大数有提示',()=>{
    const result=parseJwt(token('{"alg":"none"}','{"exp":"100","iat":1e100}'))
    expect(result.times.every(t=>t.utc==='无法转换')).toBe(true)
  })
  it.each([
    token('{"alg":"none"}','[]'), token('{"alg":"none","alg":"HS256"}','{}'),
    token('{"alg":"none"}','{"exp":1,"\\u0065xp":2}'), token('{"alg":"HS256"}','{}'),
    token('{"alg":"none"}','{}','c2ln'), token('{"alg":"HS256","b64":false}','{}','c2ln'),
    'a.b.c.d.e','a.b','!!!!.e30.','e30=.e30.', token('{"alg":"none"}','{"a":1,}'),
  ])('拒绝非法或不支持的格式',value=>expect(()=>parseJwt(value)).toThrow())
})
describe('时间戳与时区',()=>{
  it('Unix 0、上海与负毫秒',()=>{
    expect(fromTimestamp('0','seconds','Asia/Shanghai')).toMatchObject({milliseconds:'0',zoned:'1970-01-01 08:00:00.000',offset:'+08:00'})
    expect(fromTimestamp('-0.001','seconds','UTC')).toMatchObject({milliseconds:'-1',seconds:'-0.001',zoned:'1969-12-31 23:59:59.999'})
    expect(fromTimestamp('1.001','seconds','UTC').milliseconds).toBe('1001')
  })
  it('日期按时区解释，显式偏移优先',()=>{
    expect(fromDate('1970-01-01 08:00:00','Asia/Shanghai').milliseconds).toBe('0')
    expect(fromDate('1970-01-01T08:00:00+08:00','America/New_York').milliseconds).toBe('0')
    expect(fromDate('2000-02-29 12:30:00.123Z','UTC').zoned).toBe('2000-02-29 12:30:00.123')
  })
  it('毫秒级正负时间戳往返',()=>{
    for (const ms of ['-1','-1001','0','1234567890123','1767225600123']) {
      const converted=fromTimestamp(ms,'milliseconds','Asia/Shanghai')
      expect(fromDate(converted.zoned,'Asia/Shanghai').milliseconds).toBe(ms)
    }
  })
  it('夏令时跳过与歧义拒绝，明确偏移可转换',()=>{
    expect(()=>fromDate('2026-03-08 02:30:00','America/New_York')).toThrow('夏令时')
    expect(()=>fromDate('2026-11-01 01:30:00','America/New_York')).toThrow('两个')
    const first=fromDate('2026-11-01 01:30:00-04:00','America/New_York')
    const second=fromDate('2026-11-01 01:30:00-05:00','America/New_York')
    expect(Number(second.milliseconds)-Number(first.milliseconds)).toBe(3600000)
  })
  it.each(['2026-02-30 00:00:00','2025-02-29 00:00:00','2026-01-01 24:00:00','2026-01-01 00:00:60','2026-01-01','0000-01-01 00:00:00','2026-01-01 00:00:00+99:99'])('拒绝非法日期 %s',value=>expect(()=>fromDate(value,'UTC')).toThrow())
  it.each(['','1e3','NaN','1.0001','9999999999999999999999999'])('拒绝非法秒时间戳 %s',value=>expect(()=>fromTimestamp(value,'seconds','UTC')).toThrow())
  it('拒绝小数毫秒和无效时区',()=>{
    expect(()=>fromTimestamp('1.5','milliseconds','UTC')).toThrow()
    expect(()=>fromTimestamp('0','seconds','No/SuchZone')).toThrow()
  })
})
describe('MySQL 格式化',()=>{
  it('保留字面量、注释、标识符与占位符',()=>{
    const tick=String.fromCharCode(96)
    const source="select 'Keep Me' as label, id from users where id = ?; -- keep this\nselect "+tick+"name"+tick+" from users;"
    const result=formatSql(source,{indent:'2',keywordCase:'upper'})
    expect(result).toContain("'Keep Me'")
    expect(result).toContain('-- keep this')
    expect(result).toContain('?')
    expect(result).toContain(tick+'name'+tick)
    expect(result).toContain('SELECT')
    expect(result.split('\n').length).toBeGreaterThan(4)
  })
  it('关键字大小写和缩进',()=>{
    expect(formatSql('select a,b from t',{indent:'4',keywordCase:'lower'})).toContain('\n    a,')
    expect(formatSql('SELECT a FROM t',{indent:'tab',keywordCase:'preserve'})).toContain('\t')
    expect(formatSql('select a FROM t',{indent:'2',keywordCase:'preserve'})).toContain('select')
  })
  it('拒绝空输入、未闭合字面量与超大文本',()=>{
    expect(()=>formatSql('',{indent:'2',keywordCase:'upper'})).toThrow()
    expect(()=>formatSql("select 'oops",{indent:'2',keywordCase:'upper'})).toThrow()
    expect(()=>formatSql('a'.repeat(1048577),{indent:'2',keywordCase:'upper'})).toThrow()
  })
})
