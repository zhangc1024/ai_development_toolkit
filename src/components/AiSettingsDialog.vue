<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { aiSettings, aiSettingsOpen, aiSettingsWarning, saveAiSettings } from '../ai/settings'
import { listModels, normalizeBaseUrl } from '../tools/prompt/providers/ollama'
const dialog = ref<HTMLDialogElement>()
const address = ref('')
const model = ref('')
const models = ref<string[]>([])
const busy = ref(false)
const notice = ref('')
const failed = ref(false)
const origin = location.origin
let controller: AbortController | undefined
let testedAddress = ''
function cancel() { controller?.abort(); controller = undefined; busy.value = false }
function close() { cancel(); aiSettingsOpen.value = false }
watch(aiSettingsOpen, async open => {
  if (!open) { dialog.value?.close(); return }
  address.value = aiSettings.baseUrl
  model.value = aiSettings.model
  models.value = []
  testedAddress = ''
  notice.value = '配置由本地 AI 聊天与提示词优化共用。请检测连接后保存。'
  failed.value = false
  await nextTick()
  if (aiSettingsOpen.value) dialog.value?.showModal()
})
watch(address, () => {
  cancel(); models.value = []; testedAddress = ''
  notice.value = '地址已变更，请检测连接。'; failed.value = false
}, { flush: 'sync' })
onBeforeUnmount(cancel)
async function detect() {
  cancel()
  const current = new AbortController()
  controller = current
  busy.value = true; failed.value = false; notice.value = '正在检测连接和本地模型…'
  try {
    const base = normalizeBaseUrl(address.value)
    const result = await listModels(base, current.signal)
    if (controller !== current) return
    models.value = result.models
    testedAddress = base
    if (!models.value.includes(model.value)) model.value = models.value[0] ?? ''
    notice.value = result.models.length
      ? '已连接 · ' + result.models.length + ' 个本地文本模型' + (result.skipped ? '，已排除 ' + result.skipped + ' 个不适用模型。' : '。')
      : '服务可访问，但没有可确认的本地文本模型，请先安装模型或升级 Ollama。'
    failed.value = !result.models.length
  } catch (error) {
    if (controller !== current || current.signal.aborted) return
    notice.value = error instanceof Error ? error.message : '连接失败'; failed.value = true
  } finally { if (controller === current) { controller = undefined; busy.value = false } }
}
function save() {
  try {
    if (testedAddress !== normalizeBaseUrl(address.value) || !models.value.includes(model.value)) throw new Error('请先检测连接并选择可用模型。')
    saveAiSettings({ version: 1, baseUrl: address.value, model: model.value })
    close()
  } catch (error) { failed.value = true; notice.value = error instanceof Error ? error.message : '保存失败' }
}
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="ai-dialog" aria-labelledby="ai-settings-title" @cancel.prevent="close" @click="($event.target === dialog) && close()">
      <form @submit.prevent="save">
        <header><div><h2 id="ai-settings-title">AI 设置</h2><p>配置一次，全站共用</p></div><button type="button" class="button" @click="close" aria-label="关闭 AI 设置">关闭</button></header>
        <label for="ai-address">Ollama 服务地址</label>
        <input id="ai-address" v-model="address" type="url" required spellcheck="false" placeholder="http://localhost:11434" />
        <p>支持本机、局域网 IP、内网域名或 VPN 地址。</p>
        <div class="ai-detect"><button type="button" class="button" :disabled="busy" @click="detect">{{ busy ? '检测中…' : '检测连接 / 获取模型' }}</button><button v-if="busy" type="button" class="button" @click="cancel(); notice = '已取消检测'">取消检测</button></div>
        <label for="ai-model">默认模型</label>
        <select id="ai-model" v-model="model" :disabled="busy || !models.length">
          <option value="">请选择本地模型</option>
          <option v-if="model && !models.includes(model)" :value="model">{{ model }}（待检测）</option>
          <option v-for="name in models" :key="name" :value="name">{{ name }}</option>
        </select>
        <p role="status" :class="{ 'limit-error': failed }">{{ notice }}</p>
        <p v-if="aiSettingsWarning" class="limit-error">{{ aiSettingsWarning }}</p>
        <details><summary>连接排查与本地保存</summary><p>Ollama 需允许当前网页来源：<code>{{ origin }}</code>（OLLAMA_ORIGINS）。内网服务还需配置监听与端口。浏览器可能要求本地网络权限，HTTPS 页面访问 HTTP 服务也可能受限。</p><p>只使用可确认的本地文本模型；如需保证服务器离线，请在服务端设置 OLLAMA_NO_CLOUD=1。配置仅存于当前浏览器，清除网站数据后需重新填写。</p></details>
        <footer><button type="button" class="button" @click="close">取消</button><button type="submit" class="button primary" :disabled="busy || !models.includes(model)">保存配置</button></footer>
      </form>
    </dialog>
  </Teleport>
</template>
<style scoped>
.ai-dialog{width:min(540px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #e3dfef;border-radius:14px;padding:24px;color:#39455b;box-shadow:0 20px 80px #28203930}.ai-dialog::backdrop{background:#24203866}.ai-dialog header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}.ai-dialog h2{margin:0;font-size:21px}.ai-dialog p{font-size:12px;line-height:1.8;overflow-wrap:anywhere}.ai-dialog label{display:block;font-size:13px;margin:16px 0 9px}.ai-dialog input,.ai-dialog select{width:100%;padding:11px;border:1px solid #dfe3ed;border-radius:7px;background:white;color:inherit}.ai-dialog footer,.ai-detect{display:flex;gap:10px;margin-top:18px}.ai-dialog footer{justify-content:flex-end}.ai-dialog details{font-size:12px;color:#758095}.ai-dialog summary{cursor:pointer}
</style>
