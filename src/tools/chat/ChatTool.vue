<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MessageCircle, Plus, Send, Square, Copy, Trash2, Settings } from '@lucide/vue'
import { aiSettings, aiSettingsWarning, openAiSettings } from '../../ai/settings'
import { copyText } from '../../platform/browser'
import { buildContext, MAX_INPUT_CHARS, type Conversation, type ChatMessage } from './core'
import { streamChat } from './ollama'
import { loadChatSettings, saveChatSettings } from './settings'
import { clearConversations, deleteConversation, loadConversations, saveConversation } from './storage'

const restoredSettings = loadChatSettings()
const thinking = ref(restoredSettings.thinking)
const settingsWarning = ref(restoredSettings.warning)
const conversations = ref<Conversation[]>([])
const activeId = ref('')
const input = ref('')
const loading = ref(true)
const busy = ref(false)
const storageStatus = ref('正在读取本地会话…')
const storageFailed = ref(false)
const notice = ref('')
const connection = ref('未连接')
const omitted = ref(0)
const messageList = ref<HTMLElement>()
const followBottom = ref(true)
const current = computed(() => conversations.value.find(item => item.id === activeId.value))
const ordered = computed(() => [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt))
const configured = computed(() => Boolean(aiSettings.model && aiSettings.baseUrl))
let generation: AbortController | undefined
let pending: { conversation: Conversation; reply: ChatMessage } | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let writes = Promise.resolve()
let disposed = false
function id() { return crypto.randomUUID() }
function persist(conversation: Conversation) {
  const snapshot: Conversation = JSON.parse(JSON.stringify(conversation))
  storageStatus.value = '正在保存…'
  writes = writes.then(async () => {
    try {
      await saveConversation(snapshot)
      storageFailed.value = false
      storageStatus.value = '聊天记录已保存在此浏览器'
    } catch {
      storageFailed.value = true
      storageStatus.value = '聊天记录保存失败，本次仍可聊天；刷新可能丢失。'
    }
  })
}
function checkpoint(conversation: Conversation) {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = undefined; persist(conversation) }, 700)
}
function finishSave(conversation: Conversation) {
  clearTimeout(saveTimer); saveTimer = undefined; persist(conversation)
}
function stop() {
  if (!generation) return
  generation.abort(); generation = undefined; busy.value = false
  if (pending) {
    pending.reply.status = 'stopped'
    pending.reply.error = '已停止生成，已有内容保留；此轮不加入后续上下文。'
    finishSave(pending.conversation)
    pending = undefined
  }
  notice.value = '已停止生成。'
  connection.value = '已停止'
}
function newConversation() {
  stop()
  const conversation: Conversation = { id: id(), title: '新对话', updatedAt: Date.now(), messages: [] }
  conversations.value.unshift(conversation)
  activeId.value = conversation.id; input.value = ''; notice.value = ''; omitted.value = 0
  followBottom.value = true
  persist(conversation)
}
function selectConversation(conversation: Conversation) {
  if (activeId.value === conversation.id) return
  stop(); activeId.value = conversation.id; input.value = ''; notice.value = ''; omitted.value = 0
  followBottom.value = true
  void scrollBottom()
}
async function removeCurrent() {
  const conversation = current.value
  if (!conversation || !confirm('删除此对话及其聊天记录？')) return
  stop()
  await writes
  try {
    await deleteConversation(conversation.id)
    conversations.value = conversations.value.filter(item => item.id !== conversation.id)
    activeId.value = conversations.value[0]?.id ?? ''
    input.value = ''; notice.value = ''; omitted.value = 0
    if (!current.value) newConversation()
  } catch { storageFailed.value = true; storageStatus.value = '删除失败，聊天记录仍保留，请重试。' }
}
async function clearAll() {
  if (!confirm('清空此网站在当前浏览器保存的全部聊天记录？AI 配置会保留。')) return
  stop(); await writes
  try {
    await clearConversations()
    conversations.value = []; activeId.value = ''; newConversation()
  } catch { storageFailed.value = true; storageStatus.value = '清空失败，聊天记录仍保留，请重试。' }
}
async function scrollBottom() {
  await nextTick()
  if (followBottom.value && messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
}
function onScroll() {
  const el = messageList.value
  if (el) followBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
async function send() {
  if (busy.value || loading.value || !configured.value || !input.value.trim()) return
  const text = input.value
  if (!current.value) newConversation()
  const conversation = current.value!
  let context: ReturnType<typeof buildContext>
  try { context = buildContext(conversation.messages, text) }
  catch (error) { notice.value = error instanceof Error ? error.message : '消息无效'; return }
  const controller = new AbortController()
  const model = aiSettings.model
  const baseUrl = aiSettings.baseUrl
  conversation.messages.push({ id: id(), role: 'user', content: text, status: 'complete' })
  conversation.messages.push({ id: id(), role: 'assistant', content: '', status: 'generating', model })
  const reply = conversation.messages[conversation.messages.length - 1]!
  if (conversation.messages.length === 2) conversation.title = text.trim().slice(0, 32)
  conversation.updatedAt = Date.now()
  generation = controller; pending = { conversation, reply }; busy.value = true
  input.value = ''; notice.value = ''; omitted.value = context.omitted; connection.value = '正在连接…'
  followBottom.value = true
  persist(conversation); void scrollBottom()
  try {
    await streamChat(baseUrl, model, context.messages, content => {
      if (generation !== controller) return
      reply.content = content; connection.value = '已连接 · 正在回复'
      checkpoint(conversation); void scrollBottom()
    }, controller.signal, thinking.value)
    if (generation !== controller) return
    reply.status = 'complete'; connection.value = '本次请求成功'
    notice.value = '回复完成。'
  } catch (error) {
    if (generation !== controller) return
    reply.status = 'error'
    reply.error = error instanceof Error ? error.message : '生成失败，请重试。'
    connection.value = '请求失败'; notice.value = reply.error
  } finally {
    if (generation === controller) {
      generation = undefined; pending = undefined; busy.value = false
      finishSave(conversation); void scrollBottom()
    }
  }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault(); void send()
  }
}
async function copy(content: string) {
  try { await copyText(content); notice.value = '已复制回复。' }
  catch { notice.value = '复制失败，请选中文本后手动复制。' }
}
watch(thinking, value => {
  const wasBusy = busy.value
  stop()
  settingsWarning.value = saveChatSettings(value) ? '' : '聊天选项保存失败，本次仍可使用，刷新后可能丢失。'
  if (wasBusy) notice.value = 'Thinking 选项已变更，本次生成已停止，已有内容保留。'
}, { flush: 'sync' })
watch(() => [aiSettings.baseUrl, aiSettings.model], () => {
  const wasBusy = busy.value
  stop()
  connection.value = '配置已更新，发送时连接'
  if (wasBusy) notice.value = 'AI 配置已变更，本次生成已停止。'
}, { flush: 'sync' })
onMounted(async () => {
  window.addEventListener('pagehide', stop)
  try {
    const restored = await loadConversations()
    if (disposed) return
    conversations.value = restored
    activeId.value = restored[0]?.id ?? ''
    storageStatus.value = '聊天记录已保存在此浏览器'
  } catch {
    storageFailed.value = true; storageStatus.value = '无法读取本地会话，本次可聊天，刷新后可能丢失。'
  } finally {
    if (!disposed) { loading.value = false; void scrollBottom() }
  }
})
onBeforeUnmount(() => { window.removeEventListener('pagehide', stop); disposed = true; stop(); clearTimeout(saveTimer) })
</script>

<template>
  <div class="tool-page chat-page">
    <div class="tool-heading"><div><div class="eyebrow">AI 工具 <span>/</span> LOCAL CHAT</div><h1>本地 AI 聊天</h1><p>和自己的 Ollama 多轮对话，聊天记录自动保存在当前浏览器。</p></div><div class="heading-icon"><MessageCircle :size="32" /></div></div>
    <div class="chat-workspace">
      <aside class="chat-sidebar" aria-label="历史会话">
        <button class="button primary" :disabled="loading" @click="newConversation"><Plus :size="15" />新建对话</button>
        <div class="chat-history">
          <p v-if="loading">正在读取会话…</p><p v-else-if="!ordered.length">还没有会话，发送消息即可开始。</p>
          <button v-for="conversation in ordered" :key="conversation.id" class="chat-session" :class="{ active: activeId === conversation.id }" :aria-pressed="activeId === conversation.id" @click="selectConversation(conversation)"><span>{{ conversation.title }}</span><small>{{ new Date(conversation.updatedAt).toLocaleString() }}</small></button>
        </div>
        <button class="button" :disabled="loading || busy || !ordered.length" @click="clearAll"><Trash2 :size="13" />清空全部聊天</button>
      </aside>
      <section class="chat-main" aria-label="聊天">
        <header class="chat-toolbar"><div><strong>{{ aiSettings.model || '尚未配置 Ollama' }}</strong><small>{{ configured ? connection : '请先配置服务和本地模型' }}</small></div><div class="chat-toolbar-actions"><button class="button" @click="openAiSettings"><Settings :size="14" />AI 设置</button><button class="button" :disabled="loading || busy || !current" @click="removeCurrent" aria-label="删除当前对话"><Trash2 :size="14" /></button></div></header>
        <div v-if="!configured" class="chat-config-hint"><p>配置 Ollama 后即可开始纯文字多轮对话。</p><button class="button primary" @click="openAiSettings">配置 Ollama</button></div>
        <div ref="messageList" class="chat-messages" @scroll="onScroll">
          <div v-if="!current?.messages.length" class="chat-empty"><MessageCircle :size="35" /><h2>从一个问题开始</h2><p>支持解释代码、讨论方案和接着追问。<br />消息只发送到你配置的 Ollama 服务。</p></div>
          <article v-for="message in current?.messages" :key="message.id" class="chat-message" :class="message.role">
            <header><strong>{{ message.role === 'user' ? '你' : 'AI' }}</strong><span v-if="message.model">{{ message.model }}</span><button v-if="message.role === 'assistant' && message.content" class="chat-copy" @click="copy(message.content)" aria-label="复制回复"><Copy :size="13" />复制</button></header>
            <div class="chat-content">{{ message.content || (message.status === 'generating' ? '正在等待模型回复…' : '未收到回复正文') }}</div>
            <small v-if="message.status === 'generating'" class="chat-progress">正在生成…</small>
            <small v-if="message.error" class="chat-message-error">{{ message.error }}</small>
          </article>
        </div>
        <div class="chat-composer">
          <p v-if="omitted" class="chat-context" role="status">本次未发送 {{ omitted }} 条较早或未完成消息；历史记录仍保留。最多携带近期 20 轮完整对话及 24000 字符（含本次输入）。</p>
          <div class="chat-thinking">
            <label class="encoding-checkbox"><input v-model="thinking" type="checkbox" role="switch" :disabled="!configured" aria-describedby="chat-thinking-help" />Thinking（深度思考）</label>
            <p id="chat-thinking-help">默认关闭，开启可能更慢；需模型支持。GPT-OSS 等模型不能通过此开关完全关闭思考。</p>
          </div>
          <label for="chat-input" class="chat-input-label">发送消息</label>
          <textarea id="chat-input" v-model="input" :disabled="loading || !configured" :maxlength="MAX_INPUT_CHARS" rows="3" placeholder="输入消息，接着聊下去…" @keydown="keydown"></textarea>
          <div class="chat-send-row"><span>Enter 发送 · Shift+Enter 换行 <small>{{ input.length }}/{{ MAX_INPUT_CHARS }}</small></span><button v-if="busy" class="button" @click="stop"><Square :size="13" />停止生成</button><button v-else class="button primary" :disabled="loading || !configured || !input.trim()" @click="send"><Send :size="14" />发送</button></div>
        </div>
      </section>
    </div>
    <p v-if="notice" class="chat-notice" role="status">{{ notice }}</p>
    <p class="chat-storage" :class="{ 'limit-error': storageFailed }" role="status">{{ storageStatus }}<button v-if="storageFailed && current" class="button" @click="persist(current)">重试保存</button></p>
    <p v-if="settingsWarning" class="limit-error" role="status">{{ settingsWarning }}</p>
    <p v-if="aiSettingsWarning" class="limit-error">{{ aiSettingsWarning }}</p>
    <details class="usage-details"><summary>关于上下文与本地保存</summary><div><p>配置由全站 AI 设置统一维护。聊天记录保存在此网站的浏览器数据库中，不跨设备同步；清除网站数据会删除记录。切换对话或离开页面会停止生成，已收到内容保留。</p><p>仅发送近期完整的问答轮次；失败、停止或刷新中断的轮次不参与后续上下文。字符上限不是模型的 token 上限，模型仍可能受自身上下文窗口限制。</p><p>当前只支持纯文字，回复按原始文本展示，可复制代码和 Markdown。Thinking 可在输入框上方切换，默认关闭并保存选择；部分模型仍可能思考，思考内容不展示。服务端日志和推理位置由你的 Ollama 服务决定。</p></div></details>
  </div>
</template>
<style scoped>
.chat-thinking{margin-bottom:14px}.chat-thinking p{font-size:11px;line-height:1.8;color:#8790a3;margin:7px 0 0}

.chat-workspace{display:grid;grid-template-columns:210px minmax(0,1fr);border:1px solid #e0e4ee;border-radius:12px;overflow:hidden;background:#fff;min-height:630px}.chat-sidebar{background:#fafbfe;border-right:1px solid #e8eaf1;padding:16px;display:flex;flex-direction:column;gap:16px;min-width:0}.chat-history{flex:1;max-height:510px;overflow:auto}.chat-history>p{font-size:12px;color:#8790a3;line-height:1.8}.chat-session{display:block;text-align:left;width:100%;padding:12px 10px;background:transparent;border:1px solid transparent;border-radius:8px;margin-bottom:7px;color:#566079}.chat-session span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat-session small{display:block;margin-top:7px;color:#939bad;font-size:10px}.chat-session.active{background:#f0ecfc;border-color:#e2daf6;color:#715bd8}.chat-main{display:flex;flex-direction:column;min-width:0}.chat-toolbar{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e9ecf2}.chat-toolbar>div:first-child{min-width:0}.chat-toolbar strong{font-size:13px;overflow-wrap:anywhere}.chat-toolbar small{display:block;color:#8790a3;margin-top:6px;font-size:11px}.chat-toolbar-actions{display:flex;gap:7px}.chat-messages{height:440px;overflow:auto;overscroll-behavior:contain;padding:22px;scrollbar-gutter:stable}.chat-empty{min-height:330px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#9a8bc6}.chat-empty h2{font-size:18px;color:#626d83;font-weight:500;margin-bottom:2px}.chat-empty p{font-size:12px;color:#949eae;line-height:1.9}.chat-message{margin:0 0 22px;max-width:94%;width:fit-content;border:1px solid #eceef4;border-radius:10px;padding:14px 16px;background:#fafbfe;min-width:150px}.chat-message.user{margin-left:auto;background:#f3effd;border-color:#eae3f8}.chat-message header{display:flex;gap:9px;align-items:center;margin-bottom:10px;font-size:11px;color:#8590a3}.chat-message header strong{color:#71648b}.chat-message header span{overflow-wrap:anywhere}.chat-copy{display:flex;gap:4px;align-items:center;margin-left:auto;background:none;border:0;font-size:11px;color:#8c80ab}.chat-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;font-size:14px;tab-size:2}.chat-progress,.chat-message-error{display:block;margin-top:10px;font-size:11px;line-height:1.8;color:#8870b5}.chat-message-error{color:#b04c4c}.chat-config-hint{padding:14px 20px;background:#f5f1fe;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px}.chat-composer{padding:15px 20px;border-top:1px solid #e9ecf2;margin-top:auto}.chat-input-label{display:block;font-size:11px;color:#8790a3;margin-bottom:8px}.chat-composer textarea{display:block;width:100%;resize:vertical;min-height:85px;max-height:260px;border:1px solid #e1e4ee;border-radius:8px;padding:12px;font-family:inherit;font-size:14px;line-height:1.8;color:#39455b;background:#fcfcff}.chat-composer textarea:focus-visible{outline:2px solid #b8affb}.chat-send-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.chat-send-row>span{font-size:10px;color:#929bac}.chat-send-row small{margin-left:8px}.chat-context{font-size:11px;line-height:1.8;color:#987333;background:#fff8e9;padding:9px 12px;border-radius:6px}.chat-storage,.chat-notice{font-size:12px;line-height:1.8;color:#8690a2}.chat-storage.limit-error{color:#b04c4c}.chat-storage button{margin-left:10px}.chat-notice{color:#7561a4}
@media(max-width:1100px){.chat-workspace{grid-template-columns:170px minmax(0,1fr)}.chat-sidebar{padding:12px}.chat-toolbar,.chat-composer{padding:14px}.chat-messages{padding:14px}}
@media(max-width:650px){.chat-workspace{grid-template-columns:1fr}.chat-sidebar{border-right:0;border-bottom:1px solid #e8eaf1}.chat-history{display:flex;gap:8px;max-height:100px;overflow-x:auto}.chat-session{min-width:150px;max-width:180px;margin:0}.chat-sidebar>.button:last-child{align-self:flex-end}.chat-toolbar{flex-wrap:wrap}.chat-config-hint{flex-wrap:wrap}.chat-messages{height:420px}.chat-message{max-width:100%}.chat-send-row>span{max-width:60%;line-height:1.8}.chat-send-row small{display:block;margin:0}}
</style>
