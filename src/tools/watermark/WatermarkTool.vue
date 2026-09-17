<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Copy, Download, ImagePlus, Move, Trash2, Stamp, RotateCcw } from '@lucide/vue'
import { inspectImage, LEVELS, MIME, TIMEOUT_MS, type CompressionLevel, type ImageFormat } from '../images/compression'
import { MAX_IMAGE_BYTES, validateDimensions } from '../images/core'
import { canvasBlob, clamp, dimensions, hitMark, paint, PRESETS, resolveColor, resultFilename, type Watermark } from './core'

const canvas = ref<HTMLCanvasElement>(), input = ref<HTMLInputElement>()
const source = ref<{ name: string; width: number; height: number; size: number }>()
let bitmap: ImageBitmap | undefined, nextId = 1, revision = 0
const marks = ref<Watermark[]>([]), selected = ref<number>()
const current = computed(() => marks.value.find(mark => mark.id === selected.value))
const colorInput = ref('#000000'), colorError = ref('')
const compressEnabled = ref(true), level = ref<CompressionLevel>('light'), format = ref<ImageFormat>('jpg')
const busy = ref(false), status = ref(''), error = ref(''), compare = ref(50)
const result = ref<{ blob: Blob; url: string; before: Blob; beforeUrl: string; notes: string[]; compressed: boolean }>()
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, rejectWorker: ((reason: Error) => void) | undefined
let drag: { pointer: number; id: number; dx: number; dy: number } | undefined
const context = document.createElement('canvas').getContext('2d')!
const valid = computed(() => !!source.value && marks.value.some(mark => mark.text.trim() && mark.opacity > 0) && !colorError.value)
const size = (bytes: number) => bytes >= 1048576 ? (bytes / 1048576).toFixed(2) + ' MiB' : (bytes / 1024).toFixed(1) + ' KiB'
const change = computed(() => {
  if (!result.value) return ''
  const difference = 100 * (1 - result.value.blob.size / result.value.before.size)
  return difference > 0 ? '减小 ' + difference.toFixed(1) + '%' : difference < 0 ? '增大 ' + (-difference).toFixed(1) + '%' : '体积不变'
})
function releaseResult() {
  if (result.value) { URL.revokeObjectURL(result.value.url); URL.revokeObjectURL(result.value.beforeUrl) }
  result.value = undefined
}
function stop() {
  worker?.terminate(); worker = undefined; clearTimeout(timer); timer = undefined
  const reject = rejectWorker; rejectWorker = undefined; reject?.(Error('操作已取消'))
}
function invalidate() { revision++; stop(); busy.value = false; releaseResult(); status.value = ''; error.value = '' }
function cancel() { invalidate(); status.value = '已取消，可重新生成。' }
function draw() {
  if (!canvas.value || !bitmap) return
  const width = Math.min(bitmap.width, 1200)
  canvas.value.width = width; canvas.value.height = Math.round(bitmap.height * width / bitmap.width)
  paint(canvas.value.getContext('2d')!, bitmap, marks.value, width, selected.value)
}
watch(marks, () => { invalidate(); draw() }, { deep: true, flush: 'sync' })
watch([compressEnabled, level, format], invalidate, { flush: 'sync' })
watch(selected, () => { colorInput.value = current.value?.color ?? '#000000'; colorError.value = ''; draw() })
function add(copy = false) {
  if (!source.value || busy.value || marks.value.length >= 30) return
  const { width, height } = source.value, id = nextId++
  const today = new Date(), date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
  const mark: Watermark = copy && current.value
    ? { ...current.value, id, x: clamp(current.value.x + width * .04, 0, width), y: clamp(current.value.y + height * .04, 0, height) }
    : { id, text: '仅供 XX 平台实名认证使用\n' + date + ' · 他用无效', x: width / 2, y: height / 2, size: clamp(Math.round(width / 26), 8, 512), opacity: 35, angle: -25, color: '#000000' }
  marks.value.push(mark); selected.value = id
}
function remove() {
  if (busy.value) return
  marks.value = marks.value.filter(mark => mark.id !== selected.value); selected.value = marks.value.at(-1)?.id
}
function number(field: 'size' | 'opacity' | 'angle', event: Event, min: number, max: number) {
  if (!current.value) return
  const element = event.target as HTMLInputElement, value = element.valueAsNumber
  if (!Number.isFinite(value)) { element.value = String(current.value[field]); return }
  current.value[field] = clamp(value, min, max)
  element.value = String(current.value[field])
}
function setColor(value: string) {
  colorInput.value = value
  const parsed = resolveColor(value, context)
  if (!parsed) { colorError.value = '请输入有效色号（#fff / #ff0000）或英文颜色名（red / gold）。'; invalidate(); return }
  colorError.value = ''
  if (current.value) current.value.color = parsed
}
async function load(file: File) {
  invalidate(); const version = revision; busy.value = true; status.value = '正在读取图片…'
  drag = undefined
  try {
    if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error('图片必须非空且不超过 10 MiB')
    const bytes = await file.arrayBuffer()
    if (version !== revision) return
    inspectImage(new Uint8Array(bytes))
    const decoded = await createImageBitmap(new Blob([bytes]))
    if (version !== revision) { decoded.close(); return }
    try { validateDimensions(decoded.width, decoded.height) } catch (e) { decoded.close(); throw e }
    bitmap?.close(); bitmap = decoded
    source.value = { name: file.name || '粘贴图片.png', width: decoded.width, height: decoded.height, size: file.size }
    marks.value = []; selected.value = undefined; busy.value = false
    add(); await nextTick(); draw(); status.value = '图片已就绪，可拖动水印或修改右侧设置。'
  } catch (e) {
    if (version === revision) { error.value = e instanceof Error ? e.message : '图片读取失败'; status.value = '' }
  } finally { if (version === revision) busy.value = false }
}
function selectFile(event: Event) {
  const element = event.target as HTMLInputElement, file = element.files?.[0]
  if (file) void load(file)
  element.value = ''
}
function drop(event: DragEvent) { const file = event.dataTransfer?.files[0]; if (file) void load(file) }
function paste(event: ClipboardEvent) {
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return
  const file = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
  if (file) { event.preventDefault(); void load(file) }
}
function point(event: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width * source.value!.width, y: (event.clientY - rect.top) / rect.height * source.value!.height }
}
function down(event: PointerEvent) {
  if (!source.value || busy.value || !event.isPrimary || event.button !== 0) return
  const pos = point(event), padding = 10 * source.value.width / canvas.value!.getBoundingClientRect().width
  const mark = [...marks.value].reverse().find(mark => { const box = dimensions(context, mark); return hitMark(mark, pos.x, pos.y, box.width, box.height, padding) })
  if (!mark) return
  selected.value = mark.id; canvas.value!.focus()
  drag = { pointer: event.pointerId, id: mark.id, dx: pos.x - mark.x, dy: pos.y - mark.y }
  canvas.value!.setPointerCapture(event.pointerId); event.preventDefault()
}
function move(event: PointerEvent) {
  if (!drag || drag.pointer !== event.pointerId || !source.value) return
  const mark = marks.value.find(mark => mark.id === drag!.id), pos = point(event)
  if (mark) { mark.x = clamp(pos.x - drag.dx, 0, source.value.width); mark.y = clamp(pos.y - drag.dy, 0, source.value.height) }
}
function end(event: PointerEvent) {
  if (drag?.pointer !== event.pointerId) return
  drag = undefined
  if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId)
}
function key(event: KeyboardEvent) {
  if (!current.value || !source.value || busy.value) return
  const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (steps[event.key]) {
    event.preventDefault(); const [x, y] = steps[event.key], amount = event.shiftKey ? 10 : 1
    current.value.x = clamp(current.value.x + x * amount, 0, source.value.width); current.value.y = clamp(current.value.y + y * amount, 0, source.value.height)
  } else if (event.key === 'Delete') { event.preventDefault(); remove() }
}
function encode(buffer: ArrayBuffer): Promise<{ buffer: ArrayBuffer; notes: string[] }> {
  return new Promise((resolve, reject) => {
    worker = new Worker(new URL('../images/compress.worker.ts', import.meta.url), { type: 'module' }); rejectWorker = reject
    const finish = () => { rejectWorker = undefined; stop() }
    worker.onmessage = ({ data }) => { finish(); data.error ? reject(Error(data.error)) : resolve(data) }
    worker.onerror = () => { finish(); reject(Error('压缩失败，请重试或关闭「同时压缩」。')) }
    worker.onmessageerror = () => { finish(); reject(Error('无法读取压缩结果')) }
    timer = setTimeout(() => { finish(); reject(Error('压缩超过 60 秒，已停止；请关闭压缩或换用较小图片。')) }, TIMEOUT_MS)
    // The worker only receives flattened, watermarked pixels, never the unmarked source.
    worker.postMessage({ action: 'compress', buffer, level: level.value, target: format.value })
  })
}
async function generate() {
  if (!valid.value || !bitmap || busy.value) return
  invalidate(); const version = revision; busy.value = true; status.value = '正在合成水印…'
  const output = document.createElement('canvas')
  try {
    await document.fonts.ready
    if (version !== revision) return
    output.width = bitmap.width; output.height = bitmap.height
    const ctx = output.getContext('2d')!
    paint(ctx, bitmap, marks.value, output.width)
    if (format.value === 'jpg') {
      ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height); ctx.globalCompositeOperation = 'source-over'
    }
    // PNG intermediate avoids an extra lossy decode/encode before the compression worker.
    const png = await canvasBlob(output)
    if (version !== revision) return
    const before = format.value === 'png' ? png : await canvasBlob(output, MIME[format.value], .98)
    if (version !== revision) return
    let blob = before, notes: string[] = []
    if (compressEnabled.value) {
      status.value = '正在本地压缩带水印图片…'
      const buffer = await png.arrayBuffer()
      if (version !== revision) return
      const encoded = await encode(buffer)
      if (version !== revision) return
      const candidate = new Blob([encoded.buffer], { type: MIME[format.value] })
      // Do not replace lossless WebP with a smaller, lossy browser baseline.
      if (candidate.size < before.size || (format.value === 'webp' && level.value === 'preserve')) { blob = candidate; notes = encoded.notes }
      else notes = ['本次压缩未减小体积，已保留未压缩的带水印图片。']
    }
    result.value = { blob, before, url: URL.createObjectURL(blob), beforeUrl: URL.createObjectURL(before), notes, compressed: compressEnabled.value }
    compare.value = 50; status.value = '生成完成，可复制图片或下载。'
  } catch (e) { if (version === revision) { error.value = e instanceof Error ? e.message : '生成失败'; status.value = '' } }
  finally { output.width = 0; output.height = 0; if (version === revision) busy.value = false }
}
function download() {
  if (!result.value || !source.value) return
  const anchor = document.createElement('a'); anchor.href = result.value.url; anchor.download = resultFilename(source.value.name, format.value); anchor.click()
}
async function copyImage() {
  if (!result.value) return
  error.value = ''
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') { error.value = '当前浏览器不支持复制图片，请下载图片；复制需要 HTTPS 或 localhost。'; return }
  const blob = result.value.blob, version = revision
  try {
    const png = blob.type === 'image/png' ? Promise.resolve(blob) : (async () => {
      const image = await createImageBitmap(blob), surface = document.createElement('canvas')
      try { surface.width = image.width; surface.height = image.height; surface.getContext('2d')!.drawImage(image, 0, 0); return await canvasBlob(surface) }
      finally { image.close(); surface.width = 0; surface.height = 0 }
    })()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    if (version === revision) status.value = '已复制带水印图片，可粘贴到支持图片的应用中。'
  } catch { if (version === revision) error.value = '复制图片失败，请允许剪贴板权限或使用下载图片。' }
}
function clear() {
  invalidate(); bitmap?.close(); bitmap = undefined; source.value = undefined; marks.value = []; selected.value = undefined; drag = undefined; colorError.value = ''
}
onMounted(() => window.addEventListener('paste', paste))
onBeforeUnmount(() => { window.removeEventListener('paste', paste); clear() })
</script>

<template>
  <div class="tool-page watermark-tool">
    <div class="tool-heading"><div><div class="eyebrow">图片工具 <span>/</span> LOCAL WATERMARK</div>
      <h1>图片加水印</h1><p>为认证材料标注用途，处理后可直接复制或压缩。图片仅在浏览器本地处理。</p>
    </div></div>
    <input ref="input" class="wm-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择水印图片" @change="selectFile" />
    <div v-if="!source" class="wm-upload" @dragover.prevent @drop.prevent="drop">
      <ImagePlus :size="38" /><h2>添加需要标注的图片</h2><p>拖放或粘贴图片，也可以从设备选择</p>
      <button class="button primary" :disabled="busy" @click="input?.click()">选择图片</button>
      <small>静态 PNG / JPG / WebP · ≤ 10 MiB · ≤ 1600 万像素</small>
    </div>
    <div v-else class="wm-layout">
      <section class="wm-preview" @dragover.prevent @drop.prevent="drop">
        <header><div><h2>{{ source.name }}</h2><small>{{ source.width }} × {{ source.height }} · {{ size(source.size) }}</small></div>
          <button class="text-button" :disabled="busy" @click="input?.click()"><ImagePlus :size="16" />更换图片</button>
        </header>
        <div class="wm-canvas-wrap"><canvas ref="canvas" tabindex="0" aria-label="水印预览，点击水印后拖动，方向键微调，Delete 删除"
          @pointerdown="down" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="key" /></div>
        <p class="wm-help"><Move :size="14" />拖动水印调整位置 · 方向键微调 · 超出图片的部分不导出</p>
      </section>
      <fieldset class="wm-settings" :disabled="busy">
        <h2>水印设置</h2>
        <label v-if="marks.length > 1" class="wm-label">当前水印<select v-model="selected" aria-label="当前水印"><option v-for="(mark, index) in marks" :key="mark.id" :value="mark.id">水印 {{ index + 1 }} · {{ mark.text.slice(0, 16) || '空白' }}</option></select></label>
        <template v-if="current">
          <label class="wm-label">水印文字<textarea v-model="current.text" maxlength="200" rows="2" spellcheck="false" /></label>
          <small class="wm-count">{{ current.text.length }}/200</small>
          <label class="wm-label">字体大小<div class="wm-slider"><input aria-label="字体大小滑块" type="range" min="8" max="512" :value="current.size" @input="number('size', $event, 8, 512)" /><input aria-label="字体大小" type="number" min="8" max="512" :value="current.size" @change="number('size', $event, 8, 512)" /><span>px</span></div></label>
          <label class="wm-label">文字透明度<div class="wm-slider"><input aria-label="文字透明度滑块" type="range" min="0" max="100" :value="current.opacity" @input="number('opacity', $event, 0, 100)" /><input aria-label="文字透明度" type="number" min="0" max="100" :value="current.opacity" @change="number('opacity', $event, 0, 100)" /><span>%</span></div></label>
          <small>0% 完全透明，100% 不透明；文字背景始终透明。</small>
          <div class="wm-label">文字颜色<div class="wm-colors"><button v-for="preset in PRESETS" :key="preset.value" type="button" class="wm-swatch" :style="{ backgroundColor: preset.value }" :aria-label="preset.name" :title="preset.name" :aria-pressed="current.color === preset.value" @click="setColor(preset.value)" /></div></div>
          <label class="wm-label">自定义颜色<input :value="colorInput" aria-label="自定义颜色" placeholder="#ff0000 或 red" :aria-invalid="!!colorError" aria-describedby="wm-color-hint" @input="setColor(($event.target as HTMLInputElement).value)" /></label>
          <small id="wm-color-hint" :class="{ 'wm-error': colorError }">{{ colorError || '支持 #RGB、#RRGGBB 或英文颜色名，例如 black、white、red、gold。' }}</small>
          <label class="wm-label">旋转角度<div class="wm-slider"><input aria-label="旋转角度滑块" type="range" min="-180" max="180" :value="current.angle" @input="number('angle', $event, -180, 180)" /><input aria-label="旋转角度" type="number" min="-180" max="180" :value="current.angle" @change="number('angle', $event, -180, 180)" /><span>°</span></div></label>
          <div class="wm-actions"><button class="button" :disabled="marks.length >= 30 || !!colorError" @click="add(true)"><Copy :size="15" />复制此水印</button><button class="button" @click="remove"><Trash2 :size="15" />删除</button></div>
          <small>副本可独立拖动和修改，最多 30 个水印。</small>
        </template>
        <button v-else class="button" @click="add()"><Stamp :size="16" />添加水印</button>
      </fieldset>
    </div>
    <section v-if="source" class="wm-export">
      <h2>导出设置</h2><div class="wm-export-row">
        <fieldset :disabled="busy" class="wm-export-options">
          <label><input v-model="compressEnabled" type="checkbox" /> 同时压缩</label>
          <label>压缩档位<select v-model="level" :disabled="!compressEnabled"><option v-for="item in LEVELS" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>输出格式<select v-model="format"><option value="jpg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label>
        </fieldset>
        <div class="wm-actions"><button class="button primary" :disabled="busy || !valid" @click="generate"><Stamp :size="16" />{{ busy ? '处理中…' : '生成图片' }}</button>
          <button v-if="busy" class="button" @click="cancel">取消</button>
          <button class="button" :disabled="!result || busy" @click="copyImage"><Copy :size="15" />复制图片</button>
          <button class="button" :disabled="!result || busy" @click="download"><Download :size="15" />下载图片</button>
        </div>
      </div>
      <p class="wm-help">先加水印，再压缩 · 保持原图尺寸 · JPG 透明区域填白 · 复制图片使用 PNG，上传有体积限制时请下载文件</p>
      <p v-if="compressEnabled" class="wm-help">{{ level === 'preserve' ? '对已合成的图片优先保留清晰度；不保证文件体积减小。' : LEVELS.find(item => item.id === level)?.hint }}</p>
      <p v-if="!valid && !colorError" class="wm-help">请至少保留一个非空且透明度大于 0% 的水印。</p>
    </section>
    <div v-if="status || error" class="status-box" :class="{ error: !!error }" role="status">{{ error || status }}</div>
    <section v-if="result" class="wm-result">
      <header><h2>处理结果</h2><strong>{{ size(result.blob.size) }} · {{ format.toUpperCase() }}<template v-if="result.compressed"> · {{ change }}</template></strong></header>
      <p>带水印原图 {{ size(result.before.size) }} → 导出图片 {{ size(result.blob.size) }}</p>
      <ul v-if="result.notes.length"><li v-for="note in result.notes" :key="note">{{ note }}</li></ul>
      <label v-if="result.compressed" class="wm-compare-label">左：压缩前（已加水印） · 右：压缩后（已加水印）<input v-model.number="compare" type="range" min="0" max="100" aria-label="压缩对比分界" /></label>
      <div class="wm-comparison">
        <img :src="result.url" alt="生成的带水印图片" />
        <img v-if="result.compressed" class="wm-before" :src="result.beforeUrl" alt="压缩前的带水印图片" :style="{ clipPath: 'inset(0 ' + (100 - compare) + '% 0 0)' }" />
        <span v-if="result.compressed" class="wm-divider" :style="{ left: compare + '%' }" />
      </div>
    </section>
    <button v-if="source" class="text-button wm-clear" :disabled="busy" @click="clear"><RotateCcw :size="14" />清空图片与水印</button>
  </div>
</template>

<style scoped>
.watermark-tool{max-width:1600px;margin:auto;padding-top:28px}.watermark-tool .tool-heading{margin-bottom:22px}.wm-file{display:none}.wm-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
.wm-preview,.wm-settings,.wm-export,.wm-result{background:#fff;border:1px solid #e4e7ef;border-radius:10px;padding:18px;min-width:0;margin:0}
h2{font-size:16px;color:#273249;margin:0 0 12px;font-weight:600}.wm-preview header,.wm-result header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.wm-preview header h2{margin:0 0 6px;overflow-wrap:anywhere}.wm-preview header>div{min-width:0}.wm-preview header button{flex-shrink:0}
small,.wm-help{font-size:12px;color:#788398;line-height:1.7}.wm-help{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:14px 0 0}
.wm-canvas-wrap{background:#f1f2f6;min-height:240px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #e7e9ef;border-radius:4px}
canvas{display:block;max-width:100%;width:auto;height:auto;max-height:650px;touch-action:none;cursor:move}
canvas:focus-visible{outline:2px solid #7561d9;outline-offset:-2px}
.wm-label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#47536a;margin:11px 0 0}.wm-label:first-of-type{margin-top:0}
.wm-settings input:not([type=range]),.wm-settings textarea,.wm-settings select,.wm-export select{border:1px solid #dce1ec;border-radius:5px;background:#fff;padding:7px 10px;color:#29364c;min-width:0;font:inherit}
.wm-settings textarea{resize:vertical;line-height:1.65;width:100%;box-sizing:border-box}.wm-count{display:block;text-align:right}.wm-slider{display:flex;align-items:center;gap:10px}.wm-slider input[type=range]{min-width:0;flex:1;width:100%}.wm-slider input[type=number]{width:65px;box-sizing:border-box}.wm-slider span{width:20px;font-size:12px;color:#788398}
input[type=range],input[type=checkbox]{accent-color:#7561d9}.wm-colors{display:flex;gap:14px;padding:3px}.wm-swatch{width:28px;height:28px;border:1px solid #c7cbd4;border-radius:50%;cursor:pointer;box-shadow:0 0 0 3px white}
.wm-swatch[aria-pressed=true]{outline:2px solid #7561d9;outline-offset:3px}.wm-actions{display:flex;flex-wrap:wrap;gap:9px}.wm-settings .wm-actions{margin:15px 0 6px}.wm-error{color:#b42318}
.wm-export{margin-top:20px}.wm-export h2{margin-bottom:14px}.wm-export-row{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.wm-export-options{border:0;padding:0;margin:0;display:flex;gap:20px;align-items:center;flex-wrap:wrap;font-size:13px;color:#546077}.wm-export-options label{display:flex;gap:8px;align-items:center}
.wm-upload{min-height:330px;border:1px dashed #cbc4e8;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;color:#7561d9}.wm-upload h2,.wm-upload p{margin:0}.wm-upload p{font-size:13px;color:#788398}
.wm-result{margin-top:20px}.wm-result header{margin-bottom:10px}.wm-result header h2{margin:0}.wm-result strong{font-size:13px;color:#63519f}.wm-result p,.wm-result li{font-size:12px;line-height:1.8;color:#788398}
.wm-compare-label{display:flex;align-items:center;gap:15px;flex-wrap:wrap;font-size:12px;color:#67738a;margin:14px 0}.wm-compare-label input{max-width:260px;width:100%}
.wm-comparison{position:relative;background:#f1f2f6;overflow:hidden}.wm-comparison img{width:100%;display:block}.wm-comparison .wm-before{position:absolute;inset:0}.wm-divider{position:absolute;top:0;bottom:0;width:2px;background:#7561d9;pointer-events:none}.wm-clear{margin-top:20px}
@media(min-width:1000px){.wm-preview{position:sticky;top:20px}}
@media(max-width:1100px){.wm-layout{grid-template-columns:minmax(0,1fr) 300px}.wm-preview,.wm-settings{padding:16px}}
@media(max-width:900px){.wm-layout{grid-template-columns:1fr}.wm-canvas-wrap{min-height:180px}.wm-settings{display:block}.wm-export-row{align-items:stretch}.wm-export-options{gap:12px}.wm-result header{align-items:flex-start;flex-direction:column}}
</style>
