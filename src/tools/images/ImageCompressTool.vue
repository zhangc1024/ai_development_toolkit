<script setup lang="ts">
import ZipImageTool from './ZipImageTool.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LEVELS, MIME, outputFilename, TIMEOUT_MS, type CompressionLevel, type ImageFormat, type TargetFormat } from './compression'
import { detectPhoto, MAX_PHOTO_BYTES, PHOTO_ACCEPT, type PhotoFormat } from './photo-formats'

const archiveFile = ref<File>()
const level = ref<CompressionLevel>('preserve'), format = ref<TargetFormat>('original')
const hint = computed(() => LEVELS.find(item => item.id === level.value)!.hint)
const source = ref<{ name: string; bytes: ArrayBuffer; url: string; width: number; height: number; format: PhotoFormat; notes: string[] }>()
const result = ref<{ buffer: ArrayBuffer; url: string; previewUrl: string; format: ImageFormat; keptOriginal: boolean; notes: string[] }>()
const busy = ref(false), status = ref(''), error = ref(''), input = ref<HTMLInputElement>()
const zoom = ref('fit'), split = ref(50)
let revision = 0, worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined
let rejectTask: ((reason: Error) => void) | undefined
const change = computed(() => {
  if (!source.value || !result.value) return ''
  const n = (1 - result.value.buffer.byteLength / source.value.bytes.byteLength) * 100
  return n > 0 ? '减小 ' + n.toFixed(1) + '%' : n < 0 ? '增大 ' + (-n).toFixed(1) + '%' : '体积不变'
})
const compareStyle = computed(() => zoom.value === 'fit' ? { width: '100%' } : { width: ((source.value?.width ?? 0) * Number(zoom.value)) + 'px' })
function size(bytes: number) { return bytes >= 1048576 ? (bytes / 1048576).toFixed(2) + ' MiB' : (bytes / 1024).toFixed(2) + ' KiB' }
function stopWorker() {
  worker?.terminate(); worker = undefined; clearTimeout(timer); timer = undefined
  const reject = rejectTask; rejectTask = undefined
  reject?.(new Error('操作已取消'))
  busy.value = false
}
function removeResult() {
  if (result.value) { URL.revokeObjectURL(result.value.url); URL.revokeObjectURL(result.value.previewUrl) }
  result.value = undefined
}
function invalidate() { revision++; stopWorker(); removeResult(); status.value = ''; error.value = '' }
function clear() {
  invalidate(); archiveFile.value = undefined
  if (source.value) URL.revokeObjectURL(source.value.url)
  source.value = undefined; zoom.value = 'fit'; split.value = 50
  if (input.value) input.value.value = ''
}
function cancel() { invalidate(); status.value = '已取消，可以重新选择图片或开始处理。' }
watch([level, format], invalidate, { flush: 'sync' })
function task(payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' })
    rejectTask = reject
    const finish = () => { rejectTask = undefined; stopWorker() }
    worker.onmessage = ({ data }) => { finish(); data.error ? reject(new Error(data.error)) : resolve(data) }
    worker.onerror = () => { finish(); reject(new Error('图片处理失败，请确认浏览器支持 WebAssembly，并重试。')) }
    worker.onmessageerror = () => { finish(); reject(new Error('无法读取处理结果，请重试。')) }
    timer = setTimeout(() => { finish(); reject(new Error('处理超过 60 秒，已停止；请使用较小图片重试。')) }, TIMEOUT_MS)
    worker.postMessage(payload) // Keep original bytes on main thread for retry and original-file fallback.
  })
}
async function load(file: File) {
  clear(); const version = revision; busy.value = true; status.value = '正在检查图片…'
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (version !== revision) return
    if (/\.zip$/i.test(file.name) || (head[0] === 80 && head[1] === 75)) {
      archiveFile.value = file; status.value = ''; return
    }
    if (/\.rar$/i.test(file.name)) throw Error('RAR 暂不支持，请先转换为 ZIP')
    if (!file.size || file.size > MAX_PHOTO_BYTES) throw Error('图片必须非空且不超过 100 MiB')
    const bytes = await file.arrayBuffer()
    if (version !== revision) return
    detectPhoto(new Uint8Array(bytes), file.name)
    const checked = await task({ action: 'inspect', buffer: bytes, name: file.name, level: level.value, target: 'original' })
    if (version !== revision) return
    const url = URL.createObjectURL(checked.preview)
    source.value = { name: file.name || '粘贴图片.' + checked.format, bytes, url, width: checked.width, height: checked.height, format: checked.format, notes: checked.notes }
    status.value = '图片已就绪，选择档位后开始处理。'
  } catch (e) { if (version === revision) { error.value = e instanceof Error ? e.message : '读取失败'; status.value = '' } }
  finally { if (version === revision) busy.value = false }
}
async function compress() {
  if (!source.value || busy.value) return
  invalidate(); const version = revision; busy.value = true; status.value = '正在本地压缩，首次使用需加载本站编码器…'
  try {
    const data = await task({ action: 'compress', buffer: source.value.bytes, name: source.value.name, level: level.value, target: format.value })
    if (version !== revision) return
    const blob = new Blob([data.buffer], { type: MIME[data.format as ImageFormat] })
    result.value = { ...data, url: URL.createObjectURL(blob), previewUrl: URL.createObjectURL(data.preview ?? blob) }
    status.value = data.keptOriginal ? '已保留原文件。' : '处理完成。'
  } catch (e) { if (version === revision) { error.value = e instanceof Error ? e.message : '处理失败'; status.value = '' } }
  finally { if (version === revision) busy.value = false }
}
function select(e: Event) { const file = (e.target as HTMLInputElement).files?.[0]; if (file) void load(file) }
function drop(e: DragEvent) { const file = e.dataTransfer?.files[0]; if (file) void load(file) }
function paste(e: ClipboardEvent) {
  const file = Array.from(e.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
  if (file) { e.preventDefault(); void load(file) }
}
function download() {
  if (!result.value || !source.value) return
  const a = document.createElement('a')
  a.href = result.value.url; a.download = outputFilename(source.value.name, result.value.format, result.value.keptOriginal); a.click()
}
onMounted(() => window.addEventListener('paste', paste))
onBeforeUnmount(() => { clear(); window.removeEventListener('paste', paste) })
</script>
<template>
  <div class="tool-page compression-tool">
    <div class="tool-heading"><div>
      <div class="eyebrow">图片工具 <span>/</span> LOCAL COMPRESSION</div>
      <h1>图片压缩与格式转换</h1><p>保持图片尺寸，本地处理。按图片格式选择压缩策略。</p>
    </div></div>
    <section class="time-form">
      <div class="drop-zone" @dragover.prevent @drop.prevent="drop">
        <label>选择图片或 ZIP<input ref="input" type="file" :accept="PHOTO_ACCEPT" @change="select" /></label>
        <p>支持拖放或粘贴 · 手机照片 / 相机 RAW / 常用图片 ≤ 100 MiB · ZIP ≤ 50 MiB</p>
      </div>
      <div class="encoding-options-row">
        <label class="indent-label">压缩档位
          <select v-model="level" aria-describedby="compression-hint">
            <option v-for="item in LEVELS" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="indent-label">目标格式
          <select v-model="format">
            <option value="original">原格式（HEIC / RAW 转 PNG）</option><option value="webp">WebP</option>
            <option value="png">PNG</option><option value="jpg">JPG</option>
            <option value="avif">AVIF</option><option value="tiff">TIFF（未压缩）</option><option value="bmp">BMP（未压缩）</option>
          </select>
        </label>
      </div>
      <div aria-live="polite">
        <p id="compression-hint">{{ hint }}</p>
        <p>导入：PNG / JPG / WebP / HEIC / HEIF / AVIF / TIFF / BMP，以及 NEF / NRW / CR2 / CR3 / ARW / DNG / RAF / ORF / RW2 / PEF / SRW。</p>
        <p>导出：PNG / JPG / WebP / AVIF / TIFF / BMP。暂不支持生成 HEIC 或相机 RAW；RAW 兼容性取决于相机型号与压缩方式。</p>
        <p v-if="format !== 'original'">格式转换不保证文件更小；保真优先也不保证跨格式无损。</p>
        <p v-if="format === 'jpg'">转 JPG 时，透明区域填充白色背景。</p>
      </div>
      <div class="primary-actions">
        <button v-if="!archiveFile" class="button primary" :disabled="!source || busy" @click="compress">开始处理</button>
        <button v-if="busy" class="button" @click="cancel">取消</button>
        <button class="button" @click="clear">清空</button>
      </div>
    </section>
    <div v-if="status || error" class="status-box" :class="{ error: !!error }" role="status">{{ error || status }}</div>
    <ZipImageTool v-if="archiveFile" :file="archiveFile" :level="level" :target="format" />
    <section v-if="source" class="time-results">
      <header><h2>{{ result ? '处理结果' : '原图预览' }}</h2><button v-if="result" class="button" @click="download">{{ result.keptOriginal ? '下载原文件' : '下载结果' }}</button></header>
      <p class="file-info">{{ source.name }} · {{ source.width }} × {{ source.height }} · {{ source.format.toUpperCase() }} · {{ size(source.bytes.byteLength) }}</p>
      <ul v-if="!result && source.notes.length"><li v-for="note in source.notes" :key="note">{{ note }}</li></ul>
      <template v-if="result">
        <p class="result-summary">输出 {{ result.format.toUpperCase() }} · {{ size(result.buffer.byteLength) }} · {{ change }}</p>
        <ul><li v-for="note in result.notes" :key="note">{{ note }}</li></ul>
        <div class="comparison-controls">
          <label>查看比例 <select v-model="zoom"><option value="fit">适应宽度</option><option value="1">100%</option><option value="2">200%</option></select></label>
          <label>对比位置 <input v-model.number="split" type="range" min="0" max="100" aria-label="原图与结果分界位置" /></label>
          <span>左：解码后原图 · 右：结果（透明区域显示棋盘格）</span>
        </div>
        <div class="comparison-scroll" tabindex="0" aria-label="图片对比，可滚动查看细节">
          <div class="comparison" :style="compareStyle">
            <img :src="result.previewUrl" alt="压缩或转换结果" />
            <img class="original-overlay" :src="source.url" alt="原始图片对比" :style="{ clipPath: 'inset(0 ' + (100 - split) + '% 0 0)' }" />
            <div class="divider" :style="{ left: split + '%' }"></div>
          </div>
        </div>
      </template>
      <img v-else class="source-preview" :src="source.url" alt="待压缩原始图片" />
    </section>
    <section class="encoding-rules">
      <h2>使用说明</h2>
      <ul>
        <li>不缩放图片；有方向信息的照片按浏览器显示方向处理。处理静态单张图片，拒绝 GIF、APNG、动态 WebP、多图片 JPEG、HEIF/AVIF 序列及多页 TIFF。</li>
        <li>可编码的原格式结果不小于原文件时保留原文件；HEIC/RAW 的“原格式”会转换为 PNG；主动转换格式时仍可下载转换结果。</li>
        <li>PNG 的有损档会尝试减少颜色数量；未达到质量要求时回退无损结果。较强档位会比较多个候选，选择更小文件。</li>
        <li>PNG 原格式保真档直接优化原始数据；JPG/WebP 原格式保真档保留原文件。其他重新编码可能转为 8 位 sRGB，并移除 EXIF 等元数据，广色域、HDR 或 16 位素材请另行保存原片，HEIC/RAW 转换不保留原始数据。</li>
        <li>单图模式每次一张，最多 6400 万像素、单边最多 16384 像素，处理最多 60 秒。修改选项会取消任务并清除旧结果；离开页面释放图片。</li>
        <li>图片不上传、不保存历史；编码器随本站加载。压缩幅度因图而异，不保证与 TinyPNG 一致，请放大对比后下载。</li>
      </ul>
    </section>
  </div>
</template>
<style scoped>
.compression-tool .encoding-options-row,.comparison-controls{display:flex;flex-wrap:wrap;gap:16px}
.compression-tool p,.compression-tool li{line-height:1.7}
.compression-tool header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
.drop-zone{border:1px dashed #aaa3df;border-radius:12px;padding:20px;background:#faf9ff;margin-bottom:20px}
.drop-zone input{display:block;margin-top:12px;max-width:100%}
.file-info{overflow-wrap:anywhere}.result-summary{font-weight:600}
.source-preview{display:block;max-width:100%;max-height:440px;object-fit:contain;margin:auto}
.comparison-scroll{overflow:auto;max-height:600px;border:1px solid #dce1ee;border-radius:8px;margin-top:16px}
.comparison{position:relative;line-height:0;background:repeating-conic-gradient(#eee 0% 25%,white 0% 50%) 0 0/20px 20px}
.comparison img{display:block;width:100%;height:auto;max-width:none}
.comparison .original-overlay{position:absolute;inset:0;background:repeating-conic-gradient(#eee 0% 25%,white 0% 50%) 0 0/20px 20px}
.divider{position:absolute;top:0;bottom:0;border-left:2px solid #7659dc;pointer-events:none}
.comparison-controls label{display:flex;align-items:center;gap:8px}
</style>
