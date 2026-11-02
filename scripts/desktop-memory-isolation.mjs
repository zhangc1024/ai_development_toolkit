import {_electron}from'playwright-core'
import{resolve}from'node:path'
import{writeFile}from'node:fs/promises'
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),args:['--user-data-dir='+resolve('output/desktop-followup/leak-profile')],env,timeout:60000})
const result={}
try{
 const page=await app.firstWindow();await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false))
 const logs=[];page.on('console',message=>{if(logs.length<20)logs.push({type:message.type(),text:message.text().slice(0,300)})})
 const session=await page.context().newCDPSession(page);await session.send('Performance.enable')
 const names=['图片 ↔ Base64','二维码识别','图片加水印','一图切九格','图片拼接','双重曝光','图片压缩 / 格式转换','照片水印边框']
 for(const name of names){await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();await page.locator('input[type=file]').first().waitFor({state:'attached'})}
 const read=async()=>({metrics:Object.fromEntries((await session.send('Performance.getMetrics')).metrics.filter(m=>['Nodes','JSEventListeners','Documents','JSHeapUsedSize'].includes(m.name)).map(m=>[m.name,m.value])),workingSetKiB:await app.evaluate(({app})=>app.getAppMetrics().reduce((s,m)=>s+m.memory.workingSetSize,0))})
 await session.send('HeapProfiler.collectGarbage');result.baseline=await read()
 await page.evaluate(async names=>{
  for(let i=0;i<100;i++)for(const name of names){
   Array.from(document.querySelectorAll('nav a')).find(e=>e.textContent===name).click()
   await new Promise(resolve=>setTimeout(resolve,75))
  }
 },names)
 result.afterNavigation=await read()
 await session.send('HeapProfiler.collectGarbage');result.afterGc=await read()
 await session.send('Runtime.discardConsoleEntries');await session.send('HeapProfiler.collectGarbage')
 result.afterConsoleClear=await read()
 result.console=logs
 await session.detach()
}catch(error){result.error=error.stack;process.exitCode=1}
finally{await app.close();await writeFile('output/desktop-followup/leak-isolation.json',JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
