<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Clock, Copy, ArrowRightLeft, RefreshCw, Trash2 } from '@lucide/vue'
import { copyText } from '../../platform/browser'
import { currentTime, fromDate, fromTimestamp, type TimestampUnit, type TimeResult } from './core'
const mode = ref<'timestamp' | 'date'>('timestamp')
const unit = ref<TimestampUnit>('seconds')
const zone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
const input = ref('')
const result = ref<TimeResult | null>(null)
const error = ref('')
const notice = ref('')
const now = ref(Date.now())
let revision = 0
const interval = setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => { clearInterval(interval); revision++ })
const live = computed(() => { try { return currentTime(zone.value, now.value) } catch { return null } })
watch([input, mode, unit, zone], () => { revision++; result.value = null; error.value = ''; notice.value = '' }, { flush: 'sync' })
const rows = computed(() => result.value ? [
  ['Unix 秒', result.value.seconds], ['Unix 毫秒', result.value.milliseconds], ['UTC 时间', result.value.utc],
  ['所选时区时间', result.value.zoned], ['时区', result.value.zone], ['UTC 偏移', result.value.offset],
] : [])
function run() {
  result.value = null; error.value = ''; notice.value = ''; revision++
  try { result.value = mode.value === 'timestamp' ? fromTimestamp(input.value, unit.value, zone.value) : fromDate(input.value, zone.value) }
  catch (e) { error.value = e instanceof Error ? e.message : '转换失败' }
}
function fillNow() {
  try { const value = currentTime(zone.value); input.value = mode.value === 'date' ? value.zoned + value.offset : unit.value === 'seconds' ? value.seconds : value.milliseconds; run() }
  catch (e) { error.value = e instanceof Error ? e.message : '时区无效' }
}
function sample() { input.value = mode.value === 'date' ? '2026-01-01 00:00:00' : unit.value === 'seconds' ? '1767225600' : '1767225600000'; run() }
function clear() { input.value = ''; result.value = null; error.value = ''; notice.value = ''; revision++ }
async function copy(value: string) {
  const version = revision
  try { await copyText(value); if (version === revision) notice.value = '已复制' }
  catch { if (version === revision) notice.value = '复制失败，请手动选择结果复制' }
}
</script>
<template>
  <div class="tool-page timestamp-page">
    <div class="tool-heading"><div><div class="eyebrow">常用工具 <span>/</span> TIME WORKSPACE</div><h1>时间戳转换</h1><p>明确单位与时区，精确转换到毫秒，避免自动猜测。</p></div><div class="heading-icon"><Clock :size="32" /></div></div>
    <section class="live-clock"><span>设备当前时间 · 每秒刷新</span><strong>{{ live?.zoned ?? '请选择有效时区' }}</strong><small v-if="live">{{ live.zone }} · UTC{{ live.offset }} · {{ live.milliseconds }} ms</small></section>
    <section class="time-form">
      <div class="encoding-options-row">
        <label class="indent-label">转换方向<select v-model="mode" aria-label="转换方向"><option value="timestamp">时间戳 → 日期</option><option value="date">日期 → 时间戳</option></select></label>
        <label v-if="mode === 'timestamp'" class="indent-label">输入单位<select v-model="unit" aria-label="输入单位"><option value="seconds">秒（最多 3 位小数）</option><option value="milliseconds">毫秒（整数）</option></select></label>
        <label class="indent-label time-zone">时区<input v-model="zone" list="time-zones" aria-label="时区" autocomplete="off" /><datalist id="time-zones"><option>UTC</option><option>Asia/Shanghai</option><option>Asia/Tokyo</option><option>America/New_York</option><option>Europe/London</option></datalist></label>
      </div>
      <label class="time-input-label">{{ mode === 'timestamp' ? '输入时间戳' : '输入日期时间' }}<input v-model="input" maxlength="100" aria-label="待转换时间" :placeholder="mode === 'timestamp' ? '例如 1767225600 或 -0.001' : 'YYYY-MM-DD HH:mm:ss[.SSS]，可带 Z 或 ±HH:mm'" @keydown.ctrl.enter.prevent="run" @keydown.meta.enter.prevent="run" /></label>
      <div class="primary-actions"><button class="button primary" @click="run"><ArrowRightLeft :size="15" />转换</button><button class="button" @click="fillNow"><RefreshCw :size="15" />填入当前时间</button><button class="button" @click="sample">加载示例</button><button class="button" @click="clear"><Trash2 :size="14" />清空</button></div>
    </section>
    <div v-if="error || notice" role="status" aria-live="polite" class="status-box" :class="{ error: !!error }">{{ error || notice }}</div>
    <section v-if="result" class="time-results"><header><h2>转换结果</h2><button class="button" @click="copy(rows.map(([label, value]) => label + ': ' + value).join('\n'))"><Copy :size="14" />复制全部</button></header><dl><div v-for="[label, value] in rows" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd><button class="icon-button" :aria-label="'复制' + label" @click="copy(value!)"><Copy :size="15" /></button></div></dl></section>
    <section class="encoding-rules"><h2>转换规则</h2><ul><li>时间戳始终代表 UTC 瞬间；时区只影响显示或不带偏移的日期输入。单位必须明确选择。</li><li>秒允许最多 3 位小数，毫秒必须为整数；支持负时间戳。支持公元 0001–9999 年，不处理闰秒。</li><li>日期输入可用空格或 T 分隔，允许末尾 Z 或 ±HH:mm；显式偏移优先，所选时区用于结果显示。</li><li>夏令时跳过的当地时间报错；重复的当地时间需要明确 UTC 偏移，不替你猜测。</li><li>当前时间来自设备，不联网校准；时区规则来自运行环境。修改输入或设置会清除旧结果。</li></ul></section>
  </div>
</template>
