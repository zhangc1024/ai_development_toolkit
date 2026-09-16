<script setup lang="ts">
import { onBeforeUnmount,ref,watch } from 'vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText,downloadText } from '../../platform/browser'
import type { Format } from './core'
const source=ref<Format>('json'),target=ref<Format>('php'),input=ref(''),output=ref(''),error=ref(''),notice=ref(''),warnings=ref<string[]>([])
const indent=ref<'2'|'4'|'tab'>('2'),emptyPhp=ref<'list'|'map'>('list'),busy=ref(false)
const names={json:'JSON',php:'PHP Array',python:'Python 字典 / 列表'}
let worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined,revision=0
function stop(){worker?.terminate();worker=null;clearTimeout(timer);busy.value=false}
function reset(){revision++;stop();output.value='';error.value='';notice.value='';warnings.value=[]}
watch([input,source,target,indent,emptyPhp],reset,{flush:'sync'})
onBeforeUnmount(()=>{revision++;stop()})
function run(){
 reset();const v=revision;busy.value=true
 worker=new Worker(new URL('./literal.worker.ts',import.meta.url),{type:'module'})
 worker.onmessage=({data})=>{if(v!==revision)return;stop();if(data.error)error.value=data.error;else{output.value=data.result.output;warnings.value=data.result.warnings;notice.value='转换完成'}}
 worker.onerror=()=>{if(v===revision){stop();error.value='转换失败，请检查输入'}}
 worker.postMessage({input:input.value,source:source.value,target:target.value,settings:{indent:indent.value,emptyPhp:emptyPhp.value}})
 timer=setTimeout(()=>{if(v===revision){stop();error.value='转换超过 3 秒，已终止'}},3000)
}
function sample(){
 const samples={json:'{"name":"开发工具箱","enabled":true,"missing":null,"id":9223372036854775807,"tags":["PHP","Python"],"config":{}}',php:'array("name" => "开发工具箱", "enabled" => true, "missing" => null, "id" => 9223372036854775807, "tags" => ["PHP", "Python"])',python:"{'name': '开发工具箱', 'enabled': True, 'missing': None, 'id': 9223372036854775807, 'tags': ['PHP', 'Python'], 'config': {}}"}
 input.value=samples[source.value];run()
}
function reuse(){const text=output.value,old=source.value;source.value=target.value;target.value=old;input.value=text;run()}
async function copy(){const v=revision;try{await copyText(output.value);if(v===revision)notice.value='结果已复制'}catch{if(v===revision)notice.value='复制失败，请手动复制'}}
function download(){downloadText(output.value,'converted.'+({json:'json',php:'php',python:'py'}[target.value]),'text/plain;charset=utf-8')}
</script>
<template>
<div class="tool-page">
 <div class="tool-heading"><div><div class="eyebrow">数据处理 <span>/</span> LITERAL CONVERTER</div><h1>JSON ↔ PHP / Python</h1><p>三种数据字面量互转，保留数字原文，不执行输入代码。</p></div></div>
 <section class="time-form">
  <div class="encoding-options-row">
   <label class="indent-label">源格式<select v-model="source" aria-label="源格式"><option v-for="(name,key) in names" :key="key" :value="key">{{ name }}</option></select></label>
   <label class="indent-label">目标格式<select v-model="target" aria-label="目标格式"><option v-for="(name,key) in names" :key="key" :value="key">{{ name }}</option></select></label>
   <label class="indent-label">缩进<select v-model="indent" aria-label="缩进"><option value="2">2 空格</option><option value="4">4 空格</option><option value="tab">Tab</option></select></label>
   <label v-if="source==='php'" class="indent-label">PHP 空数组解释<select v-model="emptyPhp" aria-label="PHP 空数组解释"><option value="list">列表 []</option><option value="map">映射 {}</option></select></label>
  </div>
  <div class="primary-actions"><button class="button primary" :disabled="busy" @click="run">{{ busy?'转换中…':'转换' }}</button><button v-if="busy" class="button" @click="reset">停止</button><button class="button" @click="sample">加载示例</button><button class="button" @click="input='';reset()">清空</button><button class="button" :disabled="!output" @click="reuse">结果反向转换</button></div>
 </section>
 <div v-if="error||notice" role="status" class="status-box" :class="{error:!!error}">{{ error||notice }}</div>
 <div v-if="warnings.length" class="status-box"><ul><li v-for="item in warnings" :key="item">{{ item }}</li></ul></div>
 <div class="literal-editors">
  <section class="time-results"><header><h2>{{ names[source] }} 输入</h2></header><CodeEditor :key="'input-'+source" v-model="input" label="字面量输入编辑器" :language="source==='json'?'json':'text'" @run="run" /></section>
  <section class="time-results"><header><h2>{{ names[target] }} 结果</h2><div class="primary-actions"><button class="button" :disabled="!output" @click="copy">复制</button><button class="button" :disabled="!output" @click="download">下载</button></div></header><CodeEditor :key="'output-'+target" :model-value="output" readonly label="字面量结果编辑器" :language="target==='json'?'json':'text'" /></section>
 </div>
 <section class="encoding-rules"><h2>转换规则</h2><ul>
 <li>支持嵌套对象/字典、列表、字符串、十进制数字、布尔和空值。数字保留原文，不经过 JavaScript Number；运行到 PHP/Python 后仍受语言数值范围影响。</li>
 <li>PHP 支持 [...]、array(...)、字符串/整数键、隐式索引和末尾分号；不支持 PHP 标签、return、变量、函数或注释。整数键按 64 位规则，连续有序 0…n 键转为列表。</li>
 <li>Python 支持 {...}、[...]、单/双引号、True / False / None。整数字典键转为字符串；不支持元组、集合、推导式、函数或赋值。</li>
 <li>PHP / Python 允许尾逗号；JSON 严格校验。仅支持受限字符串转义与 JSON 风格十进制数字，不支持十六进制数字、NaN、Infinity、原始/三引号字符串。</li>
 <li>拒绝重复键和归一化冲突键。PHP 无法区分空对象与空列表，空数组解释选项对所有空数组生效；PHP 数字字符串键可能改变类型。</li>
 <li>上限 1 MiB、128 层，Worker 3 秒终止保护。Ctrl / ⌘ + Enter 转换。修改输入清除旧结果，切换工具或刷新不保存内容。</li>
 </ul></section>
</div>
</template>
<style scoped>
.literal-editors{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.literal-editors .time-results{padding:16px;min-width:0}.literal-editors header{flex-wrap:wrap;gap:10px}
.literal-editors :deep(.code-editor){height:450px}.encoding-options-row{margin-bottom:18px}
@media(max-width:820px){.literal-editors{grid-template-columns:minmax(0,1fr)}}
</style>
