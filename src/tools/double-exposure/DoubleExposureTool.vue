<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { MAX_IMAGE_BYTES } from '../images/core'
import { validatePhotoDimensions } from '../images/photo-formats'
import { inspectExposureImage } from './import'
import { placement, removeConnectedBackground } from './core'
import { makeCanvas, render, type Settings } from './render'

const preview = ref<HTMLCanvasElement>(), editor = ref<HTMLCanvasElement>()
const names = reactive({ portrait: '', scene: '' })
const fileInfo = reactive({ portrait: '', scene: '' }), thumbnails = reactive({ portrait: '', scene: '' })
const activeUpload = ref<'portrait' | 'scene'>()
const busy = ref(false), error = ref(''), notice = ref('')
const mode = ref<'erase' | 'restore' | 'background'>('background')
const brush = ref(40), tolerance = ref(35), editing = ref(false), historyCount = ref(0)
const ratio = ref('2:3'), longEdge = ref(2400), format = ref('png')
const settings = reactive<Settings>({
  fusion: 'full', angle: 90, sceneOpacity: .55, blend: 'source-over',
  portrait: { x: 0, y: 0, scale: 1 }, scene: { x: 0, y: 0, scale: 1 },
  center: .52, softness: .4, opacity: .8, tint: '#16769b', tintStrength: .55, background: '#edf9fa',
})
let original: HTMLCanvasElement | undefined, portrait: HTMLCanvasElement | undefined, scene: HTMLCanvasElement | undefined
let history: ImageData[] = [], frame = 0, version = 0, disposed = false
let stroke: { id: number; x: number; y: number } | undefined
const ready = computed(() => !!names.portrait && !!names.scene)
const outputSize = computed(() => {
  const [w, h] = ratio.value.split(':').map(Number)
  return { width: Math.round(longEdge.value * w / Math.max(w, h)), height: Math.round(longEdge.value * h / Math.max(w, h)) }
})
const controls = [
  { key: 'portrait' as const, title: '人像构图' },
  { key: 'scene' as const, title: '风景构图' },
]
function draw() {
  if (disposed) return
  if (preview.value) {
    const { width, height } = outputSize.value, scale = Math.min(1, 900 / Math.max(width, height))
    preview.value.width = Math.round(width * scale); preview.value.height = Math.round(height * scale)
    if (portrait) render(preview.value, portrait, scene, settings)
    else if (scene) {
      const ctx = preview.value.getContext('2d')!
      ctx.fillStyle = settings.background; ctx.fillRect(0, 0, preview.value.width, preview.value.height)
      const p = placement(scene.width, scene.height, preview.value.width, preview.value.height, settings.scene, true)
      ctx.drawImage(scene, p.x, p.y, p.width, p.height)
    } else preview.value.getContext('2d')!.clearRect(0, 0, preview.value.width, preview.value.height)
  }
  if (editor.value && portrait) {
    editor.value.width = portrait.width; editor.value.height = portrait.height
    editor.value.getContext('2d')!.drawImage(portrait, 0, 0)
  }
}
function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw) }
watch([settings, ratio, longEdge], schedule, { deep: true })
watch(editing, async () => { stroke = undefined; await nextTick(); draw() })
onMounted(draw)
onBeforeUnmount(() => { disposed = true; version++; cancelAnimationFrame(frame); history = []; original = portrait = scene = undefined })

async function load(event: Event, kind: 'portrait' | 'scene') {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''
  if (!file || busy.value) return
  const token = ++version; activeUpload.value = kind; busy.value = true; error.value = ''; notice.value = '正在读取照片…'
  let bitmap: ImageBitmap | undefined
  try {
    if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error('单张图片必须非空且不超过 10 MiB')
    const bytes = new Uint8Array(await file.arrayBuffer())
    inspectExposureImage(bytes)
    bitmap = await createImageBitmap(file)
    validatePhotoDimensions(bitmap.width, bitmap.height)
    if (disposed || token !== version) return
    const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
    const source = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
    source.getContext('2d')!.drawImage(bitmap, 0, 0, source.width, source.height)
    if (kind === 'portrait') {
      original = source; portrait = makeCanvas(source.width, source.height)
      portrait.getContext('2d', { willReadFrequently: true })!.drawImage(source, 0, 0)
      history = []; historyCount.value = 0; editing.value = true
    } else scene = source
    settings[kind] = { x: 0, y: 0, scale: 1 }; names[kind] = file.name
    fileInfo[kind] = bitmap.width + ' × ' + bitmap.height + ' · ' + (file.size / 1048576).toFixed(1) + ' MiB'
    const thumbScale = Math.min(1, 160 / Math.max(source.width, source.height))
    const thumb = makeCanvas(Math.max(1, Math.round(source.width * thumbScale)), Math.max(1, Math.round(source.height * thumbScale)))
    thumb.getContext('2d')!.drawImage(source, 0, 0, thumb.width, thumb.height)
    thumbnails[kind] = thumb.toDataURL('image/png'); thumb.width = thumb.height = 1
    notice.value = scale < 1 ? '图片已按长边 3000 px 缩小处理。' : '图片已载入。'
    await nextTick(); draw()
  } catch (e) { if (!disposed) { notice.value = ''; error.value = (kind === 'portrait' ? '人像照片：' : '风景照片：') + (e instanceof Error ? e.message : '图片读取失败') + (names[kind] ? '；已保留之前的照片。' : '') } }
  finally { bitmap?.close(); if (!disposed && token === version) busy.value = false }
}
function saveHistory() {
  if (!portrait) return
  // Bound history to 64 MiB, including the next snapshot.
  const bytes = portrait.width * portrait.height * 4, limit = Math.max(1, Math.min(10, Math.floor(64 * 1024 * 1024 / bytes)))
  while (history.length >= limit) history.shift()
  history.push(portrait.getContext('2d')!.getImageData(0, 0, portrait.width, portrait.height))
  historyCount.value = history.length
}
function undo() {
  const previous = history.pop()
  if (previous && portrait) portrait.getContext('2d')!.putImageData(previous, 0, 0)
  historyCount.value = history.length; draw()
}
function resetMask() {
  if (!portrait || !original) return
  saveHistory()
  const ctx = portrait.getContext('2d')!; ctx.clearRect(0, 0, portrait.width, portrait.height); ctx.drawImage(original, 0, 0); draw()
}
function point(e: PointerEvent) {
  const rect = editor.value!.getBoundingClientRect()
  return { x: (e.clientX - rect.left) * portrait!.width / rect.width, y: (e.clientY - rect.top) * portrait!.height / rect.height }
}
function paint(x: number, y: number, fromX: number, fromY: number) {
  if (!portrait || !original || !editor.value) return
  const ctx = portrait.getContext('2d')!, radius = brush.value * portrait.width / editor.value.getBoundingClientRect().width / 2
  ctx.save()
  if (mode.value === 'restore') {
    // Restore only original pixels, including the source alpha channel.
    const distance = Math.hypot(x - fromX, y - fromY), steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)))
    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const px = fromX + (x - fromX) * i / steps, py = fromY + (y - fromY) * i / steps
      ctx.moveTo(px + radius, py); ctx.arc(px, py, radius, 0, Math.PI * 2)
    }
    ctx.clip(); ctx.clearRect(0, 0, portrait.width, portrait.height); ctx.drawImage(original, 0, 0)
  } else {
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = radius * 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(x, y); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore(); schedule()
}
function down(e: PointerEvent) {
  if (!portrait || busy.value || !e.isPrimary || e.button !== 0) return
  const p = point(e); saveHistory()
  if (mode.value === 'background') {
    const ctx = portrait.getContext('2d')!, data = ctx.getImageData(0, 0, portrait.width, portrait.height)
    const x = Math.max(0, Math.min(portrait.width - 1, Math.floor(p.x))), y = Math.max(0, Math.min(portrait.height - 1, Math.floor(p.y)))
    data.data.set(removeConnectedBackground(data.data, portrait.width, portrait.height, y * portrait.width + x, tolerance.value))
    ctx.putImageData(data, 0, 0); draw()
  } else {
    editor.value!.setPointerCapture(e.pointerId); stroke = { id: e.pointerId, ...p }; paint(p.x, p.y, p.x, p.y)
  }
}
function move(e: PointerEvent) {
  if (!stroke || e.pointerId !== stroke.id) return
  const p = point(e); paint(p.x, p.y, stroke.x, stroke.y); stroke = { id: e.pointerId, ...p }
}
function end() { stroke = undefined }
function resetComposition() {
  settings.fusion = 'full'; settings.angle = 90; settings.sceneOpacity = .55; settings.blend = 'source-over'
  settings.portrait = { x: 0, y: 0, scale: 1 }; settings.scene = { x: 0, y: 0, scale: 1 }
  settings.center = .52; settings.softness = .4; settings.opacity = .8
  settings.tint = '#16769b'; settings.tintStrength = .55; settings.background = '#edf9fa'
}
async function download() {
  if (!portrait || !scene || busy.value) return
  activeUpload.value = undefined; busy.value = true; error.value = ''; notice.value = '正在生成高清图片…'
  const token = version, ext = format.value
  let output: HTMLCanvasElement | undefined
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    if (disposed || token !== version) return
    const { width, height } = outputSize.value
    output = makeCanvas(width, height); render(output, portrait, scene, settings)
    const blob = await new Promise<Blob>((resolve, reject) => output!.toBlob(value => value ? resolve(value) : reject(Error('图片编码失败')), ext === 'jpg' ? 'image/jpeg' : 'image/png', .95))
    if (disposed || token !== version) return
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = '双重曝光-' + output.width + 'x' + output.height + '.' + ext
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    notice.value = '已导出 ' + output.width + ' × ' + output.height + ' 图片。'
  } catch (e) { if (!disposed) error.value = e instanceof Error ? e.message : '导出失败' }
  finally { if (output) output.width = output.height = 1; if (!disposed) busy.value = false }
}
</script>

<template>
  <section class="exposure-tool">
    <header><h2>双重曝光</h2><p>将风景融入人像轮廓，制作属于你的叠影海报。图片仅在浏览器本地处理。</p></header>
    <div class="workspace">
      <div class="preview-panel">
        <div class="panel-title"><strong>合成预览</strong><span>{{ outputSize.width }} × {{ outputSize.height }}</span></div>
        <div class="stage">
          <canvas ref="preview" aria-label="双重曝光合成预览" />
          <div v-if="!names.portrait && !names.scene" class="empty">从一张侧脸开始<span>上传人像与风景，让两个瞬间融为一体</span></div>
        </div>
        <p v-if="names.scene && !names.portrait" class="hint" role="status">风景照片已载入，当前显示单图预览。请添加人像照片后合成。</p>
        <p class="hint">建议：侧脸／半身人像 + 带环境的全身照。先处理人像轮廓，再调整风景构图。</p>
      </div>
      <fieldset class="settings-panel" :disabled="busy">
        <legend>照片与合成设置</legend>
        <label class="upload">① 人像照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="load($event, 'portrait')" /><small>{{ names.portrait || '透明 PNG 最方便，也支持 JPG / WebP' }}</small><small v-if="fileInfo.portrait">{{ fileInfo.portrait }}</small><img v-if="thumbnails.portrait" :src="thumbnails.portrait" alt="已载入的人像照片缩略图" /></label>
        <div v-if="activeUpload === 'portrait'" class="upload-feedback"><p v-if="busy || notice" role="status">{{ busy ? '正在读取照片…' : notice }}</p><p v-if="error" class="error" role="alert">{{ error }}</p></div>
        <label class="upload">② 风景照片<input type="file" accept="image/jpeg,image/png,image/webp" @change="load($event, 'scene')" /><small>{{ names.scene || '可包含人物，作为轮廓内部的画面' }}</small><small v-if="fileInfo.scene">{{ fileInfo.scene }}</small><img v-if="thumbnails.scene" :src="thumbnails.scene" alt="已载入的风景照片缩略图" /></label>
        <div v-if="activeUpload === 'scene'" class="upload-feedback"><p v-if="busy || notice" role="status">{{ busy ? '正在读取照片…' : notice }}</p><p v-if="error" class="error" role="alert">{{ error }}</p></div>
        <p class="hint">每张 ≤ 10 MiB、6400 万像素；处理长边最多 3000 px。不保存历史。</p>
        <button :disabled="!names.portrait" @click="editing = !editing">{{ editing ? '收起轮廓编辑' : '编辑人像轮廓' }}</button>
        <label>画布比例<select v-model="ratio"><option>2:3</option><option>3:4</option><option>9:16</option><option>1:1</option><option>16:9</option></select></label>
        <details v-for="control in controls" :key="control.key" open>
          <summary>{{ control.title }}</summary>
          <label>缩放 {{ settings[control.key].scale.toFixed(2) }}×<input v-model.number="settings[control.key].scale" type="range" min=".25" max="3" step=".01" /></label>
          <label>水平位置<input v-model.number="settings[control.key].x" type="range" min="-1" max="1" step=".01" /></label>
          <label>垂直位置<input v-model.number="settings[control.key].y" type="range" min="-1" max="1" step=".01" /></label>
        </details>
        <label>融合方式<select v-model="settings.fusion"><option value="full">全幅叠加（整个轮廓融合）</option><option value="gradient">渐变融合（指定方向）</option></select></label>
        <p class="hint">{{ settings.fusion === 'full' ? '风景覆盖整个人像轮廓，通过风景强度控制两张照片的比例。' : '沿指定方向逐渐增加风景，方向指向风景更清晰的一侧。' }}</p>
        <template v-if="settings.fusion === 'gradient'">
          <label>渐变方向<select v-model.number="settings.angle"><option :value="90">向下（下方风景）</option><option :value="270">向上（上方风景）</option><option :value="0">向右（右侧风景）</option><option :value="180">向左（左侧风景）</option></select></label>
          <label>融合位置 {{ Math.round(settings.center * 100) }}%<input v-model.number="settings.center" type="range" min="0" max="1" step=".01" /></label>
          <label>融合柔和度<input v-model.number="settings.softness" type="range" min=".02" max="1" step=".01" /></label>
        </template>
        <label>风景强度 {{ Math.round(settings.sceneOpacity * 100) }}%<input v-model.number="settings.sceneOpacity" type="range" min="0" max="1" step=".01" /></label>
        <label>混合模式<select v-model="settings.blend"><option value="source-over">正常 · 按强度叠加</option><option value="screen">滤色 · 提亮叠影</option><option value="multiply">正片叠底 · 加深细节</option><option value="overlay">叠加 · 增强对比</option></select></label>
        <label>人像透明度<input v-model.number="settings.opacity" type="range" min="0" max="1" step=".01" /></label>
        <div class="colors"><label>背景<input v-model="settings.background" type="color" /></label><label>人像色调<input v-model="settings.tint" type="color" /></label></div>
        <label>染色强度<input v-model.number="settings.tintStrength" type="range" min="0" max="1" step=".01" /></label>
        <button @click="resetComposition">重置合成参数</button>
        <div class="export-controls"><label>导出长边<select v-model.number="longEdge"><option :value="1200">1200 px</option><option :value="2400">2400 px</option><option :value="3000">3000 px</option></select></label><label>格式<select v-model="format"><option value="png">PNG</option><option value="jpg">JPG</option></select></label></div>
        <button class="primary" :disabled="!ready" @click="download">导出图片</button>
      </fieldset>
    </div>
    <section v-if="editing && names.portrait" class="mask-panel">
      <h3>人像轮廓编辑</h3>
      <p class="hint">纯色背景：选择「去背景」后点击背景区域，可逐块清除。复杂背景请用擦除画笔；透明 PNG 可直接合成。这不是 AI 人像识别。</p>
      <fieldset :disabled="busy" class="mask-controls">
        <label>工具<select v-model="mode" @change="end"><option value="background">去背景（点击取色）</option><option value="erase">擦除画笔</option><option value="restore">恢复画笔</option></select></label>
        <label v-if="mode === 'background'">颜色容差 {{ tolerance }}<input v-model.number="tolerance" type="range" min="0" max="120" /></label>
        <label v-else>画笔大小 {{ brush }} px<input v-model.number="brush" type="range" min="5" max="160" /></label>
        <button :disabled="!historyCount" @click="undo">撤销</button><button @click="resetMask">恢复原始轮廓</button>
      </fieldset>
      <div class="mask-stage"><canvas ref="editor" aria-label="人像轮廓画布，点击背景去除或拖动画笔" @pointerdown="down" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" /></div>
    </section>
    <p v-if="!activeUpload && (busy || notice)" role="status">{{ busy ? '正在处理，请稍候…' : notice }}</p>
    <p v-if="!activeUpload && error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.exposure-tool { display: grid; gap: 20px; }
h2, h3, p { margin: 0; }
header p { margin-top: 8px; color: #64748b; }
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.preview-panel, .settings-panel, .mask-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; min-width: 0; }
.preview-panel { position: sticky; top: 20px; }
.panel-title { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.panel-title span, .hint, small { color: #64748b; font-size: 12px; line-height: 1.7; }
.stage { position: relative; display: grid; place-items: center; min-height: 300px; background: #f1f5f9; border-radius: 8px; overflow: hidden; padding: 16px; }
.stage canvas { display: block; max-width: 100%; max-height: 72vh; width: auto; height: auto; box-shadow: 0 8px 30px #0f172a15; }
.empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; color: #64748b; text-align: center; padding: 16px; }
.empty span { font-size: 12px; }
.hint { margin-top: 12px; }
.settings-panel { display: grid; gap: 15px; margin: 0; }
legend { font-size: 13px; color: #64748b; }
label { display: grid; gap: 7px; font-size: 13px; min-width: 0; }
.upload { padding: 12px; border: 1px dashed #cbd5e1; border-radius: 9px; }
small { overflow-wrap: anywhere; }
.upload img { width: auto; height: auto; max-width: 100%; max-height: 90px; object-fit: contain; justify-self: start; border-radius: 4px; }
.upload-feedback { font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
input[type=file] { width: 100%; min-width: 0; font-size: 12px; }
input[type=range] { width: 100%; accent-color: #7c3aed; }
select, button { border: 1px solid #dbe1ea; border-radius: 7px; padding: 8px 10px; background: #fff; color: #334155; font: inherit; font-size: 13px; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; }
.primary { background: #7c3aed; color: white; border-color: #7c3aed; }
details { border-top: 1px solid #eef2f6; padding-top: 10px; }
summary { cursor: pointer; font-size: 13px; margin-bottom: 12px; } details label + label { margin-top: 8px; }
.colors, .export-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.mask-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 14px; border: 0; padding: 14px 0; margin: 0; }
.mask-controls label { min-width: 150px; }
.mask-stage { text-align: center; background: #f1f5f9; padding: 12px; border-radius: 8px; }
.mask-stage canvas { max-width: 100%; max-height: 70vh; width: auto; height: auto; touch-action: none; cursor: crosshair; background: repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 0 / 20px 20px; }
.error { color: #dc2626; }
@media (max-width: 850px) { .workspace { grid-template-columns: 1fr; } .preview-panel { position: static; } .stage canvas { max-height: 60vh; } }
</style>
