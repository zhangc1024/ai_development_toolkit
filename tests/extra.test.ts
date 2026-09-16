import { describe,it,expect } from 'vitest'
import { base32,totp,parseOtp,regexMatches } from '../src/tools/extra/core'
import QRCode from 'qrcode'
const encode=(s:string)=>{let n=0,bits=0,out='';for(const c of new TextEncoder().encode(s)){n=(n<<8)|c;bits+=8;while(bits>=5){bits-=5;out+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(n>>>bits)&31]}}if(bits)out+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(n<<(5-bits))&31];return out}
describe('TOTP RFC 6238',()=>{
 const times=[59,1111111109,1111111111,1234567890,2000000000,20000000000]
 const vectors={SHA1:['94287082','07081804','14050471','89005924','69279037','65353130'],SHA256:['46119246','68084774','67062674','91819424','90698825','77737706'],SHA512:['90693936','25091201','99943326','93441116','38618901','47863826']}
 for(const [alg,values] of Object.entries(vectors))times.forEach((time,i)=>it(alg+' '+time,()=>{const length=alg==='SHA1'?20:alg==='SHA256'?32:64;expect(totp(encode('1234567890'.repeat(7).slice(0,length)),alg,8,30,time)).toBe(values[i])}))
 it('Base32 whitespace, case and padding',()=>expect([...base32(' my====== ')]).toEqual([102]))
 for(const bad of ['','A','MZ','MY=','12345','MY======!'])it('invalid '+bad,()=>expect(()=>base32(bad)).toThrow())
 it('URI import',()=>expect(parseOtp('otpauth://totp/test?secret=MY&digits=8&period=60&algorithm=SHA256')).toEqual({secret:'MY',digits:8,period:60,algorithm:'SHA256'}))
 it('reject HOTP',()=>expect(()=>parseOtp('otpauth://hotp/test?secret=MY')).toThrow())
 it('reject duplicate',()=>expect(()=>parseOtp('otpauth://totp/test?secret=MY&secret=MY')).toThrow())
 it('leading zero and six digits',()=>expect(totp(encode('12345678901234567890'),'SHA1',6,30,1111111109)).toBe('081804'))
})
describe('regex',()=>{
 it('groups and positions',()=>expect(regexMatches('(?<x>a)(b)?','g','a ab').rows).toEqual([{index:0,end:1,text:'a',groups:['a',null],named:{x:'a'}},{index:2,end:4,text:'ab',groups:['a','b'],named:{x:'a'}}]))
 it('non global',()=>expect(regexMatches('a','','aa').rows).toHaveLength(1))
 it('empty unicode advances',()=>expect(regexMatches('','gu','😀').rows.map(r=>r.index)).toEqual([0,2]))
 it('cap',()=>expect(regexMatches('','g','a'.repeat(1001)).truncated).toBe(true))
 it('invalid syntax',()=>expect(()=>regexMatches('[','g','')).toThrow())
 it('invalid flags',()=>expect(()=>regexMatches('','gg','')).toThrow())
 it('size cap',()=>expect(()=>regexMatches('','g','x'.repeat(200001))).toThrow())
})
describe('QR',()=>{
 for(const level of ['L','M','Q','H'] as const)it(level+' Unicode generation',()=>{const qr=QRCode.create('你好 😀\nhttps://example.com',{errorCorrectionLevel:level});expect(qr.modules.size).toBeGreaterThan(20)})
 it('over capacity',()=>expect(()=>QRCode.create('a'.repeat(3000),{errorCorrectionLevel:'H'})).toThrow())
})
