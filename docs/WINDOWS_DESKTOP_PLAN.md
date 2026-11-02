# 图片工具 Windows 桌面版开发方案与实施清单

更新日期：2026-11-02  
状态：Windows P2–P6 实现及自动化/安装生命周期验收已完成，交付 0.1.0 未签名内测包。普通 RAW 已补齐；原生 UI、物理 DPI/跨屏/休眠、干净机器及长期压力等仍未全部验收。当前结论见 [WINDOWS_DESKTOP_RELEASE.md](WINDOWS_DESKTOP_RELEASE.md)。P7 为后续独立项目。

## 1. 目标与范围

在现有 Git 仓库中，为“图片工具”制作一个包含全部工具的 Windows 桌面应用；不是为每个工具分别生成安装包。保留现有网页版，复用 Vue 界面和图片处理逻辑，后续可扩展 macOS，并为 Android 复用核心代码保留边界。

首版目标：Windows 11 x64、单窗口、中文界面、离线本地处理、原生保存对话框、NSIS 安装包。Windows ARM64、其他 Windows 版本另行验证，不默认承诺支持。工作名称暂用“DevKit 图片工具”；公开发布前确定正式名称、图标、发布者和稳定 appId。

首版不新增图片算法、不扩大现有容量上限、不增加账号、云端上传、自动更新、后台常驻、文件关联、最近文件或历史照片。批量处理沿用现有 ZIP 功能。

### 1.1 当前实际工具清单

依据 src/tools/registry.ts 的“图片工具”分类，共 8 项：

| 工具 ID | 工具 | 现有主要入口 | 桌面验收重点 |
| --- | --- | --- | --- |
| image-base64 | 图片 ↔ Base64 | src/tools/images/ImageTool.vue | 字节往返、文本复制、图片和文本保存 |
| qr-reader | 二维码识别 | src/tools/images/ImageTool.vue | QR Worker、文本保存、链接仅显示不自动打开 |
| watermark | 图片加水印 | src/tools/watermark/WatermarkTool.vue | 中文字体、透明度、导出格式 |
| image-stitch | 图片拼接 | src/tools/image-stitch/ImageStitchTool.vue | 多图顺序、布局、尺寸、内存与取消 |
| moments-grid | 一图切九格 | src/tools/moments-grid/MomentsGridTool.vue | 九张单图、预览弹窗保存、ZIP 保存及顺序 |
| double-exposure | 双重曝光 | src/tools/double-exposure/DoubleExposureTool.vue | 两张输入、混合效果、预览与导出一致 |
| image-compress | 图片压缩 / 格式转换 | src/tools/images/ImageCompressTool.vue | 全部现有编解码、ZIP、HEIC、RAW |
| photo-frame | 照片水印边框 | src/tools/photo-frame/PhotoFrameTool.vue | EXIF、品牌 LOGO、HEIC/RAW、字体和方向 |

二维码生成属于“常用工具”，不在本次范围内。ZIP 是图片压缩内的功能，不另算第九个工具。

### 1.2 已核实的工程现状

- Vue 3、TypeScript、Vite 7、Vitest；package.json 为 ESM（type: module）。
- npm run build 当前执行类型检查、Vite 构建、scripts/prerender.mjs 静态预渲染。
- src/main.ts、src/App.vue 使用路径路由和 History API，例如 /tools/photo-frame/；Hash 只用于旧链接迁移。
- vite.config.ts 的 base 为 /，Worker 为 ES module；dev/preview 已设置 COOP/COEP。
- 现有编解码包含 @jsquash 系列、libheif-js、libraw-wasm、imagequant、utif；ZIP 使用 @zip.js/zip.js。
- src/platform/browser.ts 只有 copyText 和 downloadText；许多图片工具直接用 Blob URL 与 a.download 导出。不能只替换该文件就认为所有导出已适配。
- public/vendor/libraw、public/photo-frame/logos 和 public/licenses 等资源必须随安装包提供。
- 方案编写时 package.json 尚无 Electron 依赖。P1 已锁定 Electron/electron-builder、增加独立桌面构建和目录包命令；网页业务代码未改动。

## 2. 技术选型

| 部分 | 建议 | 原因 |
| --- | --- | --- |
| 桌面容器 | Electron | Windows/macOS 可共用桌面工程，内置 Chromium |
| UI 与计算 | 保留 Vue + TS + Canvas + Worker + WASM | 尽量复用现有功能和测试 |
| 前端构建 | 继续 Vite，增加桌面专用配置 | 保留网页 SEO 与预渲染流程 |
| 主进程 / preload | 首版使用小型 main.cjs、preload.cjs | 避免根项目 ESM 与沙箱 preload 的模块差异 |
| 安装包 | electron-builder + NSIS x64 | 形成常规 Windows 安装、升级与卸载流程 |
| 仓库 | 当前单仓库 | 各端同改同测，不复制工具源码 |
| Android 后续 | Capacitor + 共享 Web 核心 | Electron 不支持 Android，需单独移动端壳 |

不引入多包管理框架，不同时引入 Electron Forge 和 electron-builder。主进程复杂度增加后再评估 TypeScript 编译链。

实施时选择仍受支持且与构建环境兼容的 Electron 稳定版本，将 Electron、electron-builder 的实际版本与 Node/npm 版本记录到验证文档，并提交锁文件。本方案不预设一个未经安装验证的版本号。

Electron 的平台支持见[官方介绍](https://www.electronjs.org/docs/latest/)，Android 路线见 [Capacitor 文档](https://capacitorjs.com/docs)。

## 3. 代码结构和职责

建议增量目录，现有工具留在原位置：

~~~text
electron/
  main.cjs                   窗口、协议、生命周期、IPC 注册
  preload.cjs                仅暴露受限平台接口
  protocol.cjs               本地资源响应与路径校验
  files.cjs                  原生保存与分块写入会话
src/
  desktop/
    main.ts                  桌面渲染入口
    DesktopApp.vue           图片工具首页、菜单与窗口内导航
    tools.ts                 8 个图片工具注册定义
  platform/
    browser.ts               保留现有网页兼容入口
    index.ts                 平台统一入口
    types.ts                 平台接口与结果类型
    web.ts                   浏览器保存适配
    electron.ts              Electron 桥接适配
desktop.html                 桌面专用 HTML
vite.desktop.config.ts       渲染端构建
electron-builder.yml         打包配置
build/                       应用图标等打包素材
dist-desktop/                桌面渲染产物，忽略提交
release/                     安装包，忽略提交
docs/WINDOWS_DESKTOP_VERIFICATION.md  后续创建的实测记录
~~~

将 8 个工具定义抽到可共用模块，让现有 registry.ts 和桌面入口引用；保留原来的 id、props 和懒加载方式。该局部抽取用于避免桌面依赖整个工具箱，不进行全仓重构。桌面入口不加载 AI 设置、聊天或网站 SEO 内容。首版允许 public 公共资源随包复制，后续按实际体积清理，不盲目删除许可证。

职责：
1. 渲染进程：界面、预览、Blob、用户操作和任务状态。
2. Web Worker：现有图片解码、编码和计算；不迁入主进程。
3. preload：contextBridge 提供明确方法，不暴露通用 IPC 或 Node。
4. 主进程：窗口、安装资源访问、保存对话框和受限落盘。

图片 core 与 Worker 不导入 electron、node:fs 或桌面桥接对象。Android 将来实现相同平台接口，但还需独立适配相册、权限、分享和移动性能。

## 4. Windows 与 WSL 开发安排

现有仓库在 WSL /data/www/ai_development_toolkit。继续用 WSL 处理源码、Web 构建和核心测试；Windows Electron 的启动、安装包构建、安装验收放到 Windows 原生 Node 环境。

建议 Windows 本地磁盘另建该仓库的 checkout；它仍是同一个 Git 仓库的另一工作副本，不是新建独立项目。通过提交同步，不能期待两个工作副本自动同步未提交文件。不要在 Windows 与 WSL 之间共用 node_modules，也不要在 WSL 安装出的 Linux Electron 目录上直接启动 Windows 版本。

- WSL 命令使用 bash；Windows 原生构建可用 Git Bash 或 cmd。
- 两侧按锁文件安装依赖，分别保存 node_modules。
- Windows 版本使用 Windows 构建机或 Windows CI runner 验证。
- 打包发布不要求用户安装 Node、WSL、Vite 或启动后台 Web 服务。
- macOS 后续安排 Mac 构建、签名、公证和真机测试；不要将“源码通用”理解为在 Windows 上完成所有平台验收。

## 5. 构建、路由和离线资源

### 5.1 分离 Web 与桌面构建

保留原 npm run dev/build/test 行为，新增下列目标命令；P1 已实现 dev/build/preview/pack，dist 留待安装交付阶段：

| 目标命令 | 实施后的职责 |
| --- | --- |
| npm run desktop:dev | 启动本机 Vite，等待就绪后启动 Electron；退出时清理子进程 |
| npm run desktop:build | 类型检查并构建桌面 HTML、JS、Worker、WASM |
| npm run desktop:preview | Electron 加载本地生产产物，不依赖 Vite |
| npm run desktop:pack | 构建并生成 Windows 未安装目录包 |
| npm run desktop:dist | 构建 NSIS 安装包，默认不上传、不发布 |

desktop:dev 的 Vite 只绑定 127.0.0.1，固定端口并开启 strictPort；限制开发 URL 来源。生产模式禁止从环境变量指定任意远程 URL。桌面构建不执行 scripts/prerender.mjs，也不生成网站 sitemap/canonical。

桌面配置复用必要的 Vue/WASM 插件、Worker 格式和依赖排除配置；不要无意覆盖现有网页 Vite 配置。产物 HTML 名称与主进程加载地址保持一致。

### 5.2 首选本地协议

生产首选 app://bundle/，由 protocol.handle 映射到打包资源，而非直接 file:// 加载。

在 app ready 前注册 standard、secure、supportFetchAPI 等实际需要的协议能力；不设置 bypassCSP。限制 scheme、host、方法和可访问根目录。解码和规范化 URL 后验证路径仍位于资源根目录，拒绝路径穿越、绝对路径与非法编码。

保留 /tools/<id>/ 路径导航：只有首页和 8 个合法工具路由返回桌面 HTML；资源缺失返回 404，不能把缺失的 JS/WASM 返回成 HTML。访问非图片工具路径显示桌面未找到页面或回首页。刷新、前进/后退和非法路由都要测试。

按资源实际类型返回 MIME，尤其 JS、WASM、SVG、JSON；确保 /vendor/libraw/、/photo-frame/logos/ 和动态资源均从同源加载。优先沿用根路径资源，不机械地把 base 改成 ./。

协议 API 与权限时机见 [Electron protocol 文档](https://www.electronjs.org/docs/latest/api/protocol)。

### 5.3 必须提前通过的 RAW/WASM 验证

在开发模式和生产目录包中分别检查：
- Worker 内的动态 import、fetch、WASM 实例化成功。
- 页面及必要 Worker/资源返回 COOP: same-origin、COEP: require-corp。
- 页面和相关 Worker 的 crossOriginIsolated、SharedArrayBuffer 可用性符合 RAW 解码需求。
- 真实普通 NEF/ARW 完成解码和导出，不能只检查变量值。
- 断网冷启动仍能处理 HEIC、RAW、AVIF 和品牌 LOGO。

自定义协议加响应头是否足够，必须针对选定 Electron 版本实测，不能在文档阶段宣布可用。若失败，先定位协议与 Worker 响应；必要时评估仅监听 127.0.0.1、随机端口、限定 Host/Origin、无写入 API 的本地静态服务。采用备选方案前记录原因、资源映射与退出清理方案；不要通过关闭 webSecurity 解决问题。

## 6. 平台接口与文件导出

### 6.1 导入

首版复用 file input、拖放与页面 paste，继续接收 File/Blob，不批量获取用户目录权限。保留每个工具的类型、容量、像素限制。粘贴只由用户动作触发，不轮询系统剪贴板。

拖入文件不能导致窗口导航；不要把图片当页面打开。若以后增加“文件 → 打开”菜单，再设计受限导入接口，不先暴露任意路径读取。

### 6.2 统一保存接口

建议上层契约（示意，后续实现）：

~~~ts
type SaveResult =
  | { status: 'saved' }
  | { status: 'dispatched' } // 网页已触发下载，无法确认最终落盘
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }

interface PlatformFiles {
  saveBlob(blob: Blob, suggestedName: string): Promise<SaveResult>
  saveText(text: string, suggestedName: string, mime?: string): Promise<SaveResult>
}
~~~

Web 适配沿用 Blob URL 下载并及时释放；Electron 适配调用原生另存为，完成写入才返回 saved。用户取消不显示错误。页面按任务版本检查处理保存结果，防止换图或离页后旧任务触发保存。避免重复点击生成多个并发保存对话框。

需要逐一迁移：
- ImageTool.vue 的图片、Base64 文本和二维码文本导出；
- ImageCompressTool.vue 和 ZipImageTool.vue；
- WatermarkTool.vue、ImageStitchTool.vue、DoubleExposureTool.vue；
- PhotoFrameTool.vue；
- MomentsGridTool.vue 的网格单图、预览弹窗单图、ZIP 三类入口。

不要只处理按钮，遗漏带 download 属性的链接。

### 6.3 大文件与落盘

ZIP 现有产物上限较大，不应通过一次 blob.arrayBuffer() + 单次 IPC 复制整份 ZIP。正式保存链路按 Blob.slice 分块，建议初始块大小 4 MiB，等待上一块写完后发送下一块，限制内存和在途消息。

建议受限会话：beginSave（用户选目标、声明总大小）→ appendChunk（会话 ID、顺序号、有限字节）→ finishSave / cancelSave。主进程保存路径只来源于保存对话框，渲染端不能指定任意路径；会话绑定发起窗口，检查总字节、顺序、超时、窗口销毁和并发上限。

先写目标目录的临时文件，完整写入关闭后完成替换；验证 Windows 目标已存在、被占用、权限不足和替换失败行为。失败时保护原文件并清理本次临时文件，不能先删原文件再写入。保存取消/中断仅清理该会话文件。

该设计只减少保存时的额外复制；现有 ZIP 生成仍占用内存，不因此宣称支持 GB 级低内存处理。首版保持现有限制，用真实峰值内存测量决定是否需要另立流式 ZIP 任务。

## 7. 安全与运行约束

- BrowserWindow 显式设置 nodeIntegration: false、contextIsolation: true、sandbox: true，保留 webSecurity。
- 沙箱 preload 使用可运行的 CommonJS 构建，不把项目 ESM 配置直接套到 preload。
- contextBridge 只暴露受限方法；主进程逐项验证参数、调用方 frame/origin、会话所有权和资源上限。
- 拒绝非预期导航和新窗口；外部链接只允许用户主动打开经过校验的 http/https URL。二维码内容不自动打开。
- 默认拒绝不需要的权限，如摄像头、麦克风、地理位置。
- 设置 CSP：资源以自身来源为主，图片允许必要的 blob/data；按实际 Worker/WASM 需要配置 worker-src 与 wasm-unsafe-eval。先在生产包验证，不笼统开放所有来源或 unsafe-eval。
- 首版不执行图片内脚本、SVG 输入或 ZIP 内程序；ZIP 不解压到任意系统路径。
- 不保存原图、EXIF 或文件内容到日志；技术错误日志应有限额、可清理，避免记录完整用户路径。
- 包内包含许可证及现有 LOGO 来源说明；公开分发前核对素材和编解码依赖的分发要求。

参考 [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)、[沙箱说明](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[ESM 与 preload](https://www.electronjs.org/docs/latest/tutorial/esm)。

## 8. 图片行为兼容与桌面体验

### 8.1 保留现有边界

不得因为改为桌面端就提高像素限制、取消超时或增加并发。沿用任务失效标记、Worker 终止、Blob URL 回收和 ImageBitmap 释放。

RAW 不是全机型保证。重点保留：
- 照片边框对 Nikon HE/HE★ 使用经过校验的内嵌相机 JPEG，并显示兼容提示和实际尺寸。
- 压缩工具不静默使用上述降级，按既有策略提示不支持。
- 无有效内嵌图时拒绝，不能重新引入彩条输出。
- EXIF 方向不重复旋转；手机 HEIC 拍摄参数与品牌匹配继续有效。
- 合成输出不承诺保留 EXIF、ICC、HDR 或原始 RAW 数据。

细节见 [图片压缩](IMAGE_COMPRESSION.md)、[照片边框](PHOTO_FRAME.md)、[ZIP 批量处理](ZIP_IMAGE_PROCESSING.md)、[基础图片工具](IMAGE_TOOLS.md)。

### 8.2 窗口与设置

首版用系统原生标题栏，不实现自绘窗口按钮。提供首页、8 个工具入口和版本信息，移除网站 AI 设置和 SEO 相关提示。

窗口尺寸持久化可作为轻量设置；恢复时校验显示器可见范围，避免窗口跑到已断开的屏幕。只保存窗口设置和必要偏好，不默认保存照片历史。运行任务时关闭窗口要有明确的取消/退出行为，退出后不能残留 Worker、写入会话或本地服务。

Windows 测试重点：中文字体、100%/125%/150%/200% DPI、跨屏拖动、最小窗口尺寸、键盘焦点、Ctrl+C/V、中文路径。不能用 Linux 字体渲染结果代替 Windows 中文验收。

## 9. 分阶段实施顺序

每阶段完成后更新验证记录：修改范围、执行命令、平台/依赖版本、通过项、失败项和下一步。未完成项保持未勾选；“Web 测试通过”不能替代“Windows 安装包通过”。

### P0：环境与基线

- [x] 记录 Git 状态，保留既有未提交改动。
- [x] 确认本清单 8 个工具与当前代码一致。
- [x] 准备 Windows 原生 Node checkout，分别安装 Windows/WSL 依赖。
- [x] 运行现有 npm test、npm run build，记录实际结果与已有失败。
- [ ] 收集无隐私测试样本：JPG/PNG/WebP、透明图、中文文件名、方向图、二维码、HEIC、普通 RAW、Nikon HE/HE★、混合 ZIP。已生成 7 个普通格式/方向/透明/二维码/ZIP 样本及哈希清单。P1 补入用户授权的本机 HEIC/HE★ 测试文件；普通 RAW 已用 CC0 无损 NEF 补齐；Nikon HE（非 HE★）仍缺，用户照片不进入仓库或安装包，详见验证记录。
- [x] 创建 WINDOWS_DESKTOP_VERIFICATION.md，记录样本来源与使用权限。

交付：可重复的基线和 Windows 环境。验收：明确哪些原有能力通过，哪些需要真实样本补充。

### P1：最小 Electron 与生产资源验证（最高优先级）

- [x] 新增 Electron 主进程、沙箱 preload 和桌面 Vite 入口。
- [x] 实现开发启动与本地生产协议；先接入一个简单工具形成窗口。
- [x] 生成 Windows 目录包，完全关闭 Vite 后启动。
- [x] 在目录包中探测 Worker、动态模块、HEIC/AVIF WASM、RAW 和 LOGO 资源。
- [x] 验证 crossOriginIsolated 与真实 RAW 解码。已用 CC0 Nikon D7000 无损 NEF 在开发及目录包完整解码，实际输出 17 MB PNG 并独立回读；HEIC/HE★ 分支也通过，详见最新交付记录。
- [x] 验证离线冷启动、路径刷新、资源 404、路径穿越拒绝。
- [x] 确认窗口无 Node 直接权限、未关闭安全选项。

交付：能离线运行的技术原型及兼容性结论。门槛：RAW 等关键依赖失败时先解决，不推进全量工具适配；如需缩减功能，必须另行明确范围，不能静默略过。

### P2：图片工具桌面入口

- [x] 抽取并共享图片工具注册定义，保留原网页完整菜单。
- [x] 实现桌面首页、8 个入口、懒加载与工具路由。
- [x] 移除桌面 AI 设置、网站 SEO 内容和无关入口。
- [x] 增加加载失败、未知路由的恢复入口。
- [x] 网页与桌面分别构建并验证，避免串用输出目录。

交付：8 个工具均能打开。验收：桌面只展示图片工具，网页原入口和 SEO 构建仍正常。

### P3：平台适配和保存闭环

- [x] 实现平台类型、Web 适配和 Electron 适配。
- [x] 实现原生保存对话框、分块 IPC 写入、失败清理。
- [x] 先用图片 ↔ Base64 验证图片/文本导出及字节一致。
- [x] 加入取消、重名覆盖、锁定文件、磁盘空间不足、中文路径测试。
- [x] 验证复制、拖放、粘贴与导入限制。页面拖放/粘贴事件、容量及 SVG 限制通过；后续文本/图片复制、真实系统 Ctrl+C/V 已用 WinForms 回读确认。旧剪贴板测试的并发干扰已更正。
- [x] 为 IPC 校验和保存会话添加有意义的测试。

交付：稳定的跨平台文件能力。验收：取消无错误，保存成功可由外部程序读取，失败不破坏原文件。

### P4：逐个工具迁移

按以下顺序，每个工具必须完成导入 → 操作 → 导出 → 取消/离页 → 外部查看导出文件，再处理下一个：

1. 图片 ↔ Base64、二维码识别：文本/图片保存与 Worker。
2. 图片加水印：字体与单图导出。
3. 一图切九格：多入口保存和 ZIP。
4. 图片拼接：多图排序、容量与资源回收。
5. 双重曝光：双输入和高清输出。
6. 图片压缩 / 格式转换：全部现有格式、ZIP 和解码异常。
7. 照片水印边框：EXIF、LOGO、RAW 兼容和方向。

- [x] 全部 8 个工具完成验收，记录各格式实际样本。
- [x] 所有 download 链接和导出按钮走统一保存适配。
- [x] 检查更换图片/参数、取消、离页后不产生旧结果和旧保存。
- [x] 重跑核心测试与 Web 构建；验证网页导出没有回归。

交付：完整功能版。验收：没有仅能预览不能导出的工具，也不因桌面接入改变原有图片算法。

### P5：桌面稳定性和性能

- [ ] DPI、字体、最小窗口、键盘、跨屏、休眠恢复。中文及 800×600、32 组页面缩放布局已通过；物理 DPI/跨屏/休眠和系统键盘交互待目标机验收。
- [x] 连续导入/导出/切换工具，记录内存是否持续增长。已完成 100 次覆盖保存、十分钟 388 轮约 3104 次切换，修正自动化文件选择造成的节点持有后，GC 回到 244 节点/61 监听器。观察范围见后续记录，不外推所有时长。
- [x] 代表性大图与 ZIP 记录峰值内存、耗时、取消响应。6400 万像素图、500 条目/约 45.55 MiB 输入 ZIP、约 180.22 MiB 展开数据通过；35.85/38.70s，取消约 180/71ms，大负载观察峰值约 2.52 GiB。全部资源限制未扩大。
- [x] 验证任务中关闭窗口、Worker 错误、保存中退出及临时文件清理。
- [x] 验证所有处理在断网状态完成，未意外访问线上站点。
- [x] 设置与日志不保存照片内容，错误可理解且可重试。

交付：候选发布版本。验收：目标 Windows 机器无崩溃和明显持续泄漏；对未验证的上限明确标注。

### P6：安装、升级与交付

- [ ] 确定名称、appId、发布者、版本号与 ICO 图标。内测已确定名称、local.devkit.images、0.1.0 和原创 ICO；公开发布者未声明。
- [x] electron-builder 设置包内容白名单，含完整 WASM、Worker、LOGO 和许可证，不含测试原片、密钥和开发输出。
- [x] 默认按用户安装，避免不必要的管理员权限；初期不添加文件关联。
- [x] 先测试目录包，再生成 NSIS x64；启用 ASAR 后重测资源，只有实际需要的文件才 unpack。
- [ ] 在无 Node/WSL 的 Windows 11 环境验证首次安装、离线启动、覆盖升级、卸载、重装。本开发机的安装/0.1.1 升级/卸载/重装和空 PATH 启动均通过；真正干净机器验收仍未完成。
- [x] 检查升级保留必要设置，卸载不删除用户导出照片。
- [ ] 内测可明确标记未签名；公开发布前确定代码签名方案并核验签名。内测已明确未签名且不公开发布；正式签名/SmartScreen 尚未验收。
- [x] 交付安装包、SHA-256、版本说明、已知限制和验证记录。

交付：用户可安装使用的 Windows 版本。验收：安装后的应用完成全部工具冒烟流程，而不只是在开发窗口中运行。

打包和签名参数以锁定版本文档为准：[Windows 打包](https://www.electron.build/docs/win/)、[Windows 代码签名](https://www.electron.build/docs/features/code-signing/code-signing-win/)。

### P7：后续独立任务

- 自动更新：更新服务器/渠道、签名校验、失败恢复与用户提示，另立方案；首版手动下载覆盖安装。
- macOS：同 Electron 工程，平台菜单、保存路径、字体、Intel/Apple Silicon、签名公证及安装验证。
- Android：Capacitor 工程，平台接口、小屏触摸、系统相册、分享、生命周期及内存限制；重新验证 RAW/WASM，不能默认桌面验证结论适用手机。
- 原生文件夹批处理、流式 ZIP、系统文件关联按新需求实施。

## 10. 最终验收矩阵

| 维度 | 必测项 | 通过标准 |
| --- | --- | --- |
| 平台 | Windows 11 x64；记录系统版本与内存 | 安装后可运行，无开发环境依赖 |
| 功能 | 8 个工具，含 ZIP 与全部保存入口 | 输入、处理、导出完整闭环 |
| 格式 | JPG/PNG/WebP/HEIC、现有编码格式、代表性 RAW | 实际签名/尺寸正确，异常明确提示 |
| RAW | 普通 RAW、Nikon HE/HE★、无有效内嵌预览 | 沿用既有兼容策略，无彩条误输出 |
| 素材 | 品牌 LOGO、中文/emoji、EXIF 方向 | 不丢资源，不重复旋转，字体可读 |
| 文件 | 中文/空格/长路径、覆盖、取消、只读/锁定目标 | 不破坏原文件，不误报成功 |
| ZIP | 中文名、混合条目、CRC、重名、取消 | 内容规则不变，最终 ZIP 可外部校验 |
| 生命周期 | 换图、切页、退出、异常、休眠恢复 | 无旧结果覆盖，无残留后台任务 |
| 安全 | IPC 非法输入、跨窗口会话、越界资源路径、导航 | 拒绝越权操作 |
| 离线 | 首次安装后断网冷启动并处理各类图片 | 无远程依赖，无上传 |
| 性能 | 代表性大图/ZIP、反复操作 | 有实测数据，界面可取消，无持续增长 |
| 发布 | 安装、升级、卸载、重装、签名状态 | 可复现交付，导出照片不被删除 |
| Web 回归 | 原测试、构建、图片导入导出 | 网页原有功能保持正常 |

测试层次：纯逻辑用 Vitest；协议/IPC/写入需 Node 或 Electron 集成验证；文件对话框、字体、安装升级和 DPI 用 Windows 实测。Web 页面测试不能替代后两类。历史文档中的测试数量不是本次执行结果。

## 11. 风险与工作量判断

| 项目 | 相对工作量 | 主要风险与处理 |
| --- | --- | --- |
| 桌面壳与菜单 | 小到中 | 避免复制完整网站壳，保留独立入口 |
| 协议、Worker、WASM、RAW | 高 | 最先做目录包验证，未通过不铺开 |
| 保存与分块写入 | 中到高 | 取消、覆盖和失败处理需真实文件系统测试 |
| 逐工具迁移 | 中 | 导出入口分散，按清单逐项核对 |
| 大图/ZIP 稳定性 | 高 | 内存是限制，不靠“桌面版”名义放宽上限 |
| 安装与签名 | 中 | 需 Windows 环境和发布者配置；凭据不入仓 |
| Android 后续 | 独立评估 | 移动 WebView、权限与内存不能照搬桌面结论 |

先完成 P0/P1，再根据实际兼容问题估算排期。首个窗口能打开不等于完成桌面版；不要仅按“给网页套壳”的工作量安排整个交付。

## 12. 后续逐步实施的使用方式

每次只指定一个阶段，例如：

> 请按照 docs/WINDOWS_DESKTOP_PLAN.md 实施 P0。先检查当前代码和 Git 状态，保留既有改动；完成后更新验证记录，说明已完成项、检查结果和仍未验证的部分，不提前实施后续阶段。

后续将 P0 替换为 P1、P2 等即可。阶段存在前置阻塞时优先解决阻塞；不把文档里的拟定接口当成已经实现的功能。每阶段建议形成独立、可回退的代码变更；只有实际完成对应验证后才勾选任务。

相关历史文档：[DESKTOP.md](DESKTOP.md)。本文件是当前图片工具 Windows 实施依据；旧文档中的未定选型和 Hash 路由描述不作为当前实现事实。
