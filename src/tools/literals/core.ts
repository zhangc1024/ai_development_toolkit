export type Format='json'|'php'|'python'
type Value = {type:'number';raw:string}|{type:'string';value:string}|{type:'bool';value:boolean}|{type:'null'}|{type:'list';items:Value[]}|{type:'map';items:[string,Value][]}
export interface Settings {emptyPhp:'list'|'map';indent:'2'|'4'|'tab'}
class Parser{
 p=0
 constructor(private text:string,private format:Format,private emptyPhp:'list'|'map'){}
 fail(message:string):never{const lines=this.text.slice(0,this.p).split(/\r\n|\r|\n/);throw Error(message+'（第 '+lines.length+' 行，第 '+(lines.at(-1)!.length+1)+' 列）')}
 ws(){while(/\s/.test(this.text[this.p]??'')&&this.p<this.text.length){if(this.format==='json'&&!/[ \t\r\n]/.test(this.text[this.p]!))this.fail('JSON 仅允许标准空白');this.p++}}
 take(s:string){this.ws();if(this.text.startsWith(s,this.p)){this.p+=s.length;return true}return false}
 string():string{
  const quote=this.text[this.p++]!;let out=''
  if(this.format==='json'&&quote!=='"')this.fail('JSON 字符串需要双引号')
  while(this.p<this.text.length){
   const c=this.text[this.p++]!
   if(c===quote)return out
   if(c==='\n'||c==='\r'||(c.charCodeAt(0)<32&&this.format==='json'))this.fail('字符串内控制字符需要转义')
   if(c==='$'&&this.format==='php'&&quote==='"')this.fail('PHP 双引号字符串不支持变量插值，请转义 $')
   if(c!=='\\'){out+=c;continue}
   if(this.p>=this.text.length)this.fail('转义未结束')
   const e=this.text[this.p++]!
   if(this.format==='php'&&quote==="'"){out+=(e==="'"||e==='\\')?e:'\\'+e;continue}
   const escapes:Record<string,string>={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','\\':'\\','"':'"'}
   if(this.format!=='json'){escapes["'"]="'";escapes.v='\v';escapes.a='\x07';if(this.format==='php'){delete escapes.b;delete escapes.a;escapes.e='\x1b';escapes.$='$'}}
   if(e in escapes){out+=escapes[e];continue}
   if(e==='/'&&this.format==='json'){out+='/';continue}
   if(e==='u'&&this.format==='php'){
    if(this.text[this.p++]!=='{')this.fail('PHP Unicode 转义需使用 \\u{...}')
    const end=this.text.indexOf('}',this.p);const hex=this.text.slice(this.p,end)
    if(end<0||! /^[0-9a-fA-F]{1,6}$/.test(hex))this.fail('Unicode 转义无效')
    const n=parseInt(hex,16);if(n>0x10ffff||(n>=0xd800&&n<=0xdfff))this.fail('Unicode 码点无效')
    out+=String.fromCodePoint(n);this.p=end+1;continue
   }
   const digits=e==='u'&&this.format!=='php'?4:e==='U'&&this.format==='python'?8:e==='x'&&this.format!=='json'?2:0
   if(digits){const hex=this.text.slice(this.p,this.p+digits);if(!new RegExp('^[0-9a-fA-F]{'+digits+'}$').test(hex))this.fail('转义十六进制位数无效');const n=parseInt(hex,16);if(n>0x10ffff)this.fail('Unicode 码点超出范围');if(this.format==='php'&&e==='x'&&n>=128)this.fail('PHP 非 ASCII 字节转义不支持，请直接输入 UTF-8 字符');if(this.format==='python'&&n>=0xd800&&n<=0xdfff)this.fail('Python 不支持代理项转义，请使用完整 Unicode 码点');out+=String.fromCodePoint(n);this.p+=digits;continue}
   this.fail('不支持的字符串转义：\\'+e)
  }
  return this.fail('字符串缺少结束引号')
 }
 value(depth=0):Value{
  if(depth>128)this.fail('嵌套超过 128 层')
  this.ws();const c=this.text[this.p]
  if(c==='"'||c==="'")return {type:'string',value:this.string()}
  if(c==='['){this.p++;return this.container(']',this.format==='php'?'php':'list',depth)}
  if(c==='{'&&this.format!=='php'){this.p++;return this.container('}','map',depth)}
  if(this.format==='php'&&/^array\s*\(/i.test(this.text.slice(this.p))){const m=/^array\s*\(/i.exec(this.text.slice(this.p))!;this.p+=m[0].length;return this.container(')','php',depth)}
  const words=this.format==='python'?['True','False','None']:['true','false','null']
  for(let i=0;i<words.length;i++){const word=words[i]!;const chunk=this.text.slice(this.p,this.p+word.length);if((this.format==='php'?chunk.toLowerCase():chunk)===word){this.p+=word.length;return i===2?{type:'null'}:{type:'bool',value:i===0}}}
  const match=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.p))
  if(match?.index===0){this.p+=match[0].length;return {type:'number',raw:match[0]}}
  return this.fail('仅支持字符串、十进制数字、布尔、空值、列表及键值映射；不执行代码')
 }
 container(close:string,kind:'list'|'map'|'php',depth:number):Value{
  const list:Value[]=[];const entries:[string,Value][]=[];const seen=new Set<string>();let next=0n;let indexed=false
  this.ws();if(this.take(close))return kind==='list'||(kind==='php'&&this.emptyPhp==='list')?{type:'list',items:[]}:{type:'map',items:[]}
  while(true){
   const first=this.value(depth+1)
   if(kind==='list')list.push(first)
   else{
    let key:string,value:Value
    if(kind==='map'||this.take('=>')){
     if(first.type==='string')key=first.value
     else if(first.type==='number'&&/^-?(?:0|[1-9]\d*)$/.test(first.raw)&&this.format!=='json')key=BigInt(first.raw).toString()
     else this.fail('键仅支持字符串或整数；JSON 键必须是字符串')
     if(kind==='map'&&!this.take(':'))this.fail('键后缺少冒号')
     value=this.value(depth+1)
     if(kind==='php'&&/^(?:0|-?[1-9]\d*)$/.test(key!)){const n=BigInt(key!);if(n<-(1n<<63n)||n>(1n<<63n)-1n){if(first.type==='number')this.fail('PHP 整数键超出 64 位范围')}else{if(!indexed||n>=next)next=n+1n;indexed=true}}
    }else{if(next>(1n<<63n)-1n)this.fail('PHP 隐式索引溢出');key=next.toString();next++;indexed=true;value=first}
    if(seen.has(key!))this.fail('存在重复键或转换后键冲突：'+key!)
    seen.add(key!);entries.push([key!,value!])
   }
   if(this.take(close))break
   if(!this.take(','))this.fail('成员之间缺少逗号或结束符')
   if(this.take(close)){if(this.format==='json')this.fail('JSON 不允许尾逗号');break}
  }
  if(kind==='list')return {type:'list',items:list}
  if(kind==='php'&&entries.every(([key],i)=>key===String(i)))return {type:'list',items:entries.map(([,v])=>v)}
  return {type:'map',items:entries}
 }
 parse(){const value=this.value();this.ws();if(this.format==='php')this.take(';');this.ws();if(this.p!==this.text.length)this.fail('字面量后有额外内容；不支持赋值、注释或程序包装');return value}
}
function quote(value:string,target:Format){
 if(target!=='php')return JSON.stringify(value)
 return '"'+Array.from(value).map(c=>{
  if(c==='$')return '\\$'
  if(c==='"')return '\\"'
  if(c==='\\')return '\\\\'
  const n=c.codePointAt(0)!
  if(n>=0xd800&&n<=0xdfff)throw Error('PHP 输出不支持孤立 Unicode 代理项')
  return n<32||n===127?'\\x'+n.toString(16).padStart(2,'0'):c
 }).join('')+'"'
}
function render(v:Value,target:Format,unit:string,depth=0):string{
 if(v.type==='string')return quote(v.value,target)
 if(v.type==='number')return v.raw
 if(v.type==='null')return target==='python'?'None':'null'
 if(v.type==='bool')return target==='python'?(v.value?'True':'False'):String(v.value)
 const map=v.type==='map',items=map?v.items.map(([k,value])=>quote(k,target)+(target==='php'?' => ':': ')+render(value,target,unit,depth+1)):v.items.map(value=>render(value,target,unit,depth+1))
 const open=map&&target!=='php'?'{':'[',close=map&&target!=='php'?'}':']'
 if(!items.length)return open+close
 return open+'\n'+items.map(s=>unit.repeat(depth+1)+s).join(',\n')+'\n'+unit.repeat(depth)+close
}
export function convertLiteral(input:string,source:Format,target:Format,settings:Settings={emptyPhp:'list',indent:'2'}){
 if(new TextEncoder().encode(input).length>1024*1024)throw Error('输入超过 1 MiB')
 if(!input.trim())throw Error('请先输入数据字面量')
 const value=new Parser(input,source,settings.emptyPhp).parse()
 const warnings:string[]=[]
 if(source==='php'||target==='php')warnings.push('PHP 数组不区分空列表和空映射；数字字符串键可能被 PHP 转为整数键，顺序 0…n 键会按列表读取。按 64 位 PHP 8.3+ 键规则处理。')
 if(source==='python')warnings.push('Python 整数字典键转换为字符串；重复或归一化冲突键会报错。')
 return {output:render(value,target,settings.indent==='tab'?'\t':' '.repeat(Number(settings.indent))),warnings}
}
