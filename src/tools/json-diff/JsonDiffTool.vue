<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,ref,watch } from 'vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText,downloadText } from '../../platform/browser'
import type { Difference } from './core'
const left=ref(''),right=ref(''),diffs=ref<Difference[]>([]),done=ref(false),busy=ref(false),error=ref(''),notice=ref(''),selected=ref(-1)
const leftEditor=ref<InstanceType<typeof CodeEditor>>(),rightEditor=ref<InstanceType<typeof CodeEditor>>()
const labels={'missing-left':'左侧缺少','missing-right':'右侧缺少',type:'类型不同',value:'值不同'}
let worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined,revision=0
function stop(){worker?.terminate();worker=null;clearTimeout(timer);busy.value=false}
function reset(){revision++;stop();diffs.value=[];done.value=false;selected.value=-1;error.value='';notice.value=''}
watch([left,right],reset,{flush:'sync'})
onBeforeUnmount(()=>{revision++;stop()})
const leftMarks=computed(()=>diffs.value.flatMap((d,i)=>d.left?[{...d.left,title:d.path+'：'+labels[d.kind],active:i===selected.value}]:[]))
const rightMarks=computed(()=>diffs.value.flatMap((d,i)=>d.right?[{...d.right,title:d.path+'：'+labels[d.kind],active:i===selected.value}]:[]))
const current=computed(()=>diffs.value[selected.value])
async function locate(index:number){
 if(!diffs.value.length)return
 selected.value=(index+diffs.value.length)%diffs.value.length
 await nextTick();const d=current.value;if(!d)return
 const l=d.left??{from:d.leftAnchor.from,to:d.leftAnchor.from}
 const r=d.right??{from:d.rightAnchor.from,to:d.rightAnchor.from}
 leftEditor.value?.reveal(l.from,l.to);rightEditor.value?.reveal(r.from,r.to)
}
function compare(){
 reset();busy.value=true;const version=revision
 worker=new Worker(new URL('./json-diff.worker.ts',import.meta.url),{type:'module'})
 worker.onmessage=({data})=>{if(version!==revision)return;stop();if(data.error){error.value=data.error;return}diffs.value=data.result;done.value=true;notice.value=diffs.value.length?'比较完成：'+diffs.value.length+' 处差异':'比较完成：结构与值相同';if(diffs.value.length)locate(0)}
 worker.onerror=()=>{if(version===revision){stop();error.value='比较失败，请重试'}}
 worker.postMessage({left:left.value,right:right.value})
 timer=setTimeout(()=>{if(version===revision){stop();error.value='比较超过 5 秒，已终止，请缩小输入'}},5000)
}
function sample(){left.value='{\n  "name": "张三",\n  "type": "user",\n  "age": 18,\n  "profile": {"active": true}\n}';right.value='{\n  "age": 18,\n  "name": "李四",\n  "profile": {"active": "true"}\n}';compare()}
function clear(){left.value='';right.value='';reset()}
function swap(){const old=left.value;left.value=right.value;right.value=old}
async function copy(){const version=revision;try{await copyText(JSON.stringify(diffs.value,null,2));if(version===revision)notice.value='差异已复制'}catch{if(version===revision)notice.value='复制失败，请手动复制'}}
</script>
<template>
<div class="tool-page json-diff-page">
 <div class="tool-heading"><div><div class="eyebrow">数据处理 <span>/</span> STRUCTURAL DIFF</div><h1>JSON 结构化对比</h1><p>对象字段忽略顺序，数组按位置比较。差异直接标记在原文中。</p></div></div>
 <section class="time-form"><div class="primary-actions"><button class="button primary" :disabled="busy" @click="compare">{{ busy?'比较中…':'比较 JSON' }}</button><button v-if="busy" class="button" @click="reset">停止</button><button class="button" @click="sample">加载示例</button><button class="button" @click="swap">交换左右</button><button class="button" @click="clear">清空</button></div></section>
 <div v-if="error||notice" class="status-box" :class="{error:!!error}" role="status" aria-live="polite">{{ error||notice }}</div>
 <section v-if="done&&diffs.length" class="time-form diff-navigation"><div class="primary-actions"><button class="button" @click="locate(selected-1)">上一处差异</button><span>{{ selected+1 }} / {{ diffs.length }}</span><button class="button" @click="locate(selected+1)">下一处差异</button></div><p v-if="current"><strong>{{ labels[current.kind] }}</strong> · <code>{{ current.path }}</code><span v-if="!current.left||!current.right">；缺少侧定位到父容器，原文不插入占位内容。</span></p></section>
 <div class="compare-editors">
  <section class="time-results"><header><h2>左侧 JSON</h2><span v-if="current?.kind==='missing-left'" class="missing-label">缺少 {{ current.path }}</span></header><CodeEditor ref="leftEditor" v-model="left" :marks="leftMarks" label="左侧 JSON 对比编辑器" @run="compare" /></section>
  <section class="time-results"><header><h2>右侧 JSON</h2><span v-if="current?.kind==='missing-right'" class="missing-label">缺少 {{ current.path }}</span></header><CodeEditor ref="rightEditor" v-model="right" :marks="rightMarks" label="右侧 JSON 对比编辑器" @run="compare" /></section>
 </div>
 <section v-if="done" class="time-results"><header><h2>差异列表（{{ diffs.length }}）</h2><div class="primary-actions"><button class="button" @click="copy">复制差异</button><button class="button" @click="downloadText(JSON.stringify(diffs,null,2),'json-diff.json')">下载差异</button></div></header><p v-if="!diffs.length">没有差异。对象字段顺序、排版及等值数字表示不影响结果。</p><p v-else>仅列出不同项；点击条目定位左右原文。红色背景和下划线表示差异，边框表示当前项。</p>
 <ol class="difference-list"><li v-for="(d,i) in diffs" :key="d.path" :class="{selected:i===selected}"><button class="difference-item" :aria-current="i===selected?'true':undefined" @click="locate(i)"><strong>{{ i+1 }}. {{ labels[d.kind] }} · {{ d.path }}</strong><span>左：{{ d.leftText }}</span><span>右：{{ d.rightText }}</span></button></li></ol>
 </section>
 <section class="encoding-rules"><h2>比较规则</h2><ul><li>对象字段按名称匹配，数组按下标匹配；不进行数组无序或按 id 匹配。嵌套差异使用 $["user"]["name"] 形式路径。</li><li>字段缺少不等于 null；数字 1 不等于字符串 "1"。数字按十进制精确数值比较，1 / 1.0 / 1e0 相同，大整数不经过 JavaScript Number。</li><li>值或类型不同标红两侧值；字段缺少标红存在侧整个字段。容器类型变化只列一项，不展开重复子差异。</li><li>两侧必须是严格 JSON，拒绝重复键和语法错误。修改任一输入立即清除旧标记，需要重新比较；高亮不修改内容。</li><li>每侧最多 1 MiB、128 层、2000 处差异，指数最多 1000 位；Worker 5 秒超时。Ctrl / ⌘ + Enter 比较；导航自动展开折叠区域。</li><li>本地处理，不上传或保存历史。列表长值截断预览，编辑器保留全文；下载为差异 JSON，不是补丁文件。</li></ul></section>
</div>
</template>
<style scoped>
.compare-editors{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}.compare-editors .time-results{min-width:0;padding:16px}
.compare-editors :deep(.code-editor){height:460px}.json-diff-page header{flex-wrap:wrap;gap:12px}
.missing-label{color:#991b1b;overflow-wrap:anywhere;font-size:12px}.diff-navigation p{overflow-wrap:anywhere}
.difference-list{list-style:none;padding:0;max-height:480px;overflow:auto}.difference-list li{margin-bottom:8px;border:1px solid #e2e5ee;border-radius:8px}.difference-list li.selected{border-color:#dc2626;background:#fff1f2}
.difference-item{width:100%;text-align:left;display:flex;flex-direction:column;gap:8px;border:0;padding:14px;background:transparent;color:inherit;cursor:pointer;overflow-wrap:anywhere;font:inherit}.difference-item span{font-family:monospace;white-space:pre-wrap}
@media(max-width:820px){.compare-editors{grid-template-columns:minmax(0,1fr)}}
</style>
