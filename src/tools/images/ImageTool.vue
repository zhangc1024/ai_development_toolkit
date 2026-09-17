<script setup lang="ts">
import { computed,onBeforeUnmount,onMounted,ref,watch } from 'vue'
import { copyText,downloadText } from '../../platform/browser'
import { decodeImageBase64,encodeImage,imageType,MAX_BASE64_CHARS,MAX_IMAGE_BYTES,validateDimensions } from './core'
const props=defineProps<{kind:'image-base64'|'qr-reader'}>()
const direction=ref<'encode'|'decode'>('encode'),text=ref(''),format=ref<'dataUrl'|'base64'>('dataUrl')
const preview=ref(''),name=ref(''),mime=ref(''),ext=ref(''),size=ref(0),width=ref(0),height=ref(0)
const encoded=ref<{base64:string;dataUrl:string}|null>(null),qr=ref<{text:string;bytes:number[];version:number}|null>(null)
const error=ref(''),notice=ref(''),busy=ref(false),fileInput=ref<HTMLInputElement>()
const resultText=computed(()=>encoded.value?.[format.value]??'')
let revision=0,worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined
let bytes:Uint8Array|null=null
const urls=new Set<string>()
function revoke(url:string){if(url){URL.revokeObjectURL(url);urls.delete(url)}}
function stop(){worker?.terminate();worker=null;clearTimeout(timer);busy.value=false}
function reset(){
 revision++;stop();revoke(preview.value);preview.value='';bytes=null;encoded.value=null;qr.value=null
 name.value='';mime.value='';ext.value='';size.value=0;width.value=0;height.value=0;error.value='';notice.value=''
 if(fileInput.value)fileInput.value.value=''
}
function clear(){reset();text.value=''}
watch(direction,clear,{flush:'sync'})
watch(text,()=>{if(direction.value==='decode')reset()},{flush:'sync'})
watch(format,()=>{notice.value=''})
onMounted(()=>window.addEventListener('paste',paste))
onBeforeUnmount(()=>{revision++;stop();for(const url of urls)URL.revokeObjectURL(url);urls.clear();window.removeEventListener('paste',paste)})
async function accept(data:Uint8Array,filename:string,version:number){
 const type=imageType(data)
 const blob=new Blob([new Uint8Array(data)],{type:type.mime})
 const url=URL.createObjectURL(blob);urls.add(url)
 let bitmap:ImageBitmap|null=null
 try{
  bitmap=await createImageBitmap(blob)
  if(version!==revision){revoke(url);return}
  validateDimensions(bitmap.width,bitmap.height)
  preview.value=url;bytes=data;name.value=filename;mime.value=type.mime;ext.value=type.ext;size.value=data.length;width.value=bitmap.width;height.value=bitmap.height
  if(props.kind==='qr-reader'){
   // 识别使用静态首帧，白底合成透明像素；限制工作区尺寸。
   const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height))
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio))
   const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('当前环境不支持 Canvas')
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height)
   const pixels=context.getImageData(0,0,canvas.width,canvas.height)
   worker=new Worker(new URL('./qr.worker.ts',import.meta.url),{type:'module'})
   worker.onmessage=({data:message})=>{if(version!==revision)return;stop();if(message.error)error.value=message.error;else{qr.value=message.result;notice.value='识别完成'+(ratio<1?'（已缩小至最长边 2048 像素）':'')}}
   worker.onerror=()=>{if(version===revision){stop();error.value='识别失败，请重试'}}
   worker.postMessage({pixels:pixels.data,width:pixels.width,height:pixels.height},[pixels.data.buffer])
   timer=setTimeout(()=>{if(version===revision){stop();error.value='二维码识别超过 5 秒，已终止，请裁剪图片后重试'}},5000)
  }else{
   if(direction.value==='encode')encoded.value=encodeImage(data)
   busy.value=false;notice.value=direction.value==='encode'?'图片已转为 Base64':'Base64 已还原为图片'
  }
 }catch(e){revoke(url);if(version===revision){preview.value='';bytes=null;throw e}}
 finally{bitmap?.close()}
}
async function load(file:File){
 if(props.kind==='image-base64'&&direction.value==='decode')direction.value='encode'
 reset();const version=revision;busy.value=true
 try{
  if(file.size>MAX_IMAGE_BYTES||!file.size)throw Error('图片必须非空且不超过 10 MiB')
  const data=new Uint8Array(await file.arrayBuffer());if(version!==revision)return
  await accept(data,file.name||'粘贴图片',version)
 }catch(e){if(version===revision){stop();error.value=e instanceof Error?e.message:'无法读取图片'}}
}
function select(e:Event){const file=(e.target as HTMLInputElement).files?.[0];if(file)load(file)}
function drop(e:DragEvent){const file=e.dataTransfer?.files[0];if(file)load(file)}
function paste(e:ClipboardEvent){const item=Array.from(e.clipboardData?.items??[]).find(x=>x.kind==='file'&&x.type.startsWith('image/'));const file=item?.getAsFile();if(file){e.preventDefault();load(file)}}
async function decode(){
 reset();const version=revision;busy.value=true
 try{const data=decodeImageBase64(text.value);await accept(data.bytes,'decoded.'+data.ext,version)}
 catch(e){if(version===revision){stop();error.value=e instanceof Error?e.message:'Base64 转图片失败'}}
}
async function copy(value:string){const version=revision;try{await copyText(value);if(version===revision)notice.value='已复制'}catch{if(version===revision)notice.value='复制失败，请手动选择文本复制'}}
function downloadImage(){if(!preview.value)return;const a=document.createElement('a');a.href=preview.value;a.download='image.'+ext.value;a.click()}
async function sample(){
 reset();const version=revision;busy.value=true
 try{const QRCode=await import('qrcode');const data=await QRCode.toDataURL('DevKit 本地二维码识别测试 https://example.com',{margin:4,scale:8});if(version!==revision)return
 const decoded=decodeImageBase64(data);if(props.kind==='image-base64'&&direction.value==='decode'){text.value=data;await decode()}else await accept(decoded.bytes,'example.png',version)
 }catch(e){if(version===revision){stop();error.value=e instanceof Error?e.message:'示例加载失败'}}
}
</script>
<template>
<div class="tool-page image-tool">
 <div class="tool-heading"><div><div class="eyebrow">图片工具 <span>/</span> LOCAL IMAGES</div><h1>{{ kind==='qr-reader'?'二维码识别':'图片 ↔ Base64' }}</h1><p>{{ kind==='qr-reader'?'从本地图片中读取一个二维码，不自动访问识别到的链接。':'保留原始图片字节，支持 Data URL 与纯 Base64 双向转换。' }}</p></div></div>
 <section class="time-form">
  <div v-if="kind==='image-base64'" class="encoding-options-row"><label class="indent-label">转换方向<select v-model="direction" aria-label="转换方向"><option value="encode">图片 → Base64</option><option value="decode">Base64 → 图片</option></select></label></div>
  <div v-if="kind==='qr-reader'||direction==='encode'" class="image-drop" @dragover.prevent @drop.prevent="drop"><p>选择或拖入图片，也可直接粘贴剪贴板图片</p><label class="button">选择图片<input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="选择图片" @change="select" /></label><small>PNG / JPEG / GIF / WebP · 最大 10 MiB</small></div>
  <label v-else class="time-input-label">Base64 / Data URL<textarea v-model="text" :maxlength="MAX_BASE64_CHARS" aria-label="图片 Base64 输入" rows="8" spellcheck="false" placeholder="data:image/png;base64,... 或纯 Base64"></textarea></label>
  <div class="primary-actions"><button v-if="kind==='image-base64'&&direction==='decode'" class="button primary" :disabled="busy" @click="decode">还原图片</button><button class="button" :disabled="busy" @click="sample">加载示例</button><button class="button" @click="clear">清空</button><button v-if="busy" class="button" @click="reset">取消</button><span v-if="busy">处理中…</span></div>
 </section>
 <div v-if="error||notice" role="status" class="status-box" :class="{error:!!error}">{{ error||notice }}</div>
 <section v-if="preview" class="time-results image-preview"><header><h2>图片预览</h2><button v-if="kind==='image-base64'" class="button" @click="downloadImage">下载图片</button></header><img :src="preview" alt="本地图片预览" /><p class="image-meta">{{ name }} · {{ mime }} · {{ width }} × {{ height }} · {{ size.toLocaleString() }} 字节</p></section>
 <section v-if="encoded" class="time-results"><header><h2>编码结果</h2><div class="primary-actions"><label class="indent-label">输出格式<select v-model="format" aria-label="输出格式"><option value="dataUrl">Data URL</option><option value="base64">纯 Base64</option></select></label><button class="button" @click="copy(resultText)">复制编码</button><button class="button" @click="downloadText(resultText,'image-base64.txt','text/plain;charset=utf-8')">下载编码</button></div></header><p>Base64 {{ encoded.base64.length.toLocaleString() }} 个字符（不含 Data URL 前缀）</p><textarea :value="resultText" readonly aria-label="图片 Base64 结果" rows="8" spellcheck="false"></textarea></section>
 <section v-if="qr" class="time-results"><header><h2>识别结果</h2><div class="primary-actions"><button class="button" @click="copy(qr.text)">复制识别内容</button><button class="button" @click="downloadText(qr.text,'qrcode-content.txt','text/plain;charset=utf-8')">下载文本</button></div></header><textarea :value="qr.text" readonly aria-label="二维码识别内容" rows="6" spellcheck="false"></textarea><p>QR 版本 {{ qr.version }} · 解码字节数 {{ qr.bytes.length }}。内容按普通文本显示。</p><details><summary>原始字节（Hex）</summary><pre>{{ qr.bytes.map(b=>b.toString(16).padStart(2,'0')).join(' ') }}</pre></details></section>
 <section class="encoding-rules"><h2>使用说明</h2><ul>
 <li>仅本地文件和粘贴图片，不请求远程图片地址。最大 10 MiB、1600 万像素、单边 16384 像素。文件头和浏览器解码均需通过。</li>
 <li v-if="kind==='image-base64'">图片转 Base64 保留原始字节，包括元数据与动画；支持标准 Base64（可省略填充），忽略空格、Tab 和换行。拒绝 SVG、Base64URL、错误 MIME 声明和无法解码的内容。</li>
 <li v-if="kind==='qr-reader'">每张图片识别一个 QR 码，读取静态首帧。识别时透明区域按白底处理，最长边缩至 2048；密集二维码建议先裁剪。支持普通及反色二维码，不保证模糊、遮挡或多码图片成功。</li>
 <li v-if="kind==='qr-reader'">识别在 Worker 内运行，超过 5 秒停止。不支持摄像头、条形码或批量识别。识别出的 URL、HTML、2FA 密钥均只作文本展示，不自动访问、执行或导入。</li>
 <li>粘贴来自当前页面的 paste 事件，无需主动读取剪贴板。每次只处理第一个文件；取消会丢弃结果，但已开始的浏览器图片解码可能继续到结束。</li>
 <li>修改输入、清空或离开页面会释放预览地址并清除结果，不保存历史。复制与下载由你主动触发。</li>
 </ul></section>
</div>
</template>
<style scoped>
.image-tool textarea{width:100%;box-sizing:border-box;border:1px solid #dce1ee;border-radius:8px;padding:12px;resize:vertical;font:13px/1.6 monospace;color:#172b4d;background:white}
.image-drop{border:1px dashed #aaa3df;border-radius:12px;text-align:center;padding:24px;margin:18px 0;background:#faf9ff}.image-drop small{display:block;margin-top:12px}
.image-drop input{max-width:100%;width:230px}.image-drop .button{flex-wrap:wrap;justify-content:center}
.image-tool header{flex-wrap:wrap;gap:12px}.image-tool .encoding-options-row{margin-bottom:18px}.image-tool .primary-actions{margin-top:12px}
.image-preview img{display:block;max-width:100%;max-height:400px;object-fit:contain;margin:16px auto;background:#f4f4f4}.image-meta{overflow-wrap:anywhere}
.image-tool pre{white-space:pre-wrap;overflow-wrap:anywhere}.image-tool .time-results{min-width:0}
</style>
