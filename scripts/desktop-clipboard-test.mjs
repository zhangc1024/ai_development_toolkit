import { _electron } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const helper=resolve('output/desktop-followup/clipboard-probe.exe')
const native=(mode,text='')=>JSON.parse(spawnSync(helper,[mode,text],{encoding:'utf8',windowsHide:true}).stdout.trim())
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),env,timeout:60_000})
const result={}
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15_000)
 await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 await page.getByRole('navigation').getByRole('link',{name:'图片 ↔ Base64',exact:true}).click()
 await page.getByLabel('选择图片',{exact:true}).setInputFiles(resolve('output/desktop-p0/samples/色块 中文.png'))
 const field=page.getByLabel('图片 Base64 结果')
 await field.waitFor()
 const expected=await field.inputValue()
 await page.getByRole('button',{name:'复制编码',exact:true}).click()
 await page.locator('[role=status]').filter({hasText:'已复制'}).waitFor()
 assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),expected)
 result.bridgeNativeRead=native('read',expected)
 assert.equal(result.bridgeNativeRead.matches,true)
 await field.focus();await page.keyboard.press('Control+A');await page.keyboard.press('Control+C')
 result.keyboardCopy=native('read',expected)
 assert.equal(result.keyboardCopy.matches,true)
 await page.getByLabel('转换方向',{exact:true}).selectOption('decode')
 await page.getByLabel('图片 Base64 输入').focus()
 await page.keyboard.press('Control+V')
 assert.equal(await page.getByLabel('图片 Base64 输入').inputValue(),expected)
 await page.getByRole('button',{name:'还原图片',exact:true}).click()
 await page.getByAltText('本地图片预览',{exact:true}).waitFor()
 result.keyboardPaste=true
 await page.getByRole('navigation').getByRole('link',{name:'图片加水印',exact:true}).click()
 await page.getByLabel('选择水印图片').setInputFiles(resolve('output/desktop-p0/samples/色块 中文.png'))
 await page.getByRole('button',{name:'生成图片',exact:true}).click()
 await page.getByRole('button',{name:'复制图片',exact:true}).click()
 await page.locator('[role=status]').filter({hasText:'已复制带水印图片'}).waitFor()
 result.imageClipboard=native('image')
 assert.equal(result.imageClipboard.image,true)
 assert.equal(result.imageClipboard.width,320)
 assert.equal(result.imageClipboard.height,200)
 result.passed=true
}catch(error){result.passed=false;result.error=error.stack;process.exitCode=1}
finally{await app.close();await writeFile('output/desktop-followup/clipboard-ui.json',JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
