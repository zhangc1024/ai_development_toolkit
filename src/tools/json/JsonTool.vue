<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Braces, WandSparkles, Minimize2, CircleCheck, Upload, Copy, Download, Trash2, Search, ChevronDown, ShieldCheck, ArrowRight, FileJson, WrapText } from '@lucide/vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText, downloadText } from '../../platform/browser'
import { MAX_BYTES, type Action, type Result } from './core'
const input = ref('')
const output = ref('')
const indent = ref<'2' | '4' | 'tab'>('2')
const wrap = ref(true)
const result = ref<Result | null>(null)
const busy = ref(false)
const notice = ref('')
const inputEditor = ref<InstanceType<typeof CodeEditor>>()
const outputEditor = ref<InstanceType<typeof CodeEditor>>()
const fileInput = ref<HTMLInputElement>()
let worker: Worker | undefined
let timeout: ReturnType<typeof setTimeout> | undefined
let fileVersion = 0
const bytes = (text: string) => new TextEncoder().encode(text).length
const inputBytes = computed(() => bytes(input.value))
const inputLines = computed(() => input.value ? input.value.split(/\r\n|\r|\n/).length : 0)
const outputBytes = computed(() => bytes(output.value))
const reduction = computed(() => inputBytes.value ? Math.round((1 - outputBytes.value / inputBytes.value) * 100) : 0)
const sample = '{"project":"开发工具箱","version":"1.0.0","orderId":9223372036854775807,"features":["格式化","压缩","校验"],"settings":{"localOnly":true,"indent":2},"description":null}'
function stop() { worker?.terminate(); worker = undefined; clearTimeout(timeout); busy.value = false }
watch(input, () => { stop(); fileVersion++; result.value = null; output.value = ''; notice.value = '' }, { flush: 'sync' })
onBeforeUnmount(() => { stop(); fileVersion++ })
function run(action: Action) {
  stop(); notice.value = ''; output.value = ''; result.value = null
  if (inputBytes.value > MAX_BYTES) { result.value = { ok: false, message: '输入超过 1 MiB，请缩小内容后重试' }; return }
  if (!input.value.trim()) { result.value = { ok: false, message: '请先输入 JSON 内容' }; return }
  try {
    worker = new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' })
    busy.value = true
    worker.onmessage = (event: MessageEvent<Result>) => {
      result.value = event.data; output.value = event.data.output ?? ''; stop()
    }
    worker.onerror = () => { stop(); result.value = { ok: false, message: '处理线程未能运行，请刷新页面重试' } }
    worker.postMessage({ text: input.value, action, indent: indent.value })
    timeout = setTimeout(() => { stop(); result.value = { ok: false, message: '处理超过 5 秒，已停止，请减少内容后重试' } }, 5000)
  } catch { stop(); result.value = { ok: false, message: '当前环境无法启动处理线程' } }
}
function clear() { stop(); input.value = ''; output.value = ''; result.value = null; notice.value = '' }
function loadSample() { input.value = sample; run('format') }
async function importFile(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]; element.value = ''
  if (!file) return
  if (file.size > MAX_BYTES) { notice.value = '文件超过 1 MiB，未导入'; return }
  const version = ++fileVersion
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    if (version !== fileVersion) return
    input.value = text; notice.value = '文件已导入，请选择格式化、压缩或校验'
  } catch { if (version === fileVersion) notice.value = '读取失败，请使用 UTF-8 编码的文件' }
}
async function copy() {
  try { await copyText(output.value); notice.value = '结果已复制' }
  catch { notice.value = '复制失败，请在结果编辑器中选中内容后按 Ctrl+C' }
}
function download() {
  try { downloadText(output.value, 'result.json'); notice.value = '已请求下载 result.json' }
  catch { notice.value = '下载失败，请复制结果后手动保存' }
}
</script>
<template>
  <div class="tool-page">
    <div class="tool-heading"><div><div class="eyebrow">数据处理 <span>/</span> JSON WORKSPACE</div><h1>JSON 格式化<span class="version-badge">JSON</span></h1><p>让数据清晰有序。格式化、压缩与校验，在一个工作区完成。</p></div><div class="heading-icon"><Braces :size="32" :stroke-width="1.5" /></div></div>
    <div class="action-bar"><div class="primary-actions">
      <button class="button primary" @click="run('format')" :disabled="busy"><WandSparkles :size="16" />格式化<kbd>Ctrl ↵</kbd></button>
      <button class="button" @click="run('minify')" :disabled="busy"><Minimize2 :size="16" />压缩</button>
      <button class="button" @click="run('validate')" :disabled="busy"><CircleCheck :size="16" />校验</button>
      <span class="toolbar-divider"></span><label class="indent-label">缩进<select v-model="indent" aria-label="缩进"><option value="2">2 空格</option><option value="4">4 空格</option><option value="tab">Tab</option></select></label>
    </div><button class="button text-button" @click="loadSample" :disabled="busy"><FileJson :size="15" />加载示例</button></div>
    <div class="editor-grid">
      <section class="editor-card"><header class="editor-header"><h2><span class="panel-dot input-dot"></span>输入 JSON</h2><div class="editor-actions"><input ref="fileInput" type="file" accept=".json,.txt,application/json,text/plain" hidden @change="importFile" /><button @click="fileInput?.click()" title="导入 UTF-8 文件"><Upload :size="14" />导入</button><button @click="inputEditor?.search()" title="搜索输入" aria-label="搜索输入"><Search :size="15" /></button><button @click="clear" title="清空输入和结果" aria-label="清空输入和结果"><Trash2 :size="15" /></button></div></header>
        <CodeEditor ref="inputEditor" v-model="input" label="JSON 输入编辑器" :wrap="wrap" hint="在这里粘贴 JSON，或点击「加载示例」开始…" @run="run('format')" />
        <footer class="editor-footer"><span>{{ inputLines }} 行 <i>·</i> {{ input.length.toLocaleString() }} 字符</span><span :class="{ 'limit-error': inputBytes > MAX_BYTES }">{{ (inputBytes / 1024).toFixed(1) }} KiB / 1 MiB</span></footer>
      </section>
      <section class="editor-card output-card"><header class="editor-header"><h2><span class="panel-dot output-dot"></span>处理结果<span class="readonly-label">只读</span></h2><div class="editor-actions"><button @click="copy" :disabled="!output"><Copy :size="14" />复制</button><button @click="download" :disabled="!output"><Download :size="14" />下载</button><button @click="outputEditor?.search()" aria-label="搜索结果" title="搜索结果"><Search :size="15" /></button></div></header>
        <div class="output-editor-wrap"><CodeEditor ref="outputEditor" :model-value="output" readonly label="JSON 结果编辑器" :wrap="wrap" />
          <div v-if="!output" class="output-empty"><div class="empty-icon"><Braces :size="28" :stroke-width="1.4" /></div><strong>{{ busy ? '正在本地处理…' : result?.ok ? 'JSON 校验通过' : '清晰的数据，从这里开始' }}</strong><p>{{ result?.ok ? '点击格式化或压缩，生成可复制的结果' : '输入 JSON 后，点击上方操作生成结果' }}</p></div>
        </div>
        <footer class="editor-footer"><span>{{ output.length.toLocaleString() }} 字符 <i>·</i> {{ (outputBytes / 1024).toFixed(1) }} KiB<span v-if="output && reduction > 0"> <i>·</i> 减少 {{ reduction }}%</span></span><div><button @click="outputEditor?.fold()" :disabled="!output">折叠</button><button @click="outputEditor?.unfold()" :disabled="!output">展开</button></div></footer>
      </section>
    </div>
    <div class="workspace-bottom"><span><ShieldCheck :size="14" /> 数据仅在本地处理，不会上传到服务器</span><button class="wrap-button" :aria-pressed="wrap" @click="wrap = !wrap"><WrapText :size="15" />自动换行 <span :class="{ on: wrap }" class="switch"></span></button></div>
    <div v-if="busy || result || notice" class="status-box" :class="{ error: result && !result.ok, success: result?.ok }" role="status" aria-live="polite">
      <span v-if="busy">正在处理…</span><template v-else-if="result"><CircleCheck v-if="result.ok" :size="17" /><span>{{ result.message }}<template v-if="!result.ok && result.line"> · 第 {{ result.line }} 行，第 {{ result.column }} 列</template><template v-if="result.ok && result.rootType"> · 根类型：{{ result.rootType }}</template></span><button v-if="!result.ok && result.offset !== undefined" @click="inputEditor?.focusError(result.offset)">定位错误 <ArrowRight :size="14" /></button></template><span v-if="notice">{{ notice }}</span>
    </div>
    <section class="tips-grid" aria-label="使用提示"><article><div class="tip-icon"><WandSparkles :size="18" /></div><h3>更易阅读</h3><p>支持 2 / 4 空格与 Tab 缩进，搭配语法高亮、搜索和结构折叠。</p></article><article><div class="tip-icon"><ShieldCheck :size="18" /></div><h3>保留原始数据</h3><p>大整数、小数与转义保持原文，仅调整字符串之外的空白。</p></article><article><div class="tip-icon"><CircleCheck :size="18" /></div><h3>严格的 JSON 校验</h3><p>定位语法错误到行与列。不接受注释、尾逗号和单引号。</p></article></section>
    <details class="usage-details"><summary>使用说明与快捷键<ChevronDown :size="16" /></summary><div><p>输入内容后选择操作。Ctrl / ⌘ + Enter 格式化；编辑器内 Ctrl / ⌘ + F 搜索。导入支持 UTF-8 文件，最多 1 MiB；嵌套最多 128 层。修改输入会清除旧结果，避免误复制。</p><p>校验只检查 JSON 语法，不检查业务字段或 JSON Schema。重复键会原样保留，不合并、不排序；建议业务数据避免重复键。页面刷新会清空输入和结果。</p></div></details>
  </div>
</template>
