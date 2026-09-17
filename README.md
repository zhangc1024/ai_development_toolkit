# DevKit 开发工具箱

纯 Vue 3 + TypeScript + Vite 前端项目。当前实现 **JSON 格式化 / 压缩 / 校验**、**URL、Base64、Unicode、HTML Entity 编解码**，以及 **JWT 解析、MD5/SHA 哈希、HMAC、时间戳转换、SQL 格式化**。菜单可继续扩展。无需 PHP、Hyperf、数据库或 API 服务。

## 快速启动

环境：Node.js 22.12+（本次使用 22.22.2）和 npm。在 WSL Ubuntu 中执行：

```bash
cd /data/www/ai_development_toolkit
npm ci
npm run dev
```

浏览器访问 http://localhost:5173/#/json 。端口占用时以 Vite 实际输出为准。开发服务绑定所有网卡，供 Windows 访问 WSL；仅本机开发可改用 `npx vite --host 127.0.0.1`。

```bash
npm test          # 所有工具的核心逻辑与边界测试
npm run build    # TypeScript / Vue 类型检查 + 生产构建
npm run preview  # 本地预览 dist，默认 4173
```

依赖随构建打包，不引用在线字体、外部脚本或转换接口。开发安装依赖需要网络；静态工具的输入只在浏览器内存和本地 Worker 之间传递；提示词优化启用 Ollama 后会发送到用户配置的本机或内网服务。

## 图片工具

新增图片 ↔ Base64 与本地二维码识别，支持选择、拖放和粘贴图片。详见 [IMAGE_TOOLS.md](docs/IMAGE_TOOLS.md)。

## JSON、PHP 与 Python 互转

已启用 JSON ↔ PHP Array ↔ Python 字典/列表六方向转换，详见 [LITERAL_CONVERTER.md](docs/LITERAL_CONVERTER.md)。只解析数据字面量，不执行程序。

## UUID、文本与参考查询

已实现 UUID v4、随机字符串、文本 Diff、按行去重/排序/去空行、HTTP 状态码查询。详见 [PRODUCTIVITY_TOOLS.md](docs/PRODUCTIVITY_TOOLS.md)。

## 新增工具

- 正则表达式测试、二维码 PNG 生成、TOTP 2FA 动态验证码。
- 详细功能、限制与桌面复用说明见 [EXTRA_TOOLS.md](docs/EXTRA_TOOLS.md)。

## 已实现

- 左侧分类菜单、名称搜索、菜单收起与展开；Hash 地址 `#/json`。
- 四种文本编码工具：独立地址、编码/解码、模式说明、结果作为输入、文本导入和下载。
- URL 区分参数、完整 URL 和表单单值；Base64 支持 Base64URL；Unicode 支持代理对；HTML 实体始终按文本展示。
- JWT 查看 Header/Payload/签名段与时间声明，始终标明未验签。
- 哈希与 HMAC：MD5/SHA-1/SHA-256/SHA-512，独立消息/密钥编码，Hex/Base64 输出。
- 时间戳：秒/毫秒、明确时区、日期互转、当前时间、夏令时歧义提示。
- SQL：MySQL、缩进、关键字大小写、语法高亮和下载，不执行语句。
- JSON 格式化：2 空格、4 空格、Tab。
- 压缩：移除字符串之外的空白；保留大整数、小数表示、转义和键顺序。
- 严格语法校验：拒绝注释、尾逗号等；中文错误提示及行列定位。
- 双栏编辑器：语法高亮、行号、搜索、折叠、自动换行，输出只读。
- 导入 UTF-8 文件、加载示例、清空、复制、下载 `result.json`。
- 1 MiB 输入限制、128 层嵌套限制、Worker 5 秒超时保护。
- 响应式布局；刷新不保存输入或结果。

菜单里的“待开发”只是预留项，不可点击，未伪装成已完成工具。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [编码工具说明](docs/ENCODING_TOOLS.md) | URL/Base64/Unicode/HTML Entity 的模式、示例、错误与限制 |
| [JSON 功能说明](docs/JSON_TOOL.md) | 每个操作的输入、输出、边界和验收方法 |
| [JWT/哈希/HMAC](docs/SECURITY_TOOLS.md) | 信任边界、字节编码、密钥与签名规则 |
| [时间戳说明](docs/TIMESTAMP_TOOL.md) | 秒/毫秒、时区、日期格式及夏令时 |
| [SQL 格式化说明](docs/SQL_TOOL.md) | MySQL、格式选项与支持边界 |
| [工具箱功能规划](docs/FEATURES.md) | 原始 19 项功能的具体范围、实施状态与优先级 |
| [开发与扩展](docs/DEVELOPMENT.md) | 目录、数据流、新工具接入、静态部署、验证 |
| [Windows 桌面端规划](docs/DESKTOP.md) | 可复用部分、平台适配点、打包阶段工作与风险 |
| [本次验证记录](docs/VERIFICATION.md) | 自动化与浏览器检查结果、未验证内容 |

## 静态部署

上传 `dist/` 的全部内容至静态托管或对象存储/CDN。资源路径为相对路径，路由使用 Hash，无需后端路由回退。

必须通过 HTTP(S) 提供网页，不要双击 `dist/index.html`：模块脚本和 Worker 在 `file://` 环境下可能被阻止。线上使用 HTTPS，保证剪贴板等浏览器能力可用。

## 当前边界

不含账号、数据库、埋点、云同步、JSON Schema、JSON 修复、JSONPath、键排序、桌面安装包或 PWA 离线缓存。纯静态不代表冷启动可离线；后续桌面端将资源随应用打包。

原目录中的 Hyperf 模板 README 已完整保存在 [历史模板](docs/archive/HYPERF_README.md)，仅为保留原有文件内容，不是本项目运行要求。

2FA 支持选择、拖放或粘贴二维码图片，导入 TOTP 配置或纯 Base32 密钥。详见 [EXTRA_TOOLS.md](docs/EXTRA_TOOLS.md)。

新增 [JSON 结构化对比](docs/JSON_DIFF.md)：对象字段无序匹配，编辑器原文标红，差异列表与双侧定位。

## RSA 加密 / 解密

新增本地 RSA 公私钥生成、公钥加密、私钥解密，支持 OAEP SHA-256 / SHA-1 与 PKCS#1 v1.5、Base64 / Hex 密文。入口为安全与签名 → RSA 加密 / 解密（`#/rsa`）。详见 [RSA_TOOL.md](docs/RSA_TOOL.md)。

## 图片压缩与格式转换

新增四档压缩和原格式 / WebP / PNG / JPG 转换，支持本地图片选择、拖放、粘贴、体积统计、滑块对比与下载。入口为图片工具 → 图片压缩 / 格式转换（`#/image-compress`）。规则、保真边界与依赖许可见 [IMAGE_COMPRESSION.md](docs/IMAGE_COMPRESSION.md)。

图片压缩现支持 ZIP 批量处理：解包后处理图片，保留目录和其他文件，提供结果 ZIP 下载。限制和规则见 [ZIP_IMAGE_PROCESSING.md](docs/ZIP_IMAGE_PROCESSING.md)。

## 提示词优化

入口为 AI 工具 → 提示词优化（`#/prompt`）。支持十类静态模板、自动分类、可选本机/内网 Ollama、模型列表、取消与自动降级。仅保存配置，不保存提示词或结果。详见 [使用说明](docs/PROMPT_OPTIMIZER.md) 和 [实现与验证记录](docs/PROMPT_OPTIMIZER_PROGRESS.md)。
