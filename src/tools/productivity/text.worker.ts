import { compareText } from './diff'
import { processLines } from './core'
self.onmessage=({data})=>{try{self.postMessage({result:data.kind==='diff'?compareText(data.left,data.right,data.mode,data.trim):processLines(data.input,data.options)})}catch(e){self.postMessage({error:e instanceof Error?e.message:'处理失败'})}}
