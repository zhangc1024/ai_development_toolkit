import { parseTree, type Node } from 'jsonc-parser'
import { processJson } from '../json/core'
export interface Range {from:number;to:number}
export interface Difference {path:string;kind:'missing-left'|'missing-right'|'type'|'value';left?:Range;right?:Range;leftAnchor:Range;rightAnchor:Range;leftText:string;rightText:string}
function range(n:Node):Range{return {from:n.offset,to:n.offset+n.length}}
function numberKey(raw:string){
 const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw)!
 let digits=(m[2]!+(m[3]??'')).replace(/^0+/,'')
 if(!digits)return '0'
 const exponent=m[4]??'0'
 if(exponent.replace(/^[+-]/,'').length>1000)throw Error('数字指数超过 1000 位，无法比较')
 const trailing=digits.length-digits.replace(/0+$/,'').length
 digits=digits.slice(0,digits.length-trailing)
 return m[1]+digits+'e'+(BigInt(exponent)-BigInt((m[3]??'').length)+BigInt(trailing)).toString()
}
function tree(text:string,side:string){
 const validated=processJson(text,'validate')
 if(!validated.ok)throw Error(side+'：'+validated.message+'（第 '+validated.line+' 行，第 '+validated.column+' 列）')
 const root=parseTree(text)!
 const visit=(n:Node)=>{
  if(n.type==='object'){const keys=new Set<string>();for(const p of n.children??[]){const key=p.children![0]!.value as string;if(keys.has(key))throw Error(side+'：重复字段 '+JSON.stringify(key)+'（位置 '+p.offset+'），请先消除歧义');keys.add(key)}}
  for(const child of n.children??[])visit(child)
 }
 visit(root);return root
}
export function compareJson(left:string,right:string){
 const a=tree(left,'左侧'),b=tree(right,'右侧'),diffs:Difference[]=[]
 const snippet=(n:Node|undefined,text:string)=>n?text.slice(n.offset,n.offset+Math.min(n.length,160))+(n.length>160?'…':''):'不存在'
 function add(path:string,kind:Difference['kind'],l:Node|undefined,r:Node|undefined,la:Node,ra:Node){
  if(diffs.length>=2000)throw Error('差异超过 2000 项，请缩小输入范围')
  diffs.push({path,kind,left:l?range(l):undefined,right:r?range(r):undefined,leftAnchor:range(la),rightAnchor:range(ra),leftText:snippet(l,left),rightText:snippet(r,right)})
 }
 function compare(l:Node,r:Node,path:string){
  if(l.type!==r.type){add(path,'type',l,r,l,r);return}
  if(l.type==='object'){
   const lm=new Map((l.children??[]).map(p=>[p.children![0]!.value as string,p]))
   const rm=new Map((r.children??[]).map(p=>[p.children![0]!.value as string,p]))
   for(const [key,p] of lm){const q=rm.get(key);const child=path+'['+JSON.stringify(key)+']';if(q)compare(p.children![1]!,q.children![1]!,child);else add(child,'missing-right',p,undefined,p,r)}
   for(const [key,q] of rm)if(!lm.has(key))add(path+'['+JSON.stringify(key)+']','missing-left',undefined,q,l,q)
  }else if(l.type==='array'){
   const ll=l.children??[],rr=r.children??[]
   for(let i=0;i<Math.max(ll.length,rr.length);i++){const x=ll[i],y=rr[i];if(x&&y)compare(x,y,path+'['+i+']');else add(path+'['+i+']',x?'missing-right':'missing-left',x,y,x??l,y??r)}
  }else{
   const equal=l.type==='number'?numberKey(left.slice(l.offset,l.offset+l.length))===numberKey(right.slice(r.offset,r.offset+r.length)):l.value===r.value
   if(!equal)add(path,'value',l,r,l,r)
  }
 }
 compare(a,b,'$');return diffs
}
