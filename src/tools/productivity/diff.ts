import { diffChars, diffLines } from 'diff'
export function compareText(left:string,right:string,mode:'lines'|'chars',trim:boolean){
 const max=mode==='chars'?20000:200000
 if(left.length>max||right.length>max)throw Error('当前模式每侧最多 '+max+' 个 UTF-16 字符')
 const normalize=(text:string)=>{const s=text.replace(/\r\n?/g,'\n');return trim?s.split('\n').map(line=>line.trim()).join('\n'):s}
 const a=normalize(left),b=normalize(right)
 const result=mode==='chars'?diffChars(a,b,{timeout:1500}):diffLines(a,b,{timeout:1500})
 if(!result)throw Error('差异过于复杂，已停止；请缩短文本')
 if(result.length>5000)throw Error('差异片段超过 5000，请缩短文本')
 return result.map(x=>({value:x.value,added:!!x.added,removed:!!x.removed,count:x.count??0}))
}
