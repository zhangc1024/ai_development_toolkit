import { compareJson } from './core'
self.onmessage=({data})=>{try{self.postMessage({result:compareJson(data.left,data.right)})}catch(e){self.postMessage({error:e instanceof Error?e.message:'比较失败'})}}
