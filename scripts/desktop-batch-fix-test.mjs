import { _electron } from 'playwright-core'
import { BlobReader, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter, BlobWriter } from '@zip.js/zip.js'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const out=resolve('output/desktop-batch-fix');await mkdir(out,{recursive:true})
const originals=new Map()
const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false,zip64:false})
for(const name of ['CHZ_0117.NEF','CHZ_0120.NEF','IMG_2930.HEIC']){
 const bytes=await readFile(join('D:/test',name));originals.set(name,bytes)
 await writer.add(name,new Uint8ArrayReader(bytes),{level:0})
}
const input=join(out,'samples.zip');await writeFile(input,Buffer.from(await(await writer.close()).arrayBuffer()))
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),args:['--user-data-dir='+join(out,'profile')],env,timeout:60000})
const result={runs:[]};let page
async function unpack(path){
 const reader=new ZipReader(new BlobReader(new Blob([await readFile(path)])),{useWebWorkers:false,checkSignature:true})
 const files=new Map()
 for(const entry of await reader.getEntries())if(!entry.directory)files.set(entry.filename,await entry.getData(new Uint8ArrayWriter()))
 await reader.close();return files
}
async function run(name){
 const started=Date.now()
 await page.getByRole('button',{name:'开始处理 ZIP',exact:true}).click()
 const download=page.getByRole('button',{name:'下载结果 ZIP',exact:true});await download.waitFor()
 const rows=await page.locator('.zip-table tbody tr').allTextContents()
 const target=join(out,name+'.zip')
 await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},target)
 await download.click()
 for(let i=0;i<1200;i++){try{if((await stat(target)).size>0 && await download.isEnabled())break}catch{}await new Promise(r=>setTimeout(r,100))}
 const files=await unpack(target)
 console.log(name,rows)
 result.runs.push({name,ms:Date.now()-started,rows,files:[...files].map(([name,bytes])=>({name,bytes:bytes.length}))})
 return {files,rows}
}
try{
 page=await app.firstWindow();page.setDefaultTimeout(180000)
 await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.1.4')
 await page.getByRole('navigation').getByRole('link',{name:'图片压缩 / 格式转换',exact:true}).click()
 await page.locator('input[type=file]').first().setInputFiles(input)
 assert.equal(await page.getByRole('checkbox',{name:/尼康 HE/}).isChecked(),true)
 const first=await run('original-default-compatible')
 assert.deepEqual(Buffer.from(first.files.get('IMG_2930.HEIC')),originals.get('IMG_2930.HEIC'))
 assert(first.rows[2].includes('未减小体积'));assert(first.rows.every(row=>!row.includes('失败')))
 await page.getByRole('checkbox',{name:/尼康 HE/}).check()
 await page.getByLabel('目标格式').selectOption('jpg')
 await page.getByLabel('压缩档位').selectOption('balanced')
 const second=await run('jpeg-compatible')
 assert.equal(second.files.size,3);assert(second.rows.every(row=>!row.includes('失败')))
 for(const name of ['CHZ_0117','CHZ_0120']){
  assert(second.rows.find(row=>row.includes(name)).includes('不代表 RAW 原始像素解码'))
  const bytes=second.files.get(name+'.jpg');assert(bytes);assert.equal(bytes[0],255);assert.equal(bytes[1],216)
  const dimensions=await app.evaluate(({nativeImage},data)=>nativeImage.createFromBuffer(Buffer.from(data)).getSize(),Array.from(bytes))
  assert.deepEqual(dimensions,{width:5568,height:3712})
 }
 for(const tier of ['light','balanced','strong']){
  await page.getByLabel('目标格式').selectOption('original')
  await page.getByLabel('压缩档位').selectOption(tier)
  const output=await run('original-'+tier)
  assert(output.rows.every(row=>!row.includes('失败')))
  for(const name of ['CHZ_0117','CHZ_0120'])assert(output.files.has(name+'.jpg'))
 }
 await page.getByLabel('目标格式').selectOption('png')
 const png=await run('explicit-png-strong')
 assert(png.rows.every(row=>!row.includes('失败')))
 assert(png.rows[0].includes('快速无损 PNG'))
 assert(png.files.has('CHZ_0117.png'))
 result.passed=true
}catch(error){result.passed=false;result.error=error.stack;if(page)result.screenText=await page.locator('body').innerText();process.exitCode=1}
finally{await app.close();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
