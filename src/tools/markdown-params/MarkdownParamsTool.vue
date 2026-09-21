<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileText, Eye, Link, Code, ChartColumn, Copy, WandSparkles, Trash2, Maximize2, X, ShieldCheck } from '@lucide/vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText } from '../../platform/browser'
import { autoMap, convertTable, parseMarkdown, type Mapping, type OutputFormat } from './core'

const example = '# 用户接口参数说明\n\n用于获取用户信息的接口参数列表。\n\n## 请求参数\n\n| key | 说明 | 格式 | 备注 | 默认值 |\n|---|---|---|---|---|\n| page | 页码 | int | 从1开始 | 1 |\n| keyword | 搜索词 | string | 可为空 | "" |\n| enabled | 是否启用 | bool | - | true |\n| tags | 标签 | array | 可为空 | [] |'
const input = ref(example), enabled = ref(true), tableIndex = ref(0), format = ref<OutputFormat>('json'), indent = ref<'2' | '4'>('2')
const mapping = ref<Mapping>({ key: -1, type: -1, default: -1 }), notice = ref(''), fullPreview = ref(false)
const formats: { id: OutputFormat; label: string }[] = [{ id: 'json', label: 'JSON' }, { id: 'php', label: 'PHP Array' }, { id: 'javascript', label: 'JavaScript Object' }, { id: 'python', label: 'Python Dict' }]
const fields: { id: keyof Mapping; label: string; hint: string }[] = [{ id: 'key', label: 'Key 字段', hint: '参数名，必选' }, { id: 'type', label: '类型字段', hint: '数据类型' }, { id: 'default', label: '默认值字段', hint: '参数默认值' }]
const parsed = computed(() => { try { return { ...parseMarkdown(input.value), error: '' } } catch (e) { return { tables: [], blocks: [], error: (e as Error).message } } })
const table = computed(() => parsed.value.tables[tableIndex.value])
watch(() => parsed.value.tables.length, n => { if (tableIndex.value >= n) tableIndex.value = 0 })
function recognize() { mapping.value = autoMap(table.value?.headers ?? []) }
watch(() => JSON.stringify([tableIndex.value, table.value?.headers]), recognize, { immediate: true })
const result = computed(() => {
 if (!enabled.value) return { output: '', error: '', count: 0, types: [], warnings: [] }
 if (!table.value) return { output: '', error: parsed.value.error || (input.value.trim() ? '未发现 Markdown 表格，请检查表头下方是否包含 --- 分隔行。' : ''), count: 0, types: [], warnings: [] }
 try { return { ...convertTable(table.value, mapping.value, format.value, indent.value), error: '' } }
 catch (e) { return { output: '', error: (e as Error).message, count: 0, types: [], warnings: [] } }
})
watch([input, format, indent, enabled, mapping], () => { notice.value = '' }, { deep: true })
async function copy() {
 const value = result.value.output
 try { await copyText(value); if (result.value.output === value) notice.value = '代码已复制' }
 catch { notice.value = '复制失败，请在结果编辑器中手动复制' }
}
</script>

<template>
 <div class="tool-page markdown-params">
  <div class="tool-heading"><div><div class="eyebrow">数据处理 <span>/</span> MARKDOWN PARAMETERS</div><h1>Markdown 参数转换器</h1><p>粘贴 Markdown 参数表，映射字段，实时生成 JSON / PHP / JavaScript / Python。</p></div><div class="heading-icon"><FileText :size="29" /></div></div>
  <div class="md-top-grid">
   <section class="md-card">
    <header class="md-card-head"><div class="md-title"><span class="md-icon"><FileText :size="21" /></span><div><h2>1. Markdown 编辑区</h2><p>编辑或粘贴文档，右侧实时预览</p></div></div><div class="md-actions"><button class="button" @click="input = example">示例文档</button><button class="button" @click="input = ''"><Trash2 :size="14" />清空</button></div></header>
    <div class="md-editor"><CodeEditor v-model="input" label="Markdown 编辑区" language="text" hint="在此粘贴 Markdown 参数表…" /></div>
    <footer class="md-editor-foot"><span>{{ input ? input.split('\n').length : 0 }} 行 · {{ input.length.toLocaleString() }} 字符</span><span><ShieldCheck :size="13" />仅在浏览器中处理</span></footer>
   </section>
   <section class="md-card" :class="{ 'md-full-preview': fullPreview }" @keydown.esc="fullPreview = false" @keydown.tab="fullPreview && $event.preventDefault()" :role="fullPreview ? 'dialog' : undefined" :aria-modal="fullPreview || undefined" aria-label="Markdown 实时预览">
    <header class="md-card-head"><div class="md-title"><span class="md-icon"><Eye :size="21" /></span><div><h2>2. 实时预览</h2><p>预览标题、段落、代码块与参数表</p></div></div><button class="button" :aria-expanded="fullPreview" @click="fullPreview = !fullPreview"><component :is="fullPreview ? X : Maximize2" :size="14" />{{ fullPreview ? '退出预览' : '全屏预览' }}</button></header>
    <div class="md-preview">
     <p v-if="!input.trim()" class="md-empty">粘贴 Markdown 后，在这里查看文档预览。</p>
     <p v-if="parsed.error" class="md-error">{{ parsed.error }}</p>
     <template v-for="(block, i) in parsed.blocks" :key="i">
      <component :is="'h' + block.level" v-if="block.kind === 'heading'">{{ block.text }}</component>
      <div v-else-if="block.kind === 'table'" class="md-table-scroll"><table><thead><tr><th v-for="(header, j) in block.table.headers" :key="j">{{ header }}</th></tr></thead><tbody><tr v-for="row in block.table.rows" :key="row.line"><td v-for="(cell, j) in row.cells" :key="j">{{ cell }}</td></tr></tbody></table></div>
      <pre v-else-if="block.kind === 'code'">{{ block.text }}</pre>
      <p v-else>{{ block.text }}</p>
     </template>
    </div>
   </section>
  </div>
  <section class="md-conversion-bar"><label><input v-model="enabled" type="checkbox" role="switch" /><strong>开启参数转换</strong><span class="md-badge">{{ enabled ? '已开启' : '已关闭' }}</span></label><p>根据字段映射生成参数值对象，内容与映射调整后即时更新。</p></section>
  <div v-if="enabled" class="md-bottom-grid">
   <section class="md-card md-mapping">
    <header class="md-card-head"><div class="md-title"><span class="md-icon"><Link :size="21" /></span><div><h2>3. 字段映射</h2><p>自由选择列，不受表头顺序限制</p></div></div><button class="button" :disabled="!table" @click="recognize"><WandSparkles :size="14" />自动识别</button></header>
    <div class="md-card-body">
     <label v-if="parsed.tables.length > 1" class="md-field"><span>选择表格</span><select v-model="tableIndex" aria-label="选择表格"><option v-for="(item, i) in parsed.tables" :key="i" :value="i">表格 {{ i + 1 }} · 第 {{ item.line }} 行</option></select></label>
     <label v-for="field in fields" :key="field.id" class="md-field"><span>{{ field.label }}</span><select v-model="mapping[field.id]" :aria-label="field.label" :disabled="!table"><option :value="-1">{{ field.id === 'key' ? '请选择列' : '不使用此字段' }}</option><option v-for="(header, i) in table?.headers ?? []" :key="i" :value="i">{{ header || '未命名' }}（第 {{ i + 1 }} 列）</option></select></label>
     <p class="md-help">类型和默认值至少选择一项。默认值留空时使用类型默认值；未指定类型时自动推断。</p>
     <div class="md-feedback" :class="{ 'md-error': result.error }" role="status">{{ result.error || (result.output ? '已识别 ' + result.count + ' 个参数，字段映射正确。' : '等待粘贴 Markdown 参数表。') }}</div>
    </div>
   </section>
   <section class="md-card md-result">
    <header class="md-card-head"><div class="md-title"><span class="md-icon"><Code :size="21" /></span><div><h2>4. 转换结果</h2><p>可直接使用的参数值，无额外元数据</p></div></div><button class="button" :disabled="!result.output" @click="copy"><Copy :size="14" />复制代码</button></header>
    <div class="md-output-options"><div class="md-tabs" role="group" aria-label="输出格式"><button v-for="item in formats" :key="item.id" :aria-pressed="format === item.id" :class="{ active: format === item.id }" @click="format = item.id">{{ item.label }}</button></div><label class="md-indent">缩进<select v-model="indent" aria-label="输出缩进"><option value="2">2 空格</option><option value="4">4 空格</option></select></label></div>
    <div class="md-output"><CodeEditor :key="format" :model-value="result.output" readonly label="转换结果" :language="format === 'json' ? 'json' : 'text'" :hint="result.error ? '请先修正字段映射或表格内容' : '转换后的代码将显示在这里'" /></div>
    <p class="md-copy-notice" role="status">{{ notice || '已自动格式化 · 修改内容后实时更新' }}</p>
   </section>
   <section class="md-card md-summary">
    <header class="md-card-head"><div class="md-title"><span class="md-icon"><ChartColumn :size="21" /></span><div><h2>5. 解析结果</h2><p>当前所选参数表的转换信息</p></div></div></header>
    <div class="md-card-body"><dl><div><dt>参数行数</dt><dd>{{ table?.rows.length ?? 0 }}</dd></div><div><dt>成功转换</dt><dd>{{ result.count }}</dd></div><div><dt>识别类型</dt><dd><span v-for="type in result.types" :key="type" class="md-type">{{ type }}</span><span v-if="!result.types.length">—</span></dd></div><div><dt>数据来源</dt><dd>Markdown 表格</dd></div></dl><p class="md-help">支持数字、字符串、布尔、数组、对象与 null。参数名按原文保留，不展开点号或中括号。</p><p v-for="warning in result.warnings" :key="warning" class="md-help">{{ warning }}</p></div>
   </section>
  </div>
 </div>
</template>

<style scoped>
.markdown-params{max-width:1800px;width:100%;margin:0 auto;padding-top:28px}
.markdown-params .tool-heading{margin-bottom:22px}
.md-top-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.md-card{min-width:0;background:#fff;border:1px solid #e3e5ee;border-radius:12px;overflow:hidden}
.md-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:18px 16px}
.md-title{display:flex;align-items:center;gap:10px;min-width:0}
.md-icon{display:grid;place-items:center;flex-shrink:0;width:37px;height:39px;border-radius:10px;background:#f0ecfc;color:#7561d9}
.md-title h2{font-size:15px;margin:0 0 5px;font-weight:650}
.md-title p{font-size:11px;color:#8690a2;margin:0;line-height:1.6}
.md-actions{display:flex;gap:6px}
.md-card .button{font-size:11px;padding:7px 9px}
.md-editor,.md-output{margin:0 14px;border:1px solid #e5e7ef;border-radius:7px;overflow:hidden}
.md-editor :deep(.code-editor){height:312.5px}
.md-editor-foot{display:flex;justify-content:space-between;gap:8px;padding:10px 16px;color:#929aab;font-size:10px}
.md-editor-foot span:last-child{display:flex;align-items:center;gap:4px}
.md-preview{height:357.5px;overflow:auto;padding:0 20px 20px;font-size:13px;line-height:1.8;overflow-wrap:anywhere}
.md-preview h1{font-size:25px;display:block;border-bottom:1px solid #e9ecf2;padding-bottom:9px;margin:2px 0 8px}
.md-preview h2{font-size:19px;margin:18px 0 10px}
.md-preview h3,.md-preview h4,.md-preview h5,.md-preview h6{margin:14px 0 8px}
.md-preview p{white-space:pre-wrap;margin:8px 0 16px}
.md-table-scroll{overflow:auto;border:1px solid #e5e7ef;border-radius:7px}
.md-preview table{border-collapse:collapse;width:100%;font-size:12px}
.md-preview th{background:#f7f6fb;font-weight:600;text-align:left}
.md-preview th,.md-preview td{padding:7px 12px;border-bottom:1px solid #e9ecf2;border-right:1px solid #e9ecf2;min-width:70px;white-space:pre-wrap}
.md-preview tr:last-child td{border-bottom:0}
.md-preview pre{white-space:pre-wrap;background:#f7f8fb;padding:12px;border-radius:7px}
.md-conversion-bar{display:flex;align-items:center;gap:20px;flex-wrap:wrap;background:#fff;border:1px solid #e3e5ee;border-radius:10px;padding:14px 18px;margin:16px 0}
.md-conversion-bar label{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px}
.md-conversion-bar input{appearance:none;width:40px;height:23px;border-radius:20px;background:#d5d8e0;position:relative;margin:0;cursor:pointer}
.md-conversion-bar input:before{content:'';position:absolute;top:3px;left:3px;width:17px;height:17px;background:white;border-radius:50%;transition:transform .15s}
.md-conversion-bar input:checked{background:#7561d9}.md-conversion-bar input:checked:before{transform:translateX(17px)}
.md-badge{font-size:10px;background:#f0ecfc;color:#7561d9;border-radius:12px;padding:4px 8px}
.md-conversion-bar p{font-size:11px;color:#8690a2;margin:0;line-height:1.8}
.md-bottom-grid{display:grid;grid-template-columns:minmax(260px,1.05fr) minmax(340px,1.45fr) minmax(210px,.85fr);gap:16px}
.md-card-body{padding:0 16px 16px}
.md-field{display:grid;grid-template-columns:80px minmax(0,1fr);align-items:center;gap:10px;margin:0 0 13px;font-size:12px}
.md-field select,.md-indent select{width:100%;min-width:0;padding:8px;border:1px solid #dfe3ed;border-radius:6px;background:white;color:#536079}
.md-help{font-size:11px;color:#7c869b;line-height:1.9;margin:14px 0 0;overflow-wrap:anywhere}
.md-feedback{background:#eef7f1;color:#427960;border-radius:7px;padding:10px 12px;font-size:11px;line-height:1.8;margin-top:16px;overflow-wrap:anywhere}
.md-error{background:#fff1f0;color:#b04c4c}
.md-output-options{padding:0 14px 9px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.md-tabs{display:flex;gap:3px;flex-wrap:wrap}
.md-tabs button{border:0;border-bottom:2px solid transparent;background:#f7f6fb;padding:7px 9px;border-radius:5px 5px 0 0;color:#778097;font-size:11px}
.md-tabs button.active{color:#7561d9;border-bottom-color:#7561d9;background:#f0ecfc}
.md-indent{display:flex;align-items:center;gap:7px;color:#8690a2;font-size:10px}.md-indent select{padding:4px;width:auto}
.md-output :deep(.code-editor){height:200px}
.md-copy-notice{font-size:10px;color:#8690a2;margin:10px 16px;min-height:15px}
.md-summary dl{border:1px solid #ecebf3;background:#fafafd;border-radius:8px;padding:12px;margin:0;font-size:11px}
.md-summary dl>div{display:grid;grid-template-columns:68px 1fr;gap:8px;line-height:1.8;margin:0 0 12px}.md-summary dl>div:last-child{margin:0}
.md-summary dt{color:#7c869b}.md-summary dd{margin:0;overflow-wrap:anywhere}
.md-type{display:inline-block;background:#f0ecfc;color:#7561d9;border-radius:4px;padding:0 5px;margin:0 4px 4px 0;font:10px/1.9 Consolas,monospace}
.md-empty{color:#929aab;text-align:center;padding-top:70px}
.md-full-preview{position:fixed;inset:20px;z-index:100;box-shadow:0 0 0 30px #28324880;display:flex;flex-direction:column}.md-full-preview .md-preview{height:auto;flex:1;overscroll-behavior:contain}
@media(max-width:1250px){.md-bottom-grid{grid-template-columns:minmax(250px,1fr) minmax(300px,1.4fr)}.md-summary{grid-column:1/-1}.md-summary dl{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.md-summary dl>div{margin:0}.md-card-head{flex-wrap:wrap}.md-top-grid .md-card-head{min-height:105px}}
@media(max-width:900px){.md-top-grid,.md-bottom-grid{grid-template-columns:1fr}.md-summary{grid-column:auto}.md-top-grid .md-card-head{min-height:0}.md-summary dl{grid-template-columns:1fr 1fr}.md-preview{height:312.5px}.md-conversion-bar{gap:10px}}
@media(max-width:480px){.md-card-head{padding:14px 12px}.md-title h2{font-size:14px}.md-summary dl{grid-template-columns:1fr}.md-conversion-bar{padding:12px}.md-conversion-bar label{font-size:13px}.md-full-preview{inset:8px}}
</style>
