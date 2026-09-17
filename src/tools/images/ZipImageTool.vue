<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TIMEOUT_MS, type CompressionLevel, type TargetFormat } from './compression'
import type { ZipRow } from './zip-policy'
const props = defineProps<{ file: File; level: CompressionLevel; target: TargetFormat }>()
const rows = ref<ZipRow[]>([]), expanded = ref(0), scanned = ref(false), busy = ref(false)
const phase = ref(''), error = ref(''), done = ref(0), total = ref(0)
const result = ref<{ url: string; size: number; imageBefore: number; imageAfter: number }>()
let archive: Worker | undefined, image: Worker | undefined, revision = 0, activeImageId = 0
let timer: ReturnType<typeof setTimeout> | undefined, imageTimer: ReturnType<typeof setTimeout> | undefined
const counts = computed(() => ({
  processed: rows.value.filter(r => !r.directory && r.status === 'processed').length,
  kept: rows.value.filter(r => !r.directory && r.status === 'kept').length,
  failed: rows.value.filter(r => r.status === 'failed').length,
}))
const labels = { pending: '待处理', processed: '已处理', kept: '原样保留', failed: '失败，已保留' }
function size(bytes: number) { return bytes >= 1048576 ? (bytes / 1048576).toFixed(2) + ' MiB' : (bytes / 1024).toFixed(2) + ' KiB' }
function difference(before: number, after: number) {
  if (!before) return '无可统计图片'
  const rate = (1 - after / before) * 100
  return (rate >= 0 ? '减少 ' : '增加 ') + Math.abs(rate).toFixed(1) + '%'
}
function stop() { archive?.terminate(); image?.terminate(); archive = image = undefined; activeImageId = 0; clearTimeout(timer); clearTimeout(imageTimer); busy.value = false }
function dropResult() { if (result.value) URL.revokeObjectURL(result.value.url); result.value = undefined }
function resetRun() {
  revision++; stop(); dropResult(); error.value = ''; phase.value = ''; done.value = 0
  rows.value = rows.value.map(r => ({ path: r.path, size: r.size, directory: r.directory, image: r.image, status: 'pending', reason: r.directory ? '文件夹' : '等待处理' }))
}
function cancel() { resetRun(); phase.value = '已取消，未生成不完整 ZIP；可重新开始。' }
function fail(message: string) { stop(); dropResult(); error.value = message + '（未生成结果 ZIP）'; phase.value = '' }
function guard() {
  clearTimeout(timer)
  timer = setTimeout(() => fail('当前解压或打包阶段超过 120 秒，已停止，请拆分压缩包后重试'), 120000)
}
function launch(action: 'scan' | 'run') {
  resetRun(); const version = revision
  busy.value = true; phase.value = action === 'scan' ? '扫描 ZIP 文件列表…' : '检查 ZIP 并准备处理…'
  try {
    const worker = new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' })
    archive = worker; guard()
    worker.onmessage = ({ data }) => {
      if (version !== revision || worker !== archive) return
      guard()
      if (data.type === 'error') { fail('ZIP 处理失败：' + data.error); return }
      if (data.type === 'scanned') {
        rows.value = data.rows; expanded.value = data.total; total.value = data.rows.length; scanned.value = true
        phase.value = '扫描完成，可选择档位并开始处理。'; stop()
      } else if (data.type === 'progress') {
        done.value = data.index; total.value = data.total
        phase.value = ({ extract: '解压中', image: '处理图片', pack: '打包中' } as Record<string, string>)[data.phase] + ' · ' + data.path
        if (data.row) rows.value[data.index - 1] = data.row
      } else if (data.type === 'image') {
        const id = data.id
        activeImageId = id
        const finish = (payload: Record<string, unknown>, transfer: Transferable[] = []) => {
          if (version !== revision || archive !== worker || activeImageId !== id) return
          activeImageId = 0
          image?.terminate(); image = undefined; clearTimeout(imageTimer)
          if (version === revision && archive === worker) { guard(); worker.postMessage({ type: 'image-result', id, ...payload }, transfer) }
        }
        try {
          image = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' })
          image.onmessage = ({ data: value }) => value.error ? finish({ error: value.error }) : finish({ result: value }, [value.buffer])
          image.onerror = () => finish({ error: '图片编码器运行失败' })
          image.onmessageerror = () => finish({ error: '图片结果读取失败' })
          imageTimer = setTimeout(() => finish({ error: '图片处理超过 60 秒' }), TIMEOUT_MS)
          image.postMessage({ action: 'compress', buffer: data.buffer, level: data.level, target: data.target }, [data.buffer])
        } catch (e) { finish({ error: e instanceof Error ? e.message : '无法启动图片处理' }) }
      } else if (data.type === 'done') {
        rows.value = data.rows; done.value = data.rows.length
        result.value = { url: URL.createObjectURL(data.blob), size: data.blob.size, imageBefore: data.imageBefore, imageAfter: data.imageAfter }
        phase.value = '处理完成，所有文件均已打包。'; stop()
      }
    }
    worker.onerror = () => { if (version === revision && worker === archive) fail('ZIP 处理线程异常，请重试') }
    worker.onmessageerror = () => { if (version === revision && worker === archive) fail('ZIP 结果读取失败') }
    worker.postMessage({ type: action, file: props.file, level: props.level, target: props.target })
  } catch (e) { fail(e instanceof Error ? e.message : '无法启动 ZIP 处理') }
}
function download() {
  if (!result.value) return
  const a = document.createElement('a'); a.href = result.value.url
  a.download = (props.file.name.replace(/\.zip$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'images') + '-processed.zip'; a.click()
}
watch(() => props.file, () => { scanned.value = false; rows.value = []; expanded.value = 0; total.value = 0; launch('scan') }, { immediate: true })
watch(() => [props.level, props.target], () => {
  const wasScanning = busy.value && !scanned.value
  if (wasScanning) launch('scan')
  else { resetRun(); phase.value = scanned.value ? '选项已更新，请重新开始。' : '请重新扫描 ZIP。' }
}, { flush: 'sync' })
onBeforeUnmount(() => { revision++; stop(); dropResult() })
</script>
<template>
  <section class="time-results zip-tool">
    <header><h2>ZIP 批量处理</h2><div class="primary-actions">
      <button v-if="!scanned" class="button" :disabled="busy" @click="launch('scan')">重新扫描 ZIP</button>
      <button class="button primary" :disabled="!scanned || busy" @click="launch('run')">开始处理 ZIP</button>
      <button v-if="busy" class="button" @click="cancel">取消 ZIP 处理</button>
      <button v-if="result" class="button" @click="download">下载结果 ZIP</button>
    </div></header>
    <p class="zip-name">{{ file.name }} · 输入 {{ size(file.size) }} · {{ rows.length }} 个条目 · 声明解压大小 {{ size(expanded) }}</p>
    <p v-if="target !== 'original'">转换格式会更改扩展名，HTML/CSS 等文件里的图片引用不会自动修改；重名会自动加序号。</p>
    <p>保留目录结构、非图片文件和不支持的图片；图片处理失败保留原文件。内部压缩包不递归解压。RAR、加密包和分卷包暂不支持。</p>
    <p class="zip-status" :class="{ error: !!error }" role="status">{{ error || phase }}</p>
    <div v-if="busy || result"><progress :value="done" :max="total || 1" aria-label="ZIP 处理进度"></progress> {{ done }} / {{ total }} 个条目</div>
    <div v-if="result" class="zip-summary">
      <p>已处理 {{ counts.processed }} · 原样保留 {{ counts.kept }} · 处理失败并保留 {{ counts.failed }}（不含目录）</p>
      <p>图片合计：{{ size(result.imageBefore) }} → {{ size(result.imageAfter) }}，{{ difference(result.imageBefore, result.imageAfter) }}</p>
      <p>结果 ZIP：{{ size(result.size) }}，相比输入包{{ difference(file.size, result.size) }}。ZIP 大小变化与图片大小变化并不相同。</p>
    </div>
    <div v-if="rows.length" class="zip-table" tabindex="0" aria-label="ZIP 文件清单">
      <table><thead><tr><th>原始路径/大小</th><th>输出路径 / 大小</th><th>状态 / 原因</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.path">
          <td>{{ row.path }}<div>{{ size(row.size) }}</div></td>
          <td>{{ row.outputPath || '—' }}<div v-if="row.outputSize !== undefined">{{ size(row.outputSize) }}</div></td>
          <td><strong>{{ labels[row.status] }}</strong><div>{{ row.reason }}</div></td>
        </tr></tbody>
      </table>
    </div>
    <p class="zip-limits">ZIP ≤ 50 MiB，最多 500 个文件/文件夹，解压及输出文件总量 ≤ 200 MiB；单图 ≤ 10 MiB / 1600 万像素。取消或发生压缩包错误时不提供部分结果。</p>
  </section>
</template>
<style scoped>
.zip-tool header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.zip-tool p{line-height:1.7}.zip-name,.zip-status{overflow-wrap:anywhere}
.zip-status{padding:12px;border-radius:8px;background:#f4f2ff}.zip-status.error{background:#fff0f0;color:#a32929}
.zip-table{overflow:auto;max-height:480px;margin-top:16px}
.zip-table table{width:100%;border-collapse:collapse;font-size:13px;min-width:650px}
.zip-table th,.zip-table td{padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid #e5e7eb;overflow-wrap:anywhere;max-width:300px}
.zip-table th{position:sticky;top:0;background:#f7f8fb}
.zip-limits{font-size:12px;color:#667085}.zip-summary{background:#f7f8fb;padding:12px;margin-top:12px;border-radius:8px}
</style>
