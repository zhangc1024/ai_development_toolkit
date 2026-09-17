<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { KeyRound, Copy, Download, LockKeyhole, UnlockKeyhole, Trash2 } from '@lucide/vue'
import CodeEditor from '../../components/CodeEditor.vue'
import { copyText, downloadText } from '../../platform/browser'
import type { Padding, CipherEncoding, KeyFormat, KeyPair, RsaResult, WorkerRequest } from './core'

const publicKey = ref('')
const privateKey = ref('')
const input = ref('')
const output = ref('')
const padding = ref<Padding>('oaep-sha256')
const encoding = ref<CipherEncoding>('base64')
const bits = ref(3072)
const format = ref<KeyFormat>('pkcs8')
const busy = ref(false)
const notice = ref('')
const error = ref('')
const result = ref<RsaResult | null>(null)
const lastAction = ref<'encrypt' | 'decrypt'>('encrypt')
const inputSize = computed(() => new TextEncoder().encode(input.value).length)
let worker: Worker | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let revision = 0
function stop() { worker?.terminate(); worker = undefined; clearTimeout(timer); busy.value = false }
function invalidate() { stop(); revision++; result.value = null; output.value = ''; error.value = ''; notice.value = '' }
watch([input, publicKey, privateKey, padding, encoding, bits, format], invalidate, { flush: 'sync' })
onBeforeUnmount(() => { stop(); revision++ })
function run(request: WorkerRequest) {
  invalidate()
  const version = revision
  try {
    const current = new Worker(new URL('./rsa.worker.ts', import.meta.url), { type: 'module' })
    worker = current
    busy.value = true
    current.onmessage = ({ data }: MessageEvent<{ keys?: KeyPair; result?: RsaResult; error?: string }>) => {
      if (version !== revision) return
      stop()
      if (data.error) { error.value = data.error; return }
      if (data.keys) {
        publicKey.value = data.keys.publicKey
        privateKey.value = data.keys.privateKey
        notice.value = '公私钥已生成，仅保留在当前页面；下载的私钥不带密码，请妥善保管'
      } else if (data.result) {
        result.value = data.result
        output.value = data.result.output
        notice.value = (lastAction.value === 'encrypt' ? '加密' : '解密') + '成功 · ' + data.result.bits + ' 位 RSA'
      }
    }
    current.onerror = () => { if (version === revision) { stop(); error.value = '处理线程未能运行，请刷新页面重试' } }
    current.postMessage(request)
    timer = setTimeout(() => { if (version === revision) { stop(); error.value = '处理超时，已停止，请重试或选择较短密钥' } }, request.action === 'generate' ? 60000 : 10000)
  } catch { stop(); error.value = '当前环境无法启动 RSA 处理线程' }
}
function transform(action: 'encrypt' | 'decrypt') {
  lastAction.value = action
  run({ action, text: input.value, key: action === 'encrypt' ? publicKey.value : privateKey.value, padding: padding.value, encoding: encoding.value })
}
function generate() { run({ action: 'generate', bits: bits.value, format: format.value }) }
function clear() { input.value = ''; publicKey.value = ''; privateKey.value = ''; invalidate() }
function reuse() { input.value = output.value; invalidate(); notice.value = '结果已填入输入区，可以继续解密或加密' }
async function copy(value: string) {
  const version = revision
  try { await copyText(value); if (version === revision) notice.value = '已复制' }
  catch { if (version === revision) notice.value = '复制失败，请选中文本后按 Ctrl+C' }
}
function download(value: string, filename: string) {
  try { downloadText(value, filename, 'text/plain;charset=utf-8'); notice.value = '已请求下载' }
  catch { notice.value = '下载失败，请复制后手动保存' }
}
</script>
<template>
  <div class="tool-page rsa-page">
    <div class="tool-heading"><div><div class="eyebrow">安全与签名 <span>/</span> RSA WORKSPACE</div><h1>RSA 加密 / 解密</h1><p>生成公私钥，使用公钥加密、私钥解密。密钥与内容仅在浏览器本地处理。</p></div><div class="heading-icon"><KeyRound :size="32" :stroke-width="1.5" /></div></div>
    <section class="encoding-options" aria-label="密钥生成设置">
      <div class="encoding-options-row">
        <label class="indent-label">生成位数<select v-model.number="bits"><option :value="2048">2048 位</option><option :value="3072">3072 位</option><option :value="4096">4096 位</option></select></label>
        <label class="indent-label">生成私钥格式<select v-model="format"><option value="pkcs8">PKCS#8</option><option value="pkcs1">PKCS#1</option></select></label>
        <button class="button" :disabled="busy" @click="generate"><KeyRound :size="15" />{{ publicKey || privateKey ? '重新生成并替换密钥' : '生成公私钥' }}</button>
      </div>
      <p>公钥导出为 SPKI PEM；私钥不带密码。生成设置仅影响新密钥，粘贴的密钥会自动识别。生成需要 HTTPS 或 localhost。</p>
    </section>
    <div class="editor-grid rsa-keys">
      <section class="editor-card"><header class="editor-header"><h2>公钥 · 加密使用</h2><div class="editor-actions"><button :disabled="!publicKey" @click="copy(publicKey)"><Copy :size="14" />复制</button><button :disabled="!publicKey" @click="download(publicKey, 'rsa-public.pem')"><Download :size="14" />下载</button></div></header>
        <CodeEditor v-model="publicKey" language="text" label="RSA 公钥" hint="粘贴完整的 PUBLIC KEY 或 RSA PUBLIC KEY PEM…" />
      </section>
      <section class="editor-card"><header class="editor-header"><h2>私钥 · 解密使用</h2><div class="editor-actions"><button :disabled="!privateKey" @click="copy(privateKey)"><Copy :size="14" />复制</button><button :disabled="!privateKey" @click="download(privateKey, 'rsa-private.pem')"><Download :size="14" />下载</button></div></header>
        <CodeEditor v-model="privateKey" language="text" label="RSA 私钥" hint="粘贴完整的 PRIVATE KEY 或 RSA PRIVATE KEY PEM…" />
      </section>
    </div>
    <section class="encoding-options" aria-label="RSA 加解密设置">
      <div class="encoding-options-row">
        <label class="indent-label">填充方式<select v-model="padding"><option value="oaep-sha256">OAEP / SHA-256（推荐）</option><option value="oaep-sha1">OAEP / SHA-1（兼容）</option><option value="pkcs1-v1_5">PKCS#1 v1.5（兼容）</option></select></label>
        <label class="indent-label">密文编码<select v-model="encoding"><option value="base64">Base64</option><option value="hex">Hex</option></select></label>
      </div>
      <p v-if="padding === 'pkcs1-v1_5'">用于兼容现有系统，例如 PHP OPENSSL_PKCS1_PADDING。新协议优先使用 OAEP。</p>
      <p v-else>OAEP 的 MGF1 与所选哈希一致，Label 为空。对接方的哈希、MGF1 与 Label 必须相同。</p>
    </section>
    <div class="action-bar"><div class="primary-actions">
      <button class="button primary" :disabled="busy" @click="transform('encrypt')"><LockKeyhole :size="16" />公钥加密</button>
      <button class="button" :disabled="busy" @click="transform('decrypt')"><UnlockKeyhole :size="16" />私钥解密</button>
      <button class="button" :disabled="!result || busy" @click="reuse">结果作为输入</button>
    </div><button class="button text-button" @click="clear"><Trash2 :size="15" />清空全部</button></div>
    <div class="editor-grid">
      <section class="editor-card"><header class="editor-header"><h2>输入 · 明文或密文</h2></header><CodeEditor v-model="input" language="text" label="RSA 输入" hint="加密时输入 UTF-8 文本，解密时输入 Base64 或 Hex 密文…" @run="transform(lastAction)" /><footer class="editor-footer"><span>{{ inputSize }} 字节（输入文本）</span><span>单块 RSA，不自动分段</span></footer></section>
      <section class="editor-card"><header class="editor-header"><h2>处理结果<span class="readonly-label">只读</span></h2><div class="editor-actions"><button :disabled="!result" @click="copy(output)"><Copy :size="14" />复制</button><button :disabled="!result" @click="download(output, 'rsa-' + lastAction + '.txt')"><Download :size="14" />下载</button></div></header><CodeEditor :model-value="output" language="text" readonly label="RSA 结果" /><footer class="editor-footer"><span>{{ result ? (lastAction === 'encrypt' ? encoding + ' 密文' : 'UTF-8 明文') : '等待操作' }}</span><span v-if="result">明文上限 {{ result.maxBytes }} 字节</span></footer></section>
    </div>
    <p v-if="error" class="rsa-error" role="alert">{{ error }}</p>
    <p class="rsa-status" role="status" aria-live="polite">{{ busy ? '正在本地处理…可清空全部以取消' : notice }}</p>
    <section class="encoding-rules"><h2>使用说明</h2><ul>
      <li>支持 2048 / 3072 / 4096 位 RSA，导入 SPKI / PKCS#1 公钥、PKCS#8 / PKCS#1 未加密私钥。暂不支持证书、OpenSSH 和带密码私钥。</li>
      <li>明文按 UTF-8 字节计算。2048 位密钥最多加密 190 字节（OAEP SHA-256）、214 字节（OAEP SHA-1）或 245 字节（PKCS#1 v1.5）。</li>
      <li>解密时忽略密文空白和换行。加密包含随机填充，同一明文每次得到不同密文是正常现象。</li>
      <li>本页提供加密与解密，不包含签名、验签或分段协议。退出页面、刷新或清空全部会丢弃当前密钥与结果。</li>
    </ul></section>
  </div>
</template>
<style scoped>
.rsa-keys{margin-bottom:18px}.rsa-keys :deep(.code-editor){height:200px}
.rsa-page>.editor-grid:not(.rsa-keys) :deep(.code-editor){height:280px}
.rsa-status{min-height:20px;color:#64748b;font-size:12px;line-height:1.8}
.rsa-error{color:#b42318;background:#fff1f0;border:1px solid #fecaca;padding:12px;border-radius:8px;font-size:13px}
.rsa-page .action-bar{flex-wrap:wrap;gap:10px}
</style>
