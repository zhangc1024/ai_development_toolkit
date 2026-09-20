<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Sparkles, Copy, Trash2, RotateCcw, SlidersHorizontal, Server, ShieldCheck, Info } from '@lucide/vue'
import { categories, dimensions, loadSettings, saveSettings, type PromptSettings } from './settings'
import { optimizePrompt, MAX_PROMPT_CHARS } from './optimizer'
import { resolveCategory } from './categories'
import { aiSettings, openAiSettings } from '../../ai/settings'
import { copyText } from '../../platform/browser'

const locationOrigin = location.origin
const restored = loadSettings()
const storageNotice = ref(restored.warning || '选项修改后自动保存，输入内容不会保存。')
const storageFailed = ref(Boolean(restored.warning))
const input = ref('')
const category = ref(restored.settings.category)
const mode = ref(restored.settings.mode)
const language = ref(restored.settings.language)
const enabled = ref(restored.settings.enabled)
const thinking = ref(restored.settings.thinking)
const baseUrl = computed(() => aiSettings.baseUrl)
const model = computed(() => aiSettings.model)
const selected = ref(restored.settings.selected)
const busy = ref(false)
const output = ref('')
const generated = ref(false)
const stale = ref(false)
const notice = ref('')
const failed = ref(false)
const fallback = ref(false)
const copying = ref(false)
const resultSource = ref('待生成')
const count = computed(() => Array.from(input.value).length)
const outputCount = computed(() => Array.from(output.value).length)
const actualCategory = computed(() => resolveCategory(input.value, category.value))
const modes = [{ id: 'auto', label: '自动' }, { id: 'static', label: '静态规则' }, { id: 'ollama', label: '本地 / 内网 Ollama' }]
const modeHint = computed(() => mode.value === 'auto'
  ? '未启用 Ollama 时直接使用静态规则；启用后优先使用模型，失败时明确提示并使用静态规则。'
  : mode.value === 'static' ? '按类别和所选维度组织提示词，不访问 Ollama。'
    : '仅使用配置的 Ollama，失败时显示错误，不自动切换模式。')
let revision = 0
let generation: AbortController | undefined
function currentSettings(): PromptSettings {
  return { version: 1, language: language.value, category: category.value, mode: mode.value, enabled: enabled.value, thinking: thinking.value, baseUrl: baseUrl.value, model: model.value, selected: [...selected.value] }
}
function cancelGeneration(showNotice = true) {
  if (!generation) return
  generation.abort()
  generation = undefined
  busy.value = false
  revision++
  if (showNotice) { failed.value = false; fallback.value = false; notice.value = '已取消，不会自动降级；已有结果保留。' }
}
watch([category, language, mode, enabled, thinking, baseUrl, model, selected], () => {
  const saved = saveSettings(currentSettings())
  storageFailed.value = !saved
  storageNotice.value = saved ? '配置已保存在此浏览器，输入内容不会保存。' : '配置保存失败，当前选项仍可使用，但刷新后可能丢失。'
}, { deep: true, flush: 'sync' })
watch([input, language, category, selected, mode, enabled, thinking, baseUrl, model], () => {
  const wasBusy = busy.value
  cancelGeneration(false)
  if (generated.value) stale.value = true
  notice.value = wasBusy ? '输入或设置已修改，本次生成已取消，已有结果保留。' : ''
  failed.value = false
  fallback.value = false
  revision++
}, { deep: true, flush: 'sync' })
watch(output, () => { notice.value = ''; revision++ }, { flush: 'sync' })
onBeforeUnmount(() => { cancelGeneration(false); revision++ })

function resetOptions() { category.value = '自动识别'; selected.value = dimensions.slice(0, 6); mode.value = 'auto'; language.value = 'zh' }
async function optimize() {
  if (busy.value) return
  const startedAt = performance.now()
  const controller = new AbortController()
  generation = controller
  busy.value = true
  failed.value = false
  fallback.value = false
  notice.value = '正在处理，请稍候…'
  try {
    const result = await optimizePrompt(input.value, currentSettings(), controller.signal)
    if (generation !== controller || controller.signal.aborted) return
    output.value = result.text
    generated.value = true
    stale.value = false
    resultSource.value = result.source
    fallback.value = Boolean(result.warning)
    const elapsedSeconds = Math.max(0, Math.floor((performance.now() - startedAt) / 1000))
    const duration = '（耗时' + Math.floor(elapsedSeconds / 60) + '分钟' + elapsedSeconds % 60 + '秒）'
    notice.value = duration + (result.warning || '已完成 · ' + result.source + '。可继续编辑结果。')
  } catch (error) {
    if (generation !== controller || controller.signal.aborted) return
    failed.value = true
    notice.value = error instanceof Error ? error.message : '生成失败，请重试。'
  } finally {
    if (generation === controller) { generation = undefined; busy.value = false }
  }
}
async function copyResult() {
  if (!output.value || copying.value) return
  copying.value = true
  const current = revision
  try {
    await copyText(output.value)
    if (current === revision) { failed.value = false; fallback.value = false; notice.value = '已复制当前结果。' }
  } catch {
    if (current === revision) { failed.value = true; notice.value = '复制失败，请选中结果后手动复制（Ctrl+C / ⌘C）。' }
  } finally { copying.value = false }
}
</script>

<template>
  <div class="tool-page prompt-page">
    <div class="tool-heading">
      <div>
        <div class="eyebrow">AI 工具 <span>/</span> PROMPT BUILDER</div>
        <h1>提示词优化 <span class="version-badge">V1</span></h1>
        <p>整理想法，补充目标与约束，让提示词更清晰、更容易执行。</p>
      </div>
      <div class="heading-icon"><Sparkles :size="32" :stroke-width="1.5" /></div>
    </div>

    <div class="prompt-preview-note"><Info :size="16" /><span>静态规则无需模型；启用 Ollama 后，提示词将发送至你配置的本机或内网服务。</span></div>

    <p class="prompt-storage-notice" :class="{ 'limit-error': storageFailed }" role="status">{{ storageNotice }}</p>
    <div class="prompt-grid">
      <div class="prompt-controls">
        <section class="editor-card">
          <header class="editor-header">
            <h2><span class="panel-dot input-dot"></span><label for="prompt-input">原始提示词</label></h2>
            <div class="editor-actions"><button :disabled="!input" @click="input = ''"><Trash2 :size="13" />清空</button></div>
          </header>
          <textarea id="prompt-input" v-model="input" class="prompt-input" placeholder="描述你想完成的任务…&#10;&#10;例如：帮我优化 MySQL 查询，找出性能瓶颈，并给出改进建议。"></textarea>
          <footer class="editor-footer"><span>保留你的原始意图</span><span>{{ count }} / {{ MAX_PROMPT_CHARS }} 字符</span></footer>
          <div class="prompt-options">
            <label class="prompt-field" for="prompt-category">任务类别
              <select id="prompt-category" v-model="category"><option v-for="item in categories" :key="item">{{ item }}</option></select>
            </label>
            <p class="prompt-help">{{ category === '自动识别' ? '关键词识别：' : '当前类别：' }}{{ actualCategory }}。自动识别仅供参考，可手动修改。</p>
            <label class="prompt-field prompt-language" for="prompt-language">输出语言
              <select id="prompt-language" v-model="language"><option value="zh">中文</option><option value="en">English</option></select>
            </label>
            <p class="prompt-help">{{ language === 'en' ? '静态模式使用英文模板，原始输入保留不翻译；Ollama 会按英文改写。' : '生成中文提示词；静态模式保留原始输入。' }}全部取消维度时原样返回。</p>
            <fieldset class="prompt-dimensions">
              <legend>优化维度 <span>选择希望补充的内容</span></legend>
              <div class="dimension-grid">
                <label v-for="item in dimensions" :key="item" class="dimension-option" :class="{ selected: selected.includes(item) }">
                  <input v-model="selected" type="checkbox" :value="item" />{{ item }}
                </label>
              </div>
            </fieldset>
          </div>
        </section>

        <section class="editor-card">
          <header class="editor-header"><h2><SlidersHorizontal :size="14" />优化方式</h2><span class="readonly-label">自动保存配置</span></header>
          <div class="prompt-options">
            <div class="mode-options" role="group" aria-label="优化方式">
              <button v-for="item in modes" :key="item.id" :aria-pressed="mode === item.id" :class="{ active: mode === item.id }" @click="mode = item.id">{{ item.label }}</button>
            </div>
            <p class="prompt-help mode-help">{{ modeHint }}</p>
            <div v-if="mode !== 'static'" class="ollama-settings ollama-fields">
              <p><Server :size="14" /> 共用 AI 设置 · {{ model || '尚未选择模型' }}</p>
              <label class="encoding-checkbox"><input v-model="enabled" type="checkbox" />此工具启用 Ollama</label>
              <p class="prompt-help">服务地址和默认模型由全站 AI 设置统一维护。</p>
              <button class="button" @click="openAiSettings">打开 AI 设置</button>
              <label class="encoding-checkbox" style="margin-top:14px"><input v-model="thinking" type="checkbox" role="switch" :disabled="!enabled" />Thinking（深度思考）</label>
              <p class="prompt-help">默认关闭，开启可能更慢。效果取决于模型，GPT-OSS 等模型不能通过此开关完全关闭思考。</p>
            </div>
            <div class="prompt-submit">
              <button class="button primary" :disabled="busy" @click="optimize"><Sparkles :size="15" />{{ busy ? '正在优化…' : '优化提示词' }}</button>
              <button v-if="busy" class="button" @click="cancelGeneration()">取消</button>
              <button class="button text-button" @click="resetOptions"><RotateCcw :size="13" />恢复默认选项</button>
            </div>
          </div>
        </section>
      </div>

      <section class="editor-card prompt-result" aria-label="优化结果">
        <header class="editor-header">
          <h2><span class="panel-dot output-dot"></span>优化结果 <span class="readonly-label">{{ resultSource }}</span></h2>
          <div class="editor-actions"><button :disabled="!output || copying" @click="copyResult"><Copy :size="14" />{{ copying ? '复制中…' : '复制结果' }}</button></div>
        </header>
        <p v-if="stale" class="prompt-stale" role="status">输入或设置已变更，当前仍为上次结果。点击优化提示词将重新生成并替换结果。</p>
        <textarea v-if="generated" v-model="output" class="prompt-input prompt-output" :readonly="busy" aria-label="可编辑的优化结果" spellcheck="false"></textarea>
        <div v-else class="prompt-result-body">
          <div class="empty-icon"><Sparkles :size="26" :stroke-width="1.3" /></div>
          <strong>让每一次提问更清晰</strong>
          <p>输入原始需求，选择需要补充的维度。<br />优化后的提示词将在这里显示。</p>
          <div class="result-outline" aria-label="结果结构示意">
            <span>角色与目标</span><i></i><i class="short"></i>
            <span>背景与步骤</span><i></i><i class="medium"></i>
            <span>输出与约束</span><i></i><i class="short"></i>
          </div>
          <span class="prompt-muted">结构示意，非实际优化结果</span>
        </div>
        <footer class="editor-footer"><span>{{ generated ? '可编辑 · 不保存内容' : '等待优化结果' }}</span><span>{{ outputCount }} 字符</span></footer>
      </section>
    </div>

    <div v-if="notice" class="status-box" :class="failed ? 'error' : fallback ? 'warning' : 'success'" role="status">{{ notice }}</div>
    <details class="usage-details">
      <summary><Info :size="14" />使用说明与连接排查</summary>
      <div>
        <p>静态模式直接可用。模型模式请先在全站 AI 设置中配置服务并选择模型，再为此工具启用 Ollama。模型首次加载可能较慢，生成最长等待 120 秒；可主动取消。全部取消优化维度时原样返回输入，不请求模型。</p>
        <p>支持 localhost、局域网 IP 和内网域名，例如 http://192.168.1.100:11434。内网服务器需开放监听与端口，并通过 OLLAMA_ORIGINS 放行当前网页来源：<code>{{ locationOrigin }}</code>。不要无差别放行所有来源。</p>
        <p>浏览器可能要求本地网络权限，HTTPS 页面访问 HTTP 内网地址也可能受限。请允许可信页面访问，或由管理员为服务配置 HTTPS；不要关闭浏览器安全检查。网络错误无法仅凭前端准确区分 CORS、服务停机或浏览器拦截。</p>
        <p>只显示经模型详情确认的本地文本生成模型。旧版 Ollama 无能力信息时请升级。要确保离线推理，请管理员关闭 Ollama 云端功能（OLLAMA_NO_CLOUD=1）；网页无法保证服务器的内部代理或日志策略。</p>
        <p>刷新会清空输入和结果。输入最多 12000 字符，模型上下文限制因模型与服务配置而异；输出截断时请缩短输入。重新生成会替换手动编辑的结果。</p>
      </div>
    </details>
    <div class="tips-grid">
      <article><SlidersHorizontal class="tip-icon" :size="17" /><h3>静态规则构建</h3><p>按类别和所选维度拼接模板，完整保留原文。缺失背景使用占位符，不进行语义理解。</p></article>
      <article><Server class="tip-icon" :size="17" /><h3>本地 / 内网增强</h3><p>支持个人电脑或团队内网的 Ollama。模型优化需核对结果，不保证完全保留原文措辞。</p></article>
      <article><ShieldCheck class="tip-icon" :size="17" /><h3>内容不留存</h3><p>仅保存页面配置，不保存输入或结果。模型模式会将内容发送至配置的服务，服务端留存由管理员管理。</p></article>
    </div>
  </div>
</template>

<style scoped>
.prompt-language{margin-top:16px}
.status-box.warning{background:#fff7e8;color:#896428}.connection-placeholder.limit-error{color:#b04c4c}.prompt-result .readonly-label{white-space:normal;overflow-wrap:anywhere;max-width:210px}.prompt-result .editor-header{height:auto;min-height:51px;padding-top:10px;padding-bottom:10px}.prompt-result .editor-header h2{white-space:normal}.model-row{flex-wrap:wrap}

.prompt-input.prompt-output{flex:1;min-height:520px;resize:vertical;line-height:2}.prompt-stale{margin:0;padding:12px 16px;color:#896428;background:#fff7e8;font-size:11px;line-height:1.8}

.prompt-storage-notice{font-size:11px;color:#8992a5;line-height:1.8;margin:-8px 0 18px}.prompt-storage-notice.limit-error{color:#b04c4c}
.prompt-preview-note{display:flex;align-items:center;gap:9px;margin:-10px 0 20px;padding:12px 15px;background:#f0ecfa;border:1px solid #e5def5;border-radius:8px;color:#80709f;font-size:11px;line-height:1.8}
.prompt-preview-note svg{flex-shrink:0}.prompt-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:stretch}.prompt-controls{display:flex;flex-direction:column;gap:18px;min-width:0}
.prompt-input{display:block;width:100%;min-height:180px;resize:vertical;border:0;padding:18px;font-family:inherit;font-size:12px;line-height:1.9;color:#39455b;background:#fff}.prompt-input::placeholder{color:#a3acba}.prompt-input:focus-visible{outline:2px solid #b8affb;outline-offset:-3px}
.prompt-options{padding:18px}.prompt-field{display:flex;flex-direction:column;gap:9px;font-size:12px;color:#68748a;min-width:0}.prompt-field input,.prompt-field select{width:100%;min-width:0;border:1px solid #e1e4ec;border-radius:6px;background:#fff;padding:10px;color:#536078;font-size:12px}.prompt-field input:disabled,.prompt-field select:disabled{background:#f7f8fb;color:#9ba4b4}.prompt-field input{font-family:Consolas,monospace}
.prompt-help{font-size:11px;line-height:1.8;color:#929bad;margin:8px 0 0}.prompt-dimensions{border:0;padding:0;margin:20px 0 0;min-width:0}.prompt-dimensions legend{font-size:12px;color:#68748a;padding:0;margin-bottom:12px}.prompt-dimensions legend span{color:#a0a8b6;font-size:10px;margin-left:10px}
.dimension-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dimension-option{display:flex;align-items:center;gap:7px;border:1px solid #e9ebf1;background:#fafbfd;border-radius:6px;padding:10px 8px;font-size:11px;cursor:pointer;color:#7a859a}.dimension-option.selected{border-color:#e6e0f5;background:#f8f6fd;color:#776598}.dimension-option input{accent-color:#7561d9;margin:0}
.mode-options{display:flex;border:1px solid #e3e5ee;background:#f7f8fb;border-radius:7px;padding:3px;gap:3px}.mode-options button{flex:1;border:0;background:none;border-radius:5px;padding:9px 5px;font-size:11px;color:#8992a5;line-height:1.5}.mode-options button.active{background:#fff;color:#715bd8;box-shadow:0 1px 5px #29314b10}.mode-help{min-height:38px}
.ollama-settings{border:1px solid #e8eaf1;border-radius:7px;margin-top:12px;background:#fcfcfe}.ollama-settings summary{cursor:pointer;padding:13px;display:flex;align-items:center;gap:8px;font-size:11px;color:#748096}.ollama-settings summary:before{content:'›';font-size:17px;line-height:12px}.ollama-settings[open] summary:before{transform:rotate(90deg)}.ollama-settings summary>span{margin-left:auto;color:#a0a8b6;font-size:10px}.ollama-fields{padding:0 13px 14px}.ollama-fields>.prompt-field{margin-top:16px}.model-row{display:flex;align-items:flex-end;gap:10px;margin:14px 0}.model-row label{flex:1}.connection-placeholder{font-size:10px;color:#9ba4b4}
.prompt-submit{display:flex;align-items:center;gap:12px;margin-top:20px}.prompt-submit>.primary{flex:1}.prompt-submit>.text-button{font-size:11px}.prompt-result{display:flex;flex-direction:column}.prompt-result-body{flex:1;min-height:470px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:35px 24px;text-align:center}.prompt-result-body strong{font-size:13px;font-weight:500;color:#8992a4}.prompt-result-body p{font-size:11px;line-height:1.9;color:#a4adbb;margin:12px 0 26px}.prompt-muted{font-size:10px;color:#a5adbb}.result-outline{width:100%;max-width:280px;text-align:left;border:1px solid #eeedf5;border-radius:8px;padding:20px;background:#fcfbfe;margin-bottom:14px}.result-outline span{display:block;font-size:10px;color:#a39ab6;margin:0 0 12px}.result-outline i{display:block;height:5px;border-radius:3px;background:#eeeaf6;margin-bottom:10px}.result-outline i.short{width:58%;margin-bottom:24px}.result-outline i.medium{width:78%;margin-bottom:24px}.result-outline i:last-child{margin-bottom:0}
@media(max-width:1100px){.prompt-grid{grid-template-columns:1fr}.prompt-result-body{min-height:420px}}
@media(max-width:480px){.prompt-options{padding:14px}.dimension-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.prompt-submit{flex-wrap:wrap}.prompt-submit>.primary{flex-basis:100%}.model-row{flex-wrap:wrap}.model-row label{flex-basis:100%}.prompt-preview-note{align-items:flex-start}.prompt-result-body{padding:28px 18px}.prompt-result .readonly-label{max-width:135px;font-size:9px}.prompt-input.prompt-output{min-height:420px}}
</style>
