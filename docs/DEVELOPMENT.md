# 开发、扩展与部署

## 1. 技术结构

Vue 3 Composition API + TypeScript，Vite 构建，CodeMirror 编辑器，jsonc-parser 做严格语法检查与 token/空白处理，entities 提供 HTML 实体表，Vitest 验证纯逻辑。

```text
src/
  main.ts                      应用启动
  App.vue                      菜单、独立路径与公共外壳
  style.css                    全局样式与响应式规则
  components/CodeEditor.vue    编辑器生命周期、搜索、折叠、跳转
  platform/browser.ts          剪贴板和文件下载
  tools/registry.ts            工具元信息与懒加载注册表
  tools/json/
    JsonTool.vue               JSON 工作区与操作状态
    core.ts                    无 DOM 的纯处理函数
    json.worker.ts             Worker 消息入口
  tools/encoding/
    EncodingTool.vue           四种编码工具共用工作区
    config.ts                  模式、示例、页面规则
    core.ts                    无 DOM 的编码/解码纯函数
    encoding.worker.ts         编码 Worker 入口
tests/encoding.test.ts          编码标准向量、往返和边界
tests/json.test.ts              语法和无损边界用例
docs/                          功能与开发说明
```

## 2. 数据流

用户输入 → 选择操作 → 检查输入容量 → 创建 Worker → 严格校验 → 转换原始 token/空白 → 回传结果 → 显示只读输出 → 用户主动复制或下载。

错误、超时、输入变更或组件卸载都会终止线程。每次使用新 Worker，旧结果不能覆盖新内容。导入文件使用版本标记处理异步竞争。

输入、结果、错误仅放 Vue 内存状态；Worker 只收当前任务，不联网。平台层只在用户点击时访问剪贴板或下载。

## 3. 为什么不 JSON.parse 后 JSON.stringify

这种方式可能先把大整数转换为无法精确表示的 Number，并改变小数/指数/转义表示。当前解析树只用于语法检查与根类型；输出基于原始 token 或格式化空白编辑。

jsonc-parser 名字包含 JSONC，但本项目明确设置 disallowComments=true、allowTrailingComma=false。调用方必须检查错误列表，不能因为解析器返回树就认定合法。

官方参考：[jsonc-parser](https://github.com/microsoft/node-jsonc-parser)、[Vue](https://vuejs.org/)、[Vite](https://vite.dev/)、[CodeMirror](https://codemirror.net/)。

## 4. 增加一个工具

例如后续接入时间戳：

1. 创建独立页面与纯函数模块，在 registry.ts 中将条目改为 ready，增加 defineAsyncComponent 懒加载组件。
2. 可选 props 字段传递固定的页面配置；现有四种编码页面共用 EncodingTool.vue，通过 kind 区分。
3. 元信息包含唯一 id、中文 name、category、status。菜单按注册表自动生成，页面地址为 /tools/{id}/，旧 #/{id} 地址保持兼容。
4. App.vue 使用 active.id 作为组件 key，保证同一页面组件的不同工具实例不会共享旧输入或运行中的任务。
5. 核心函数不依赖 DOM、Vue、文件系统；系统能力放 platform。编码工作区默认纯文本编辑器，不套用 JSON 语法。
6. 耗时处理用 Worker，限制容量和时间；补充规则文档与边界测试。

当前使用 History API 支持独立工具页与未知地址提示，暂不引入路由库。窄屏菜单横向滚动，桌面菜单纵向滚动，避免新增工具后菜单被截断。

## 5. 开发与验证

推荐 Node 22.12+，提交 package-lock.json。正常安装使用 npm ci，保持依赖一致。不要提交 node_modules、dist、浏览器截图缓存。

```bash
npm ci
npm test
npm run build
npm run preview
git diff --check
```

Vitest 检查无损转换、严格拒绝、根值、缩进、错误定位、容量与深度。界面验证清单见 JSON_TOOL.md；具体本次执行结果见 VERIFICATION.md。

编辑器相关细节：CodeMirror 实例在 onMounted 创建、onBeforeUnmount 销毁；外部值相同不重复写回；自动换行使用 Compartment 切换，不重建整个编辑器。

## 6. 静态/CDN 部署

`npm run build` 自动生成静态页面与 dist。必须上传整个 dist，包括所有工具目录、sitemap.xml、robots.txt、404.html 和 assets。详见 [SEO_DEPLOYMENT.md](SEO_DEPLOYMENT.md)。

- `base: '/'` 使用根路径资源，当前部署目标是域名根目录。
- 工具目录直接提供静态 HTML；未知路径返回真实 404，不统一回退首页。
- index.html 建议短缓存/重新验证；带内容哈希的 assets 可长缓存。
- 发布时先上传新资源再更新 HTML，保留旧资源一段时间，避免旧页面动态加载失败。
- JS 和 Worker 正确返回 JavaScript MIME；不要把缺失 JS 资源改写成 HTML。
- 线上 HTTPS；file:// 双击运行不属于支持方式。
- 当前没有 Service Worker，不承诺网页冷启动离线。
- 如配置 CSP，应允许同源脚本和 Worker；CodeMirror 动态样式需要实际验证，不能直接套用禁止所有内联样式的规则。

## 7. 手动调试

打开浏览器 Network 面板，执行转换应只有初次加载 Worker 脚本，不出现输入内容的 HTTP 请求。生产构建检查更准确，开发服务还有热更新 WebSocket。

复制失败优先检查 HTTPS/localhost、权限和浏览器策略；Worker 失败检查资源路径、MIME 与 CSP；静态部署刷新出错检查是否完整上传 dist。

## 8. 编码工具实现约定

详见 ENCODING_TOOLS.md。模式与方向由页面明确传给 core.ts，禁止根据输入猜测并静默切换。

HTML 通过 entities 的纯字符串 API 解码，不用 innerHTML/DOMParser。Base64 通过 UTF-8 字节转换，禁止直接 btoa 中文。Unicode 使用扫描过程逐层还原，不执行 eval。URL 调用平台 URI 函数并区分表单值语义。

CodeEditor 的 language 默认为 json；text 模式不加载 JSON 语言扩展，并明确以 LF 分行，保留导入文本里的 CR 字符用于精确转换。浏览器手动输入/粘贴仍受平台输入行为影响。

downloadText 增加可选 MIME 参数，默认仍为 application/json;charset=utf-8，编码工作区传入 text/plain;charset=utf-8。

编码测试命令：npm test。生产构建必须包含 encoding.worker 文件。依赖随静态产物分发，无在线实体表查询。

## 9. JWT / 密码学 / 时间 / SQL 模块

- security/bytes.ts：消息和密钥的 UTF-8/Hex/Base64 字节处理，容量限制。
- security/crypto.ts：通过 @noble/hashes 实现 MD5、SHA 与 HMAC。Node crypto 仅作为测试中的独立对照。
- security/jwt.ts：严格分段、未验签展示、原文 JSON 格式化与时间声明。
- sql/core.ts：sql-formatter 的 MySQL 封装。
- workbench/WorkbenchTool.vue：四个工具共用编辑器、模式、文件/剪贴板与状态；按 kind 配置。
- workbench/workbench.worker.ts：按 kind 动态加载所需算法，防止每种操作都加载 SQL 格式化器。
- timestamp/core.ts：使用 Luxon 和运行环境 Intl 做时区转换；BigInt 精确处理秒转毫秒。
- timestamp/TimestampTool.vue：日期输入、设备时钟、结构化结果及复制。
- tests/workbench.test.ts：独立哈希/HMAC 对照、JWT、时区/DST、SQL 边界。

Vite 的 worker.format 设为 es，支持模块 Worker 动态导入。所有页面都使用 type=module Worker；静态部署必须完整发布 assets 下的入口和依赖分块。

新增导入不改变默认 JSON 语言模式。CodeEditor 新增 sql 模式使用 MySQL 高亮；纯文本模式继续保留 CR 字符。

密钥只在当前页面和本地 Worker 使用，不写入工具注册表、持久化存储或结果下载；退出/清空时清除页面状态。不承诺 JavaScript 字符串内存物理销毁。

生产上线前复测：所有 Worker 分块 MIME/相对路径、CSP、纯静态环境加载、时区兼容性。当前不引入服务端或原生依赖。

开发环境注意：Worker 的动态依赖也列入 Vite 的 optimizeDeps.include，避免首次使用工具时重新优化依赖导致整页刷新；新增动态库时同步检查此配置。生产 Worker 使用 ES 格式以支持拆分资源。

## UUID、随机、文本及 HTTP 模块

新增 productivity 模块；文本操作通过 text.worker.ts 执行，Diff 库只进入 Worker 构建。随机生成使用 Web Crypto 和拒绝采样。HTTP 数据本地维护，不请求 API。模块、容量限制和桌面复用约定见 [PRODUCTIVITY_TOOLS.md](PRODUCTIVITY_TOOLS.md)。

## 提示词优化模块

提示词优化是可选网络能力：静态模式仍不联网，Ollama 模式只访问用户配置的服务；配置可持久化，正文与结果不持久化。模块、取消/降级边界、部署与验证见 [PROMPT_OPTIMIZER.md](PROMPT_OPTIMIZER.md)。
