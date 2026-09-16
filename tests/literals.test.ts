import { it,expect,describe } from 'vitest'
import { convertLiteral as convert,type Format } from '../src/tools/literals/core'
describe('literal conversion',()=>{
 const source='{"id":9223372036854775807,"decimal":1.2300e+20,"text":"中文 😀 $user","list":[true,false,null,{"x":1}]}'
 for(const target of ['php','python'] as Format[])it('JSON roundtrip '+target,()=>{const out=convert(source,'json',target).output;expect(out).toContain('9223372036854775807');const back=convert(out,target,'json').output;expect(back).toContain('1.2300e+20');expect(JSON.parse(back)).toEqual(JSON.parse(source))})
 it('PHP long arrays and implicit index',()=>expect(JSON.parse(convert('array(0 => "a", "b",);','php','json').output)).toEqual(['a','b']))
 it('PHP sparse map',()=>expect(JSON.parse(convert('[2 => "x", "y"]','php','json').output)).toEqual({'2':'x','3':'y'}))
 it('PHP 8.3 negative index',()=>expect(JSON.parse(convert('[-2 => "x", "y"]','php','json').output)).toEqual({'-2':'x','-1':'y'}))
 it('empty PHP list default',()=>expect(convert('[]','php','json').output).toBe('[]'))
 it('empty PHP map option',()=>expect(convert('array()','php','python',{indent:'2',emptyPhp:'map'}).output).toBe('{}'))
 it('Python integer keys',()=>expect(JSON.parse(convert("{12: 'hello', 'flag': True, 'none': None,}",'python','json').output)).toEqual({'12':'hello',flag:true,none:null}))
 it('Python list to PHP',()=>expect(convert("[False, None, {'x': 1}]",'python','php').output).toContain('"x" => 1'))
 it('Python unicode escapes',()=>expect(JSON.parse(convert(String.raw`"\U0001F600\x41"`,'python','json').output)).toBe('😀A'))
 it('PHP unicode escapes',()=>expect(JSON.parse(convert(String.raw`"\u{1F600}\x41"`,'php','json').output)).toBe('😀A'))
 it('PHP single quote backslash preserved',()=>expect(JSON.parse(convert(String.raw`'a\nb'`,'php','json').output)).toBe(String.raw`a\nb`))
 it('prototype keys preserved',()=>expect(convert('{"__proto__":1,"constructor":2}','json','python').output).toContain('"__proto__": 1'))
 it('indent',()=>expect(convert('[1]','json','python',{indent:'tab',emptyPhp:'list'}).output).toBe('[\n\t1\n]'))
 for(const [format,bad] of [
 ['json','{"a":1,"a":2}'],['json',"{'a':1}"],['json','[1,]'],['json','01'],['json','NaN'],['json','true false'],
 ['php','["0"=>1,0=>2]'],['php','[true=>1]'],['php','[$x]'],['php','system("id")'],['php','<?php return [];'],['php','[1+2]'],['php',String.raw`"\xFF"`],['php','"$x"'],['php','[9223372036854775807=>1,2]'],
 ['python',"{1: 'a', '1': 'b'}"],['python','(1,2)'],['python','{1,2}'],['python','dict(a=1)'],['python','[x for x in y]'],['python','float("inf")'],['python',String.raw`"\uD800"`],['python',"{True: 1}"],
 ] as [Format,string][])it('reject '+format+' '+bad,()=>expect(()=>convert(bad,format,'json')).toThrow())
 it('depth guard',()=>expect(()=>convert('['.repeat(130)+'0'+']'.repeat(130),'json','php')).toThrow('128'))
 it('size guard',()=>expect(()=>convert('"'+ 'a'.repeat(1024*1024)+'"','json','php')).toThrow('1 MiB'))
 it('line and column error',()=>expect(()=>convert('[\n x]','python','json')).toThrow('第 2 行'))
})
