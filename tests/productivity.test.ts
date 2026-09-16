import { describe,it,expect } from 'vitest'
import { uuids,randomStrings,processLines,type TextOptions } from '../src/tools/productivity/core'
import { compareText } from '../src/tools/productivity/diff'
import { httpStatuses,searchStatuses } from '../src/tools/productivity/http'
describe('UUID v4',()=>{
 it('version and variant from fixed bytes',()=>expect(uuids(1,false,true,b=>b.fill(255))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff'))
 it('compact uppercase',()=>expect(uuids(1,true,false,b=>b.fill(255))).toBe('FFFFFFFFFFFF4FFFBFFFFFFFFFFFFFFF'))
 it('batch length and real random format',()=>{const rows=uuids(1000).split('\n');expect(rows).toHaveLength(1000);expect(rows.every(s=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s))).toBe(true)})
 for(const n of [0,1001,1.5,NaN])it('reject count '+n,()=>expect(()=>uuids(n)).toThrow())
})
describe('random strings',()=>{
 it('reject samples above unbiased threshold',()=>expect(randomStrings(1,1,'abc',b=>{b.fill(0);b[0]=255;b[1]=2})).toBe('c'))
 it('dedupe alphabet',()=>expect(randomStrings(4,1,'aabb',b=>b.fill(1))).toBe('bbbb'))
 it('unicode codepoints',()=>expect(randomStrings(3,2,'😀😁',b=>b.fill(0))).toBe('😀😀😀\n😀😀😀'))
 it('real random range',()=>expect(randomStrings(30,10,'0123456789').split('\n').every(s=>/^[0-9]{30}$/.test(s))).toBe(true))
 for(const a of ['', 'x','ab ','ab\n','a\ud800','a'.repeat(2049)])it('invalid alphabet '+JSON.stringify(a),()=>expect(()=>randomStrings(1,1,a)).toThrow())
 for(const args of [[0,1],[4097,1],[10,0],[1,1001],[101,1000],[1.5,1]])it('invalid range '+args,()=>expect(()=>randomStrings(args[0]!,args[1]!,'ab')).toThrow())
})
describe('line processing',()=>{
 const defaults:TextOptions={trim:false,empty:false,dedupe:false,ignoreCase:false,sort:'none'}
 it('empty',()=>expect(processLines('',defaults)).toEqual({text:'',before:0,after:0,removed:0}))
 it('normalize CRLF and CR preserving trailing empty',()=>expect(processLines('a\r\nb\r',defaults)).toEqual({text:'a\nb\n',before:3,after:3,removed:0}))
 it('pipeline and first appearance',()=>expect(processLines(' A \na\n \nB\n',{trim:true,empty:true,dedupe:true,ignoreCase:true,sort:'none'})).toEqual({text:'A\nB',before:5,after:2,removed:3}))
 it('case sensitive',()=>expect(processLines('a\nA\na',{...defaults,dedupe:true}).text).toBe('a\nA'))
 it('ordinal sort not numeric',()=>expect(processLines('2\n10\n1',{...defaults,sort:'asc'}).text).toBe('1\n10\n2'))
 it('stable case-insensitive sort',()=>expect(processLines('b\nA\na\nB',{...defaults,sort:'desc',ignoreCase:true}).text).toBe('b\nB\nA\na'))
 it('size limit',()=>expect(()=>processLines('a'.repeat(200001),defaults)).toThrow())
})
describe('diff',()=>{
 it('reconstruct both sides',()=>{const a='one\ntwo\n',b='one\nthree';const parts=compareText(a,b,'lines',false);expect(parts.filter(x=>!x.added).map(x=>x.value).join('')).toBe(a);expect(parts.filter(x=>!x.removed).map(x=>x.value).join('')).toBe(b)})
 it('same after newline normalization',()=>expect(compareText('a\r\nb\r','a\nb\n','lines',false).some(p=>p.added||p.removed)).toBe(false))
 it('ignore line edges only',()=>{expect(compareText(' a \n','a\n','lines',true).some(p=>p.added||p.removed)).toBe(false);expect(compareText('a b','ab','chars',true).some(p=>p.added||p.removed)).toBe(true)})
 it('trailing newline meaningful',()=>expect(compareText('a','a\n','lines',false).some(p=>p.added||p.removed)).toBe(true))
 it('unicode character count',()=>expect(compareText('','😀','chars',false)[0]!.count).toBe(1))
 it('empty sides',()=>expect(compareText('','','lines',false)).toEqual([]))
 it('character cap',()=>expect(()=>compareText('x'.repeat(20001),'','chars',false)).toThrow())
 it('line cap',()=>expect(()=>compareText('x'.repeat(200001),'','lines',false)).toThrow())
})
describe('HTTP reference',()=>{
 it('unique numeric ascending codes',()=>{const codes=httpStatuses.map(s=>s.code);expect(new Set(codes).size).toBe(codes.length);expect(codes).toEqual([...codes].sort((a,b)=>a-b))})
 it('English case insensitive',()=>expect(searchStatuses('unauthorized','')[0]!.code).toBe(401))
 it('Chinese and category',()=>expect(searchStatuses('限流','4').map(r=>r.code)).toEqual([429]))
 it('category excludes',()=>expect(searchStatuses('404','5')).toEqual([]))
 it('unknown not mislabeled',()=>expect(searchStatuses('599','')).toEqual([]))
 it('temporary and historical status',()=>{expect(searchStatuses('104','')[0]!.hint).toContain('2026-11-13');expect(searchStatuses('418','')[0]!.meaning).toContain('未使用');expect(searchStatuses('510','')[0]!.meaning).toContain('废弃')})
})
