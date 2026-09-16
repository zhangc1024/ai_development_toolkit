<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { copyText, downloadText } from '../../platform/browser'
import { randomStrings, uuids, type TextOptions } from './core'
import { searchStatuses } from './http'
const props=defineProps<{kind:'uuid'|'random'|'diff'|'text'|'http-status'}>()
const titles={uuid:'UUID 生成',random:'随机字符串生成',diff:'文本 Diff',text:'文本去重 / 排序 / 去空行','http-status':'HTTP 状态码查询'}
const count=ref(10),length=ref(24),upper=ref(false),hyphens=ref(true)
const alphabet=ref('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
const input=ref(''),right=ref(''),output=ref(''),hasResult=ref(false),error=ref(''),notice=ref(''),busy=ref(false)
const mode=ref<'lines'|'chars'>('lines'),trimDiff=ref(false)
const options=ref<TextOptions>({trim:false,empty:true,dedupe:true,ignoreCase:false,sort:'none'})
const query=ref(''),category=ref('')
const statuses=computed(()=>searchStatuses(query.value,category.value))
type Part={value:string;added:boolean;removed:boolean;count:number}
const parts=ref<Part[]>([])
const summary=computed(()=>({added:parts.value.filter(x=>x.added).reduce((s,x)=>s+x.count,0),removed:parts.value.filter(x=>x.removed).reduce((s,x)=>s+x.count,0)}))
let worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined,revision=0
function stop(){worker?.terminate();worker=null;clearTimeout(timer);busy.value=false}
function invalidate(){revision++;stop();hasResult.value=false;output.value='';parts.value=[];error.value='';notice.value=''}
watch([count,length,upper,hyphens,alphabet,input,right,mode,trimDiff,options],invalidate,{deep:true,flush:'sync'})
onBeforeUnmount(()=>{revision++;stop()})
function run(){
 invalidate();const version=revision
 try{
  if(props.kind==='uuid'){output.value=uuids(count.value,upper.value,hyphens.value);hasResult.value=true;notice.value='已生成 '+count.value+' 个 UUID'}
  else if(props.kind==='random'){output.value=randomStrings(length.value,count.value,alphabet.value);hasResult.value=true;notice.value='已生成 '+count.value+' 条随机字符串'}
  else{
   busy.value=true;worker=new Worker(new URL('./text.worker.ts',import.meta.url),{type:'module'})
   worker.onmessage=({data})=>{
    if(version!==revision)return
    stop()
    if(data.error){error.value=data.error;return}
    hasResult.value=true
    if(props.kind==='diff'){parts.value=data.result;output.value=JSON.stringify(data.result,null,2);notice.value=parts.value.some(x=>x.added||x.removed)?'比较完成，存在差异':'比较完成，文本相同（按当前选项）'}
    else{output.value=data.result.text;notice.value='处理完成：'+data.result.before+' 行 → '+data.result.after+' 行，移除 '+data.result.removed+' 行'}
   }
   worker.onerror=()=>{if(version===revision){stop();error.value='处理失败，请重试'}}
   worker.postMessage(props.kind==='diff'?{kind:'diff',left:input.value,right:right.value,mode:mode.value,trim:trimDiff.value}:{kind:'text',input:input.value,options:{...options.value}})
   timer=setTimeout(()=>{if(version===revision){stop();error.value='处理超过 3 秒，已终止；请缩短文本'}},3000)
  }
 }catch(e){error.value=e instanceof Error?e.message:'操作失败'}
}
function clear(){invalidate();input.value='';right.value=''}
function sample(){if(props.kind==='diff'){input.value='Hello Vue\n旧的一行\n';right.value='Hello Vue 3\n新的一行\n'}else{input.value='apple\nBanana\n\napple\n  orange  \n'}run()}
function swap(){const a=input.value;input.value=right.value;right.value=a}
async function copy(text=output.value){const version=revision;try{await copyText(text);if(version===revision)notice.value='已复制'}catch{if(version===revision)notice.value='复制失败，请手动选择复制'}}
function download(){downloadText(output.value,props.kind==='diff'?'diff.json':props.kind+'.txt',props.kind==='diff'?'application/json;charset=utf-8':'text/plain;charset=utf-8')}
</script>
<template>
<div class="tool-page productivity-page">
 <div class="tool-heading"><div><div class="eyebrow">开发工具 <span>/</span> LOCAL WORKSPACE</div><h1>{{ titles[kind] }}</h1><p>{{ kind==='http-status'?'按状态码、名称或中文说明查询，无需发送网络请求。':'所有输入和结果仅在当前页面内处理。' }}</p></div></div>
 <template v-if="kind==='http-status'">
  <section class="time-form"><label class="time-input-label">搜索状态码<input v-model="query" aria-label="搜索状态码" placeholder="例如 404、限流、Unauthorized" maxlength="200" /></label><label class="indent-label">分类<select v-model="category" aria-label="状态码分类"><option value="">全部</option><option value="1">1xx 信息响应</option><option value="2">2xx 成功</option><option value="3">3xx 重定向</option><option value="4">4xx 客户端错误</option><option value="5">5xx 服务端错误</option></select></label><p role="status">找到 {{ statuses.length }} 条</p></section>
  <section class="http-list" aria-label="状态码结果"><article v-for="row in statuses" :key="row.code" class="time-results"><header><h2>{{ row.code }} · {{ row.name }}</h2><button class="button" :aria-label="'复制状态码 '+row.code" @click="copy(row.code+' '+row.name+'\n'+row.meaning+'\n'+row.hint)">复制</button></header><strong>{{ row.meaning }}</strong><p>{{ row.hint }}</p></article><p v-if="!statuses.length">没有匹配条目。未分配代码和厂商私有码未收录，可调整关键词或分类。</p></section>
  <section class="encoding-rules"><h2>数据范围</h2><p>静态登记数据核对日期：2026-09-16。104 为临时登记（到期日 2026-11-13）；305 已弃用，306 / 418 未使用，510 已废弃。未分配区间、Nginx / CDN 私有状态码不收录。</p><p>说明用于排查方向，实际原因需结合响应头、正文与日志。查询不访问你的服务；以下来源链接需要主动打开。</p><a href="https://www.iana.org/assignments/http-status-codes/" target="_blank" rel="noopener noreferrer">IANA 状态码登记表</a></section>
 </template>
 <template v-else>
  <section class="time-form">
   <div v-if="kind==='uuid'||kind==='random'" class="encoding-options-row">
    <label class="indent-label">数量<input v-model.number="count" type="number" min="1" max="1000" aria-label="生成数量" /></label>
    <template v-if="kind==='uuid'"><span>版本：UUID v4</span><label><input v-model="upper" type="checkbox" />大写输出</label><label><input v-model="hyphens" type="checkbox" />保留连字符</label></template>
    <label v-else class="indent-label">长度<input v-model.number="length" type="number" min="1" max="4096" aria-label="字符串长度" /></label>
   </div>
   <template v-if="kind==='random'"><label class="time-input-label">字符集合<input v-model="alphabet" aria-label="字符集合" maxlength="2048" spellcheck="false" /></label><div class="primary-actions"><button class="button" @click="alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'">字母与数字</button><button class="button" @click="alphabet='0123456789'">纯数字</button><button class="button" @click="alphabet='0123456789abcdef'">十六进制</button><button class="button" @click="alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'">排除易混淆字符</button></div></template>
   <template v-if="kind==='diff'">
    <div class="encoding-options-row"><label class="indent-label">比较粒度<select v-model="mode" aria-label="比较粒度"><option value="lines">按行</option><option value="chars">按字符</option></select></label><label><input v-model="trimDiff" type="checkbox" />忽略每行首尾空白</label><button class="button" @click="swap">交换左右</button></div>
    <div class="text-columns"><label class="time-input-label">原文本<textarea v-model="input" aria-label="原文本" maxlength="200000" rows="12" spellcheck="false"></textarea></label><label class="time-input-label">新文本<textarea v-model="right" aria-label="新文本" maxlength="200000" rows="12" spellcheck="false"></textarea></label></div>
   </template>
   <template v-if="kind==='text'">
    <div class="encoding-options-row"><label><input v-model="options.trim" type="checkbox" />去首尾空白</label><label><input v-model="options.empty" type="checkbox" />去空行</label><label><input v-model="options.dedupe" type="checkbox" />去重</label><label><input v-model="options.ignoreCase" type="checkbox" />去重/排序忽略大小写</label><label class="indent-label">排序<select v-model="options.sort" aria-label="排序"><option value="none">保持顺序</option><option value="asc">升序</option><option value="desc">降序</option></select></label></div>
    <label class="time-input-label">输入文本<textarea v-model="input" aria-label="输入文本" maxlength="200000" rows="12" spellcheck="false"></textarea></label>
   </template>
   <div class="primary-actions"><button class="button primary" :disabled="busy" @click="run">{{ busy?'处理中…':kind==='diff'?'比较文本':kind==='text'?'处理文本':'生成' }}</button><button v-if="busy" class="button" @click="invalidate">停止</button><button v-if="kind==='diff'||kind==='text'" class="button" @click="sample">加载示例</button><button class="button" @click="clear">清空</button></div>
  </section>
  <section v-if="hasResult" class="time-results"><header><h2>处理结果</h2><div class="primary-actions"><button class="button" @click="copy()">复制{{ kind==='diff'?'差异 JSON':'结果' }}</button><button class="button" @click="download">下载</button><button v-if="kind==='text'" class="button" @click="input=output">结果作为输入</button></div></header>
   <template v-if="kind==='diff'"><p>新增 {{ summary.added }} / 删除 {{ summary.removed }} {{ mode==='lines'?'行':'个码点' }}；绿色 + 新增，红色 − 删除，灰色 = 相同。行尾换行以 ↵ 展示。</p><div class="diff-result"><div v-for="(part,i) in parts" :key="i" class="diff-part" :class="{added:part.added,removed:part.removed}"><span class="diff-marker">{{ part.added?'+':part.removed?'−':'=' }}</span><pre>{{ part.value.replace(/\n/g,'↵\n') }}</pre></div><p v-if="!parts.length">两侧均为空文本。</p></div></template>
   <textarea v-else :value="output" aria-label="处理结果" readonly rows="12"></textarea>
  </section>
  <section class="encoding-rules"><h2>使用规则</h2>
   <ul v-if="kind==='uuid'"><li>生成 UUID v4，固定版本与变体位，使用 crypto.getRandomValues。支持 1–1000 个，一行一个。</li><li>默认小写及标准连字符；去掉连字符后属于紧凑表示。随机 UUID 不承诺绝对无碰撞；不提供有序 ID。</li></ul>
   <ul v-else-if="kind==='random'"><li>使用 crypto.getRandomValues 和拒绝采样，避免取模偏差。没有安全随机源时直接报错，不使用 Math.random。</li><li>长度按 Unicode 码点计；字符集自动去重，允许 2–256 个不同字符，不允许空白或控制字符。长度 1–4096，数量 1–1000，总长度最多 100,000。</li><li>每个位置独立取样，不保证覆盖所选字符的每一类，也不保证批次内唯一。不保存生成内容。</li></ul>
   <ul v-else-if="kind==='diff'"><li>统一 CRLF / CR 为 LF 后比较。可忽略每行首尾空白；行内空白和末尾换行仍参与比较。按字符以 Unicode 码点为单位。</li><li>每侧按行上限 200,000、按字符上限 20,000 个 UTF-16 字符；最多 5000 个差异片段。Worker 最长 3 秒，复杂比较可提前停止。</li><li>下载为差异 JSON，包含片段和新增/删除标志，不是可应用的 Git 补丁。不提供自动合并。</li></ul>
   <ul v-else><li>顺序：去首尾空白 → 去空行 → 去重 → 排序。空行包括仅有空白的行；去重保留第一次出现的内容。</li><li>大小写忽略使用 toLowerCase；排序使用 UTF-16 字符串顺序，不是数值、拼音或自然排序。等价项保留输入先后顺序。</li><li>CRLF / CR 统一为 LF；末尾换行视为一个末尾空行。空输入计 0 行，最多 200,000 个 UTF-16 字符。</li></ul>
   <p>修改选项清除旧结果；清空、刷新、切换工具不保留数据。复制会进入系统剪贴板，下载会保存到本机。</p>
  </section>
 </template>
 <div v-if="error||notice" role="status" aria-live="polite" class="status-box" :class="{error:!!error}">{{ error||notice }}</div>
</div>
</template>
<style scoped>
.productivity-page textarea{width:100%;box-sizing:border-box;border:1px solid #dce1ee;border-radius:8px;padding:12px;resize:vertical;font:14px/1.6 monospace;background:white;color:#172b4d}
.productivity-page .time-input-label{margin-bottom:18px}
.productivity-page .encoding-options-row{margin-bottom:20px}
.productivity-page input[type=number]{width:90px;border:1px solid #dce1ee;border-radius:6px;padding:8px;background:white}
.text-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.diff-result{max-height:600px;overflow:auto}.diff-part{display:flex;background:#f3f5f8}.diff-part pre{margin:0;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}
.diff-marker{padding:8px;font-family:monospace}.added{background:#e5f5eb;color:#14532d}.removed{background:#fce7e7;color:#881337}
.http-list{display:grid;gap:12px}.http-list .time-results{margin:0}.http-list header{gap:12px}.http-list h2{overflow-wrap:anywhere;min-width:0}
.productivity-page .time-results header{flex-wrap:wrap;gap:12px}.productivity-page .encoding-rules p{line-height:1.8}
@media(max-width:820px){.text-columns{grid-template-columns:minmax(0,1fr)}}
</style>
