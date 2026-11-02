import{_electron}from'playwright-core'
import{resolve,join}from'node:path'
import{mkdir,mkdtemp,writeFile,readFile,stat}from'node:fs/promises'
import assert from'node:assert/strict'
const base=resolve('output/desktop-25mp');await mkdir(base,{recursive:true});const out=await mkdtemp(join(base,'run-'))
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),args:['--user-data-dir='+join(out,'profile'),'--disable-backgrounding-occluded-windows'],env,timeout:60000})
const result={files:[],tools:[]}
let page
async function until(fn){const end=Date.now()+120000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out')}
async function route(name){await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();console.log(name)}
async function save(button,name,expected){
 const target=join(out,name)
 await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},target)
 await button.click()
 await until(async()=>{try{return(await stat(target)).size>0}catch{return false}})
 await until(()=>button.isEnabled())
 const dimensions=await app.evaluate(({nativeImage},file)=>nativeImage.createFromPath(file).getSize(),target)
 if(expected)assert.deepEqual(dimensions,expected)
 result.files.push({name,bytes:(await stat(target)).size,dimensions})
}
try{
 page=await app.firstWindow();page.setDefaultTimeout(120000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 result.version=await app.evaluate(({app})=>app.getVersion())
 const fixtures=await app.evaluate(({nativeImage},paths)=>{
  const photo=nativeImage.createFromPath(paths.photo).resize({width:5000,height:5000,quality:'best'})
  const qr=nativeImage.createFromPath(paths.qr).resize({width:5000,height:5000,quality:'best'})
  return{photo:photo.toJPEG(92).toString('base64'),qr:qr.toPNG().toString('base64'),dimensions:photo.getSize()}
 },{photo:resolve('output/desktop-p0/samples/色块 中文.png'),qr:resolve('output/desktop-p0/samples/二维码.png')})
 assert.deepEqual(fixtures.dimensions,{width:5000,height:5000})
 const photo=join(out,'2500万像素.jpg'),qr=join(out,'2500万像素二维码.png')
 await writeFile(photo,Buffer.from(fixtures.photo,'base64'));await writeFile(qr,Buffer.from(fixtures.qr,'base64'))
 assert((await stat(photo)).size<10*1024*1024)
 await route('图片 ↔ Base64')
 await page.getByLabel('选择图片',{exact:true}).setInputFiles(photo)
 await save(page.getByRole('button',{name:'下载图片',exact:true}),'base64.jpg',{width:5000,height:5000})
 assert.deepEqual(await readFile(join(out,'base64.jpg')),await readFile(photo));result.tools.push('image-base64')
 await route('二维码识别')
 await page.getByLabel('选择图片',{exact:true}).setInputFiles(qr)
 await page.getByLabel('二维码识别内容').waitFor()
 assert.match(await page.getByLabel('二维码识别内容').inputValue(),/DevKit P0/);result.tools.push('qr-reader')
 await route('图片加水印')
 await page.getByLabel('选择水印图片').setInputFiles(photo)
 await page.getByLabel('水印文字',{exact:true}).fill('2500万像素测试')
 await page.getByRole('button',{name:'生成图片',exact:true}).click()
 await save(page.getByRole('button',{name:'下载图片',exact:true}),'watermark.jpg',{width:5000,height:5000});result.tools.push('watermark')
 await route('一图切九格')
 await page.getByLabel('选择照片文件').setInputFiles(photo)
 await page.getByRole('button',{name:'生成 9 张图片'}).click()
 await save(page.getByRole('button',{name:'下载 01',exact:true}),'grid.jpg',{width:1080,height:1080});result.tools.push('moments-grid')
 await route('图片拼接')
 await page.getByLabel('选择拼接图片').setInputFiles([photo,photo])
 await page.getByRole('button',{name:'水平拼接',exact:true}).click()
 await page.getByLabel('间距').fill('0');await page.getByLabel('外边距').fill('0');await page.getByLabel('统一高度').fill('5000')
 await save(page.getByRole('button',{name:'下载图片',exact:true}),'stitch.png',{width:10000,height:5000});result.tools.push('image-stitch')
 await route('双重曝光')
 await page.locator('.upload input[type=file]').nth(0).setInputFiles(photo)
 await page.getByAltText('已载入的人像照片缩略图').waitFor()
 await page.locator('.upload input[type=file]').nth(1).setInputFiles(photo)
 await page.getByAltText('已载入的风景照片缩略图').waitFor()
 await page.getByLabel('导出长边').selectOption('1200')
 await save(page.getByRole('button',{name:'导出图片',exact:true}),'exposure.png');result.tools.push('double-exposure')
 await route('图片压缩 / 格式转换')
 await page.locator('input[type=file]').first().setInputFiles(photo)
 await page.getByRole('heading',{name:'原图预览',exact:true}).waitFor()
 await page.getByRole('button',{name:'开始处理',exact:true}).click()
 await save(page.getByRole('button',{name:/下载(原文件|结果)$/}),'compression.jpg',{width:5000,height:5000});result.tools.push('image-compress')
 await route('照片水印边框')
 await page.getByLabel('选择照片',{exact:true}).setInputFiles(photo)
 await page.getByLabel('导出尺寸').selectOption('2048')
 await save(page.getByRole('button',{name:'导出照片',exact:true}),'frame.jpg');result.tools.push('photo-frame')
 result.pageErrors=errors;assert.deepEqual(errors,[])
 result.passed=true
}catch(error){result.passed=false;result.error=error.stack;process.exitCode=1}
finally{await app.close();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
