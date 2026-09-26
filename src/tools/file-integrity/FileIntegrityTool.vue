<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { Upload, Copy, ShieldCheck } from '@lucide/vue'
import { copyText } from '../../platform/browser'
import { algorithms, identifyHash, type Hashes, type WorkerResult } from './core'

const file = shallowRef<File>()
const fileInput = ref<HTMLInputElement>()
const hashes = shallowRef<Hashes>()
const busy = ref(false)
const loaded = ref(0)
const status = ref('')
const notice = ref('')
const expected = ref('')
const dragging = ref(false)
let worker: Worker | undefined
let revision = 0
function stop() { revision++; worker?.terminate(); worker = undefined; busy.value = false }
onBeforeUnmount(stop)
function formatSize(size: number) {
  if (!size) return '0 B'
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 4)
  return `${(size / 1024 ** unit).toFixed(unit ? 2 : 0)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`
}
const metadata = computed(() => {
  const value = file.value
  if (!value) return []
  const dot = value.name.lastIndexOf('.')
  return [
    ['文件名', value.name],
    ['文件大小', `${formatSize(value.size)}（${value.size.toLocaleString()} 字节）`],
    ['MIME 类型', value.type || '未知（浏览器未提供）'],
    ['文件后缀', dot > 0 && dot < value.name.length - 1 ? value.name.slice(dot) : '无后缀'],
    ['最后修改时间', new Date(value.lastModified).toLocaleString()],
  ]
})
const percentage = computed(() => hashes.value ? 100 : file.value?.size ? Math.min(99, Math.floor(loaded.value / file.value.size * 100)) : 0)
const detected = computed(() => identifyHash(expected.value))
const verification = computed(() => {
  if (!expected.value.trim()) return { text: '粘贴已有 Hash，自动识别算法并校验。', kind: '' }
  if (!detected.value) return { text: 'Hash 格式无效：请输入 32、40、64 或 128 位十六进制字符。', kind: 'error' }
  if (!hashes.value) return { text: `可能的算法：${detected.value}。请先选择文件并等待计算完成。`, kind: '' }
  const matches = hashes.value[detected.value] === expected.value.trim().toLowerCase()
  return { text: `${detected.value} · ${matches ? '校验一致' : '校验不一致'}`, kind: matches ? 'success' : 'error' }
})
function start(value: File) {
  stop()
  const current = revision
  file.value = value; hashes.value = undefined; loaded.value = 0; notice.value = ''
  busy.value = true; status.value = '正在读取并计算…'
  try {
    const active = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' })
    worker = active
    active.onmessage = (event: MessageEvent<WorkerResult>) => {
      if (current !== revision) return
      const message = event.data
      if (message.type === 'progress') {
        loaded.value = message.loaded
        if (message.loaded === value.size) status.value = '读取完成，正在生成摘要…'
      } else {
        if (message.type === 'done') { hashes.value = message.hashes; status.value = '计算完成' }
        else status.value = message.message
        stop()
      }
    }
    active.onerror = () => {
      if (current !== revision) return
      status.value = '计算线程启动失败，请刷新页面后重试。'; stop()
    }
    active.postMessage(value)
  } catch { status.value = '当前环境无法启动计算线程，请更换浏览器后重试。'; stop() }
}
function select(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.files?.[0]
  if (value) start(value)
  input.value = ''
}
function drop(event: DragEvent) {
  dragging.value = false
  const files = event.dataTransfer?.files
  if (!files?.length) return
  if (files.length !== 1) { notice.value = '每次请选择一个文件。'; return }
  start(files[0]!)
}
function cancel() { stop(); hashes.value = undefined; status.value = '已取消计算，可重新计算或选择其他文件。' }
async function copy(algorithm?: keyof Hashes) {
  if (!hashes.value) return
  const text = algorithm ? hashes.value[algorithm] : [
    ...metadata.value.map(([label, value]) => `${label}：${value}`),
    ...algorithms.map(name => `${name}：${hashes.value![name]}`),
  ].join('\n')
  try { await copyText(text); notice.value = '已复制到剪贴板' }
  catch { notice.value = '复制失败，请手动选择并复制结果。' }
}
</script>

<template>
  <div class="tool-page integrity-page">
    <div class="tool-heading"><div>
      <div class="eyebrow">开发工具 <span>/</span> LOCAL WORKSPACE</div>
      <h1>文件完整性校验</h1>
      <p>计算文件 MD5 / SHA 摘要并校验，所有文件仅在浏览器本地处理，不上传服务器。</p>
    </div></div>
    <section class="file-drop" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop">
      <Upload :size="28" aria-hidden="true" />
      <h2>拖拽文件到这里</h2>
      <p>支持任意类型文件，每次处理一个文件</p>
      <button class="button primary" @click="fileInput?.click()">选择文件</button>
      <input ref="fileInput" class="hidden-input" type="file" aria-label="选择要校验的文件" @change="select" />
      <small>文件分片读取 · 本地计算 · 支持大文件</small>
    </section>
    <p v-if="notice" class="status-box" role="status">{{ notice }}</p>
    <section v-if="file" class="time-results">
      <header><h2>文件基本信息</h2><button class="button" :disabled="!hashes" @click="copy()"><Copy :size="14" />复制全部信息</button></header>
      <dl class="file-details"><div v-for="[label, value] in metadata" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
      <div class="progress-heading"><span role="status">{{ status }}</span><strong>{{ percentage }}%</strong></div>
      <progress :value="percentage" max="100" aria-label="文件 Hash 计算进度"></progress>
      <div class="progress-actions"><small>已处理 {{ formatSize(loaded) }} / {{ formatSize(file.size) }}</small>
        <button v-if="busy" class="button" @click="cancel">取消计算</button>
        <button v-else class="button" @click="start(file)">重新计算</button>
      </div>
    </section>
    <section class="time-results">
      <header><h2>Hash 结果</h2><span class="hint">十六进制</span></header>
      <div v-for="algorithm in algorithms" :key="algorithm" class="hash-row">
        <strong>{{ algorithm }}</strong><code>{{ hashes?.[algorithm] || (busy ? '计算中…' : '等待计算') }}</code>
        <button class="button" :disabled="!hashes" :aria-label="'复制 ' + algorithm" @click="copy(algorithm)"><Copy :size="14" />复制</button>
      </div>
    </section>
    <section class="time-form">
      <h2 class="verify-heading"><ShieldCheck :size="18" />Hash 校验</h2>
      <label class="time-input-label">已有 Hash
        <textarea v-model="expected" rows="3" spellcheck="false" autocomplete="off" placeholder="粘贴 MD5、SHA-1、SHA-256 或 SHA-512 值" aria-describedby="hash-verification"></textarea>
      </label>
      <p id="hash-verification" class="status-box" :class="verification.kind" role="status">{{ verification.text }}</p>
      <p class="hint">根据长度识别可能的算法，忽略首尾空白与字母大小写。</p>
    </section>
  </div>
</template>

<style scoped>
.file-drop{border:1px dashed #aaa3df;border-radius:12px;text-align:center;padding:30px 20px;margin-bottom:20px;background:#faf9ff;color:#7962bc}
.file-drop.dragging{background:#f0ebff;border-color:#7962bc}
.file-drop h2{font-size:16px;color:#39455b;margin:12px 0}
.file-drop p,.file-drop small,.hint,.progress-actions small{font-size:12px;color:#748099;line-height:1.8}
.file-drop small{display:block;margin-top:14px}
.hidden-input{display:none}
.integrity-page .file-details>div{grid-template-columns:130px minmax(0,1fr)}
.progress-heading,.progress-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;font-size:12px;color:#59657b}
progress{width:100%;height:10px;accent-color:#8971cf;margin-top:12px}
.hash-row{display:grid;grid-template-columns:85px minmax(0,1fr) auto;gap:16px;align-items:center;border-top:1px solid #eef0f5;padding:20px 0}
.hash-row strong{font-size:13px;color:#59657b}
.hash-row code{font:13px/1.9 Consolas,monospace;overflow-wrap:anywhere;white-space:pre-wrap;color:#48556d;user-select:text}
.verify-heading{display:flex;align-items:center;gap:8px;font-size:15px;color:#39455b}
.integrity-page textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #dfe3ed;border-radius:8px;resize:vertical;font:13px/1.8 Consolas,monospace;color:#48556d;background:white}
.integrity-page textarea:focus{outline:2px solid #b4a4e6;outline-offset:2px}
.integrity-page header{flex-wrap:wrap}
@media(max-width:620px){.hash-row{grid-template-columns:minmax(0,1fr) auto;gap:12px}.hash-row code{grid-column:1/-1;grid-row:2}.integrity-page .file-details>div{grid-template-columns:90px minmax(0,1fr)}.file-drop{padding:24px 16px}}
</style>
