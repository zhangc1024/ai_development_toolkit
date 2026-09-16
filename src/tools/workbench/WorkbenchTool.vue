<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Play, Copy, Download, Upload, Search, Trash2, ShieldCheck, WrapText, FileText, Eye, EyeOff, CodeXml } from '@lucide/vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText, downloadText } from '../../platform/browser'
import { jwtSample } from '../security/jwt'
import { TEXT_LIMIT } from '../security/bytes'
import type { Algorithm } from '../security/crypto'
import type { InputEncoding, OutputEncoding } from '../security/bytes'
import type { SqlOptions } from '../sql/core'
import { workbenchConfig } from './config'
import type { WorkbenchKind, WorkRequest, WorkResult } from './types'
const props = defineProps<{ kind: WorkbenchKind }>()
const config = computed(() => workbenchConfig[props.kind])
const input = ref('')
const output = ref('')
const result = ref<WorkResult | null>(null)
const notice = ref('')
const busy = ref(false)
const wrap = ref(true)
const algorithm = ref<Algorithm>('SHA-256')
const inputEncoding = ref<InputEncoding>('utf8')
const outputEncoding = ref<OutputEncoding>('hex')
const secret = ref('')
const keyEncoding = ref<InputEncoding>('utf8')
const allowEmptyKey = ref(false)
const showKey = ref(false)
const indent = ref<SqlOptions['indent']>('2')
const keywordCase = ref<SqlOptions['keywordCase']>('upper')
const editor = ref<InstanceType<typeof CodeEditor>>()
const outputEditor = ref<InstanceType<typeof CodeEditor>>()
const fileInput = ref<HTMLInputElement>()
const byteSize = computed(() => new TextEncoder().encode(input.value).length)
const hasOutput = computed(() => result.value?.ok === true)
let worker: Worker | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let revision = 0
function stop() { worker?.terminate(); worker = undefined; clearTimeout(timer); busy.value = false }
function invalidate() { stop(); revision++; output.value = ''; result.value = null; notice.value = '' }
watch([input, algorithm, inputEncoding, outputEncoding, secret, keyEncoding, allowEmptyKey, indent, keywordCase], invalidate, { flush: 'sync' })
onBeforeUnmount(() => { stop(); revision++; secret.value = '' })
function run() {
  invalidate()
  if (byteSize.value > TEXT_LIMIT) { result.value = { ok: false, message: '输入超过 1 MiB，请缩小内容后重试' }; return }
  const options: WorkRequest['options'] = { algorithm: algorithm.value, inputEncoding: inputEncoding.value, outputEncoding: outputEncoding.value, key: secret.value, keyEncoding: keyEncoding.value, allowEmptyKey: allowEmptyKey.value, indent: indent.value, keywordCase: keywordCase.value }
  try {
    worker = new Worker(new URL('./workbench.worker.ts', import.meta.url), { type: 'module' })
    busy.value = true
    worker.onmessage = (event: MessageEvent<WorkResult>) => { result.value = event.data; output.value = event.data.output ?? ''; stop() }
    worker.onerror = () => { stop(); result.value = { ok: false, message: '处理线程启动失败，请刷新后重试' } }
    worker.postMessage({ kind: props.kind, text: input.value, options } satisfies WorkRequest)
    timer = setTimeout(() => { stop(); result.value = { ok: false, message: '处理超过 5 秒，已停止，请缩小输入后重试' } }, 5000)
  } catch { stop(); result.value = { ok: false, message: '当前环境无法启动处理线程' } }
}
function sample() { input.value = props.kind === 'jwt' ? jwtSample() : config.value.sample; if (props.kind === 'hmac') { secret.value = 'key'; keyEncoding.value = 'utf8' }; inputEncoding.value = 'utf8'; run() }
function clear() { input.value = ''; secret.value = ''; showKey.value = false; invalidate() }
async function copy() {
  const version = revision
  try { await copyText(output.value); if (revision === version) notice.value = '结果已复制' }
  catch { if (revision === version) notice.value = '复制失败，请选中结果后按 Ctrl+C' }
}
function download() {
  try { downloadText(output.value, props.kind === 'sql' ? 'formatted.sql' : props.kind + '-result.txt', 'text/plain;charset=utf-8'); notice.value = '已请求下载结果文件' }
  catch { notice.value = '下载失败，请手动复制结果' }
}
async function importFile(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]; element.value = ''
  if (!file) return
  if (file.size > TEXT_LIMIT) { notice.value = '文件超过 1 MiB，未导入'; return }
  const version = ++revision
  try {
    const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer())
    if (revision !== version) return
    input.value = value; invalidate(); notice.value = '文件已导入，请执行操作'
  } catch { if (revision === version) notice.value = '导入失败，请使用有效 UTF-8 文本文件' }
}
</script>
<template>
  <div class="tool-page encoding-page">
    <div class="tool-heading"><div><div class="eyebrow">{{ config.category }} <span>/</span> LOCAL WORKSPACE</div><h1>{{ config.title }}</h1><p>{{ config.description }}</p></div><div class="heading-icon"><CodeXml :size="32" /></div></div>
    <div v-if="kind === 'jwt'" class="trust-banner"><ShieldCheck :size="18" /><span><strong>未验签</strong> · 仅解析内容，不能据此判断 Token 可信或授权有效。</span></div>
    <div class="action-bar"><div class="primary-actions"><button class="button primary" :disabled="busy" @click="run"><Play :size="15" />{{ config.action }}</button><button class="button" @click="clear"><Trash2 :size="14" />清空</button></div><button class="button text-button" :disabled="busy" @click="sample"><FileText :size="15" />加载示例</button></div>
    <section v-if="kind === 'hash' || kind === 'hmac'" class="encoding-options" aria-label="算法设置">
      <div class="encoding-options-row">
        <label class="indent-label">算法<select v-model="algorithm" aria-label="算法"><option v-for="item in ['MD5', 'SHA-1', 'SHA-256', 'SHA-512']" :key="item">{{ item }}</option></select></label>
        <label class="indent-label">输入编码<select v-model="inputEncoding" aria-label="输入编码"><option value="utf8">UTF-8 文本</option><option value="hex">Hex 字节</option><option value="base64">Base64 字节</option></select></label>
        <label class="indent-label">输出格式<select v-model="outputEncoding" aria-label="输出格式"><option value="hex">Hex 小写</option><option value="HEX">Hex 大写</option><option value="base64">Base64</option></select></label>
      </div>
      <div v-if="kind === 'hmac'" class="hmac-key-row">
        <label class="secret-field">密钥<input v-model="secret" :type="showKey ? 'text' : 'password'" autocomplete="off" spellcheck="false" aria-label="HMAC 密钥" placeholder="密钥仅用于本次本地计算" /></label>
        <button class="icon-button" :aria-label="showKey ? '隐藏密钥' : '显示密钥'" :aria-pressed="showKey" @click="showKey = !showKey"><EyeOff v-if="showKey" :size="18" /><Eye v-else :size="18" /></button>
        <label class="indent-label">密钥编码<select v-model="keyEncoding" aria-label="密钥编码"><option value="utf8">UTF-8</option><option value="hex">Hex</option><option value="base64">Base64</option></select></label>
        <label class="encoding-checkbox"><input v-model="allowEmptyKey" type="checkbox" />允许空密钥（测试）</label>
      </div>
      <p v-if="algorithm === 'MD5' || algorithm === 'SHA-1'">当前为旧算法，仅用于兼容联调；新方案优先选择 SHA-256 或 SHA-512。</p>
      <p v-else>按所选编码解释字节，首尾空格和换行参与计算。{{ kind === 'hmac' ? '密钥输入上限 64 KiB，不自动保存。' : '支持空消息摘要。' }}</p>
    </section>
    <section v-if="kind === 'sql'" class="encoding-options" aria-label="SQL 设置"><div class="encoding-options-row"><span class="version-badge">MySQL</span><label class="indent-label">缩进<select v-model="indent" aria-label="SQL 缩进"><option value="2">2 空格</option><option value="4">4 空格</option><option value="tab">Tab</option></select></label><label class="indent-label">关键字<select v-model="keywordCase" aria-label="关键字大小写"><option value="upper">大写</option><option value="lower">小写</option><option value="preserve">保留</option></select></label></div></section>
    <div class="editor-grid">
      <section class="editor-card"><header class="editor-header"><h2><span class="panel-dot input-dot"></span>{{ kind === 'jwt' ? '输入 JWT' : kind === 'sql' ? '输入 SQL' : '输入消息' }}</h2><div class="editor-actions"><input ref="fileInput" type="file" accept=".txt,.json,.sql,text/plain,application/json" hidden @change="importFile" /><button @click="fileInput?.click()"><Upload :size="14" />导入</button><button aria-label="搜索输入" title="搜索输入" @click="editor?.search()"><Search :size="15" /></button></div></header>
        <CodeEditor ref="editor" v-model="input" :language="kind === 'sql' ? 'sql' : 'text'" label="工具输入编辑器" :wrap="wrap" hint="粘贴内容或加载示例…" @run="run" />
        <footer class="editor-footer"><span>{{ input.length.toLocaleString() }} 字符</span><span :class="{ 'limit-error': byteSize > TEXT_LIMIT }">{{ (byteSize / 1024).toFixed(1) }} KiB / 1 MiB</span></footer>
      </section>
      <section class="editor-card"><header class="editor-header"><h2><span class="panel-dot output-dot"></span>处理结果<span class="readonly-label">只读</span></h2><div class="editor-actions"><button :disabled="!hasOutput" @click="copy"><Copy :size="14" />复制</button><button :disabled="!hasOutput" @click="download"><Download :size="14" />下载</button><button aria-label="搜索结果" title="搜索结果" @click="outputEditor?.search()"><Search :size="15" /></button></div></header>
        <div class="output-editor-wrap"><CodeEditor ref="outputEditor" :model-value="output" :language="kind === 'sql' ? 'sql' : 'text'" readonly label="工具结果编辑器" :wrap="wrap" @run="run" /><div v-if="!output" class="output-empty"><div class="empty-icon"><CodeXml :size="28" /></div><strong>{{ busy ? '正在本地处理…' : '结果将在这里显示' }}</strong><p>选择选项后点击{{ config.action }}</p></div></div>
        <footer class="editor-footer"><span>{{ output.length.toLocaleString() }} 字符</span><span>{{ kind === 'jwt' ? '解析不等于验签' : '本地计算' }}</span></footer>
      </section>
    </div>
    <div class="workspace-bottom"><span><ShieldCheck :size="14" /> 不上传内容，不保存历史</span><button class="wrap-button" :aria-pressed="wrap" @click="wrap = !wrap"><WrapText :size="15" />自动换行 <span class="switch" :class="{ on: wrap }"></span></button></div>
    <div v-if="busy || result || notice" role="status" aria-live="polite" class="status-box" :class="{ error: result && !result.ok, success: result?.ok && kind !== 'jwt' }"><span>{{ busy ? '正在处理…' : result?.message }}</span><span v-if="notice">{{ notice }}</span></div>
    <section v-if="result?.jwt" class="jwt-details">
      <h2>时间声明 <small>算法声明：{{ result.jwt.algorithm }}</small></h2><p>按解析时设备时间判断：{{ result.jwt.checkedAt }}。以下均为未验证的声明。</p>
      <ul class="jwt-warnings"><li v-for="warning in result.jwt.warnings" :key="warning">{{ warning }}</li></ul>
      <div v-if="result.jwt.times.length" class="table-scroll"><table class="result-table"><thead><tr><th>字段</th><th>原值（秒）</th><th>UTC</th><th>提示</th></tr></thead><tbody><tr v-for="row in result.jwt.times" :key="row.claim"><td>{{ row.claim }}</td><td>{{ row.value }}</td><td>{{ row.utc }}</td><td>{{ row.note }}</td></tr></tbody></table></div>
    </section>
    <section class="encoding-rules"><h2>使用规则</h2><ul><li v-for="rule in config.rules" :key="rule">{{ rule }}</li></ul><p>Ctrl / ⌘ + Enter 执行操作；Ctrl / ⌘ + F 搜索。修改输入或选项清空旧结果。输入上限 1 MiB，处理超过 5 秒停止。切换工具或刷新清空数据。</p></section>
  </div>
</template>
