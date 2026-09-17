import { defineAsyncComponent, type Component } from 'vue'

const workbenchPage = defineAsyncComponent(() => import('./workbench/WorkbenchTool.vue'))
const encodingPage = defineAsyncComponent(() => import('./encoding/EncodingTool.vue'))

/** 新工具只需注册元信息和页面。planned 不加载组件，也不允许导航。 */
export interface ToolDefinition { id: string; name: string; description?: string; category: string; icon?: string; status: 'ready' | 'planned'; component?: Component; props?: Record<string, string> }
export const tools: ToolDefinition[] = [
  { id: 'prompt', name: '提示词优化', category: 'AI 工具', status: 'ready', component: defineAsyncComponent(() => import('./prompt/PromptTool.vue')) },
  { id: 'image-compress', name: '图片压缩 / 格式转换', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./images/ImageCompressTool.vue')) },
  { id: 'json-diff', name: 'JSON 结构化对比', category: '数据处理', status: 'ready', component: defineAsyncComponent(() => import('./json-diff/JsonDiffTool.vue')) },
  { id: 'json', name: 'JSON 格式化', description: '格式化 / 压缩 / 校验', category: '数据处理', icon: 'braces', status: 'ready', component: defineAsyncComponent(() => import('./json/JsonTool.vue')) },
  { id: 'php-array', name: 'JSON ↔ PHP / Python', category: '数据处理', status: 'ready', component: defineAsyncComponent(() => import('./literals/LiteralTool.vue')) },
  { id: 'sql', name: 'SQL 格式化', category: '数据处理', status: 'ready', component: workbenchPage, props: { kind: 'sql' } },
  { id: 'url', name: 'URL 编解码', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'url' } },
  { id: 'base64', name: 'Base64 编解码', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'base64' } },
  { id: 'unicode', name: 'Unicode 编解码', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'unicode' } },
  { id: 'html-entity', name: 'HTML Entity 编解码', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'html-entity' } },
  { id: 'jwt', name: 'JWT 解析', category: '安全与签名', status: 'ready', component: workbenchPage, props: { kind: 'jwt' } },
  { id: 'hash', name: 'MD5 / SHA 哈希', category: '安全与签名', status: 'ready', component: workbenchPage, props: { kind: 'hash' } },
  { id: 'rsa', name: 'RSA 加密 / 解密', category: '安全与签名', status: 'ready', component: defineAsyncComponent(() => import('./rsa/RsaTool.vue')) },
  { id: 'hmac', name: 'HMAC 签名', category: '安全与签名', status: 'ready', component: workbenchPage, props: { kind: 'hmac' } },
  { id: 'timestamp', name: '时间戳转换', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./timestamp/TimestampTool.vue')) },
  { id: 'regex', name: '正则表达式测试', category: '数据处理', status: 'ready', component: defineAsyncComponent(() => import('./extra/ExtraTool.vue')), props: { kind: 'regex' } },
  { id: 'qrcode', name: '二维码生成', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./extra/ExtraTool.vue')), props: { kind: 'qrcode' } },
  { id: 'totp', name: '2FA 工具', category: '安全与签名', status: 'ready', component: defineAsyncComponent(() => import('./extra/ExtraTool.vue')), props: { kind: 'totp' } },
  { id: 'uuid', name: 'UUID 生成', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'uuid' } },
  { id: 'random', name: '随机字符串生成', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'random' } },
  { id: 'diff', name: '文本 Diff', category: '文本处理', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'diff' } },
  { id: 'text', name: '文本去重 / 排序 / 去空行', category: '文本处理', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'text' } },
  { id: 'http-status', name: 'HTTP 状态码查询', category: '参考查询', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'http-status' } },
  { id: 'image-base64', name: '图片 ↔ Base64', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./images/ImageTool.vue')), props: { kind: 'image-base64' } },
  { id: 'qr-reader', name: '二维码识别', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./images/ImageTool.vue')), props: { kind: 'qr-reader' } },
]
