import { _electron } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
const helper=resolve('output/desktop-followup/clipboard-probe.exe')
const probe=(mode,text)=>JSON.parse(spawnSync(helper,[mode,text],{encoding:'utf8',windowsHide:true}).stdout.trim())
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const result={native:probe('write','DevKit native marker A')}
const app=await _electron.launch({executablePath:resolve('release/win-unpacked/DevKitImages.exe'),env,timeout:60_000})
try {
 const page=await app.firstWindow();await page.getByRole('heading',{name:'图片工具',exact:true}).waitFor()
 async function inspect(){return await app.evaluate(async({clipboard})=>({textLength:(await clipboard.readText()).length,hasText:await clipboard.has('text/plain'),types:(await clipboard.read()).map(item=>item.types),writeType:clipboard.writeText.constructor.name}))}
 result.currentPolicy=await inspect()
 await app.evaluate(async({clipboard})=>clipboard.writeText('DevKit Electron marker B'))
 result.nativeReadElectronWrite=probe('read','DevKit Electron marker B')
 await app.evaluate(({session})=>{session.defaultSession.setPermissionRequestHandler(null);session.defaultSession.setPermissionCheckHandler(null)})
 probe('write','DevKit native marker A')
 result.defaultPolicy=await inspect()
 await app.evaluate(async({clipboard})=>clipboard.writeText('DevKit Electron marker C'))
 result.nativeReadDefaultWrite=probe('read','DevKit Electron marker C')
 result.defaultAfter=await inspect()
 await app.evaluate(async({clipboard,ClipboardItem})=>clipboard.write([new ClipboardItem({'text/plain':new Blob(['DevKit ClipboardItem marker D'],{type:'text/plain'})})]))
 result.nativeReadItemWrite=probe('read','DevKit ClipboardItem marker D')
 result.itemAfter=await inspect()
 result.displays=await app.evaluate(({screen})=>screen.getAllDisplays().map(d=>({bounds:d.bounds,scaleFactor:d.scaleFactor})))
} catch(error){result.error=error.stack;process.exitCode=1}
finally{await app.close();await writeFile('output/desktop-followup/clipboard-diagnosis.json',JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
