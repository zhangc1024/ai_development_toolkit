import { _electron } from 'playwright-core'
import { resolve,join } from 'node:path'
import { mkdir,mkdtemp,stat,readFile,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { ZipReader,Uint8ArrayReader } from '@zip.js/zip.js'
const root=resolve('output/desktop-stress');await mkdir(root,{recursive:true})
const out=await mkdtemp(join(root,'run-'))
const samples=join(root,'samples')
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),args:['--user-data-dir='+join(out,'profile'),'--disable-http-cache','--host-resolver-rules=MAP * ~NOTFOUND','--proxy-server=http://127.0.0.1:9'],env,timeout:60_000})
const duration=Number(process.env.DESKTOP_STRESS_MS??600000)
const result={cases:[],samples:[],peakKiB:0,cycles:0,durationTargetMs:duration}
let page,sampling=false,overBudget=false
async function checkpoint(){await writeFile(join(out,'result.json'),JSON.stringify(result,null,2))}
async function memory(){
 const metrics=await app.evaluate(({app})=>app.getAppMetrics())
 const value=metrics.reduce((sum,p)=>sum+p.memory.workingSetSize,0)
 result.peakKiB=Math.max(result.peakKiB,value)
 return value
}
const monitor=setInterval(async()=>{if(sampling)return;sampling=true;try{const value=await memory();if(value>4*1024*1024)overBudget=true}catch{}finally{sampling=false}},500)
async function until(fn,timeout=120000){const start=Date.now();while(Date.now()-start<timeout){if(overBudget)throw Error('4 GiB working-set safety limit reached');if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw Error('condition timed out')}
async function go(name){await page.getByRole('navigation').getByRole('link',{name,exact:true}).click()}
async function clear(){await page.getByRole('button',{name:'清空',exact:true}).click()}
async function select(name){await page.locator('input[type=file]').first().setInputFiles(join(samples,name))}
async function step(name,fn){
 const start=Date.now();console.log('START '+name)
 try{const detail=await fn();result.cases.push({name,passed:true,ms:Date.now()-start,...detail});console.log('PASS '+name)}
 catch(error){result.cases.push({name,passed:false,ms:Date.now()-start,error:error.message});console.log('FAIL '+name+': '+error.message)}
 await checkpoint()
}
try{
 page=await app.firstWindow();page.setDefaultTimeout(120000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 result.systemMemory=await app.evaluate(()=>process.getSystemMemoryInfo())
 await page.context().setOffline(true)
 await go('图片压缩 / 格式转换')
 if (!process.env.DESKTOP_STRESS_REPEAT_ONLY) {
 await step('64 MP import cancellation',async()=>{
  await select('6400万像素.png')
  const button=page.getByRole('button',{name:'取消',exact:true});await button.waitFor()
  const start=Date.now();await button.click()
  await page.getByRole('status').filter({hasText:'已取消'}).waitFor()
  const ms=Date.now()-start
  await page.waitForTimeout(500)
  assert.equal(await page.getByRole('heading',{name:'原图预览',exact:true}).count(),0)
  return{cancelResponseMs:ms}
 })
 await step('64 MP full import process save',async()=>{
  await clear();await select('6400万像素.png')
  await page.getByRole('heading',{name:'原图预览',exact:true}).waitFor()
  assert.match(await page.locator('.file-info').textContent(),/8000 × 8000/)
  await page.getByRole('button',{name:'开始处理',exact:true}).click()
  const target=join(out,'max-pixels.png')
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},target)
  const save=page.getByRole('button',{name:/下载(原文件|结果)$/});await save.click()
  await until(async()=>{try{return(await stat(target)).size>0}catch{return false}})
  await until(()=>save.isEnabled())
  const dimensions=await app.evaluate(({nativeImage},file)=>nativeImage.createFromPath(file).getSize(),target)
  assert.deepEqual(dimensions,{width:8000,height:8000})
  return{dimensions,bytes:(await stat(target)).size}
 })
 await step('over pixel limit rejected',async()=>{
  await clear();await select('超过像素上限.png')
  await page.locator('.status-box.error').filter({hasText:'6400 万像素'}).waitFor()
  return{}
 })
 await step('500-entry large ZIP cancellation',async()=>{
  await clear();await select('500条目大混合.zip')
  await page.getByRole('button',{name:'开始处理 ZIP',exact:true}).click()
  const cancel=page.getByRole('button',{name:'取消 ZIP 处理',exact:true});await cancel.waitFor()
  const start=Date.now();await cancel.click()
  await page.locator('.zip-status').filter({hasText:'已取消'}).waitFor()
  await page.waitForTimeout(500)
  assert.equal(await page.getByRole('button',{name:'下载结果 ZIP',exact:true}).count(),0)
  return{cancelResponseMs:Date.now()-start-500}
 })
 await step('500-entry large ZIP process save CRC',async()=>{
  await clear();await select('500条目大混合.zip')
  await page.getByRole('button',{name:'开始处理 ZIP',exact:true}).click()
  const target=join(out,'large-processed.zip')
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},target)
  const button=page.getByRole('button',{name:'下载结果 ZIP',exact:true});await button.click()
  await until(async()=>{try{return(await stat(target)).size>0}catch{return false}})
  await until(()=>button.isEnabled())
  const input=new ZipReader(new Uint8ArrayReader(await readFile(join(samples,'500条目大混合.zip'))),{useWebWorkers:false})
  const source=await input.getEntries();const expected=new Map(source.map(e=>[e.filename,e]))
  const reader=new ZipReader(new Uint8ArrayReader(await readFile(target)),{useWebWorkers:false})
  const entries=await reader.getEntries();assert.equal(entries.length,500)
  let expanded=0
  for(const entry of entries){
   await entry.getData(new WritableStream({write(bytes){expanded+=bytes.length}}),{checkSignature:true})
   if(!entry.filename.endsWith('.png'))assert.equal(entry.signature,expected.get(entry.filename).signature)
  }
  await reader.close();await input.close()
  return{inputBytes:(await stat(join(samples,'500条目大混合.zip'))).size,outputBytes:(await stat(target)).size,entries:entries.length,expanded}
 })
 for(const [file,text] of [['501条目.zip','500'],['超过展开上限.zip','解压后总大小超过限制'],['超过ZIP大小.zip','50 MiB']]){
  await step('reject '+file,async()=>{await clear();await select(file);await page.locator('.zip-status.error').filter({hasText:text}).waitFor();return{}})
 }
 }
 await step('10-minute repeated work and navigation',async()=>{
  await clear()
  const small=resolve('output/desktop-p0/samples/色块 中文.png')
  const b64=(await readFile(small)).toString('base64')
  async function chooseSmall(locator) {
   await locator.evaluate((element,b64)=>{
    const data=new DataTransfer()
    data.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'fixture.png',{type:'image/png'}))
    element.files=data.files
    element.dispatchEvent(new Event('change',{bubbles:true}))
   },b64)
  }
  const diagnostics=await page.context().newCDPSession(page)
  await diagnostics.send('Performance.enable')
  const heap=async()=>Object.fromEntries((await diagnostics.send('Performance.getMetrics')).metrics.filter(m=>['Nodes','JSEventListeners','Documents','JSHeapUsedSize'].includes(m.name)).map(m=>[m.name,m.value]))
  result.inputMode='page File/change event; avoids DevTools setInputFiles node retention'
  result.heapBeforeLoop=await heap()
  const start=Date.now()
  while(Date.now()-start<duration){
   if(overBudget)throw Error('memory safety budget exceeded')
   await go('图片压缩 / 格式转换')
   await chooseSmall(page.locator('input[type=file]').first())
   await page.getByRole('heading',{name:'原图预览',exact:true}).waitFor()
   await page.getByRole('button',{name:'开始处理',exact:true}).click()
   await page.getByRole('button',{name:/下载(原文件|结果)$/}).waitFor()
   await go('照片水印边框')
   await chooseSmall(page.getByLabel('选择照片',{exact:true}))
   await until(()=>page.getByRole('button',{name:'导出照片',exact:true}).isEnabled())
   await go('图片加水印')
   await chooseSmall(page.getByLabel('选择水印图片'))
   await page.getByRole('button',{name:'生成图片',exact:true}).click()
   await until(()=>page.getByRole('button',{name:'下载图片',exact:true}).isEnabled())
   await go('一图切九格')
   await chooseSmall(page.getByLabel('选择照片文件'))
   await page.getByRole('button',{name:'生成 9 张图片',exact:true}).click()
   await page.getByRole('button',{name:'下载 01',exact:true}).waitFor()
   await go('双重曝光');await page.locator('.exposure-tool h2').waitFor()
   await go('图片拼接');await page.getByLabel('选择拼接图片').waitFor({state:'attached'})
   await go('二维码识别');await page.getByRole('heading',{name:'二维码识别',exact:true}).waitFor()
   await go('图片 ↔ Base64');await chooseSmall(page.getByLabel('选择图片',{exact:true}))
   await page.getByLabel('图片 Base64 结果').waitFor()
   result.cycles++
   if(result.cycles%10===0){result.samples.push({cycle:result.cycles,ms:Date.now()-start,workingSetKiB:await memory()});await checkpoint();console.log('CYCLE '+result.cycles+' '+Math.round((Date.now()-start)/1000)+'s')}
   await page.waitForTimeout(500)
  }
  await go('图片压缩 / 格式转换');await page.waitForTimeout(3000)
  result.heapBeforeGc=await heap()
  await diagnostics.send('HeapProfiler.collectGarbage')
  await diagnostics.send('HeapProfiler.collectGarbage')
  result.heapAfterGc=await heap()
  assert(result.heapAfterGc.Nodes < 5000, 'Too many old DOM nodes retained after GC')
  assert(result.heapAfterGc.JSEventListeners < 1000, 'Too many old listeners retained after GC')
  await diagnostics.detach()
  return{cycles:result.cycles,actualMs:Date.now()-start,finalWorkingSetKiB:await memory(),pageErrors:errors}
 })
 result.pageErrors=errors;assert.deepEqual(errors,[])
 result.passed=result.cases.every(item=>item.passed)
 if(!result.passed)process.exitCode=1
}catch(error){result.passed=false;result.error=error.stack;process.exitCode=1}
finally{clearInterval(monitor);await checkpoint();await app.close()}
console.log(JSON.stringify(result,null,2))
