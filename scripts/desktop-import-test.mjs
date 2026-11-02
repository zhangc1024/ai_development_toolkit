import { _electron } from 'playwright-core'
import { resolve, join } from 'node:path'
import { readFile, writeFile, readdir, stat, mkdir, mkdtemp } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = resolve('output/playwright/desktop-import')
await mkdir(base, { recursive: true })
const out = await mkdtemp(join(base, 'run-'))
const suite = resolve('output/playwright/desktop-suite')
const runs = []
for (const dir of await readdir(suite)) { try { const data = JSON.parse(await readFile(join(suite, dir, 'result.json'), 'utf8')); if (data.passed) runs.push({ dir, time: (await stat(join(suite, dir))).mtimeMs }) } catch {} }
runs.sort((a,b) => b.time - a.time)
const sourceDir = join(suite, runs[0].dir)
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: resolve('release/win-unpacked/DevKitImages.exe'), env, timeout: 60_000 })
const result = { formats: [] }
async function until(fn) { for (let n=0;n<300;n++) { if (await fn()) return; await new Promise(resolve=>setTimeout(resolve,100)) } throw Error('Timed out') }
try {
 const page=await app.firstWindow(); page.setDefaultTimeout(30_000)
 await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 await page.context().setOffline(true)
 await page.getByRole('navigation').getByRole('link',{name:'图片 ↔ Base64',exact:true}).click()
 const png=await readFile('output/desktop-p0/samples/色块 中文.png')
 const b64=png.toString('base64')
 await page.evaluate(b64=>{
  const file=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'拖放.png',{type:'image/png'})
  const transfer=new DataTransfer(); transfer.items.add(file)
  document.querySelector('.image-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}))
 },b64)
 await until(async()=>await page.getByLabel('图片 Base64 结果').inputValue() === 'data:image/png;base64,'+b64)
 await page.getByRole('button',{name:'清空',exact:true}).click()
 await page.evaluate(b64=>{
  const file=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'粘贴.png',{type:'image/png'})
  const transfer=new DataTransfer();transfer.items.add(file)
  window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,cancelable:true}))
 },b64)
 await until(async()=>await page.getByLabel('图片 Base64 结果').inputValue() === 'data:image/png;base64,'+b64)
 assert(await page.evaluate(()=>{const event=new DragEvent('drop',{bubbles:true,cancelable:true});document.body.dispatchEvent(event);return event.defaultPrevented}))
 result.pageDropAndPaste=true
 await page.getByLabel('选择图片',{exact:true}).setInputFiles({name:'too-large.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)})
 await page.locator('.status-box.error').filter({hasText:'10 MiB'}).waitFor()
 result.inputLimit=true
 await page.getByLabel('选择图片',{exact:true}).setInputFiles({name:'input.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>window.svgExecuted=true</script></svg>')})
 await page.locator('.status-box.error').waitFor()
 assert.equal(await page.evaluate(()=>Boolean(window.svgExecuted)),false)
 result.svgRejected=true
 await page.getByRole('navigation').getByRole('link',{name:'图片压缩 / 格式转换',exact:true}).click()
 for (const format of ['png','jpg','webp','avif','tiff','bmp']) {
  await page.locator('input[type=file]').first().setInputFiles(join(sourceDir,'压缩.'+format))
  await page.getByRole('heading',{name:'原图预览',exact:true}).waitFor()
  const target=join(out,'roundtrip.'+format)
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},target)
  await page.getByRole('button',{name:'开始处理',exact:true}).click()
  const button=page.getByRole('button',{name:/下载(原文件|结果)$/})
  await button.click()
  await until(async()=>{try{return(await stat(target)).size>0}catch{return false}})
  await until(()=>button.isEnabled())
  const bytes=await readFile(target)
  if(format!=='png')assert.deepEqual(bytes,await readFile(join(sourceDir,'压缩.'+format)))
  result.formats.push({format,bytes:bytes.length,preservedOriginal:format!=='png'})
 }
 result.passed=true
} catch(error){result.passed=false;result.error=error.stack;process.exitCode=1}
finally{await app.close();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
