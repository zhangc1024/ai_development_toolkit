import jsQR from 'jsqr'
self.onmessage=({data})=>{
 try{
  const result=jsQR(data.pixels,data.width,data.height,{inversionAttempts:'attemptBoth'})
  self.postMessage(result?{result:{text:result.data,bytes:result.binaryData,version:result.version}}:{error:'未识别到二维码，请使用清晰、完整的二维码图片或裁剪后重试'})
 }catch{self.postMessage({error:'二维码识别失败，请换一张图片重试'})}
}
