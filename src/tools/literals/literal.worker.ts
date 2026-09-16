import { convertLiteral } from './core'
self.onmessage=({data})=>{try{self.postMessage({result:convertLiteral(data.input,data.source,data.target,data.settings)})}catch(e){self.postMessage({error:e instanceof Error?e.message:'转换失败'})}}
