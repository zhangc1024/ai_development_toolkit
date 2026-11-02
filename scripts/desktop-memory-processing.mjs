import {_electron}from'playwright-core'
import{resolve}from'node:path'
import{writeFile,readFile}from'node:fs/promises'
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),args:['--user-data-dir='+resolve('output/desktop-followup/leak-profile-'+(process.env.NO_DOM_FILE_CHOOSER?'event':'path'))],env,timeout:60000})
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
 for(let i=0;i<10;i++)for(const name of names) {
  await page.getByRole('navigation').getByRole('link',{name,exact:true}).click()
  await page.locator('input[type=file]').first().waitFor({state:'attached'})
 }
 result.afterNavigation=await read()
 await session.send('HeapProfiler.collectGarbage');result.afterGc=await read()
 await session.send('Runtime.discardConsoleEntries');await session.send('HeapProfiler.collectGarbage')
 result.afterConsoleClear=await read()
 const input=resolve('output/desktop-p0/samples/色块 中文.png')
 const b64=(await readFile(input)).toString('base64')
 async function choose(locator) {
  if (!process.env.NO_DOM_FILE_CHOOSER) return locator.setInputFiles(input)
  return locator.evaluate((element,b64) => {
    const transfer=new DataTransfer()
    transfer.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'fixture.png',{type:'image/png'}))
    element.files=transfer.files
    element.dispatchEvent(new Event('change',{bubbles:true}))
  },b64)
 }
 for(let cycle=0;cycle<20;cycle++) {
  await page.getByRole('navigation').getByRole('link',{name:'图片压缩 / 格式转换',exact:true}).click()
  await choose(page.locator('input[type=file]').first())
  await page.getByRole('heading',{name:'原图预览',exact:true}).waitFor()
  await page.getByRole('button',{name:'开始处理',exact:true}).click()
  await page.getByRole('button',{name:/下载(原文件|结果)$/}).waitFor()
  await page.getByRole('navigation').getByRole('link',{name:'图片加水印',exact:true}).click()
  await choose(page.getByLabel('选择水印图片'))
  await page.getByRole('button',{name:'生成图片',exact:true}).click()
  while(!await page.getByRole('button',{name:'下载图片',exact:true}).isEnabled())await page.waitForTimeout(20)
  await page.getByRole('navigation').getByRole('link',{name:'一图切九格',exact:true}).click()
  await choose(page.getByLabel('选择照片文件'))
  await page.getByRole('button',{name:'生成 9 张图片',exact:true}).click()
  await page.getByRole('button',{name:'下载 01',exact:true}).waitFor()
 }
 await page.getByRole('navigation').getByRole('link',{name:'首页',exact:true}).click()
 await page.waitForTimeout(1000)
 result.afterProcessing=await read()
 await session.send('HeapProfiler.collectGarbage');result.processAfterGc=await read()
 await session.send('Runtime.discardConsoleEntries');await session.send('HeapProfiler.collectGarbage')
 result.processAfterConsoleClear=await read()
 result.console=logs
 await session.detach()
}catch(error){result.error=error.stack;process.exitCode=1}
finally{await app.close();await writeFile('output/desktop-followup/leak-processing-'+(process.env.NO_DOM_FILE_CHOOSER?'event':'path')+'.json',JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
