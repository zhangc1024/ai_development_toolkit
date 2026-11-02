import{_electron}from'playwright-core'
import{resolve,join}from'node:path'
import{mkdir,mkdtemp,writeFile,readFile,readdir}from'node:fs/promises'
import assert from'node:assert/strict'
const base=resolve('output/desktop-followup/save-soak');await mkdir(base,{recursive:true});const out=await mkdtemp(join(base,'run-'))
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),args:['--user-data-dir='+join(out,'profile')],env,timeout:60000})
const result={saves:0,samples:[]}
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000)
 await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 const target=join(out,'反复覆盖.png')
 await app.evaluate(({dialog},filePath)=>{dialog.saveCalls=0;dialog.showSaveDialog=async()=>{dialog.saveCalls++;return{canceled:false,filePath}}},target)
 await page.getByRole('navigation').getByRole('link',{name:'图片 ↔ Base64',exact:true}).click()
 const input=resolve('output/desktop-p0/samples/色块 中文.png')
 await page.getByLabel('选择图片',{exact:true}).setInputFiles(input)
 const expected=await readFile(input);const button=page.getByRole('button',{name:'下载图片',exact:true})
 const start=Date.now()
 for(let i=0;i<100;i++){
  await button.click()
  const end=Date.now()+10000
  while(await app.evaluate(({dialog})=>dialog.saveCalls)<i+1){if(Date.now()>end)throw Error('Save dialog/session did not advance');await page.waitForTimeout(10)}
  while(!await button.isEnabled())await page.waitForTimeout(10)
  assert.equal(await page.locator('.status-box.error').count(),0)
  assert.deepEqual(await readFile(target),expected)
  result.saves++
  if((i+1)%20===0)result.samples.push({saves:i+1,workingSetKiB:await app.evaluate(({app})=>app.getAppMetrics().reduce((s,m)=>s+m.memory.workingSetSize,0))})
 }
 result.ms=Date.now()-start
 assert.equal((await readdir(out)).some(n=>n.startsWith('.devkit-save-')),false)
 result.passed=true
}catch(error){result.passed=false;result.error=error.stack;process.exitCode=1}
finally{await app.close();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
