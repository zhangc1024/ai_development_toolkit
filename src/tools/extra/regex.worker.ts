import { regexMatches } from './core'
self.onmessage=({data})=>{try{self.postMessage({result:regexMatches(data.pattern,data.flags,data.input)})}catch(e){self.postMessage({error:e instanceof Error?e.message:'测试失败'})}}
