# Windows 桌面版验证记录（P0–P6）

验证日期：2026-11-02（Asia/Shanghai）。本文件保留 P0/P1 历史。最新 P2–P6 内测交付与验收见 [WINDOWS_DESKTOP_RELEASE.md](WINDOWS_DESKTOP_RELEASE.md)，普通 RAW 缺口已补齐；人工/物理环境剩余项见该记录。

## 结论

Windows 原生 checkout、两侧独立依赖、现有测试/构建基线和自生成样本已建立。WSL 测试全通过；Windows 有 6 项既有聊天测试失败，原因见下文。真实 HEIC、普通 RAW、Nikon HE/HE★ 样本尚缺，P0 样本清单不能全部勾选；进入 P1 的真实解码验收前需补齐。

## 源码和改动保护

起始 HEAD：`10e95724b61d8c6fe6217a5cd888935df6b10e90`。

开始时 `git status --short`：

~~~text
 M docs/DESKTOP.md
?? docs/WINDOWS_DESKTOP_PLAN.md
~~~

上述既有改动已保留。本阶段仅增加本记录和样本脚本，并增量更新方案状态/P0 勾选；未修改业务代码、package.json 或锁文件，未提交、推送或安装 Electron。

已逐项核对 `src/tools/registry.ts` 中 8 个 `图片工具` 条目，均为 ready，组件入口与方案 1.1 一致：

| ID | 入口 | props |
| --- | --- | --- |
| image-base64 | images/ImageTool.vue | kind: image-base64 |
| qr-reader | images/ImageTool.vue | kind: qr-reader |
| watermark | watermark/WatermarkTool.vue | 无 |
| image-stitch | image-stitch/ImageStitchTool.vue | 无 |
| moments-grid | moments-grid/MomentsGridTool.vue | 无 |
| double-exposure | double-exposure/DoubleExposureTool.vue | 无 |
| image-compress | images/ImageCompressTool.vue | 无 |
| photo-frame | photo-frame/PhotoFrameTool.vue | 无 |

ZIP 为压缩工具内功能；二维码生成不在图片工具范围。

## 实际环境

| 项目 | WSL | Windows 原生 |
| --- | --- | --- |
| 系统 | Ubuntu 22.04.5 LTS；Linux 6.18.33.1-microsoft-standard-WSL2 | Windows 11，系统报告 10.0.26200.9711 |
| Node | v22.22.2 | v24.13.0 |
| npm | 10.9.7 | 11.6.2 |
| 源码目录 | /data/www/ai_development_toolkit | 见下方本地路径 |
| 依赖安装 | npm ci | npm ci |
| Electron / electron-builder | 未安装，P1 再选型验证 | 未安装 |

Windows checkout 位于当前已授权的本地磁盘工作目录：

~~~text
C:\Users\Administrator\.codex\visualizations\2026\11\01\01a19809-3216-7fa3-a669-40a9309dcb7e\windows-desktop-p0
~~~

此路径是本次验证工作目录，不是发布路径。通过 Windows Git 执行以下命令克隆，HEAD 与 WSL 一致；两个目录各有自己的 node_modules，没有跨平台共用。文档及新样本脚本另行同步，不能依赖 clone 同步未提交文件。

~~~sh
git clone --no-hardlinks //wsl.localhost/Ubuntu/data/www/ai_development_toolkit windows-desktop-p0
~~~

Windows Git 的 `core.autocrlf=true`，允许文本行尾差异。基线两侧 Node 主版本不同，不将测试差异直接归因为 Windows 系统。

默认命令执行器曾报 `CreateProcessSecurityEnvironment failed (0x80070001)`；使用经审批的进程执行后可运行 WSL 和 Windows 命令。WSL 未安装 rg，本次使用 find/sed/cat，未为此安装系统工具。

## 检查结果和复现

在各自 checkout 根目录依次执行；测试失败时仍单独运行 build：

~~~sh
npm ci
npm test
npm run build
node scripts/desktop-p0-fixtures.mjs
npm ls --depth=0
~~~

| 检查 | WSL | Windows |
| --- | --- | --- |
| 按锁文件安装 | 通过，新增 156 packages | 通过，新增 155 packages |
| npm test | 35 文件、739 项通过 | 34 文件通过、1 文件失败；733 项通过、6 项失败 |
| 类型检查 + Vite build | 通过，Vite 构建约 8.91s | 通过，Vite 构建约 8.99s |
| 静态预渲染 | 36 pages + 404，通过 | 36 pages + 404，通过 |
| 生成样本和 ZIP 全条目 CRC | 通过 | 通过 |
| 两侧样本 manifest（含 SHA-256）比较 | 完全一致 | 完全一致 |

安装包数量差异属于平台可选依赖差异，未修改锁文件。WSL npm ci 报告 5 个依赖漏洞（2 moderate、3 high），未执行 audit fix；这不是桌面安全验收结论，后续依赖选型时另行复核。

### Windows 既有失败

失败文件：`tests/chat-interactions.test.ts`，6 项均在第 34 行测试 harness 初始化时抛出：

~~~text
SyntaxError: Arg string terminates parameters early
~~~

测试使用 `import * as vue from 'vue'`，把 Vue 全部导出名展开进 env，再将 `Object.keys(env)` 传给 `new Function` 作为形参。在 Windows Node v24.13.0 下单独导入 Vue，确认存在非合法形参名 `module.exports`，可解释此错误；WSL Node v22.22.2 下该测试通过。这是现有测试 harness 的 Node 版本兼容问题，本阶段记录失败，不改动聊天逻辑或测试。尚未用相同 Node 主版本进行两平台对照，也不能据此宣称 Windows 所有测试通过。

### 日志位置

WSL：`output/desktop-p0/` 下的 wsl-install.log、wsl-test.log、wsl-build.log、wsl-versions.log、fixtures.log。

Windows：独立 checkout 的 `output/desktop-p0/` 下的 windows-install.log、windows-test.log、windows-build.log、windows-versions.log、fixtures.log。

Windows 日志另复制到 WSL 的 `output/desktop-p0/` 便于集中查阅。output 已被 Git 忽略；本记录保留结果摘要，日志和二进制样本不进入发布资源。

## 样本来源、权限和校验

脚本：`scripts/desktop-p0-fixtures.mjs`；输出：两侧各自的 `output/desktop-p0/samples/`。只使用已有锁定依赖和 Node 标准库，无新增依赖、联网下载或用户照片。色块为计算生成；二维码文字为 `DevKit P0 本地测试 https://example.com/desktop-p0`，不含真实账户或私有链接。

这些自生成测试内容允许随本项目测试、修改和分发；不借此对任何第三方照片作授权声明。manifest.json 记录文件名、大小、完整 SHA-256、用途、来源和使用权限；ZIP 时间固定以便复现。两侧均执行脚本，manifest 字节完全一致。

| 文件 | 覆盖范围 | 验证 |
| --- | --- | --- |
| 色块 中文.png | 320×200、中文与空格文件名 | PNG 签名/尺寸 |
| 色块 中文.jpg | 320×200、真实 JPEG 编码 | JPEG 签名/尺寸 |
| 色块 中文.webp | 320×200、真实 WebP 编码 | RIFF/VP8 签名/尺寸 |
| 透明 半透明.png | alpha=0/128 | RGBA PNG，像素由脚本定义 |
| 方向-6.jpg | JPEG APP1 EXIF Orientation=6 | 存储 320×200；预期显示 200×320 |
| 二维码.png | 中文文本及保留示例域名 | PNG 246×246；待 UI 识别 |
| 混合样本.zip | 三种真实图片、UTF-8 文本、故意损坏 PNG | 5 条目，逐项读取并校验 CRC |

已使用 WSL `file` 核对上述文件类型和尺寸。方向、透明、二维码的实际 UI 行为、各工具导出后外部查看仍属于后续工具验收，样本生成不代表这些流程已通过。当前几何样本体积小，不用于大图性能或内存结论。

### 缺失的真实格式样本

| 类别 | 当前状态 | 补齐要求 |
| --- | --- | --- |
| HEIC | 缺少真实文件 | 无隐私、允许测试使用；记录拍摄/来源及方向、预期尺寸 |
| 普通 NEF/ARW | 缺少真实文件 | 可完整解码的普通 RAW，记录机型/压缩方式 |
| Nikon HE | 缺少真实文件 | 明确压缩方式，验证照片边框内嵌 JPEG 降级与压缩工具拒绝策略 |
| Nikon HE★ | 缺少真实文件 | 同上，不以 HE 样本代替 HE★ |
| 无有效内嵌预览 RAW | 尚未收集 | 后续验证明确失败，不输出彩条 |

仓库 output 中已有以 NEF 命名的 PNG 截图，不能代替原始 RAW。现有单元测试中的合成元数据也不能代替实际解码样本。未下载来源/授权不明的照片。补充真实样本时需登记文件名、SHA-256、格式/压缩方式、机型、预期结果、来源和授权，排除人像、GPS、序列号等隐私信息。

## 下一阶段前的明确边界

P0 已完成环境和可重复基线交付，但完整样本收集仍待补齐，Windows 既有 6 项测试失败已有记录。P1 必须以真实样本验证 Worker、WASM、RAW 和断网生产目录包，不可用本次 Web build 或合成图片替代。P0 结束时尚未创建桌面入口、协议、IPC 或安装包。

## P1：最小 Electron 与生产资源验证（2026-11-02）

### 状态与范围

P1 技术原型已实现，Windows 开发模式和 ASAR 生产目录包的可执行检查通过。**P1 完整验收仍未关闭：缺少普通 NEF/ARW，无法证明普通 RAW 原始像素的完整解码。** 用户已确认没有其他 NEF，本阶段停止在此门槛，不推进 P2，不以 HE★ 内嵌 JPEG 结果替代完整 RAW。

本阶段仅接入图片 ↔ Base64 和原型兼容性诊断；没有全量工具入口、原生保存 IPC、NSIS 安装包或签名。Web 入口与既有图片算法未改动。

### 新增实现

- `electron/main.cjs`：原生标题栏单窗口；显式禁用 Node 集成，开启 contextIsolation、sandbox、webSecurity；拒绝权限、webview、新窗口和非预期导航。
- `electron/preload.cjs`：只暴露冻结的 Electron/Chromium/平台信息，无通用 IPC、文件路径读取或 Node 对象。
- `electron/protocol.cjs`：本地 `app://bundle/` 资源；限制 host、方法、路由及资源根目录；检查编码、路径穿越与符号链接；返回 MIME、COOP、COEP、CORP、CSP；缺失模块不回退 HTML。
- `desktop.html`、`src/desktop/`、`vite.desktop.config.ts`：独立 Vue 桌面入口和输出目录，复用一个现有工具；诊断中运行真实 Worker/WASM，用户文件只在内存处理。读取前保留 100 MiB 限制，解码沿用 6400 万像素等既有约束。
- `scripts/desktop-dev.mjs`：Vite 仅监听 127.0.0.1:5179，strictPort；就绪后启动 Electron；退出/信号时清理子进程及服务器。桌面开发路由使用桌面 HTML，提前优化 exifr 防止首次诊断触发重载。
- `electron-builder.yml`：Windows x64 目录包，ASAR、包内容白名单、禁止发布；当前名称/appId/图标/签名仅为原型配置，正式发行由 P6 处理。
- `tests/desktop-protocol.cjs`、`scripts/desktop-smoke.mjs`：协议边界测试及真实 Windows Electron 自动验证，未引入 Playwright Test 框架。

### 实际版本与依赖

| 项目 | 锁定/实测 |
| --- | --- |
| Electron | 45.2.1 |
| 运行时 Chromium | 156.0.8078.75 |
| Electron 内置 Node | 24.22.1 |
| electron-builder | 26.18.0 |
| playwright-core | 1.64.1（仅开发验证，不下载浏览器） |
| Windows 构建 Node/npm | v24.13.0 / 11.6.2 |
| WSL Node/npm | v22.22.2 / 10.9.7 |

提交范围内更新 package.json 和 package-lock.json；尚未创建 Git 提交。WSL 安装时设置 ELECTRON_SKIP_BINARY_DOWNLOAD=1，避免安装 Linux Electron 二进制；Windows 在独立 checkout 中 npm ci，使用原生 Windows Electron。新增构建依赖使锁文件中 @types/node 从 22.20.3 变为 24.19.2、undici-types 从 6.21.0 变为 7.24.6；既有业务依赖版本没有变化。

版本和协议能力参考 [Electron 45.2.1 官方发布记录](https://releases.electronjs.org/release/v45.2.1)、[protocol 官方文档](https://www.electronjs.org/docs/latest/api/protocol)、[electron-builder v26 配置](https://www.electron.build/v26/docs/configuration/)，最终结论以本机运行结果为准。

### CSP 实测与兼容处理

首次严格 CSP 验证发现，现有 LibRaw 1.6.0 的 Embind JavaScript 绑定含 `new Function`，在实例化时被拒绝。这不是缺少 WASM 文件，也不能靠仅加入 wasm-unsafe-eval 解决。

保留原厂 JS/WASM 与既有 Web 行为；桌面增加独立 `raw-probe.worker`。仅此 Worker 的入口响应允许 unsafe-eval，用于固定的本地 Embind 动态绑定。页面、通用编解码 Worker 仍禁止 unsafe-eval，资源来源仍限 self，Worker 没有 Node 或任意文件访问能力。生产协议按固定 Worker 文件名前缀及构建哈希精确匹配，开发模式仅匹配对应源码路径，9 项协议测试包含例外范围检查。后续若迁移其他 RAW 工具，需要沿用明确 Worker 边界或另行使用无需动态绑定的构建，不能笼统放开整个应用 CSP。

实测由应用脚本自身和普通 Worker 执行 new Function 均被 CSP 拒绝，专用 RAW Worker 能实例化并处理样本。没有通过关闭 webSecurity、sandbox 或跨源隔离规避问题。

### 执行命令

WSL（项目根目录）：

~~~sh
npm test
npm run build
npm run desktop:test
npm run desktop:build
~~~

Windows 独立 checkout（本记录 P0 路径）：

~~~bat
npm ci
npm run desktop:test
npm run desktop:dev
npm run desktop:build
npm run desktop:preview
npm run desktop:pack
set DESKTOP_SAMPLE_DIR=D:\test
npm run desktop:smoke -- --dev
npm run desktop:smoke -- release/win-unpacked/DevKitImages.exe
npm test
~~~

其中 desktop:dev/preview 是人工使用入口；自动检查使用相同桌面配置分别启动开发服务器或生产 exe。目录包测试不启动 Vite。打包命令含 --publish never，不生成安装器。包内保留整个 win-unpacked 目录，不能只复制 exe。开发服务器只允许固定本机来源；打包后忽略开发 URL 参数，不接受环境变量指定远程页面。

### 最终检查结果

| 检查 | 结果 |
| --- | --- |
| WSL 原测试 | 35 文件、739 项全部通过 |
| WSL Web build | 类型检查、Vite、36 pages + 404 预渲染通过 |
| WSL 桌面 build | 通过，不执行网站预渲染 |
| 协议测试 | WSL 9/9 通过；Windows 8 通过、1 跳过（创建符号链接需独立权限） |
| Windows 原测试 | 733 通过、6 失败，仍为 P0 的聊天 harness / Node 版本兼容问题 |
| Windows desktop:pack | x64、ASAR 目录包成功 |
| 原生开发自动检查 | 通过，真实 HEIC、HE★ 拒绝/兼容预览、PNG 回读 |
| 生产目录包自动检查 | 通过，同上；ordinaryRawDecoded=false 单独标记 |
| 页面与必要 Worker | crossOriginIsolated=true；SharedArrayBuffer 为 function |
| 模块及 WASM | Worker 动态 import、LibRaw 实例化、HEIC 解码、AVIF 编码与 4×4 回读通过 |
| 本地素材 | Nikon SVG 加载通过；ASAR 包含 LOGO、LibRaw WASM、许可证及来源说明 |
| 路由 | 工具路径刷新、前进/后退通过；未知工具及资源 404 |
| 边界 | 编码路径穿越 403；页面无 require/process；新窗口/外部导航拒绝；远程 fetch 拒绝 |
| Base64 | 选入 P0 中文名 PNG 后，编码与原文件字节一致 |
| 截图 | 已检查 Windows 页面截图，中文、布局和几何测试图正常；不代表 DPI/安装验收 |

ASAR 清单共 66 个文件/目录条目（本次构建），无 node_modules、src、tests 或用户测试照片。原生 exe 使用系统标题栏，Playwright 截图记录的是页面内容。

生产冷启动测试关闭 HTTP 缓存、将 DNS 映射为不可解析、使用不可连接的本机代理；应用本身从启动起拒绝外部网络请求，随后还设置 Chromium 离线模式并重载。整个过程只加载包内 app:// 资源，无 Vite。此为受控离线条件，不声称已物理断开 Windows 网卡；首次安装到无 Node/WSL 的机器属于 P6。

### 用户授权的真实样本

来源为用户提供的 D:\test，明确授权本机测试。未检查照片隐私，也未取得公开分发授权；不复制到仓库、public 或安装包。诊断结果只记录尺寸、格式、兼容策略和编码大小，不输出 GPS、序列号、完整 EXIF 或像素内容。生成的 PNG 在 Worker 内完成并回读，未使用原生保存（该能力属于 P3）。

| 文件 | SHA-256 | 实际结果（开发与目录包均一致） |
| --- | --- | --- |
| CHZ_0117.NEF | c0d7e71751bf894e9facfc61593960e749f19d680aea1b80cf72c364d71fcc97 | Nikon Z50II HE★；严格解码明确拒绝；显式兼容预览生成并回读 5568×3712 PNG |
| CHZ_0120.NEF | ef63ec1446a2694ac0cfbb52438e566482093c759541c61fb493baf66d67c75c | 同为 HE★；拒绝/兼容预览符合既有策略，PNG 5568×3712 |
| IMG_2930.HEIC | 79dddf71cf2d199573d2410655391f1ae5b74c2db81b2284b68ec6b2067a100d | 真实 HEIC 解码并生成 PNG，回读尺寸 3024×4032 |

Nikon HE、普通无损 NEF/ARW、无有效内嵌 JPEG 的真实 RAW 仍缺样本。两张 HE★ 不计作完整 RAW 解码成功，也不能覆盖 HE。既有 RAW 单元测试仍通过，但不能替代这些真实输入。

### 验证中发现并解决的问题

- LibRaw 动态绑定与严格 CSP 冲突：采用仅限专用 RAW Worker 的例外，保持页面严格策略。
- 开发模式首次加载 exifr 会触发预编译重载：桌面配置提前 include exifr，复测通过。
- 调试协议直接求值可绕过 CSP，导致原 CSP 断言失真：改由页面自身事件处理代码执行探测。
- Playwright 等待被拒绝的导航可能拖住后续 locator：将该独立边界检查放在流程最后；应用导航拦截逻辑保持不变。
- 曾有一次 Electron 调试连接超时，重试后最终两模式自动检查通过；未作长时间稳定性结论，P5 仍需压力/生命周期验收。

### 产物和日志

Windows 原型入口（本机本地目录）：

~~~text
C:\Users\Administrator\.codex\visualizations\2026\11\01\01a19809-3216-7fa3-a669-40a9309dcb7e\windows-desktop-p0\release\win-unpacked\DevKitImages.exe
~~~

`output/desktop-p1/` 保存安装、协议测试、WSL Web/桌面构建、Windows 打包与测试日志。`output/playwright/desktop-p1/` 保存 development.json、packaged.json 及对应页面截图。Windows 结果另复制到 WSL 的同名 output 目录；这些本地产物均被 Git 忽略。

**下一步限制：** 补入允许测试的普通 NEF/ARW，按相同开发/目录包流程验证原始像素解码和 PNG 输出后，才关闭 P1 完整 RAW 门槛。本阶段未推进 P2–P6。

## P2–P6 后续实施

按用户明确授权继续实施 Windows 首版。八工具、原生分块保存、目录包及未签名 NSIS 内测包已交付；最终测试、公开 CC0 普通 RAW、安装升级卸载重装和待办统一记录于 [WINDOWS_DESKTOP_RELEASE.md](WINDOWS_DESKTOP_RELEASE.md)。P1 上文“缺少普通 RAW/未进入 P2”的描述为当时历史，已由后续结果更新。
