import { hmac } from '@noble/hashes/hmac.js'
import { sha1 } from '@noble/hashes/legacy.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
export function base32(value: string) {
 const s=value.replace(/\s/g,'').toUpperCase()
 if(!s || s.length>4096 || !/^[A-Z2-7]+={0,6}$/.test(s)) throw Error('请输入有效 Base32 密钥（A–Z、2–7）')
 const raw=s.replace(/=+$/,''); const rem=raw.length%8
 if(![0,2,4,5,7].includes(rem) || (s.includes('=') && s.length%8!==0)) throw Error('Base32 长度或填充无效')
 let bits=0,valueBits=0; const out:number[]=[]
 for(const c of raw){valueBits=(valueBits<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);bits+=5;if(bits>=8){bits-=8;out.push((valueBits>>>bits)&255)}}
 if(bits && (valueBits & ((1<<bits)-1)))throw Error('Base32 尾部位必须为零')
 return new Uint8Array(out)
}
export function totp(secret:string, algorithm:string, digits:number, period:number, seconds:number) {
 if(![6,8].includes(digits)||!Number.isInteger(period)||period<1||period>300||!Number.isSafeInteger(seconds)||seconds<0)throw Error('验证码参数无效')
 const hash=algorithm==='SHA1'?sha1:algorithm==='SHA256'?sha256:algorithm==='SHA512'?sha512:null
 if(!hash)throw Error('不支持此算法')
 const key=base32(secret);const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(Math.floor(seconds/period)))
 try{const digest=hmac(hash,key,counter);const offset=digest[digest.length-1]!&15;const n=new DataView(digest.buffer,digest.byteOffset).getUint32(offset)&0x7fffffff;return String(n%10**digits).padStart(digits,'0')}finally{key.fill(0)}
}
export function parseOtp(value:string) {
 const url=new URL(value)
 if(url.protocol!=='otpauth:'||url.hostname!=='totp')throw Error('仅支持 otpauth://totp，不支持 HOTP')
 for(const k of ['secret','algorithm','digits','period'])if(url.searchParams.getAll(k).length>1)throw Error('配置参数重复')
 const secret=url.searchParams.get('secret')||''
 const algorithm=(url.searchParams.get('algorithm')||'SHA1').toUpperCase()
 const digits=Number(url.searchParams.get('digits')||6),period=Number(url.searchParams.get('period')||30)
 totp(secret,algorithm,digits,period,0)
 return {secret,algorithm,digits,period}
}
export function regexMatches(pattern:string, flags:string, input:string) {
 if(pattern.length>10000||input.length>200000)throw Error('表达式上限 10,000 字符，测试文本上限 200,000 字符')
 if(!/^[dgimsuvy]*$/.test(flags))throw Error('仅支持 JavaScript 标志 dgimsuvy')
 const re=new RegExp(pattern,flags);const rows: {index:number;end:number;text:string;groups: (string|null)[];named:Record<string,string>|null}[]=[]
 let m:RegExpExecArray|null
 while((m=re.exec(input))){
  if(rows.length===1000)return {rows,truncated:true}
  rows.push({index:m.index,end:m.index+m[0].length,text:m[0],groups:m.slice(1).map(x=>x??null),named:m.groups??null})
  if(!re.global)break
  if(m[0]===''){const p=re.lastIndex;re.lastIndex=p+((re.unicode||flags.includes('v'))&&(input.codePointAt(p)??0)>65535?2:1)}
 }
 return {rows,truncated:false}
}

export function parseQrOtp(text:string){
 const value=text.trim()
 if(/^otpauth:/i.test(value))return {...parseOtp(value),raw:false}
 if(!/^[A-Za-z2-7=\s]+$/.test(value))throw Error('不是 TOTP 配置或 Base32 密钥')
 base32(value)
 return {secret:value.replace(/\s/g,'').toUpperCase(),algorithm:'SHA1',digits:6,period:30,raw:true}
}
