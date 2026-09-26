<script setup lang="ts">
import { computed, ref } from 'vue'
import { Copy, Database, Info } from '@lucide/vue'
import { copyText } from '../../platform/browser'
import { convertSize, sizeUnits, type SizeBase, type SizeUnit } from './core'

const input = ref('1.5')
const unit = ref<SizeUnit>('GB')
const base = ref<SizeBase>(1024)
const copied = ref<SizeUnit | null>(null)
const notice = ref('')
let copyRevision = 0

const error = computed(() => {
  if (!input.value.trim()) return ''
  try { convertSize(input.value, unit.value, base.value); return '' }
  catch (e) { return e instanceof Error ? e.message : '换算失败' }
})
const results = computed(() => error.value || !input.value.trim() ? [] : convertSize(input.value, unit.value, base.value))

function resetNotice() {
  copyRevision++
  copied.value = null
  notice.value = ''
}
async function copy(unitToCopy: SizeUnit, value: string) {
  const revision = ++copyRevision
  try {
    await copyText(value)
    if (revision === copyRevision) { copied.value = unitToCopy; notice.value = '已复制 ' + unitToCopy + ' 数值' }
  } catch {
    if (revision === copyRevision) { copied.value = null; notice.value = '复制失败，请手动选择结果复制' }
  }
}
</script>

<template>
  <div class="tool-page size-page">
    <div class="tool-heading">
      <div>
        <div class="eyebrow">常用工具 <span>/</span> SIZE CONVERTER</div>
        <h1>数据大小转换</h1>
        <p>输入数值，查看 B、KB、MB、GB、TB 的换算结果。所有计算均在浏览器本地完成。</p>
      </div>
      <div class="heading-icon"><Database :size="32" /></div>
    </div>

    <div class="size-content">
      <section class="size-card">
        <h2>输入数值</h2>
        <div class="size-input-row">
          <input v-model="input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="50" placeholder="请输入非负数值" aria-label="输入数值" :aria-invalid="!!error" @input="resetNotice" />
          <select v-model="unit" aria-label="输入单位" @change="resetNotice">
            <option v-for="item in sizeUnits" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <p v-if="error" class="size-error" role="alert">{{ error }}</p>
        <p v-else class="size-hint"><Info :size="15" />支持小数，修改数值或单位后自动换算。</p>
      </section>

      <section class="size-card size-results" aria-label="换算结果">
        <h2>换算结果</h2>
        <div v-if="results.length" class="size-list">
          <div v-for="row in results" :key="row.unit" class="size-row" :class="{ selected: row.unit === unit }">
            <strong>{{ row.unit }}</strong>
            <span class="size-value" :title="row.approximate ? '结果已保留至多 24 位小数' : ''">{{ row.approximate ? '≈ ' : '' }}{{ row.display }}</span>
            <button class="size-copy" type="button" :aria-label="'复制 ' + row.unit + ' 数值'" @click="copy(row.unit, row.value)"><Copy :size="14" />{{ copied === row.unit ? '已复制' : '复制' }}</button>
          </div>
        </div>
        <p v-else class="size-empty">{{ error ? '请修正输入后查看结果' : '输入数值后显示换算结果' }}</p>
        <span class="sr-only" role="status" aria-live="polite">{{ notice }}</span>
      </section>

      <section class="size-card">
        <h2>换算基准</h2>
        <div class="size-base" role="group" aria-label="换算基准">
          <button type="button" :class="{ active: base === 1024 }" :aria-pressed="base === 1024" @click="base = 1024; resetNotice()">1024（二进制）</button>
          <button type="button" :class="{ active: base === 1000 }" :aria-pressed="base === 1000" @click="base = 1000; resetNotice()">1000（十进制）</button>
        </div>
        <p class="size-hint"><Info :size="15" />当前按 1 KB = {{ base }} B 逐级换算。KB 等单位按所选基准解释。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.size-page .tool-heading{max-width:1000px;margin-left:auto;margin-right:auto}
.size-content{max-width:1000px;margin:0 auto;display:grid;gap:16px}
.size-card{background:#fff;border:1px solid #e3e5ed;border-radius:12px;padding:25px 28px;box-shadow:0 4px 18px #29314b05}
.size-card h2{font-size:16px;color:#303a50;margin:0 0 20px;font-weight:650}
.size-input-row{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:12px}
.size-input-row input,.size-input-row select{width:100%;min-width:0;height:52px;background:#fff;border:1px solid #d9ddea;border-radius:8px;padding:0 17px;color:#283248;font-size:17px;font-weight:600}
.size-input-row select{cursor:pointer}
.size-hint{display:flex;align-items:center;gap:7px;color:#8173bd;font-size:12px;line-height:1.7;margin:15px 0 0}
.size-hint svg{flex-shrink:0}
.size-error{font-size:12px;color:#b04c4c;margin:13px 0 0}
.size-list{border:1px solid #e4e7ef;border-radius:8px;overflow:hidden}
.size-row{display:grid;grid-template-columns:110px minmax(0,1fr) 95px;align-items:center;gap:12px;min-height:51px;padding:7px 16px;border-bottom:1px solid #edf0f5}
.size-row:last-child{border-bottom:0}
.size-row.selected{background:#f2effd;color:#614bd2}
.size-row strong{font-size:14px}
.size-value{font-variant-numeric:tabular-nums;overflow-wrap:anywhere;font-size:14px}
.size-copy{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#fff;border:1px solid #a793ee;border-radius:7px;color:#694fd1;padding:8px 6px;font-size:12px}
.size-copy:hover{background:#f7f4ff}
.size-empty{color:#8790a2;font-size:13px;margin:0;padding:14px 0}
.size-base{display:inline-grid;grid-template-columns:1fr 1fr;background:#f5f6fa;border:1px solid #e7e9f0;border-radius:8px;padding:3px;gap:3px}
.size-base button{border:0;background:transparent;padding:10px 20px;border-radius:6px;color:#7b8396;font-size:12px;font-weight:600}
.size-base button.active{background:#7058dc;color:white;box-shadow:0 2px 7px #7058dc33}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:620px){.size-card{padding:18px}.size-input-row{grid-template-columns:minmax(0,1fr) 100px;gap:8px}.size-row{grid-template-columns:40px minmax(0,1fr) 72px;gap:7px;padding:8px 10px}.size-value{font-size:12px}.size-copy{font-size:11px;gap:3px}.size-copy svg{display:none}.size-base{display:grid;width:100%}.size-base button{padding:10px 5px}}
</style>

