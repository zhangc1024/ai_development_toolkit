import { defineAsyncComponent, type Component } from 'vue'

const workbenchPage = defineAsyncComponent(() => import('./workbench/WorkbenchTool.vue'))
const encodingPage = defineAsyncComponent(() => import('./encoding/EncodingTool.vue'))

/** 新工具只需注册元信息和页面。planned 不加载组件，也不允许导航。 */
export interface ToolDefinition { id: string; name: string; description?: string; category: string; icon?: string; status: 'ready' | 'planned'; component?: Component; props?: Record<string, string> }
export const tools: ToolDefinition[] = [
  { id: 'ai-chat', name: '本地 AI 聊天', description: '连接 Ollama，多轮对话与本地会话保存', category: 'AI 工具', status: 'ready', component: defineAsyncComponent(() => import('./chat/ChatTool.vue')) },
  { id: 'prompt', name: '提示词优化', description: '整理需求，生成结构化提示词', category: 'AI 工具', status: 'ready', component: defineAsyncComponent(() => import('./prompt/PromptTool.vue')) },
  { id: 'watermark', name: '图片加水印', description: '添加文字水印，调整位置与透明度', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./watermark/WatermarkTool.vue')) },
  { id: 'image-compress', name: '图片压缩 / 格式转换', description: '压缩图片，转换 PNG、JPG、WebP', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./images/ImageCompressTool.vue')) },
  { id: 'moments-grid', name: '一图切九格', description: '裁剪九宫格，打包下载分享', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./moments-grid/MomentsGridTool.vue')) },
  { id: 'json', name: 'JSON 格式化', description: '格式化、压缩与语法校验', category: '数据处理', icon: 'braces', status: 'ready', component: defineAsyncComponent(() => import('./json/JsonTool.vue')) },
  { id: 'json-diff', name: 'JSON 结构化对比', description: '对比字段变化，定位结构差异', category: '数据处理', status: 'ready', component: defineAsyncComponent(() => import('./json-diff/JsonDiffTool.vue')) },
  { id: 'php-array', name: 'JSON ↔ PHP / Python', description: 'JSON、PHP 与 Python 数据互转', category: '数据处理', status: 'ready', component: defineAsyncComponent(() => import('./literals/LiteralTool.vue')) },
  { id: 'sql', name: 'SQL 格式化', description: '整理 SQL 缩进与关键字大小写', category: '数据处理', status: 'ready', component: workbenchPage, props: { kind: 'sql' } },
  { id: 'url', name: 'URL 编解码', description: '编码或还原 URL 与参数', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'url' } },
  { id: 'base64', name: 'Base64 编解码', description: '文本与 Base64 编码互转', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'base64' } },
  { id: 'unicode', name: 'Unicode 编解码', description: '中文与 Unicode 转义互转', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'unicode' } },
  { id: 'html-entity', name: 'HTML Entity 编解码', description: '转换 HTML 实体与特殊字符', category: '编码转换', status: 'ready', component: encodingPage, props: { kind: 'html-entity' } },
  { id: 'jwt', name: 'JWT 解析', description: '查看令牌结构与时间声明（不验签）', category: '安全与签名', status: 'ready', component: workbenchPage, props: { kind: 'jwt' } },
  { id: 'hash', name: 'MD5 / SHA 哈希', description: '计算文本摘要与哈希值', category: '安全与签名', status: 'ready', component: workbenchPage, props: { kind: 'hash' } },
  { id: 'rsa', name: 'RSA 加密 / 解密', description: '生成密钥，进行公钥加密与私钥解密', category: '安全与签名', status: 'ready', component: defineAsyncComponent(() => import('./rsa/RsaTool.vue')) },
  { id: 'hmac', name: 'HMAC 签名', description: '使用密钥计算消息签名', category: '安全与签名', status: 'ready', component: workbenchPage, props: { kind: 'hmac' } },
  { id: 'timestamp', name: '时间戳转换', description: '日期时间与秒、毫秒时间戳互转', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./timestamp/TimestampTool.vue')) },
  { id: 'regex', name: '正则表达式测试', description: '测试匹配规则，查看匹配结果', category: '数据处理', status: 'ready', component: defineAsyncComponent(() => import('./extra/ExtraTool.vue')), props: { kind: 'regex' } },
  { id: 'qrcode', name: '二维码生成', description: '将文本或链接生成二维码', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./extra/ExtraTool.vue')), props: { kind: 'qrcode' } },
  { id: 'totp', name: '2FA 工具', description: '生成 TOTP 动态验证码', category: '安全与签名', status: 'ready', component: defineAsyncComponent(() => import('./extra/ExtraTool.vue')), props: { kind: 'totp' } },
  { id: 'uuid', name: 'UUID 生成', description: '快速生成 UUID v4 标识', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'uuid' } },
  { id: 'random', name: '随机字符串生成', description: '按需生成随机字符组合', category: '常用工具', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'random' } },
  { id: 'diff', name: '文本 Diff', description: '逐行对比，快速发现文本差异', category: '文本处理', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'diff' } },
  { id: 'text', name: '文本去重 / 排序 / 去空行', description: '清理重复内容，整理文本行', category: '文本处理', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'text' } },
  { id: 'http-status', name: 'HTTP 状态码查询', description: '查询状态码含义与使用场景', category: '参考查询', status: 'ready', component: defineAsyncComponent(() => import('./productivity/ProductivityTool.vue')), props: { kind: 'http-status' } },
  { id: 'image-base64', name: '图片 ↔ Base64', description: '图片与 Base64 字符串互转', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./images/ImageTool.vue')), props: { kind: 'image-base64' } },
  { id: 'qr-reader', name: '二维码识别', description: '从图片中提取二维码内容', category: '图片工具', status: 'ready', component: defineAsyncComponent(() => import('./images/ImageTool.vue')), props: { kind: 'qr-reader' } },
]

/** 首页和侧栏共用分类顺序，新分类自动追加。 */
const categoryOrder = ['数据处理', '编码转换', '常用工具', '安全与签名', '文本处理', '图片工具', 'AI 工具', '参考查询']
export const toolCategories = [...new Set([...categoryOrder, ...tools.map(tool => tool.category)])]
