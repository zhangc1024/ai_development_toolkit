<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { copyText } from '../../platform/browser'
import { parseOtp, totp } from './core'
const props=defineProps<{kind:'regex'|'qrcode'|'totp'}>()
const titles={regex:'正则表达式测试',qrcode:'二维码生成',totp:'2FA 工具'}
const descriptions={regex:'使用 JavaScript 正则表达式查看匹配与捕获组。',qrcode:'把文本或链接转成二维码，所有内容均在本地处理。',totp:'本地生成 TOTP 动态验证码，不保存账号或密钥。'}
const input=ref(''),pattern=ref(''),flags=ref('g'),output=ref(''),error=ref(''),notice=ref(''),busy=ref(false)
const level=ref<'L'|'M'|'Q'|'H'>('M'),image=ref(''),scale=ref(8)
const secret=ref(''),show=ref(false),algorithm=ref('SHA1'),digits=ref(6),period=ref(30),active=ref(false),now=ref(Math.floor(Date.now()/1000))
let worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined,revision=0
function stop(){worker?.terminate();worker=null;clearTimeout(timer);busy.value=false}
function invalidate(){revision++;stop();output.value='';image.value='';error.value='';notice.value='';active.value=false}
watch([input,pattern,flags,level,scale,secret,algorithm,digits,period],invalidate,{flush:'sync'})
const clock=setInterval(()=>{now.value=Math.floor(Date.now()/1000)},250)
onBeforeUnmount(()=>{revision++;stop();clearInterval(clock);secret.value='';input.value=''})
const code=computed(()=>{if(!active.value)return '';try{return totp(secret.value,algorithm.value,digits.value,period.value,now.value)}catch{return ''}})
const remaining=computed(()=>period.value-now.value%period.value)
async function run(){
 invalidate();const version=revision
 try{
 if(props.kind==='regex'){
  if(pattern.value.length>10000||input.value.length>200000)throw Error('表达式上限 10,000 字符，测试文本上限 200,000 字符')
  busy.value=true;worker=new Worker(new URL('./regex.worker.ts',import.meta.url),{type:'module'})
  worker.onmessage=({data})=>{if(version!==revision)return;stop();if(data.error)error.value=data.error;else{output.value=JSON.stringify(data.result.rows,null,2);notice.value='匹配 '+data.result.rows.length+' 项'+(data.result.truncated?'（仅展示前 1000 项）':'')}}
  worker.onerror=()=>{if(version===revision){stop();error.value='正则执行失败'}}
  worker.postMessage({pattern:pattern.value,flags:flags.value,input:input.value})
  timer=setTimeout(()=>{if(version===revision){stop();error.value='执行超过 2 秒，已终止。请简化表达式或缩短文本。'}},2000)
 }else if(props.kind==='qrcode'){
  if(!input.value||new TextEncoder().encode(input.value).length>2953)throw Error('请输入内容，UTF-8 字节数不能超过 2953；实际容量随纠错级别变化')
  busy.value=true
  const result=await QRCode.toDataURL(input.value,{errorCorrectionLevel:level.value,scale:scale.value,margin:4})
  if(version===revision){image.value=result;busy.value=false;notice.value='二维码已生成'}
 }else{
  now.value=Math.floor(Date.now()/1000);totp(secret.value,algorithm.value,digits.value,period.value,now.value);active.value=true;notice.value='验证码已启动'
 }
 }catch(e){if(version===revision){busy.value=false;error.value=props.kind==='qrcode'?'无法生成：内容超过当前纠错级别容量，或输入为空。请缩短内容。':e instanceof Error?e.message:'操作失败'}}
}
function importOtp(){try{const value=parseOtp(input.value.trim());secret.value=value.secret;algorithm.value=value.algorithm;digits.value=value.digits;period.value=value.period;input.value='';run()}catch{invalidate();error.value='配置无效：仅支持 TOTP，检查 secret、algorithm、digits 和 period 参数'}}
function clear(){invalidate();input.value='';secret.value='';pattern.value='';show.value=false}
function sample(){if(props.kind==='regex'){pattern.value='(?<name>[A-Za-z]+)';flags.value='g';input.value='Hello Vue 2026'}else if(props.kind==='qrcode'){input.value='https://example.com'}else{secret.value='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';algorithm.value='SHA1';digits.value=6;period.value=30}run()}
async function copy(text:string){const v=revision;try{await copyText(text);if(v===revision)notice.value='已复制'}catch{if(v===revision)notice.value='复制失败，请手动复制'}}
function download(){const a=document.createElement('a');a.href=image.value;a.download='qrcode.png';a.click()}
</script>
<template>
<div class="tool-page extra-page">
 <div class="tool-heading"><div><div class="eyebrow">本地工具 <span>/</span> LOCAL WORKSPACE</div><h1>{{ titles[kind] }}</h1><p>{{ descriptions[kind] }}</p></div></div>
 <section class="time-form">
  <template v-if="kind==='regex'">
   <label class="time-input-label">表达式（不含两侧 /）<input v-model="pattern" aria-label="正则表达式" maxlength="10000" placeholder="例如 (?<name>[A-Za-z]+)" /></label>
   <label class="time-input-label">标志<input v-model="flags" aria-label="正则标志" maxlength="8" placeholder="gim" /></label>
  </template>
  <template v-if="kind==='totp'">
   <label class="time-input-label">Base32 密钥<input v-model="secret" :type="show?'text':'password'" aria-label="Base32 密钥" autocomplete="off" spellcheck="false" maxlength="4096" /></label>
   <label><input v-model="show" type="checkbox" /> 显示密钥</label>
   <div class="encoding-options-row">
    <label class="indent-label">算法<select v-model="algorithm" aria-label="TOTP 算法"><option>SHA1</option><option>SHA256</option><option>SHA512</option></select></label>
    <label class="indent-label">位数<select v-model="digits" aria-label="验证码位数"><option :value="6">6 位</option><option :value="8">8 位</option></select></label>
    <label class="indent-label">周期（秒）<input v-model.number="period" type="number" min="1" max="300" aria-label="周期" /></label>
   </div>
   <label class="time-input-label">导入配置（可选）<input v-model="input" :type="show?'text':'password'" aria-label="TOTP 配置" autocomplete="off" maxlength="8192" placeholder="otpauth://totp/..." /></label>
   <button class="button" @click="importOtp">导入并启动</button>
  </template>
  <label v-else class="time-input-label">{{ kind==='regex'?'测试文本':'二维码内容' }}<textarea v-model="input" :aria-label="kind==='regex'?'测试文本':'二维码内容'" :maxlength="kind==='regex'?200000:2953" rows="8" spellcheck="false"></textarea></label>
  <div v-if="kind==='qrcode'" class="encoding-options-row">
   <label class="indent-label">纠错级别<select v-model="level" aria-label="纠错级别"><option>L</option><option>M</option><option>Q</option><option>H</option></select></label>
   <label class="indent-label">像素倍率<select v-model="scale" aria-label="像素倍率"><option :value="4">4</option><option :value="8">8</option><option :value="12">12</option></select></label>
  </div>
  <div class="primary-actions"><button class="button primary" :disabled="busy" @click="run">{{ busy?'处理中…':kind==='regex'?'测试匹配':kind==='qrcode'?'生成二维码':'启动验证码' }}</button><button v-if="busy" class="button" @click="invalidate">停止</button><button class="button" @click="sample">加载示例</button><button class="button" @click="clear">清空</button></div>
 </section>
 <div v-if="error||notice" role="status" aria-live="polite" class="status-box" :class="{error:!!error}">{{ error||notice }}</div>
 <section v-if="output" class="time-results"><header><h2>匹配结果</h2><button class="button" @click="copy(output)">复制结果</button></header><pre>{{ output }}</pre></section>
 <section v-if="image" class="time-results qr-result"><h2>二维码预览</h2><img :src="image" alt="生成的二维码" /><button class="button" @click="download">下载 PNG</button></section>
 <section v-if="code" class="live-clock"><span>当前验证码</span><strong class="otp-code">{{ code }}</strong><span>{{ remaining }} 秒后更新</span><progress :value="remaining" :max="period"></progress><button class="button" @click="copy(code)">复制验证码</button><button class="button" @click="invalidate">停止并隐藏</button></section>
 <section class="encoding-rules"><h2>使用说明</h2>
  <ul v-if="kind==='regex'"><li>使用当前浏览器的 JavaScript 正则语法，不是 PHP PCRE。标志可用性由浏览器决定；g 查找全部，未设置 g 只返回一次。</li><li>结果包含起止位置（UTF-16，下标从 0 开始，结束不包含）、匹配文本、捕获组和命名组。空匹配自动前进，最多展示 1000 项。</li><li>独立 Worker 执行，2 秒超时终止。支持停止；修改输入会清空旧结果。不执行替换。</li></ul>
  <ul v-else-if="kind==='qrcode'"><li>支持普通文本、中文、emoji 和链接；保留原始空格与换行，不会访问输入链接。</li><li>黑白 PNG，四模块留白。L / M / Q / H 纠错由低到高，越高可容纳内容越少；倍率决定每模块像素。</li><li>生成不代表链接有效。下载后请使用目标扫码设备确认；暂不提供二维码识别或 Logo 覆盖。</li></ul>
  <ul v-else><li>TOTP 支持 SHA1 / SHA256 / SHA512、6 / 8 位和 1–300 秒周期，默认 SHA1 / 6 位 / 30 秒。仅按设备时间计算，不联网校时。</li><li>Base32 忽略空白和大小写；可导入 otpauth://totp 配置。暂不支持 HOTP、扫码导入、账号收藏或云同步。</li><li>示例密钥公开，仅用于测试。真实账号参数应与服务端保持一致；这里生成验证码，不代表服务端验证成功。</li><li>不写入地址、存储或日志；清空、刷新或离开页面后不保留密钥。停止仅隐藏验证码，清空才清除输入。复制会把验证码交给系统剪贴板。</li></ul>
 </section>
</div>
</template>
<style scoped>
.extra-page textarea{width:100%;box-sizing:border-box;border:1px solid var(--border,#dce1ee);border-radius:8px;padding:12px;resize:vertical;font:14px/1.6 monospace;background:white;color:#172b4d}
.extra-page .time-input-label{margin-bottom:18px}
.extra-page .primary-actions{margin-top:20px}
.extra-page pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:600px;overflow:auto;font:13px/1.6 monospace}
.qr-result{display:flex;flex-direction:column;align-items:center;gap:16px}
.qr-result img{max-width:100%;height:auto;image-rendering:pixelated}
.extra-page progress{width:100%}.otp-code{letter-spacing:0.15em}
.extra-page .encoding-options-row{margin:18px 0}
.extra-page input[type=number]{width:90px}
</style>
