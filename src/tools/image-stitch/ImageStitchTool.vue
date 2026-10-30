<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Plus, X, Grip, Rows3, Columns3, Grid2x2, Download, Maximize, Images, ArrowLeft, ArrowRight } from '@lucide/vue'
import { prepareImage, canvasBlob, type Prepared } from '../moments-grid/images'
import { layoutImages, MAX_IMAGES, MAX_TOTAL_BYTES, type Options } from './core'
import { createCanvas, paint, exportImage } from './render'

interface Item extends Prepared { id: number; thumb: string }
const items = shallowRef<Item[]>([])
const options = reactive<Options>({ mode: 'grid', size: 600, columns: 3, gap: 12, padding: 24, fit: 'contain' })
const modes = [{ id: 'vertical', name: '垂直拼接', icon: Rows3 }, { id: 'horizontal', name: '水平拼接', icon: Columns3 }, { id: 'grid', name: '宫格拼接', icon: Grid2x2 }] as const
const background = ref('#ffffff'), transparent = ref(false), format = ref('image/png')
const picker = ref<HTMLInputElement>(), canvas = ref<HTMLCanvasElement>()
const busy = ref(false), phase = ref(''), error = ref(''), notice = ref(''), previewError = ref('')
const dragged = ref<number>(), dropTarget = ref<number>(), dropping = ref(false)
const geometry = computed(() => {
  if (items.value.length < 2) return { layout: undefined, error: '' }
  try { return { layout: layoutImages(items.value, options), error: '' } }
  catch (e) { return { layout: undefined, error: message(e) } }
})
const fit = computed(() => options.mode === 'grid' ? options.fit : 'contain')
const fill = computed(() => transparent.value && format.value !== 'image/jpeg' ? 'transparent' : transparent.value ? '#ffffff' : background.value)
let serial = 0, job: AbortController | undefined, disposed = false, frame = 0
const downloadUrls = new Set<string>()
function message(e: unknown) { return e instanceof Error ? e.message : '图片处理失败，请重试' }
function release(item: Item) { URL.revokeObjectURL(item.thumb); item.preview.width = item.preview.height = 0 }
function clear() {
  if (busy.value) return
  items.value.forEach(release); items.value = []; error.value = ''; notice.value = ''
}
function remove(index: number) {
  if (busy.value) return
  release(items.value[index]!); items.value = items.value.filter((_, i) => i !== index); notice.value = ''
}
function move(from: number, to: number) {
  if (busy.value || from === to || from < 0 || to < 0 || from >= items.value.length || to >= items.value.length) return
  const list = [...items.value], [item] = list.splice(from, 1)
  list.splice(to, 0, item!); items.value = list; notice.value = ''
}
function dropOn(index: number, event: DragEvent) {
  dropTarget.value = undefined
  if (event.dataTransfer?.files.length) { void load(Array.from(event.dataTransfer.files)); return }
  if (dragged.value !== undefined) move(dragged.value, index)
  dragged.value = undefined
}
async function load(files: File[]) {
  if (busy.value || !files.length) return
  busy.value = true; error.value = ''; notice.value = ''
  const task = new AbortController(); job = task
  const failures: string[] = []
  try {
    for (const file of files) {
      task.signal.throwIfAborted()
      if (items.value.length >= MAX_IMAGES) { failures.push('最多添加 50 张图片，其余文件未导入'); break }
      if (items.value.reduce((sum, item) => sum + item.file.size, 0) + file.size > MAX_TOTAL_BYTES) { failures.push(file.name + '：总文件大小不能超过 100 MiB'); continue }
      phase.value = '正在读取：' + file.name
      let prepared: Prepared | undefined, thumb = ''
      try {
        prepared = await prepareImage(file, task.signal)
        task.signal.throwIfAborted()
        // Keep only a modest preview in memory; export always decodes original files.
        const small = document.createElement('canvas'), scale = Math.min(1, 640 / Math.max(prepared.preview.width, prepared.preview.height))
        small.width = Math.max(1, Math.round(prepared.preview.width * scale)); small.height = Math.max(1, Math.round(prepared.preview.height * scale))
        const ctx = small.getContext('2d')
        if (!ctx) throw Error('无法生成缩略图')
        ctx.drawImage(prepared.preview, 0, 0, small.width, small.height)
        prepared.preview.width = prepared.preview.height = 0; prepared.preview = small
        thumb = URL.createObjectURL(await canvasBlob(small))
        task.signal.throwIfAborted()
        items.value = [...items.value, { ...prepared, id: ++serial, thumb }]
        prepared = undefined; thumb = ''
      } catch (e) {
        if (prepared) prepared.preview.width = prepared.preview.height = 0
        if (thumb) URL.revokeObjectURL(thumb)
        if (task.signal.aborted) throw e
        failures.push(file.name + '：' + message(e))
      }
    }
  } catch (e) { if (!task.signal.aborted) failures.push(message(e)) }
  finally {
    if (!disposed) { error.value = failures.join('\n'); busy.value = false; phase.value = '' }
    if (job === task) job = undefined
  }
}
function select(event: Event) { const input = event.target as HTMLInputElement; void load(Array.from(input.files || [])); input.value = '' }
function dropFiles(event: DragEvent) { dropping.value = false; void load(Array.from(event.dataTransfer?.files || [])) }
function paste(event: ClipboardEvent) {
  if (event.clipboardData?.files.length) { event.preventDefault(); void load(Array.from(event.clipboardData.files)) }
}
function render() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0; previewError.value = ''
    if (!canvas.value) return
    const layout = geometry.value.layout
    if (!layout) { canvas.value.width = canvas.value.height = 0; return }
    try {
      const scale = Math.min(1, 1400 / Math.max(layout.width, layout.height))
      const ctx = createCanvas(canvas.value, layout, fill.value, scale)
      items.value.forEach((item, i) => paint(ctx, item.preview, item, layout.cells[i]!, fit.value, item.preview))
    } catch (e) { previewError.value = message(e) }
  })
}
watch([items, () => ({ ...options }), fill], () => { notice.value = ''; render() }, { flush: 'post' })
async function download() {
  const layout = geometry.value.layout
  if (!layout || busy.value || previewError.value) return
  busy.value = true; error.value = ''; notice.value = ''; phase.value = '正在生成图片…'
  const task = new AbortController(); job = task
  try {
    const blob = await exportImage([...items.value], layout, fit.value, fill.value, format.value, task.signal, count => { phase.value = '正在合并 ' + count + ' / ' + items.value.length })
    task.signal.throwIfAborted()
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
    const url = URL.createObjectURL(blob); downloadUrls.add(url)
    const link = document.createElement('a'); link.href = url; link.download = '拼接图片-' + layout.width + 'x' + layout.height + '.' + ext
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.delete(url) }, 60000)
    notice.value = blob.type === format.value ? '图片已生成，已开始下载。' : '浏览器不支持所选格式，已改为 PNG 下载。'
  } catch (e) { if (!disposed && !task.signal.aborted) error.value = message(e) }
  finally { if (!disposed) { busy.value = false; phase.value = '' }; if (job === task) job = undefined }
}
function cancel() { job?.abort(); notice.value = '已取消，已添加的图片会保留。' }
onMounted(() => { window.addEventListener('paste', paste); render() })
onBeforeUnmount(() => {
  disposed = true; job?.abort(); cancelAnimationFrame(frame); window.removeEventListener('paste', paste)
  items.value.forEach(release); downloadUrls.forEach(url => URL.revokeObjectURL(url))
})
</script>

<template>
  <div class="tool-page stitch-tool">
    <div class="tool-heading"><div><h1>图片拼接</h1><p>将多张图片合并为一张，支持垂直、水平与宫格排列。浏览器本地处理图片。</p></div></div>
    <div class="stitch-workspace">
      <section class="stitch-controls">
        <div class="section-title"><h2>1. 添加图片 <span>（至少 2 张）</span></h2><button class="text-button button" :disabled="busy || !items.length" @click="clear">清空</button></div>
        <input ref="picker" class="file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="选择拼接图片" @change="select" />
        <button class="button add-images" :class="{ dragging: dropping }" :disabled="busy || items.length >= MAX_IMAGES" @click="picker?.click()" @dragover.prevent="dropping = true" @dragleave="dropping = false" @drop.prevent="dropFiles"><Plus :size="18" />添加图片</button>
        <p class="upload-help">JPG / PNG / WebP · 支持拖入或粘贴</p>
        <p class="sort-help"><Grip :size="14" />拖动调整顺序，或使用前移 / 后移按钮</p>
        <div v-if="items.length" class="thumbnail-list" aria-label="待拼接图片列表">
          <div v-for="(item, index) in items" :key="item.id" class="thumbnail" :class="{ 'drop-target': dropTarget === index }" :draggable="!busy" @dragstart="dragged = index" @dragend="dragged = undefined; dropTarget = undefined" @dragover.prevent="dropTarget = index" @dragleave="dropTarget = undefined" @drop.prevent.stop="dropOn(index, $event)">
            <img :src="item.thumb" :alt="item.name" :title="item.name + ' · ' + item.width + ' × ' + item.height" draggable="false" />
            <span class="image-number">{{ index + 1 }}</span><button class="remove-image" :disabled="busy" :aria-label="'删除 ' + item.name" @click="remove(index)"><X :size="13" /></button>
            <div class="reorder"><button :disabled="busy || index === 0" :aria-label="'前移 ' + item.name" @click="move(index, index - 1)"><ArrowLeft :size="13" /></button><button :disabled="busy || index === items.length - 1" :aria-label="'后移 ' + item.name" @click="move(index, index + 1)"><ArrowRight :size="13" /></button></div>
          </div>
        </div>
        <div v-else class="source-empty" @dragover.prevent @drop.prevent="dropFiles"><Images :size="30" /><p>添加 2 张或更多图片开始拼接</p><span>可随时继续添加，最多 50 张</span></div>
        <fieldset :disabled="busy" class="settings">
          <legend>2. 拼接方式</legend>
          <div class="mode-options"><button v-for="mode in modes" :key="mode.id" type="button" :class="{ selected: options.mode === mode.id }" :aria-pressed="options.mode === mode.id" @click="options.mode = mode.id"><component :is="mode.icon" :size="24" /><span>{{ mode.name }}</span></button></div>
          <label v-if="options.mode === 'grid'" class="setting-row"><span>列数</span><select v-model.number="options.columns"><option v-for="n in 10" :key="n" :value="n">{{ n }}</option></select></label>
          <div v-if="options.mode === 'grid'" class="setting-row fit-row"><span>图片适配</span><div><label><input v-model="options.fit" type="radio" value="contain" />完整显示</label><label><input v-model="options.fit" type="radio" value="cover" />裁剪填满</label></div></div>
          <label class="setting-row"><span>{{ options.mode === 'grid' ? '格子边长' : options.mode === 'vertical' ? '统一宽度' : '统一高度' }}</span><div class="number-field"><input v-model.number="options.size" type="number" min="1" max="8192" step="1" /><span>px</span></div></label>
          <p v-if="options.mode !== 'grid'" class="setting-hint">按原图比例缩放，不裁剪、不拉伸。</p>
          <label class="setting-row"><span>间距</span><div class="number-field"><input v-model.number="options.gap" type="number" min="0" max="500" step="1" /><span>px</span></div></label>
          <label class="setting-row"><span>外边距</span><div class="number-field"><input v-model.number="options.padding" type="number" min="0" max="500" step="1" /><span>px</span></div></label>
          <div class="setting-row"><label for="stitch-color">背景颜色</label><div class="background-controls"><input id="stitch-color" v-model="background" type="color" :disabled="transparent" /><label><input v-model="transparent" type="checkbox" />透明</label></div></div>
          <p v-if="transparent && format === 'image/jpeg'" class="setting-hint">JPG 不支持透明，预览和导出均使用白底。</p>
        </fieldset>
      </section>
      <section class="stitch-preview">
        <header><h2>拼接预览</h2><span class="fit-label"><Maximize :size="15" />适应画布</span></header>
        <div class="preview-stage" @dragover.prevent @drop.prevent="dropFiles">
          <canvas v-show="geometry.layout && !previewError" ref="canvas" aria-label="合并图片预览" />
          <div v-if="!geometry.layout || previewError" class="preview-empty"><Images :size="46" /><strong>{{ geometry.error || previewError || (items.length === 1 ? '再添加一张图片即可预览' : '拼接效果将在这里呈现') }}</strong><p v-if="!geometry.error && !previewError">选择图片与拼接方式，实时查看合并效果</p></div>
        </div>
        <footer><div class="output-info"><template v-if="geometry.layout"><strong>{{ geometry.layout.columns }} 列 × {{ geometry.layout.rows }} 行 · {{ items.length }} 张图片</strong><span>{{ geometry.layout.width }} × {{ geometry.layout.height }} px</span></template><span v-else>至少添加 2 张图片</span></div><div class="export-actions"><label>输出格式<select v-model="format" :disabled="busy"><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></label><button class="button primary" :disabled="busy || !geometry.layout || !!previewError" @click="download"><Download :size="17" />下载图片</button></div></footer>
      </section>
    </div>
    <div v-if="busy" class="status-box" role="status">{{ phase }}<button @click="cancel">取消</button></div>
    <div v-if="error" class="status-box error stitch-error" role="alert">{{ error }}</div>
    <div v-if="notice" class="status-box success" role="status">{{ notice }}</div>
    <p class="limits-note">单张 ≤ 10 MiB / 1600 万像素，总文件 ≤ 100 MiB；导出 ≤ 3200 万像素、单边 ≤ 16384 px。仅支持静态图片，不上传、不保存历史。</p>
  </div>
</template>

<style scoped>
.stitch-tool{padding-top:24px}.stitch-tool .tool-heading{margin-bottom:24px}.stitch-tool h1{margin-top:0}.stitch-workspace{display:grid;grid-template-columns:340px minmax(0,1fr);gap:18px;align-items:stretch}.stitch-controls,.stitch-preview{background:#fff;border:1px solid #e2e5ee;border-radius:10px;min-width:0}.stitch-controls{padding:20px}.section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}h2{font-size:14px;margin:0;font-weight:650}.section-title h2 span{color:#8c95a8;font-size:12px;font-weight:400}.section-title .button{padding:0;font-size:11px}.file-input{display:none}.add-images{width:100%;color:#7561d9;border-color:#a695e7;background:#faf8ff;padding:11px}.add-images.dragging{background:#eee8ff;outline:2px solid #7561d9}.upload-help{font-size:10px;color:#929bad;text-align:center;margin:9px 0 18px}.sort-help{display:flex;align-items:center;gap:6px;color:#8992a5;font-size:10px;margin-bottom:12px}.thumbnail-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:300px;overflow:auto;padding:2px}.thumbnail{position:relative;aspect-ratio:1.2;min-width:0;border-radius:6px;overflow:hidden;background:#f1f2f6;cursor:grab}.thumbnail img{width:100%;height:100%;object-fit:cover;display:block}.thumbnail.drop-target{outline:2px solid #7561d9;outline-offset:-2px}.image-number{position:absolute;top:5px;left:5px;border-radius:6px;background:#283248d9;color:#fff;font-size:11px;padding:2px 5px}.remove-image{position:absolute;top:5px;right:5px;border:0;border-radius:50%;background:#fffffff0;width:20px;height:20px;padding:0;display:grid;place-items:center}.reorder{position:absolute;bottom:4px;right:4px;display:flex;gap:3px}.reorder button{display:grid;place-items:center;background:#ffffffe8;border:0;border-radius:4px;width:22px;height:20px;padding:0}.source-empty{min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#b1a6d4;background:#faf9fd;border-radius:6px}.source-empty p{font-size:12px;color:#8891a3;margin:14px 0 7px}.source-empty span{font-size:10px;color:#9ca4b3}.settings{border:0;border-top:1px solid #e9ebf2;padding:20px 0 0;margin:18px 0 0;min-width:0}.settings legend{float:left;width:100%;font-size:14px;font-weight:650;margin:0 0 16px}.mode-options{clear:both;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:18px}.mode-options button{display:flex;flex-direction:column;align-items:center;gap:9px;background:#fcfcfe;border:1px solid #e5e7f0;border-radius:7px;padding:12px 2px;font-size:11px}.mode-options button.selected{background:#f0ecfc;border-color:#a895e7;color:#7561d9}.setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;font-size:12px}.setting-row>span:first-child,.setting-row>label:first-child{flex-shrink:0}.setting-row select,.number-field{width:190px;min-width:0;border:1px solid #dfe3ed;border-radius:6px;background:#fff;height:34px}.setting-row select{padding:0 10px;color:#4b566f}.number-field{display:flex;align-items:center;padding-right:10px;gap:5px}.number-field input{border:0;background:none;min-width:0;width:100%;padding:7px 10px;color:#354059}.number-field>span{color:#9ca4b4;font-size:11px}.fit-row>div{display:flex;gap:8px;flex-wrap:wrap}.fit-row label,.background-controls label{display:flex;align-items:center;gap:4px;font-size:10px}.fit-row input,.background-controls input{accent-color:#7561d9;margin:0}.background-controls{width:190px;display:flex;align-items:center;gap:16px}.background-controls input[type=color]{width:42px;height:32px;border:1px solid #dfe3ed;border-radius:5px;padding:3px;background:#fff}.setting-hint{font-size:10px;color:#929bad;line-height:1.7;margin:9px 0 0}.stitch-preview{display:flex;flex-direction:column;padding:18px;min-height:660px}.stitch-preview header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:10px;min-height:28px}.fit-label{display:flex;align-items:center;gap:7px;font-size:11px;border:1px solid #e3e6ee;border-radius:6px;padding:7px 9px;color:#7e889c}.preview-stage{flex:1;min-height:400px;max-height:760px;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;background:repeating-conic-gradient(#eceef4 0% 25%,#f7f8fb 0% 50%) 0 0/20px 20px}.preview-stage canvas{display:block;max-width:100%;max-height:640px;object-fit:contain;width:auto;height:auto;box-shadow:0 2px 12px #2832480d}.preview-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px;gap:18px;color:#b4abc9}.preview-empty strong{color:#858fa2;font-size:13px;font-weight:500;max-width:420px;line-height:1.8}.preview-empty p{font-size:11px;color:#969fb0;margin:0}.stitch-preview footer{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:20px;flex-wrap:wrap}.output-info{display:flex;flex-direction:column;gap:6px;color:#7d879b;font-size:11px}.output-info strong{font-weight:500}.output-info>span{font-size:10px;color:#98a1b0}.export-actions{display:flex;align-items:center;gap:12px}.export-actions label{display:flex;align-items:center;gap:8px;font-size:11px;color:#7d879b}.export-actions select{padding:8px;border:1px solid #e0e4ee;border-radius:6px;background:white;color:#46516a}.export-actions .primary{padding:11px 18px}.limits-note{font-size:10px;color:#969fb0;line-height:1.8;margin:16px 0 0}.stitch-error{white-space:pre-line;overflow-wrap:anywhere}
@media(min-width:1250px){.stitch-workspace{grid-template-columns:380px minmax(0,1fr)}}
@media(max-width:1150px){.stitch-workspace{grid-template-columns:300px minmax(0,1fr)}.stitch-controls{padding:16px}.setting-row select,.number-field,.background-controls{width:160px}.stitch-preview{padding:14px}.preview-stage{padding:12px}}
@media(max-width:950px){.stitch-workspace{grid-template-columns:1fr}.stitch-preview{min-height:480px}.thumbnail-list{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));max-height:220px}.setting-row select,.number-field,.background-controls{width:65%}.settings{max-width:none}.preview-stage{min-height:320px}.preview-stage canvas{max-height:480px}}
@media(max-width:520px){.stitch-tool{padding:24px 14px 18px}.stitch-preview footer{align-items:stretch}.export-actions{width:100%;justify-content:space-between}.preview-stage{padding:10px;min-height:280px}.preview-stage canvas{max-height:380px}.limits-note{font-size:10px}.fit-row>div{gap:10px}.stitch-preview{min-height:420px}}
</style>
