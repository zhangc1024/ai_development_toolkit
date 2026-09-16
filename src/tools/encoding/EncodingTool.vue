<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Copy, Download, Upload, Trash2, Search, ShieldCheck, WrapText, CodeXml, FileText, CircleCheck } from '@lucide/vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText, downloadText } from '../../platform/browser'
import { encodingConfigs } from './config'
import { MAX_ENCODING_BYTES, type EncodingKind, type Direction, type EncodingResult } from './core'
const props = defineProps<{ kind: EncodingKind }>()
const config = computed(() => encodingConfigs[props.kind])
const mode = ref(config.value.defaultMode)
const ignoreWhitespace = ref(false)
const direction = ref<Direction>('encode')
const input = ref('')
const output = ref('')
const result = ref<EncodingResult | null>(null)
const notice = ref('')
const busy = ref(false)
const wrap = ref(true)
const inputEditor = ref<InstanceType<typeof CodeEditor>>()
const outputEditor = ref<InstanceType<typeof CodeEditor>>()
const fileInput = ref<HTMLInputElement>()
const size = (s: string) => new TextEncoder().encode(s).length
const inputBytes = computed(() => size(input.value))
const outputBytes = computed(() => size(output.value))
const hasOutput = computed(() => result.value?.ok === true && result.value.output !== undefined)
const modeHint = computed(() => config.value.options.find(o => o.value === mode.value)?.hint)
let worker: Worker | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let revision = 0
function stop() { worker?.terminate(); worker = undefined; clearTimeout(timer); busy.value = false }
function resetResult() { stop(); revision++; output.value = ''; result.value = null; notice.value = '' }
watch([input, mode, ignoreWhitespace], resetResult, { flush: 'sync' })
onBeforeUnmount(() => { stop(); revision++ })
function run(next: Direction) {
  resetResult(); direction.value = next
  if (inputBytes.value > MAX_ENCODING_BYTES) { result.value = { ok: false, message: '输入超过 1 MiB，请缩小内容后重试' }; return }
  try {
    worker = new Worker(new URL('./encoding.worker.ts', import.meta.url), { type: 'module' })
    busy.value = true
    worker.onmessage = (event: MessageEvent<EncodingResult>) => { result.value = event.data; output.value = event.data.output ?? ''; stop() }
    worker.onerror = () => { stop(); result.value = { ok: false, message: '处理线程未能运行，请刷新页面重试' } }
    worker.postMessage({ kind: props.kind, text: input.value, direction: next, options: { mode: mode.value, ignoreWhitespace: ignoreWhitespace.value } })
    timer = setTimeout(() => { stop(); result.value = { ok: false, message: '处理超过 5 秒，已停止，请减少内容后重试' } }, 5000)
  } catch { stop(); result.value = { ok: false, message: '当前环境无法启动处理线程' } }
}
function clear() { input.value = ''; resetResult() }
function sample() { input.value = config.value.sample; run('encode') }
function reuse() {
  if (outputBytes.value > MAX_ENCODING_BYTES) { notice.value = '结果超过 1 MiB，不能作为输入；可以复制或下载'; return }
  input.value = output.value; resetResult(); notice.value = '结果已填入左侧，请选择编码或解码'
}
async function copy() {
  const version = revision
  try { await copyText(output.value); if (version === revision) notice.value = '结果已复制' }
  catch { if (version === revision) notice.value = '复制失败，请在结果编辑器中选中内容后按 Ctrl+C' }
}
function download() {
  try { downloadText(output.value, props.kind + '-' + direction.value + '.txt', 'text/plain;charset=utf-8'); notice.value = '已请求下载文本文件' }
  catch { notice.value = '下载失败，请复制结果后手动保存' }
}
async function importFile(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]; element.value = ''
  if (!file) return
  if (file.size > MAX_ENCODING_BYTES) { notice.value = '文件超过 1 MiB，未导入'; return }
  const version = ++revision
  try {
    const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer())
    if (version !== revision) return
    input.value = value; resetResult(); notice.value = '文件已导入，请选择编码或解码'
  } catch { if (version === revision) notice.value = '读取失败，请使用 UTF-8 文本文件' }
}
</script>
<template>
  <div class="tool-page encoding-page">
    <div class="tool-heading"><div><div class="eyebrow">编码转换 <span>/</span> TEXT WORKSPACE</div><h1>{{ config.title }}</h1><p>{{ config.description }}</p></div><div class="heading-icon"><CodeXml :size="32" :stroke-width="1.5" /></div></div>
    <div class="action-bar"><div class="primary-actions">
      <button class="button primary" :disabled="busy" @click="run('encode')"><ArrowUpFromLine :size="16" />编码</button>
      <button class="button" :disabled="busy" @click="run('decode')"><ArrowDownToLine :size="16" />解码</button>
      <button class="button" :disabled="!hasOutput" @click="reuse"><ArrowLeftRight :size="15" />结果作为输入</button>
    </div><button class="button text-button" :disabled="busy" @click="sample"><FileText :size="15" />加载示例</button></div>
    <section class="encoding-options" aria-label="转换设置">
      <div class="encoding-options-row"><label class="indent-label">转换模式<select v-model="mode" aria-label="转换模式"><option v-for="option in config.options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <label v-if="kind === 'base64'" class="encoding-checkbox"><input v-model="ignoreWhitespace" type="checkbox" />解码时忽略空格与换行</label>
      </div><p>{{ modeHint }}</p>
    </section>
    <div class="editor-grid">
      <section class="editor-card"><header class="editor-header"><h2><span class="panel-dot input-dot"></span>输入文本</h2><div class="editor-actions"><input ref="fileInput" type="file" accept=".txt,.json,text/plain,application/json" hidden @change="importFile" /><button @click="fileInput?.click()"><Upload :size="14" />导入</button><button aria-label="搜索输入" title="搜索输入" @click="inputEditor?.search()"><Search :size="15" /></button><button aria-label="清空输入和结果" title="清空输入和结果" @click="clear"><Trash2 :size="15" /></button></div></header>
        <CodeEditor ref="inputEditor" v-model="input" language="text" label="编码输入编辑器" :wrap="wrap" hint="粘贴需要转换的文本，或加载示例…" @run="run(direction)" />
        <footer class="editor-footer"><span>{{ input.length.toLocaleString() }} 字符</span><span :class="{ 'limit-error': inputBytes > MAX_ENCODING_BYTES }">{{ (inputBytes / 1024).toFixed(1) }} KiB / 1 MiB</span></footer>
      </section>
      <section class="editor-card"><header class="editor-header"><h2><span class="panel-dot output-dot"></span>处理结果<span class="readonly-label">只读</span></h2><div class="editor-actions"><button :disabled="!hasOutput" @click="copy"><Copy :size="14" />复制</button><button :disabled="!hasOutput" @click="download"><Download :size="14" />下载</button><button aria-label="搜索结果" title="搜索结果" @click="outputEditor?.search()"><Search :size="15" /></button></div></header>
        <div class="output-editor-wrap"><CodeEditor ref="outputEditor" :model-value="output" language="text" readonly label="编码结果编辑器" :wrap="wrap" @run="run(direction)" />
          <div v-if="!output" class="output-empty"><div class="empty-icon"><CodeXml :size="28" /></div><strong>{{ busy ? '正在本地处理…' : hasOutput ? '转换成功，结果为空文本' : '转换结果将在这里显示' }}</strong><p>{{ hasOutput ? '空文本也是有效结果' : '选择合适的模式，再点击编码或解码' }}</p></div>
        </div><footer class="editor-footer"><span>{{ output.length.toLocaleString() }} 字符</span><span>{{ (outputBytes / 1024).toFixed(1) }} KiB · UTF-8 文本</span></footer>
      </section>
    </div>
    <div class="workspace-bottom"><span><ShieldCheck :size="14" /> 本地转换，不上传内容，不保存历史</span><button class="wrap-button" :aria-pressed="wrap" @click="wrap = !wrap"><WrapText :size="15" />自动换行 <span class="switch" :class="{ on: wrap }"></span></button></div>
    <div v-if="busy || result || notice" class="status-box" :class="{ success: result?.ok, error: result && !result.ok }" role="status" aria-live="polite"><span v-if="busy">正在处理…</span><template v-else-if="result"><CircleCheck v-if="result.ok" :size="16" /><span>{{ result.message }}</span></template><span v-if="notice">{{ notice }}</span></div>
    <section class="encoding-rules"><h2>转换规则</h2><ul><li v-for="rule in config.rules" :key="rule">{{ rule }}</li></ul><p>Ctrl / ⌘ + Enter 重复上一次操作（默认编码）；Ctrl / ⌘ + F 搜索。修改输入或设置会清除旧结果；切换工具或刷新不保留内容。UTF-8 输入上限 1 MiB，处理超过 5 秒自动停止。</p></section>
  </div>
</template>
