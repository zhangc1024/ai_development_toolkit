<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { INITIAL_CROP, outputFormat, constrainCrop, cropRect, moveCrop, type Crop } from './core'
import { drawPreview, exportTiles, packTiles, prepareImage, type Prepared, type Tile } from './images'

const image = shallowRef<Prepared>()
const crop = ref<Crop>({ ...INITIAL_CROP })
const canvas = ref<HTMLCanvasElement>(), picker = ref<HTMLInputElement>(), dialog = ref<HTMLDialogElement>()
const busy = ref(false), progress = ref(0), phase = ref(''), error = ref(''), notice = ref('')
const results = shallowRef<(Tile & { url: string; thumb: string })[]>([])
const zipUrl = ref(''), selected = ref(0), showGaps = ref(true)
const formatLabel = computed(() => results.value.length ? outputFormat(results.value[0].blob.type).toUpperCase() : image.value?.format.toUpperCase())
const current = computed(() => results.value[selected.value])
const lowResolution = computed(() => image.value && cropRect(image.value.width, image.value.height, crop.value).size < 3240)
let job: AbortController | undefined, disposed = false, frame = 0
const pointers = new Map<number, { x: number; y: number }>()
function clearResults() {
  dialog.value?.close()
  for (const item of results.value) { URL.revokeObjectURL(item.url); URL.revokeObjectURL(item.thumb) }
  results.value = []
  if (zipUrl.value) URL.revokeObjectURL(zipUrl.value)
  zipUrl.value = ''
}
function render() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (canvas.value && image.value) drawPreview(canvas.value, image.value, crop.value)
  })
}
function updateCrop(value: Crop) {
  if (!image.value || busy.value) return
  crop.value = constrainCrop(image.value.width, image.value.height, value)
  if (results.value.length) { clearResults(); notice.value = '裁剪已调整，请重新生成图片。' }
  error.value = ''; render()
}
function resetCrop() { pointers.clear(); updateCrop({ ...INITIAL_CROP }) }
function releaseImage() {
  if (image.value) image.value.preview.width = image.value.preview.height = 0
  image.value = undefined
}
function clear() {
  if (busy.value) return
  pointers.clear(); clearResults(); releaseImage(); error.value = ''; notice.value = ''
}
async function load(file?: File) {
  if (!file || busy.value) return
  busy.value = true; phase.value = '正在读取图片…'; error.value = ''; notice.value = ''; pointers.clear()
  const task = new AbortController(); job = task
  try {
    const prepared = await prepareImage(file, task.signal)
    if (disposed || task.signal.aborted) { prepared.preview.width = prepared.preview.height = 0; return }
    clearResults(); releaseImage(); image.value = prepared; crop.value = { ...INITIAL_CROP }
    await nextTick(); render()
  } catch (e) {
    if (!disposed && !task.signal.aborted) error.value = e instanceof Error ? e.message : '图片读取失败，请更换后重试'
  } finally { if (!disposed) { busy.value = false; phase.value = '' }; if (job === task) job = undefined }
}
function select(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]; input.value = ''; void load(file)
}
function drop(event: DragEvent) { void load(event.dataTransfer?.files[0]) }
function cancel() { job?.abort(); phase.value = '正在取消…'; notice.value = '操作已取消，等待当前图片处理结束。' }
async function generate() {
  if (!image.value || busy.value) return
  pointers.clear(); clearResults(); error.value = ''; notice.value = ''; busy.value = true; progress.value = 0; phase.value = '正在生成图片'
  const task = new AbortController(); job = task
  try {
    const tiles = await exportTiles(image.value, { ...crop.value }, task.signal, count => { progress.value = count })
    if (disposed || task.signal.aborted) return
    results.value = tiles.map(tile => ({ ...tile, url: URL.createObjectURL(tile.blob), thumb: URL.createObjectURL(tile.thumbnail) }))
    notice.value = '九张图片已生成，请按 01 → 09 的顺序发布。'
    if (outputFormat(tiles[0].blob.type) !== image.value.format) notice.value += '当前浏览器不支持原格式编码，已改为 PNG 并保留透明区域。'
  } catch (e) { if (!disposed && !task.signal.aborted) error.value = e instanceof Error ? e.message : '生成失败，请重试' }
  finally { if (!disposed) { busy.value = false; phase.value = '' }; if (job === task) job = undefined }
}
async function makeZip() {
  if (busy.value || results.value.length !== 9) return
  busy.value = true; phase.value = '正在打包 ZIP…'; error.value = ''
  const task = new AbortController(); job = task
  try {
    const blob = await packTiles(results.value, task.signal)
    if (!disposed && !task.signal.aborted) zipUrl.value = URL.createObjectURL(blob)
  } catch { if (!disposed && !task.signal.aborted) error.value = 'ZIP 打包失败，请重试或逐张保存。' }
  finally { if (!disposed) { busy.value = false; phase.value = '' }; if (job === task) job = undefined }
}
function point(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
}
function down(event: PointerEvent) {
  if (busy.value || !image.value || (event.pointerType === 'mouse' && event.button !== 0) || pointers.size >= 2) return
  pointers.set(event.pointerId, point(event))
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!pointers.has(event.pointerId) || busy.value || !image.value) return
  const before = [...pointers.values()]
  pointers.set(event.pointerId, point(event))
  const after = [...pointers.values()]
  const middle = (points: { x: number; y: number }[]) => ({ x: points.reduce((a, p) => a + p.x, 0) / points.length, y: points.reduce((a, p) => a + p.y, 0) / points.length })
  let zoom = crop.value.zoom
  if (before.length === 2) {
    const distance = (points: { x: number; y: number }[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
    if (distance(before) > 0.005) zoom *= distance(after) / distance(before)
  }
  updateCrop(moveCrop(image.value.width, image.value.height, crop.value, middle(before), middle(after), zoom))
}
function up(event: PointerEvent) { pointers.delete(event.pointerId) }
function keyboard(event: KeyboardEvent) {
  const delta: Record<string, { x: number; y: number }> = { ArrowLeft: { x: -0.02, y: 0 }, ArrowRight: { x: 0.02, y: 0 }, ArrowUp: { x: 0, y: -0.02 }, ArrowDown: { x: 0, y: 0.02 } }
  if (!delta[event.key] || !image.value || busy.value) return
  event.preventDefault()
  updateCrop(moveCrop(image.value.width, image.value.height, crop.value, { x: 0.5, y: 0.5 }, { x: 0.5 + delta[event.key].x, y: 0.5 + delta[event.key].y }))
}
async function openTile(index: number) { selected.value = index; await nextTick(); dialog.value?.showModal() }
onBeforeUnmount(() => { disposed = true; job?.abort(); cancelAnimationFrame(frame); pointers.clear(); clearResults(); releaseImage() })
</script>

<template>
  <div class="tool-page moments-tool">
    <div class="tool-heading"><div><div class="eyebrow">图片工具 <span>/</span> MOMENTS GRID</div><h1>一图切九格</h1><p>把一张照片切成九张方图，按顺序发布，拼出完整画面。</p></div></div>
    <div class="local-hint">照片仅在您的设备中处理，不会上传服务器。</div>
    <section class="grid-workspace" @dragover.prevent @drop.prevent="drop">
      <div class="editor-pane">
        <div class="pane-heading"><h2>{{ image ? '调整整体裁剪' : '选择一张照片' }}</h2><button v-if="image" class="button" :disabled="busy" @click="resetCrop">重置裁剪</button></div>
        <div v-if="!image" class="empty-upload"><span class="grid-symbol" aria-hidden="true">▦</span><strong>一张照片，九格风景</strong><p>选择或拖入照片，先调整画面，再生成九张图片。</p><button class="button primary" :disabled="busy" @click="picker?.click()">选择照片</button><small>静态 JPG / PNG / WebP · 最大 10 MiB、1600 万像素</small></div>
        <div v-else class="crop-stage" :class="{ gaps: showGaps, locked: busy }" tabindex="0" role="group" aria-label="图片裁剪区域，拖动或方向键移动，双指或下方滑块缩放" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" @keydown="keyboard">
          <canvas ref="canvas" width="900" height="900" aria-label="整体裁剪预览"></canvas>
          <div class="grid-overlay" aria-hidden="true"><span v-for="n in 9" :key="n"><i>{{ String(n).padStart(2, '0') }}</i></span></div>
        </div>
        <p v-if="image" class="image-info">{{ image.name }} · {{ image.width }} × {{ image.height }}</p>
        <input ref="picker" class="hidden-picker" type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择照片文件" :disabled="busy" @change="select" />
      </div>
      <div class="controls-pane">
        <h2>几步完成九宫格</h2>
        <ol class="steps"><li>选择照片，调整正方形裁剪区域</li><li>生成九张图片，保存到设备</li><li>按 01 → 09 的顺序发朋友圈</li></ol>
        <template v-if="image">
          <label class="zoom-label" for="grid-zoom">缩放 <span>{{ crop.zoom.toFixed(2) }}×</span></label>
          <input id="grid-zoom" class="zoom-slider" type="range" min="1" max="6" step="0.01" :value="crop.zoom" :disabled="busy" @input="updateCrop({ ...crop, zoom: Number(($event.target as HTMLInputElement).value) })" />
          <p class="muted">拖动移动画面，双指缩放；电脑也可使用方向键和滑块。</p>
          <label class="gap-toggle"><input v-model="showGaps" type="checkbox" />显示九格分隔线</label>
          <p class="muted">序号和分隔线只用于预览，不会出现在导出图片中。</p>
          <div class="primary-actions"><button class="button" :disabled="busy" @click="picker?.click()">更换照片</button><button class="button" :disabled="busy" @click="clear">清空</button></div>
          <p v-if="lowResolution" class="quality-note">当前裁剪区域不足 3240 × 3240，导出时会放大；放大不会增加原图细节。</p>
        </template>
        <div class="export-actions"><button class="button primary generate" :disabled="!image || busy" @click="generate">生成 9 张图片</button><small>每张 1080 × 1080 · {{ formatLabel || '跟随原图格式' }}<template v-if="image && image.format !== 'jpg'"> · 保留透明区域</template></small></div>
      </div>
    </section>
    <div v-if="busy" class="status-box" role="status">{{ phase }}<span v-if="phase === '正在生成图片'">{{ progress }} / 9</span><button @click="cancel">取消</button></div>
    <div v-if="error || notice" class="status-box" :class="{ error: !!error }" role="status">{{ error || notice }}</div>
    <section v-if="results.length" class="results-pane">
      <div class="pane-heading"><h2>生成结果</h2><button v-if="!zipUrl" class="button primary" :disabled="busy" @click="makeZip">打包 ZIP</button><a v-else class="button primary" :href="zipUrl" download="moment-grid.zip">下载 ZIP</a></div>
      <p class="muted">点击图片查看大图，手机可长按保存；也可逐张下载。ZIP 下载后需要先解压。</p>
      <div class="result-grid"><div v-for="(tile, index) in results" :key="tile.name"><button class="tile-button" :aria-label="'查看第 ' + (index + 1) + ' 张图片'" @click="openTile(index)"><img :src="tile.thumb" :alt="'第 ' + (index + 1) + ' 格'" /><span>{{ String(index + 1).padStart(2, '0') }}</span></button><a :href="tile.url" :download="tile.name">下载 {{ String(index + 1).padStart(2, '0') }}</a></div></div>
      <p class="muted">浏览器无法保证直接保存到系统相册。微信内下载受限时，可尝试长按保存或使用系统浏览器；发布前请核对图片顺序。</p>
    </section>
    <dialog ref="dialog" class="tile-dialog" aria-label="单张图片预览" @click="($event.target === dialog) && dialog?.close()">
      <template v-if="current"><div class="pane-heading"><strong>{{ current.name }}</strong><button class="button" @click="dialog?.close()">关闭</button></div><img :src="current.url" :alt="'第 ' + (selected + 1) + ' 张，长按保存图片'" /><div class="dialog-actions"><button class="button" :disabled="selected === 0" @click="selected--">上一张</button><a class="button primary" :href="current.url" :download="current.name">下载图片</a><button class="button" :disabled="selected === 8" @click="selected++">下一张</button></div><p class="muted">手机可长按上方图片保存。</p></template>
    </dialog>
  </div>
</template>

<style scoped>
.moments-tool{max-width:1200px;margin:auto}.local-hint{font-size:12px;color:#638979;margin:-12px 0 22px}.grid-workspace{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:28px;background:white;border:1px solid #e4e7ef;border-radius:12px;padding:24px}.editor-pane,.controls-pane{min-width:0}.pane-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.pane-heading h2,.controls-pane h2{font-size:16px;margin:0}.controls-pane{padding:8px 0}.crop-stage{position:relative;width:100%;aspect-ratio:1;touch-action:none;cursor:grab;overflow:hidden;background:#f4f4f6;user-select:none}.crop-stage,.tile-button,.tile-dialog img{background-color:#fff;background-image:conic-gradient(#eef0f4 25%,transparent 0 50%,#eef0f4 0 75%,transparent 0);background-size:16px 16px}.crop-stage:active{cursor:grabbing}.crop-stage.locked{cursor:wait}.crop-stage canvas{display:block;width:100%;height:100%}.grid-overlay{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);pointer-events:none}.grid-overlay span{position:relative}.gaps .grid-overlay span:not(:nth-child(3n)){border-right:3px solid white}.gaps .grid-overlay span:nth-child(-n+6){border-bottom:3px solid white}.grid-overlay i{position:absolute;left:8px;top:8px;font-size:11px;font-style:normal;color:white;background:#0006;border-radius:4px;padding:3px 5px}.image-info{font-size:12px;color:#8690a2;overflow-wrap:anywhere}.steps{padding-left:20px;font-size:13px;line-height:2.3;color:#758095;margin:18px 0 28px}.zoom-label{display:flex;justify-content:space-between;font-size:14px}.zoom-slider{width:100%;min-height:44px;accent-color:#7561d9}.muted{font-size:12px;color:#758095;line-height:1.9}.gap-toggle{display:flex;align-items:center;gap:8px;font-size:13px;margin-top:20px;min-height:44px}.gap-toggle input{accent-color:#7561d9}.quality-note{font-size:12px;color:#916e37;line-height:1.8;background:#fff8eb;padding:12px;border-radius:8px;margin-top:20px}.export-actions{margin-top:24px}.generate{width:100%;min-height:48px;font-size:14px}.export-actions small{display:block;text-align:center;font-size:11px;color:#8690a2;line-height:1.8;margin-top:10px}.empty-upload{min-height:360px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;border:1px dashed #c9c3e4;border-radius:10px;background:#faf9ff;padding:24px;gap:16px}.empty-upload p{font-size:13px;line-height:1.8;color:#758095;margin:0}.empty-upload small{font-size:11px;color:#8690a2;line-height:1.8}.grid-symbol{font-size:65px;color:#9585db}.hidden-picker{display:none}.results-pane{margin-top:24px;padding:24px;background:white;border:1px solid #e4e7ef;border-radius:12px}.result-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:660px;margin:20px auto}.tile-button{display:block;position:relative;width:100%;border:0;background:none;padding:0;aspect-ratio:1}.tile-button img{width:100%;height:100%;display:block}.tile-button span{position:absolute;left:6px;top:6px;background:#0007;color:white;padding:4px;border-radius:4px;font-size:12px}.result-grid a{display:block;text-align:center;font-size:12px;color:#7561d9;padding:12px 0}.tile-dialog{width:min(92vw,650px);max-height:92dvh;overflow:auto;border:1px solid #e4e7ef;border-radius:12px;padding:18px;color:inherit}.tile-dialog::backdrop{background:#131b30b3}.tile-dialog img{display:block;width:100%;height:auto}.tile-dialog strong{font-size:13px;overflow-wrap:anywhere}.dialog-actions{display:flex;justify-content:space-between;gap:8px;margin-top:16px}.tile-dialog .muted{text-align:center}.moments-tool .button{min-height:44px}
@media(max-width:820px){.grid-workspace{grid-template-columns:1fr;gap:16px;padding:16px}.controls-pane h2,.steps{display:none}.controls-pane{padding:0}.results-pane{padding:16px}.result-grid{gap:6px}.empty-upload{min-height:290px}.export-actions{padding-bottom:env(safe-area-inset-bottom)}}
</style>
