<script setup lang="ts">
import FolderBatch from '../../platform/FolderBatch.vue'
import { frameProcessor } from './batch'
const batchMode = ref(false), batchRunning = ref(false), batchAutomaticLogo = ref(true), batchOverrideMetadata = ref(false)
const windowDesktop = !!window.desktopBatch
async function prepareBatch() {
  const settings = { style: { ...style }, visible: { ...visible }, edge: edge.value, format: format.value, shooting: batchOverrideMetadata.value ? { ...shooting } : undefined, automaticLogo: batchAutomaticLogo.value, nikonVariant: nikonVariant.value }
  const fixed = !settings.automaticLogo && logo.value ? { ...logo.value, image: await createImageBitmap(logo.value.image as ImageBitmapSource) } : undefined
  return { process: frameProcessor({ ...settings, fixedLogo: fixed }), dispose: () => fixed?.image.close() }
}
import { useFiles } from "../../platform/use-files"
const { save, saveUrl, saving, cancelSave } = useFiles((text, failed) => { if (failed) error.value = text; else { error.value = ''; notice.value = text } })
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { ImagePlus, Download, RotateCcw, Camera, ShieldCheck } from '@lucide/vue'
import { MAX_PHOTO_BYTES, RAW_EXTENSIONS } from '../images/photo-formats'
import { brandFor, defaults, emptyShooting, fields, layout, visibility, type Shooting, type Template } from './core'
import { render, type Logo } from './render'
import { phoneBrands } from './devices'
const templates = [{ id: 'white', name: '白底参数栏', hint: '经典 · 简洁' }, { id: 'portrait', name: '竖版虚化海报', hint: '9:16 · 分享' }, { id: 'landscape', name: '横版虚化卡片', hint: '3:2 · 作品' }] as const
const brands = [{ id: 'nikon', name: '尼康 Nikon' }, { id: 'canon', name: '佳能 Canon' }, { id: 'sony', name: '索尼 Sony' }, { id: 'fujifilm', name: '富士 Fujifilm' }, { id: 'leica', name: '徕卡 Leica' }, ...phoneBrands]
const controls = [
  { key: 'padding', name: '留白', min: 0, max: 20 }, { key: 'photoSize', name: '照片大小', min: 40, max: 100 },
  { key: 'radius', name: '圆角', min: 0, max: 12 }, { key: 'shadow', name: '阴影', min: 0, max: 100 },
  { key: 'blur', name: '背景虚化', min: 0, max: 100 }, { key: 'logoSize', name: 'LOGO 大小', min: 50, max: 180 },
] as const
const style = reactive(defaults('white')), shooting = reactive(emptyShooting()), visible = reactive(visibility())
visible.model = false
const source = shallowRef<ImageBitmap>(), name = ref(''), notes = ref<string[]>([])
const brand = ref(''), nikonVariant = ref('auto'), custom = shallowRef<Logo>(), logo = shallowRef<Logo>()
const logoBusy = ref(false), logoError = ref(''), busy = ref(false), phase = ref(''), error = ref(''), notice = ref(''), previewError = ref('')
const canvas = ref<HTMLCanvasElement>(), picker = ref<HTMLInputElement>(), logoPicker = ref<HTMLInputElement>()
const edge = ref<number | 'original'>(4096), format = ref('image/jpeg')
const accept = '.jpg,.jpeg,.png,.webp,.heic,.heif,' + RAW_EXTENSIONS.map(x => '.' + x).join(',')
const geometry = computed(() => {
  if (!source.value) return { value: undefined, error: '' }
  try { return { value: layout(source.value.width, source.value.height, style, edge.value), error: '' } }
  catch (e) { return { value: undefined, error: message(e) } }
})
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, revision = 0, logoRevision = 0, customRevision = 0, frame = 0, disposed = false
const urls = new Set<string>()
const message = (e: unknown) => e instanceof Error ? e.message : '处理失败，请重试'
function stop() { worker?.terminate(); worker = undefined; clearTimeout(timer); timer = undefined }
function cancel() { cancelSave(); revision++; stop(); busy.value = false; phase.value = ''; notice.value = '已取消。' }
function clearPhoto() { cancel(); source.value?.close(); source.value = undefined; name.value = ''; notes.value = []; Object.assign(shooting, emptyShooting()); error.value = ''; notice.value = '' }
function selectTemplate(template: Template) {
  Object.assign(style, defaults(template))
  Object.assign(visible, visibility(), { model: template !== 'white', focal: template !== 'portrait', aperture: template !== 'portrait', shutter: template !== 'portrait', iso: template !== 'portrait', time: template !== 'landscape' })
}
function startWorker(task: Worker, version: number) {
  worker = task
  const fail = (text: string) => { if (version !== revision || disposed) return; error.value = text; busy.value = false; phase.value = ''; stop() }
  task.onerror = () => fail('处理线程异常，请重试或降低图片尺寸')
  task.onmessageerror = () => fail('无法读取处理结果，请重试')
  timer = setTimeout(() => fail('处理超时，请更换图片或降低尺寸后重试'), 120000)
  return task
}
async function load(file: File) {
  if (batchRunning.value) return
  cancel(); error.value = ''; notice.value = ''; previewError.value = ''
  const version = revision
  busy.value = true; phase.value = '正在读取照片与拍摄信息…'
  source.value?.close(); source.value = undefined; name.value = ''; notes.value = []; Object.assign(shooting, emptyShooting())
  try {
    if (!file.size || file.size > MAX_PHOTO_BYTES) throw Error('请选择非空且不超过 100 MiB 的照片')
    if (!/\.(jpe?g|png|webp|heic|heif|nef|nrw|cr2|cr3|arw|dng|raf|orf|rw2|pef|srw)$/i.test(file.name)) throw Error('请选择 JPG、PNG、WebP、HEIC 或支持的 RAW 文件')
    const buffer = await file.arrayBuffer()
    if (version !== revision || disposed) return
    const task = startWorker(new Worker(new URL('./photo.worker.ts', import.meta.url), { type: 'module' }), version)
    task.onmessage = async ({ data }: MessageEvent<{ bitmap?: ImageBitmap; shooting: Shooting; notes: string[]; error?: string }>) => {
      if (version !== revision || disposed) { data.bitmap?.close(); return }
      stop(); busy.value = false; phase.value = ''
      if (data.error || !data.bitmap) { error.value = data.error || '未收到照片'; return }
      source.value = data.bitmap; name.value = file.name; Object.assign(shooting, data.shooting); notes.value = data.notes
      brand.value = brandFor(data.shooting.make, data.shooting.model)
      notice.value = Object.values(data.shooting).some(Boolean) ? '已读取拍摄信息，可修改或隐藏。' : '未发现拍摄信息，可手动填写。'
      await nextTick(); draw()
    }
    task.postMessage({ buffer, name: file.name }, [buffer])
  } catch (e) { if (version === revision) { stop(); busy.value = false; phase.value = ''; error.value = message(e) } }
}
function choose(event: Event) { const el = event.target as HTMLInputElement; if (el.files?.[0]) void load(el.files[0]); el.value = '' }
function drop(event: DragEvent) { if (event.dataTransfer?.files[0]) void load(event.dataTransfer.files[0]) }
function paste(event: ClipboardEvent) {
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return
  const file = event.clipboardData?.files[0]
  if (file) { event.preventDefault(); void load(file) }
}
async function loadLogo() {
  const version = ++logoRevision
  logoError.value = ''; logo.value = undefined; logoBusy.value = true
  try {
    if (brand.value === 'custom') { logo.value = custom.value; return }
    if (!brand.value) return
    const color = brand.value !== 'nikon' || nikonVariant.value !== 'word'
    const image = new Image()
    image.src = '/photo-frame/logos/' + brand.value + (color ? '-color' : '') + '.svg'
    await image.decode()
    if (version !== logoRevision || disposed) return
    logo.value = { image, width: image.naturalWidth, height: image.naturalHeight, tint: !color }
  } catch { if (version === logoRevision) logoError.value = 'LOGO 加载失败，请重试或选择其他 LOGO' }
  finally { if (version === logoRevision) { logoBusy.value = false; draw() } }
}
async function uploadLogo(event: Event) {
  const el = event.target as HTMLInputElement, file = el.files?.[0]; el.value = ''
  if (!file) return
  const version = ++customRevision; logoError.value = ''
  let image: ImageBitmap | undefined
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) throw Error('LOGO 需要为不超过 10 MiB 的 PNG、WebP 或 JPG')
    image = await createImageBitmap(file)
    if (image.width * image.height > 16000000) throw Error('LOGO 最多 1600 万像素')
    if (version !== customRevision || disposed) { image.close(); return }
    if (custom.value) (custom.value.image as ImageBitmap).close()
    custom.value = { image, width: image.width, height: image.height, tint: false }
    brand.value = 'custom'; await loadLogo()
  } catch (e) { image?.close(); if (version === customRevision && !disposed) logoError.value = message(e) }
}
function draw() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0; previewError.value = ''
    if (!canvas.value || !source.value) return
    try {
      const g = geometry.value.value
      if (!g) { canvas.value.width = canvas.value.height = 1; return }
      const scale = Math.min(1, 1400 / Math.max(g.width, g.height))
      canvas.value.width = Math.max(1, Math.round(g.width * scale)); canvas.value.height = Math.max(1, Math.round(g.height * scale))
      const ctx = canvas.value.getContext('2d')!
      const rect = (r: typeof g.photo) => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale })
      render(ctx, source.value, source.value, { width: g.width * scale, height: g.height * scale, photo: rect(g.photo), footer: rect(g.footer) }, style, shooting, visible, logo.value)
    } catch (e) { previewError.value = message(e) }
  })
}
async function download() {
  const g = geometry.value.value
  if (!source.value || !g || busy.value || logoBusy.value || logoError.value || previewError.value) return
  const version = ++revision
  busy.value = true; phase.value = '正在生成高清图片…'; error.value = ''; notice.value = ''
  let photo: ImageBitmap | undefined, logoBitmap: ImageBitmap | undefined
  try {
    const settings = { ...style }, data = { ...shooting }, show = { ...visible }, output = format.value
    const selectedLogo = logo.value
    photo = await createImageBitmap(source.value)
    if (selectedLogo) logoBitmap = await createImageBitmap(selectedLogo.image as ImageBitmapSource)
    if (version !== revision || disposed) { photo.close(); logoBitmap?.close(); return }
    const task = startWorker(new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }), version)
    task.onmessage = async ({ data }) => {
      if (version !== revision || disposed) return
      stop()
      if (data.error) { busy.value = false; phase.value = ''; error.value = data.error; return }
      const blob: Blob = data.blob
      phase.value = '正在保存图片…'
      try { await save(blob, name.value.replace(/\.[^.]+$/, '') + '-水印边框.' + (blob.type === 'image/jpeg' ? 'jpg' : 'png'), () => !disposed && version === revision) }
      finally { if (!disposed && version === revision) { busy.value = false; phase.value = '' } }

    }
    const exportedLogo = selectedLogo && logoBitmap ? { ...selectedLogo, image: logoBitmap } : undefined
    task.postMessage({ photo, logo: exportedLogo, geometry: g, style: settings, shooting: data, visible: show, format: output }, logoBitmap ? [photo, logoBitmap] : [photo])
    photo = undefined; logoBitmap = undefined
  } catch (e) { photo?.close(); logoBitmap?.close(); if (version === revision) { stop(); busy.value = false; phase.value = ''; error.value = message(e) } }
}
watch([brand, nikonVariant, () => style.template], loadLogo)
watch([style, shooting, visible, edge, logo], () => { draw() }, { deep: true, flush: 'post' })
onMounted(() => window.addEventListener('paste', paste))
onBeforeUnmount(() => { disposed = true; revision++; logoRevision++; customRevision++; stop(); cancelAnimationFrame(frame); source.value?.close(); (custom.value?.image as ImageBitmap | undefined)?.close(); urls.forEach(url => URL.revokeObjectURL(url)); window.removeEventListener('paste', paste) })
</script>

<template>
  <div class="tool-page frame-tool">
    <FolderBatch title="照片水印边框" :extensions="accept.split(',').map(value => value.slice(1))" :max-bytes="MAX_PHOTO_BYTES" :prepare="prepareBatch" :disabled="busy || saving || logoBusy || !!logoError" hint="沿用下方模板与导出设置，默认每张照片分别读取拍摄参数和品牌；空白参数自动隐藏。" @mode="batchMode = $event" @running="batchRunning = $event" @preview="load" />
    <div :inert="batchRunning || undefined">
    <div v-if="windowDesktop && batchMode" class="help"><label><input v-model="batchAutomaticLogo" type="checkbox" />批量逐张识别品牌 LOGO（关闭则统一使用当前 LOGO）</label><br /><label><input v-model="batchOverrideMetadata" type="checkbox" />批量统一覆盖拍摄信息：使用下方全部字段（默认关闭）</label></div>
    <div v-if="!windowDesktop" class="tool-heading"><div><h1>照片水印边框</h1><p>为照片添上品牌标识与拍摄故事，生成属于你的摄影作品。</p></div><span class="local-badge"><ShieldCheck :size="15" />本地处理 · 不上传</span></div>
    <div class="frame-workspace">
      <section class="frame-controls">
        <div class="section-head"><h2>1. 添加照片</h2><button class="text-action" :disabled="busy || !source" @click="clearPhoto">清空</button></div>
        <input ref="picker" hidden type="file" :accept="accept" aria-label="选择照片" @change="choose" />
        <button class="upload-zone" :disabled="busy" @click="picker?.click()" @dragover.prevent @drop.prevent="drop"><ImagePlus :size="27" /><strong>{{ source ? '更换照片' : '选择或拖入一张照片' }}</strong><span>JPG / PNG / WebP / HEIC / RAW</span></button>
        <p class="help">支持粘贴 · 单张最多 100 MiB / 6400 万像素</p>
        <p v-if="name" class="filename">{{ name }} · {{ source?.width }} × {{ source?.height }}</p>
        <fieldset :disabled="busy">
          <legend>2. 选择模板</legend>
          <div class="template-list"><button v-for="item in templates" :key="item.id" class="template-button" :class="{ selected: style.template === item.id }" :aria-pressed="style.template === item.id" @click="selectTemplate(item.id)"><span class="template-thumb" :class="item.id"><i></i><b></b></span><strong>{{ item.name }}</strong><small>{{ item.hint }}</small></button></div>
          <div class="section-head"><h2>3. LOGO 与拍摄信息</h2></div>
          <label class="setting">品牌 LOGO<select v-model="brand" aria-label="品牌 LOGO"><option value="">不显示</option><option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option><option v-if="custom" value="custom">自定义 LOGO</option></select></label>
          <label v-if="brand === 'nikon'" class="setting">尼康样式<select v-model="nikonVariant"><option value="auto">彩色方标（默认）</option><option value="word">单色字标</option></select></label>
          <input ref="logoPicker" hidden type="file" accept="image/png,image/webp,image/jpeg" aria-label="选择自定义 LOGO" @change="uploadLogo" />
          <button class="button secondary full" @click="logoPicker?.click()">上传自定义 LOGO</button>
          <p class="help">内置 LOGO 保留品牌原色；尼康可切换单色字标。自定义推荐透明 PNG / WebP。</p>
          <p v-if="logoError" role="alert" class="error">{{ logoError }}</p>
          <p class="help">自动读取手机 / 相机型号；已收录的手机内部代码会转换为常用名称，未知型号保留原值。未读取时可手动填写。</p>
          <div class="metadata-fields"><div v-for="[key, label] in fields" :key="key" class="metadata-row"><label><input v-model="visible[key]" type="checkbox" :aria-label="'显示' + label" />{{ label }}</label><input v-model="shooting[key]" type="text" maxlength="160" :aria-label="label" :placeholder="key === 'time' ? 'YYYY-MM-DD HH:mm:ss' : '未读取，可手动填写'" /></div></div>
          <p class="help">勾选控制显示；空白字段自动隐藏，不会生成虚构参数。</p>
          <div class="section-head"><h2>4. 样式调节</h2><button class="text-action" @click="selectTemplate(style.template)"><RotateCcw :size="13" />恢复默认</button></div>
          <label v-for="control in controls.filter(c => c.key !== 'blur' || style.template !== 'white')" :key="control.key" class="slider-row"><span>{{ control.name }}</span><input v-model.number="style[control.key]" type="range" :min="control.min" :max="control.max" :aria-label="control.name" /><output>{{ style[control.key] }}</output></label>
          <label class="setting">文字颜色<input v-model="style.color" type="color" aria-label="文字颜色" /></label>
        </fieldset>
      </section>
      <section class="frame-preview">
        <div class="preview-heading"><h2>效果预览</h2><span v-if="geometry.value">{{ geometry.value.width }} × {{ geometry.value.height }} px</span></div>
        <div class="preview-stage" @dragover.prevent @drop.prevent="drop">
          <canvas v-show="source && geometry.value && !previewError" ref="canvas" aria-label="照片水印边框效果预览"></canvas>
          <div v-if="!source" class="preview-empty"><Camera :size="48" /><h3>{{ busy ? '正在准备照片' : '每张照片，都值得被呈现' }}</h3><p>{{ busy ? phase : '添加照片，选择模板，即可预览效果' }}</p><div class="empty-pills"><span>品牌 LOGO</span><span>自动读取参数</span><span>高清导出</span></div></div>
        </div>
        <div class="export-panel">
          <div class="export-settings"><label>导出尺寸<select v-model="edge" :disabled="busy" aria-label="导出尺寸"><option :value="2048">长边 2048 px</option><option :value="4096">长边 4096 px（默认）</option><option value="original">原尺寸级输出</option></select></label><label>图片格式<select v-model="format" :disabled="busy" aria-label="图片格式"><option value="image/jpeg">JPG · 质量 95%</option><option value="image/png">PNG</option></select></label></div>
          <button class="button primary full export-button" :disabled="saving || !source || !geometry.value || busy || logoBusy || !!logoError || !!previewError" @click="download"><Download :size="17" />导出照片</button>
          <div v-if="busy" class="processing" role="status"><span>{{ phase }}</span><button class="text-action" @click="cancel">取消处理</button></div>
          <p v-if="error || geometry.error || previewError" class="error" role="alert">{{ error || geometry.error || previewError }}</p>
          <p v-if="notice" class="notice" role="status">{{ notice }}</p>
          <p v-for="note in notes" :key="note" class="help">{{ note }}</p>
          <p class="help">不放大主体原图；输出最多 3200 万像素。合成图片不保留原始 EXIF、RAW 数据或 HDR。</p>
          <details class="format-help"><summary>RAW 与 HEIC 兼容说明</summary><p>RAW 支持 NEF、NRW、CR2、CR3、ARW、DNG、RAF、ORF、RW2、PEF、SRW，具体相机型号与压缩方式取决于解码器。尼康高效率 HE／HE★ 使用内嵌相机 JPEG，并显示实际分辨率；无损 NEF 正常解码。RAW 需要站点开启跨源隔离；HEIC 仅支持单张静态图片。</p></details>
        </div>
      </section>
    </div>
  </div>
    </div>
</template>

<style scoped>
.frame-tool{max-width:1440px;margin:auto}.tool-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.local-badge{display:flex;gap:6px;align-items:center;color:#6b7280;font-size:12px;white-space:nowrap}.frame-workspace{display:grid;grid-template-columns:360px minmax(0,1fr);gap:20px;align-items:start}.frame-controls,.frame-preview{background:#fff;border:1px solid #e7e7ef;border-radius:14px;min-width:0}.frame-controls{padding:22px}.frame-preview{position:sticky;top:20px;overflow:hidden}.section-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 14px}.section-head h2,.preview-heading h2{font-size:15px;margin:0}.text-action{border:0;background:none;color:#7760c0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:12px}.text-action:disabled{opacity:.4;cursor:default}.upload-zone{width:100%;border:1px dashed #c9bde7;background:#faf8ff;border-radius:10px;padding:22px 8px;display:flex;flex-direction:column;align-items:center;gap:9px;color:#7961b6;cursor:pointer}.upload-zone span{font-size:11px;color:#898291}.upload-zone strong{font-size:14px}.help{font-size:12px;line-height:1.7;color:#898692;margin:10px 0}.filename{font-size:12px;overflow-wrap:anywhere;color:#625c70}fieldset{border:0;padding:0;margin:24px 0 0;min-width:0}legend{font-size:15px;font-weight:600;margin-bottom:14px}.template-list{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:26px}.template-button{border:1px solid #e7e4ed;border-radius:9px;background:#fff;cursor:pointer;padding:8px 5px;color:#5d5868;min-width:0}.template-button.selected{border-color:#9571dc;background:#f7f2ff;box-shadow:0 0 0 1px #9571dc}.template-button strong{display:block;font-size:11px;margin:8px 0 4px;white-space:nowrap}.template-button small{font-size:10px;color:#a09aa8}.template-thumb{height:58px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#859b9b,#dae1d0 50%,#807d9b);border-radius:4px;position:relative;overflow:hidden}.template-thumb i{background:linear-gradient(150deg,#a8c4d1,#778d72 50%,#344e46);width:82%;height:65%;border-radius:3px;box-shadow:0 3px 6px #0003}.template-thumb b{position:absolute;width:18px;height:2px;background:white;bottom:6px}.template-thumb.white i{width:100%;height:80%;position:absolute;top:0;border-radius:0}.template-thumb.white{background:#fff}.template-thumb.white b{background:#a69a78;right:7px;bottom:5px}.template-thumb.portrait{width:40px;margin:auto}.template-thumb.portrait i{height:37%}.template-thumb.portrait b{bottom:12px}.setting{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;margin:13px 0}select,input[type=text]{border:1px solid #e2dfe8;border-radius:6px;background:white;color:#484253;padding:8px;min-width:0;font:inherit}select{max-width:210px}.full{width:100%;justify-content:center}.metadata-fields{margin-top:16px;display:grid;gap:8px}.metadata-row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px;align-items:center;font-size:12px}.metadata-row label{display:flex;align-items:center;gap:5px}.metadata-row input[type=text]{width:100%;box-sizing:border-box}.metadata-row input[type=checkbox],input[type=range]{accent-color:#8d68d3}.metadata-fields+.help{margin-bottom:25px}.slider-row{display:grid;grid-template-columns:76px minmax(0,1fr) 30px;gap:10px;align-items:center;margin:14px 0;font-size:12px}.slider-row input{width:100%;margin:0}.slider-row output{text-align:right;color:#8f859e;font-variant-numeric:tabular-nums}.setting input[type=color]{width:42px;height:28px;padding:2px;border:1px solid #e1dce9;border-radius:5px}.preview-heading{display:flex;justify-content:space-between;align-items:center;padding:19px 22px}.preview-heading span{font-size:12px;color:#92899d}.preview-stage{min-height:440px;padding:28px;background:#f2f1f5;display:flex;justify-content:center;align-items:center}.preview-stage canvas{display:block;max-width:100%;max-height:640px;width:auto;height:auto;object-fit:contain;box-shadow:0 8px 32px #29223815}.preview-empty{text-align:center;color:#b1a9bf}.preview-empty h3{font-size:18px;color:#81758e;font-weight:500;margin:18px 0 12px}.preview-empty p{font-size:13px}.empty-pills{display:flex;justify-content:center;gap:8px;margin-top:28px}.empty-pills span{font-size:11px;padding:6px 10px;background:#e9e6ef;border-radius:20px;color:#9b90aa}.export-panel{padding:20px 22px}.export-settings{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.export-settings label{display:flex;flex-direction:column;gap:8px;font-size:12px;color:#776d83}.export-settings select{max-width:100%;width:100%}.export-button{padding:12px}.processing{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-top:14px}.error{color:#c03750;font-size:12px;line-height:1.7;overflow-wrap:anywhere}.notice{color:#56815d;font-size:12px}.format-help{font-size:12px;color:#898692;line-height:1.7}.format-help summary{cursor:pointer}.frame-tool button:focus-visible,.frame-tool input:focus-visible,.frame-tool select:focus-visible{outline:2px solid #9973dc;outline-offset:2px}.frame-tool button:disabled{cursor:default;opacity:.5}
@media(max-width:1100px){.frame-workspace{grid-template-columns:320px minmax(0,1fr)}.frame-controls{padding:16px}.preview-stage{padding:16px;min-height:360px}.local-badge{display:none}}
@media(max-width:760px){.frame-workspace{grid-template-columns:minmax(0,1fr)}.frame-preview{position:static}.preview-stage{min-height:260px;padding:14px}.preview-stage canvas{max-height:520px}.export-panel{padding:16px}.preview-heading{padding:16px}.frame-controls{padding:18px}.template-thumb{height:70px}.template-thumb.portrait{width:44px}.tool-heading p{line-height:1.7}.empty-pills{gap:4px}.empty-pills span{padding:5px 7px}}
</style>
