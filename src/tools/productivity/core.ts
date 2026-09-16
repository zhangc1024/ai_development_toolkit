export type RandomSource = (bytes: Uint8Array) => void
const secure:RandomSource = bytes => {
 if(!globalThis.crypto?.getRandomValues)throw Error('当前环境没有安全随机源')
 globalThis.crypto.getRandomValues(bytes)
}
function integer(n:number,min:number,max:number,label:string){if(!Number.isInteger(n)||n<min||n>max)throw Error(label+'必须为 '+min+'–'+max+' 的整数')}
export function uuids(count:number,upper=false,hyphens=true,fill:RandomSource=secure){
 integer(count,1,1000,'数量')
 return Array.from({length:count},()=>{
  const b=new Uint8Array(16);fill(b);b[6]=(b[6]!&15)|64;b[8]=(b[8]!&63)|128
  const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')
  const value=hyphens?s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20):s
  return upper?value.toUpperCase():value
 }).join('\n')
}
export function randomStrings(length:number,count:number,alphabet:string,fill:RandomSource=secure){
 integer(length,1,4096,'长度');integer(count,1,1000,'数量')
 if(length*count>100000)throw Error('总生成长度不能超过 100,000 个字符')
 if(alphabet.length>2048)throw Error('字符集合输入过长')
 // Array.from 按 Unicode 码点处理，重复字符去重，避免重复字母加权。
 const chars=[...new Set(Array.from(alphabet))]
 if(chars.length<2||chars.length>256||chars.some(c=>/[\s\p{Cc}\p{Cs}]/u.test(c)))throw Error('字符集合需含 2–256 个不同字符，不含空白、控制字符或孤立代理项')
 const limit=256-256%chars.length;const bytes=new Uint8Array(1024);let p=bytes.length,attempts=0
 return Array.from({length:count},()=>Array.from({length},()=>{
  while(true){
   if(p===bytes.length){fill(bytes);p=0}
   const n=bytes[p++]!;if(++attempts>2000000)throw Error('随机源异常，请重试')
   if(n<limit)return chars[n%chars.length]!
  }
 }).join('')).join('\n')
}
export interface TextOptions {trim:boolean;empty:boolean;dedupe:boolean;ignoreCase:boolean;sort:'none'|'asc'|'desc'}
export function processLines(input:string,options:TextOptions){
 if(input.length>200000)throw Error('文本上限 200,000 个 UTF-16 字符')
 if(!input)return {text:'',before:0,after:0,removed:0}
 let lines=input.replace(/\r\n?/g,'\n').split('\n');const before=lines.length
 if(options.trim)lines=lines.map(s=>s.trim())
 if(options.empty)lines=lines.filter(s=>s.trim()!=='')
 if(options.dedupe){const seen=new Set<string>();lines=lines.filter(s=>{const key=options.ignoreCase?s.toLowerCase():s;if(seen.has(key))return false;seen.add(key);return true})}
 if(options.sort!=='none')lines.sort((a,b)=>{const aa=options.ignoreCase?a.toLowerCase():a,bb=options.ignoreCase?b.toLowerCase():b;const n=aa<bb?-1:aa>bb?1:0;return options.sort==='asc'?n:-n})
 return {text:lines.join('\n'),before,after:lines.length,removed:before-lines.length}
}
