<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { Folder, ChevronDown, ChevronRight, Play, LoaderCircle } from '@lucide/vue'
import { useFiles } from './use-files'
import { checkAbort, type BatchEntry, type BatchInput, type BatchOutput, type BatchFactory, type BatchSaveResult } from './batch'
const props = defineProps<{ title: string; extensions: string[]; maxBytes: number; prepare: BatchFactory; disabled?: boolean; hint: string }>()
const emit = defineEmits<{ running: [value: boolean]; preview: [file: File]; mode: [batch: boolean] }>()
const bridge = window.desktopBatch
const listOpen = ref(false)
const folderName = (path?: string) => path?.split(/[\\\\/]/).filter(Boolean).pop() || path || ''
function setMode(batch: boolean) { if (running.value || working.value) return; opened.value = batch; emit('mode', batch) }
const opened = ref(false), recursive = ref(false), working = ref(false), running = ref(false)
const input = shallowRef<BatchInput>(), output = shallowRef<BatchOutput>()
type Row = BatchEntry & { state: string; message: string; output?: string }
const rows = ref<Row[]>([]), conflict = ref<'rename' | 'skip'>('rename'), error = ref(''), status = ref(''), page = ref(0)
let controller: AbortController | undefined, session: Awaited<ReturnType<BatchFactory>> | undefined, disposed = false
let savedConflict: 'rename' | 'skip' = 'rename'
const visible = computed(() => rows.value.slice(page.value * 50, (page.value + 1) * 50))
const eligible = computed(() => rows.value.filter(row => !row.reason))
const failures = computed(() => rows.value.filter(row => row.state === '失败'))
const done = computed(() => rows.value.filter(row => ['成功', '失败', '跳过'].includes(row.state)).length)
const summary = computed(() => ['成功', '失败', '跳过'].map(state => state + ' ' + rows.value.filter(row => row.state === state).length).join(' · '))
const message = (e: unknown) => e instanceof Error ? e.message : String(e)
const { save: saveReport } = useFiles((text, failed) => { if (failed) error.value = text })
async function changeRecursive() {
  if (!input.value) return
  releaseProcessor(); input.value = undefined; output.value = undefined; rows.value = []; page.value = 0
  status.value = ''; error.value = '子文件夹选项已更改，请重新选择输入文件夹。'
  working.value = true
  try { await bridge?.release() } catch (e) { error.value = message(e) } finally { working.value = false }
}
function releaseProcessor() { session?.dispose?.(); session = undefined }
function busy(value: boolean) { running.value = value; emit('running', value) }
async function selectInput() {
  if (!bridge || working.value || running.value) return
  working.value = true; error.value = ''
  try {
    const selected = await bridge.input(recursive.value)
    if (!selected || disposed) return
    releaseProcessor(); input.value = selected; output.value = undefined; page.value = 0; status.value = ''
    rows.value = selected.entries.map(entry => {
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      const reason = entry.reason || (!props.extensions.includes(ext) ? '此工具不支持该格式' : !entry.size || entry.size > props.maxBytes ? '文件为空或超过本工具容量限制' : '')
      return { ...entry, reason, state: reason ? '跳过' : '待处理', message: reason }
    })
  } catch (e) { error.value = message(e) } finally { working.value = false }
}
async function selectOutput() {
  if (!bridge || !input.value) return
  working.value = true; error.value = ''
  try {
    const selected = await bridge.output(input.value.id)
    if (!selected || disposed) return
    output.value = selected
    // Directory exclusion is evaluated on every output selection, without losing format restrictions.
    for (const row of rows.value) {
      if (row.reason === '位于输出目录，已排除') { row.reason = ''; row.state = '待处理'; row.message = '' }
      if (!row.reason && selected.excluded.includes(row.id)) { row.reason = '位于输出目录，已排除'; row.state = '跳过'; row.message = row.reason }
    }
    releaseProcessor()
  } catch (e) { error.value = message(e) } finally { working.value = false }
}
async function preview(row: Row) {
  if (!bridge || !input.value || working.value || running.value) return
  working.value = true; error.value = ''
  try {
    const bytes = await bridge.read(input.value.id, row.id)
    if (!disposed) emit('preview', new File([new Uint8Array(bytes)], row.name))
  } catch (e) { error.value = message(e) } finally { working.value = false }
}
function verify(result: BatchSaveResult) {
  if (result.status === 'failed') throw Error(result.message || '保存失败，请检查输出目录权限和剩余空间')
  if (result.status === 'cancelled') throw new DOMException('保存已取消', 'AbortError')
  return result
}
async function start(retry = false) {
  if (!bridge || !input.value || !output.value || running.value || working.value) return
  const selected = retry ? failures.value : eligible.value
  if (!selected.length) return
  error.value = ''; status.value = ''; busy(true)
  const task = new AbortController(); controller = task
  try {
    if (!retry) { releaseProcessor(); session = await props.prepare(); savedConflict = conflict.value }
    checkAbort(task.signal)
    if (!session) throw Error('请重新开始批量处理')
    for (const row of selected) { row.state = '待处理'; row.message = ''; row.output = undefined }
    for (const row of selected) {
      if (task.signal.aborted) break
      row.state = '处理中'
      let saving = false
      try {
        const bytes = await bridge.read(input.value.id, row.id)
        checkAbort(task.signal)
        const result = await session.process(new File([new Uint8Array(bytes)], row.name), task.signal)
        checkAbort(task.signal)
        saving = true
        const begin = verify(await bridge.begin(input.value.id, output.value.id, row.id, result.name, result.blob.size, savedConflict))
        if (begin.status !== 'ready' || !begin.id) throw Error('无法开始保存')
        let sequence = 0
        for (let offset = 0; offset < result.blob.size; offset += 4 * 1024 * 1024) {
          checkAbort(task.signal)
          const bytes = new Uint8Array(await result.blob.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer())
          checkAbort(task.signal)
          verify(await bridge.append(begin.id, sequence++, bytes))
        }
        checkAbort(task.signal)
        const saved = verify(await bridge.finish(begin.id))
        row.state = saved.status === 'skipped' ? '跳过' : '成功'
        row.output = saved.path; row.message = saved.status === 'skipped' ? '已存在同名结果' : (result.notes ?? []).join('；')
      } catch (e) {
        await bridge.cancel().catch(() => {})
        if (task.signal.aborted) { row.state = '待处理'; row.message = '已取消'; break }
        row.state = '失败'; row.message = message(e)
        if (saving) throw Error('输出失败，批量任务已停止：' + row.message)
      }
    }
    status.value = task.signal.aborted ? '已取消，已保存的结果保留。' : '本轮处理结束。'
  } catch (e) { if (!task.signal.aborted) error.value = message(e) }
  finally { if (task.signal.aborted) await bridge.cancel().catch(() => {}); controller = undefined; if (disposed) releaseProcessor(); busy(false) }
}
async function cancel() {
  controller?.abort()
  await bridge?.cancel().catch(e => { error.value = message(e) })
}
async function openOutput() { try { if (output.value) await bridge?.open(output.value.id) } catch (e) { error.value = message(e) } }
async function report() {
  working.value = true
  try {
    const result = await saveReport(new Blob([JSON.stringify({ input: input.value?.path, output: output.value?.path, files: rows.value.map(({ relative, state, message, output }) => ({ file: relative, state, message, output })) }, null, 2)], { type: 'application/json' }), '批量处理报告.json', () => !disposed)
    if (result.status === 'failed') error.value = result.message
  } catch (e) { error.value = message(e) } finally { working.value = false }
}
onBeforeUnmount(() => { disposed = true; controller?.abort(); releaseProcessor(); void bridge?.release().catch(() => {}) })
</script>
<template>
  <section v-if="bridge" class="folder-batch" aria-label="图片处理方式">
    <header class="batch-heading">
      <h1>{{ title }}</h1>
      <div class="mode-switch" role="group" aria-label="处理模式">
        <button :class="{ selected: !opened }" :aria-pressed="!opened" :disabled="running || working" @click="setMode(false)">单图</button>
        <button aria-label="文件夹批量处理" :class="{ selected: opened }" :aria-pressed="opened" :disabled="running || working" @click="setMode(true)">文件夹批量</button>
      </div>
    </header>
    <div v-if="opened" class="batch-body">
      <div class="path-row">
        <span class="row-label">输入</span><Folder :size="22" :stroke-width="1.7" class="folder-icon" />
        <div class="folder-location" :title="input?.path">
          <strong>{{ input ? folderName(input.path) : '选择图片所在文件夹' }}</strong>
          <span v-if="input" class="folder-path">{{ input.path }}</span>
          <span v-else class="folder-path">批量导入文件夹中的图片</span>
        </div>
        <button class="path-button" aria-label="选择输入文件夹" :disabled="running || working || disabled" @click="selectInput"><LoaderCircle v-if="working" :size="16" class="spinning" />{{ input ? '更换' : '选择文件夹' }}</button>
        <label class="row-option"><input v-model="recursive" type="checkbox" @change="changeRecursive" :disabled="running || working" />包含子文件夹</label>
      </div>
      <div class="path-row">
        <span class="row-label">输出</span><Folder :size="22" :stroke-width="1.7" class="folder-icon" />
        <div class="folder-location" :title="output?.path">
          <strong>{{ output ? folderName(output.path) : '选择结果保存位置' }}</strong>
          <span v-if="output" class="folder-path">{{ output.path }}</span>
          <span v-else class="folder-path">处理后的图片将保存到这里</span>
        </div>
        <button class="path-button" aria-label="选择输出文件夹" :disabled="!input || running || working || disabled" @click="selectOutput">{{ output ? '更换' : '选择文件夹' }}</button>
        <label class="row-option conflict-option">同名：<select v-model="conflict" aria-label="同名结果" :disabled="running || working"><option value="rename">自动加序号</option><option value="skip">跳过已有文件</option></select></label>
      </div>
      <div class="batch-toolbar">
        <div class="batch-summary"><span><strong>{{ eligible.length }}</strong> 张图片<span class="separator">·</span>原图不变</span>
          <button class="text-action" :disabled="!rows.length" :aria-expanded="listOpen" @click="listOpen = !listOpen">{{ listOpen ? '收起清单' : '查看清单' }}<ChevronDown v-if="listOpen" :size="16" /><ChevronRight v-else :size="16" /></button>
        </div>
        <button v-if="running" class="start-button cancel-button" @click="cancel">取消批量处理</button>
        <button v-else class="start-button" :disabled="!output || !eligible.length || working || disabled" @click="start()"><Play :size="16" fill="currentColor" />开始批量处理</button>
      </div>
      <div v-if="running || status" class="batch-progress" role="status"><span>{{ running ? '正在处理 · ' : '' }}{{ summary }} {{ status }}</span><progress :value="done" :max="rows.length || 1" aria-label="批量处理进度" /></div>
      <p v-if="error" role="alert" class="batch-error">{{ error }}</p>
      <div v-if="listOpen" class="batch-details">
        <div class="details-heading"><h2>文件清单 <span>{{ rows.length }} 项</span></h2><div class="secondary-actions">
          <button v-if="session && failures.length" class="text-action" :disabled="running || working || disabled" @click="start(true)">仅重试失败项</button>
          <button class="text-action" :disabled="!output || running || working" @click="openOutput">打开输出文件夹</button>
          <button class="text-action" :disabled="!rows.length || running || working" @click="report">导出处理报告</button>
        </div></div>
        <p class="batch-hint">{{ hint }} 包含子文件夹选项更改后，请重新选择输入文件夹。失败重试沿用上次设置。</p>
        <div class="batch-list"><table><thead><tr><th>文件</th><th>状态 / 说明</th><th>样图</th></tr></thead><tbody>
          <tr v-for="row in visible" :key="row.id"><td>{{ row.relative }}<small v-if="row.output">→ {{ row.output }}</small></td><td><span :class="{ failed: row.state === '失败' }">{{ row.state }}</span><small>{{ row.message }}</small></td><td><button class="path-button preview-button" :disabled="!!row.reason || running || working || disabled" @click="preview(row)">预览</button></td></tr>
        </tbody></table></div>
        <div v-if="rows.length > 50" class="pagination"><button class="path-button" :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ Math.ceil(rows.length / 50) }}</span><button class="path-button" :disabled="(page + 1) * 50 >= rows.length" @click="page++">下一页</button></div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.folder-batch{margin:0 0 18px;color:#17213b;font-size:15px}.batch-heading{display:flex;align-items:center;gap:30px;margin:0 0 24px;flex-wrap:wrap}.batch-heading h1{font-size:30px;letter-spacing:-.6px;line-height:1.3;margin:0;font-weight:700}.mode-switch{display:flex;padding:4px;border:1px solid #dce0ec;border-radius:9px;background:#fff;gap:4px}.mode-switch button{padding:9px 24px;min-width:100px;border:0;border-radius:6px;background:transparent;color:#596179;font:inherit;cursor:pointer}.mode-switch button.selected{background:#7656db;color:white}.path-row{display:grid;grid-template-columns:56px 24px minmax(0,1fr) auto 214px;align-items:center;gap:20px;padding:22px 18px;border-top:1px solid #e0e4ee;background:#ffffff80;min-height:76px;box-sizing:border-box}.path-row:nth-child(2){border-bottom:1px solid #e0e4ee}.row-label{font-size:17px;font-weight:650}.folder-icon{color:#27324d}.folder-location{display:flex;align-items:center;gap:24px;min-width:0}.folder-location strong{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;flex-shrink:0}.folder-path{color:#7c859b;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:420px}.path-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #d7ddeb;background:white;border-radius:7px;padding:9px 18px;color:#27324d;font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}.path-button:hover:not(:disabled){border-color:#9d86dd;background:#faf8ff}.row-option{display:flex;align-items:center;gap:9px;white-space:nowrap;font-size:14px;padding-left:8px}.row-option input{width:17px;height:17px;accent-color:#7959dc;margin:0}.row-option select{min-width:0;flex:1;border:1px solid #d7ddeb;border-radius:7px;padding:9px 10px;background:white;color:#27324d;font:inherit}.batch-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 0 0;min-height:52px}.batch-summary{display:flex;gap:28px;align-items:center;font-size:14px}.separator{margin:0 10px;color:#9ca3b4}.text-action{display:inline-flex;align-items:center;gap:6px;padding:5px 0;border:0;background:none;color:#7958d1;font:inherit;font-size:14px;cursor:pointer}.start-button{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;background:#7656db;color:white;border-radius:8px;padding:13px 25px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;min-width:180px}.start-button:hover:not(:disabled){background:#6745cb}.cancel-button{background:#fff;color:#7958d1;border:1px solid #cbbce9}.batch-progress{margin-top:16px;font-size:13px;color:#68718a}progress{display:block;width:100%;height:5px;margin-top:10px;accent-color:#7959dc}.batch-error,.failed{color:#b52c47}.batch-error{font-size:14px;line-height:1.6}.batch-details{margin:16px 0 22px;padding:18px;background:white;border:1px solid #e0e4ee;border-radius:8px}.details-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.details-heading h2{font-size:16px;margin:0}.details-heading h2 span{font-size:13px;color:#8991a3;font-weight:400;margin-left:10px}.secondary-actions{display:flex;gap:20px;flex-wrap:wrap}.batch-hint{font-size:12px;color:#798296;line-height:1.8;margin:10px 0}.batch-list{max-height:300px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}td,th{padding:11px 8px;border-bottom:1px solid #edf0f5}th{color:#7c859b;font-weight:500}td:first-child{width:30%;overflow-wrap:anywhere}td:last-child{width:70px}small{display:block;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:#7c859b;margin-top:4px;line-height:1.6}.preview-button{padding:6px 12px}.pagination{display:flex;gap:15px;align-items:center;justify-content:flex-end;margin-top:15px}button:disabled,select:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #7959dc;outline-offset:3px}.spinning{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinning{animation:none}}@media(max-width:1000px){.path-row{gap:12px;grid-template-columns:44px 22px minmax(0,1fr) auto 190px;padding:18px 10px}.folder-location{flex-direction:column;align-items:flex-start;gap:4px}.folder-location strong,.folder-path{max-width:100%}.row-option{padding-left:0}.batch-heading h1{font-size:26px}}@media(max-width:680px){.batch-heading{gap:16px}.path-row{grid-template-columns:40px 22px minmax(0,1fr) auto}.row-option{grid-column:3 / 5}.batch-summary{gap:12px;flex-wrap:wrap}.batch-toolbar{align-items:flex-start}.start-button{padding:12px 14px;min-width:auto}.secondary-actions{gap:12px}}
</style>
