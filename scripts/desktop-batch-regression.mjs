import assert from 'node:assert/strict'
import { _electron } from 'playwright-core'
import { mkdir, writeFile, copyFile, mkdtemp, readdir, stat } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
const root=await mkdtemp(join(tmpdir(),'devkit-batch-regression-')), input=join(root,'in'), output=join(root,'out')
await mkdir(join(input,'sub'),{recursive:true}); await mkdir(output)
const png=resolve('output/desktop-p0/samples/色块 中文.png')
await copyFile(png,join(input,'a.png')); await copyFile(png,join(input,'sub','b.png'))
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:process.argv[2],args:[resolve('.'),'--user-data-dir='+join(root,'profile')],cwd:dirname(process.argv[2]),env})
const result={root}; const page=await app.firstWindow();page.setDefaultTimeout(20000)
const route=async name=>page.getByRole('navigation').getByRole('link',{name,exact:true}).click()
try {
await route('图片压缩 / 格式转换')
await app.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[paths.shift()]})},[input,output])
await page.getByRole('button',{name:'文件夹批量处理',exact:true}).click()
await page.getByRole('button',{name:'选择输入文件夹',exact:true}).click()
await page.getByRole('button',{name:'选择输出文件夹',exact:true}).click()
await page.getByLabel('包含子文件夹').check()
assert(await page.getByRole('button',{name:'开始批量处理',exact:true}).isDisabled())
await page.getByText('子文件夹选项已更改，请重新选择输入文件夹。',{exact:true}).waitFor()
await app.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[paths.shift()]})},[input,output])
await page.getByRole('button',{name:'选择输入文件夹',exact:true}).click()
await page.getByRole('button',{name:'选择输出文件夹',exact:true}).click()
await page.getByLabel('目标格式').selectOption('jpg')
await page.getByRole('button',{name:'开始批量处理',exact:true}).click()
await page.locator('.folder-batch').getByText('本轮处理结束。',{exact:false}).waitFor()
result.recursion={checked:await page.getByLabel('包含子文件夹').isChecked(),summary:await page.locator('.batch-progress').innerText(),files:await readdir(output)}
assert.match(result.recursion.summary,/成功 2/)
assert((await readdir(join(output,'sub'))).includes('b-compressed.jpg'))
await page.getByRole('button',{name:'查看清单',exact:true}).click()
await app.evaluate(({dialog})=>{dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.auditResolveSave=resolve})})
await page.getByRole('button',{name:'导出处理报告',exact:true}).click()
for(let i=0;i<100;i++){if(await app.evaluate(()=>!!globalThis.auditResolveSave))break;await new Promise(r=>setTimeout(r,30))}
await route('图片加水印')
const report=join(root,'late-report.json')
await app.evaluate((_,filePath)=>globalThis.auditResolveSave({canceled:false,filePath}),report)
await new Promise(r=>setTimeout(r,500))
result.reportAfterNavigation=await stat(report).then(s=>s.size).catch(()=>false)
assert.equal(result.reportAfterNavigation,false)
const longInput=join(root,'long'),longOutput=join(root,'long-out')
await mkdir(longInput);await mkdir(longOutput)
await copyFile(png,join(longInput,'a'.repeat(232)+'.png'));await copyFile(png,join(longInput,'z.png'))
await route('图片压缩 / 格式转换')
await app.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[paths.shift()]})},[longInput,longOutput])
await page.getByRole('button',{name:'文件夹批量处理',exact:true}).click()
await page.getByRole('button',{name:'选择输入文件夹',exact:true}).click()
await page.getByRole('button',{name:'选择输出文件夹',exact:true}).click()
await page.getByLabel('目标格式').selectOption('jpg')
await page.getByRole('button',{name:'开始批量处理',exact:true}).click()
await page.locator('.folder-batch').getByText('本轮处理结束。',{exact:false}).waitFor()
result.longNames=await readdir(longOutput)
assert.equal(result.longNames.length,2)
assert(result.longNames.every(name=>name.length<=240))
assert(result.longNames.includes('z-compressed.jpg'))
result.passed=true
} catch(e){result.error=String(e);process.exitCode=1}finally{await app.close();await writeFile(resolve('output/playwright/desktop-batch-regression-result.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result))}
