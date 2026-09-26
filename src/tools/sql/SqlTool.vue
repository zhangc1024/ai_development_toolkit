<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Play, Copy, Download, Trash2, FileText, Database, ShieldCheck } from '@lucide/vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText, downloadText } from '../../platform/browser'
import type { SqlOptions } from './core'
import type { SqlAnalysis } from './analyzer'
import { explainColumns, parseExplain, type ExplainRow } from './explain'
import { workbenchConfig } from '../workbench/config'
const input = ref(''), output = ref(''), error = ref(''), notice = ref('')
const analysis = ref<SqlAnalysis[]>([]), busy = ref(false)
const indent = ref<SqlOptions['indent']>('2'), keywordCase = ref<SqlOptions['keywordCase']>('upper')
const explainInput = ref(''), explainError = ref(''), explainRows = ref<ExplainRow[]>([])
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined
let revision = 0
function stop() { worker?.terminate(); worker = undefined; clearTimeout(timer); busy.value = false }
function invalidate() { stop(); revision++; output.value = ''; analysis.value = []; error.value = ''; notice.value = '' }
watch([input, indent, keywordCase], invalidate, { flush: 'sync' })
watch(explainInput, () => { explainRows.value = []; explainError.value = '' }, { flush: 'sync' })
onBeforeUnmount(stop)
function run(formatOnly = false) {
  invalidate()
  if (!input.value.trim()) { error.value = '请先输入 SQL'; return }
  if (input.value.length > 100_000) { error.value = 'SQL 输入上限为 100,000 字符'; return }
  try {
    worker = new Worker(new URL('./analyzer.worker.ts', import.meta.url), { type: 'module' })
    busy.value = true
    worker.onmessage = (event: MessageEvent<{output:string;analysis:SqlAnalysis[];error:string}>) => {
      output.value = event.data.output; analysis.value = event.data.analysis; error.value = event.data.error; stop()
    }
    worker.onerror = () => { stop(); error.value = '本地处理线程启动失败，请刷新后重试' }
    worker.postMessage({text:input.value,options:{indent:indent.value,keywordCase:keywordCase.value},formatOnly})
    timer = setTimeout(() => { stop(); error.value = '处理超过 5 秒已停止，请缩小输入' },5000)
  } catch { stop(); error.value = '当前环境无法启动本地处理线程' }
}
function clear() { input.value = ''; explainInput.value = ''; invalidate(); explainRows.value = []; explainError.value = '' }
function example() { input.value = workbenchConfig.sql.sample; run() }
async function copy() {
  const version = revision
  try { await copyText(output.value); if (version === revision) notice.value = '格式化 SQL 已复制' }
  catch { if (version === revision) notice.value = '复制失败，请选中结果后按 Ctrl+C' }
}
function download() {
  try { downloadText(output.value,'formatted.sql','text/plain;charset=utf-8'); notice.value = '已请求下载 SQL' }
  catch { notice.value = '下载失败，请复制结果' }
}
function explain() {
  explainRows.value = []; explainError.value = ''
  try { explainRows.value = parseExplain(explainInput.value) }
  catch (e) { explainError.value = e instanceof Error ? e.message : 'EXPLAIN 解析失败' }
}
function explainExample() {
  explainInput.value = 'table\ttype\tpossible_keys\tkey\trows\tfiltered\tExtra\norders\tALL\tidx_user_id\tNULL\t50000\t10\tUsing where; Using filesort; Using temporary'
  explain()
}
</script>
<template>
  <div class="tool-page encoding-page sql-page">
    <div class="tool-heading"><div><div class="eyebrow">数据处理 <span>/</span> LOCAL WORKSPACE</div><h1>MySQL SQL 分析器</h1><p>格式化 SQL，查看结构、静态风险与索引关注字段，并辅助解读 EXPLAIN。</p></div><div class="heading-icon"><Database :size="32" /></div></div>
    <div class="action-bar"><div class="primary-actions"><button class="button primary" :disabled="busy" @click="run()"><Play :size="15" />格式化并分析</button><button class="button" :disabled="busy" @click="run(true)">仅格式化</button><button class="button" @click="clear"><Trash2 :size="14" />一键清空</button></div><button class="button text-button" @click="example"><FileText :size="15" />加载示例</button></div>
    <section class="encoding-options" aria-label="SQL 设置"><div class="encoding-options-row"><span class="version-badge">MySQL</span><label class="indent-label">缩进<select v-model="indent"><option value="2">2 空格</option><option value="4">4 空格</option><option value="tab">Tab</option></select></label><label class="indent-label">关键字<select v-model="keywordCase"><option value="upper">大写</option><option value="lower">小写</option><option value="preserve">保留</option></select></label><span class="sql-muted">Ctrl / ⌘ + Enter 分析</span></div></section>
    <div class="editor-grid sql-grid">
      <section class="editor-card"><header class="editor-header"><h2><span class="panel-dot input-dot"></span>SQL 输入</h2></header><CodeEditor v-model="input" language="sql" label="SQL 输入" hint="粘贴 SELECT / INSERT / UPDATE / DELETE SQL…" @run="run()" /><footer class="editor-footer">{{ input.length.toLocaleString() }} / 100,000 字符</footer></section>
      <section class="editor-card"><header class="editor-header"><h2><span class="panel-dot output-dot"></span>格式化 SQL</h2><div class="editor-actions"><button :disabled="!output" @click="copy"><Copy :size="14" />复制</button><button :disabled="!output" @click="download"><Download :size="14" />下载</button></div></header><CodeEditor :model-value="output" language="sql" readonly label="格式化 SQL" hint="格式化结果将在这里显示" /><footer class="editor-footer"><span>{{ output.length.toLocaleString() }} 字符</span><span>只读 · MySQL</span></footer></section>
    </div>
    <div class="workspace-bottom"><span><ShieldCheck :size="14" />全部在浏览器本地处理，不上传 SQL，不连接数据库，不保存历史。</span></div>
    <div v-if="busy || error || notice" class="status-box" :class="{error:!!error}" role="status">{{ busy ? '正在本地处理…' : error || notice }}<span v-if="error && output">格式化结果可用，但基础分析未完成。</span></div>
    <section class="sql-panel sql-basics"><h2>基础分析</h2><p v-if="!analysis.length" class="sql-muted">输入 SQL 后点击“格式化并分析”。</p><article v-for="(item,i) in analysis" :key="i" class="sql-statement"><h3>语句 {{ i + 1 }} <span class="version-badge">{{ item.type }}</span></h3><dl class="sql-facts"><div v-for="(value,label) in { '数据表':item.tables.join(', '), 'SELECT 字段':item.fields, 'JOIN 条件':item.joins.join('；'), 'WHERE':item.where, 'GROUP BY':item.groupBy, 'ORDER BY':item.orderBy, 'LIMIT':item.limit }" :key="label"><dt>{{ label }}</dt><dd>{{ value || '未发现 / 不适用' }}</dd></div></dl></article></section>
    <div class="sql-lower">
      <section class="sql-panel"><h2>风险提示与优化建议</h2><p class="sql-muted">静态规则仅提供检查线索，不判断 SQL 一定存在性能问题。</p><p v-if="!analysis.length" class="sql-muted">完成分析后显示风险提示。</p><article v-for="(item,i) in analysis" :key="i" class="sql-statement"><h3>语句 {{ i + 1 }} · {{ item.type }}</h3><ul v-if="item.risks.length" class="sql-warnings"><li v-for="risk in item.risks" :key="risk">{{ risk }}</li></ul><p v-else>未命中当前规则；不代表无风险或性能最优。</p></article></section>
      <section class="sql-panel"><h2>索引辅助分析</h2><p class="sql-muted">候选字段按用途列出，不自动生成“最佳索引”。未限定表名的字段、别名和表达式需结合表结构核实。</p><article v-for="(item,i) in analysis" :key="i" class="sql-statement"><h3>语句 {{ i + 1 }} · {{ item.type }}</h3><dl><template v-for="group in item.indexes" :key="group.source"><dt>{{ group.source }}</dt><dd>{{ group.fields.join('、') || '未提取到字段' }}</dd></template></dl></article><p class="sql-note">联合索引通常遵循最左前缀原则：例如 (a, b, c) 可优先关注 a、(a, b)、(a, b, c) 的访问模式，不能假定只查 b 就能有效定位。字段顺序、等值 / 范围条件、选择性与排序都会影响效果，应结合已有索引和 EXPLAIN 验证，避免重复建索引。</p></section>
    </div>
    <section class="sql-panel sql-explain"><h2>EXPLAIN 分析</h2><p class="sql-muted">粘贴带表头的 MySQL 文本表格、TSV、CSV 或传统 EXPLAIN 行对象 JSON 数组。需包含 type、possible_keys、key、rows、filtered、Extra；暂不支持 FORMAT=JSON / TREE。</p><label class="sql-explain-label" for="explain-input">EXPLAIN 结果输入</label><textarea id="explain-input" v-model="explainInput" spellcheck="false" placeholder="table&#9;type&#9;possible_keys&#9;key&#9;rows&#9;filtered&#9;Extra" /><div class="primary-actions"><button class="button primary" @click="explain">分析 EXPLAIN</button><button class="button" @click="explainInput = ''; explainRows = []; explainError = ''">清空 EXPLAIN</button><button class="button text-button" @click="explainExample">加载示例</button></div><p v-if="explainError" class="status-box error" role="alert">{{ explainError }}</p>
      <div v-if="explainRows.length" class="sql-table" tabindex="0" role="region" aria-label="EXPLAIN 分析结果，可横向滚动"><table><thead><tr><th>行</th><th v-for="col in explainColumns" :key="col">{{ col }}</th></tr></thead><tbody><tr v-for="(row,i) in explainRows" :key="i"><td>{{ i + 1 }}</td><td v-for="col in explainColumns" :key="col" :class="{'sql-highlight':row.warnings.some(w=>w.field===col)}">{{ row.values[col] || 'NULL' }}</td></tr></tbody></table></div>
      <article v-for="(row,i) in explainRows" :key="i" class="sql-statement"><h3>第 {{ i + 1 }} 行 · {{ row.values.table }}</h3><ul v-if="row.warnings.length" class="sql-warnings"><li v-for="(warning,j) in row.warnings" :key="j">{{ warning.message }}</li></ul><p v-else>未命中当前提示规则，请继续结合实际数据与执行耗时判断。</p></article>
      <p class="sql-note">possible_keys 是候选索引，key 是实际选用索引；rows 与 filtered 是估算值，filtered 表示条件过滤后保留比例（%）。本工具不会执行 SQL，EXPLAIN 输入与上方 SQL 独立，不自动判断二者是否对应。</p>
    </section>
    <section class="encoding-rules"><h2>第一版规则与范围</h2><ul><li>支持常见 SELECT / INSERT / UPDATE / DELETE，可按分号拆分多条语句。未实现完整 SQL 语法校验；格式化成功不代表 SQL 可执行。</li><li>暂不分析 CTE、子查询、UNION、INSERT SELECT 和可执行注释；复杂语法可尝试“仅格式化”。按 MySQL 默认引号与反斜杠转义规则处理，不解析自定义 SQL mode。</li><li>规则阈值：LIMIT offset ≥ 10,000；WHERE 中 OR ≥ 3 个；EXPLAIN rows ≥ 10,000。阈值是提醒标准，不是性能好坏界限。</li><li>SQL 和 EXPLAIN 各限 100,000 字符；SQL 处理超过 5 秒停止。修改输入会清除对应旧结果。</li></ul></section>
  </div>
</template>
<style scoped>
.sql-grid{align-items:stretch;grid-template-columns:repeat(2,minmax(0,1fr))}.sql-grid>.editor-card{min-width:0}.sql-basics{margin-top:20px}.sql-statement .sql-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}.sql-facts>div{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px;padding:10px 0;border-bottom:1px solid #f0f1f6}.sql-panel{border:1px solid #e7e9f0;border-radius:12px;background:#fff;padding:22px;min-width:0}.sql-panel h2{font-size:16px;margin:0 0 14px;color:#303b52}.sql-muted,.sql-note{color:#748099;font-size:12px;line-height:1.8}.sql-note{padding:14px;background:#f7f6fd;border-radius:8px;margin-bottom:0}.sql-statement{border-top:1px solid #edf0f5;padding-top:14px;margin-top:14px;font-size:13px;line-height:1.8}.sql-statement h3{font-size:13px;margin:0 0 10px;color:#58647b}.sql-statement dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px;margin:0}.sql-statement dt{color:#748099}.sql-statement dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:Consolas,monospace;color:#39455b}.sql-lower{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin:20px 0}.sql-warnings{padding-left:20px;margin:0;color:#8a5b20}.sql-warnings li+li{margin-top:10px}.sql-explain-label{display:block;font-size:13px;margin:16px 0 8px}.sql-explain textarea{display:block;box-sizing:border-box;width:100%;min-height:170px;resize:vertical;border:1px solid #dde1ec;border-radius:8px;padding:14px;font:13px/1.7 Consolas,monospace;margin-bottom:16px;color:#39455b;background:#fcfdff}.sql-explain textarea:focus{outline:2px solid #8b5cf6;outline-offset:2px}.sql-table{overflow:auto;margin-top:20px}.sql-table table{width:100%;border-collapse:collapse;font-size:12px;text-align:left;min-width:720px}.sql-table th,.sql-table td{padding:12px;border-bottom:1px solid #e7e9f0;max-width:300px;overflow-wrap:anywhere}.sql-table th{background:#f5f7fb;color:#59657b}.sql-highlight{background:#fff5df;color:#885b19;font-weight:600}.sql-page :deep(.code-editor){height:340px}.sql-page :deep(.cm-editor){height:100%}.sql-page :deep(.cm-scroller){overflow:auto}.sql-page .status-box{display:flex;flex-wrap:wrap;gap:8px}.sql-page .primary-actions{flex-wrap:wrap}.sql-page .encoding-rules{margin-top:20px}@media(max-width:900px){.sql-statement .sql-facts{grid-template-columns:1fr}.sql-lower{grid-template-columns:1fr}.sql-grid{grid-template-columns:1fr}.sql-panel{padding:16px}}@media(max-width:600px){.sql-page .action-bar{align-items:flex-start;gap:10px;flex-wrap:wrap}.sql-statement dl,.sql-facts>div{grid-template-columns:80px minmax(0,1fr)}.sql-page :deep(.code-editor){height:280px}}
</style>
