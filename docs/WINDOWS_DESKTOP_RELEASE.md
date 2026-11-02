# Windows 桌面内测版 0.1.0 交付与验收

日期：2026-11-02（Asia/Shanghai）。最新补测、更正和未关闭项见 [WINDOWS_DESKTOP_FOLLOWUP.md](WINDOWS_DESKTOP_FOLLOWUP.md)。本轮范围为 Windows 首版 P2–P6；P7 的 macOS、Android、自动更新等独立需求未纳入。

## 当前结论

已实现八工具桌面入口、受限原生分块保存及所有导出入口迁移，交付未签名 NSIS x64 内测安装包。安装后八工具验收、0.1.0 → 0.1.1 测试升级、卸载与 0.1.0 重装均通过。此前普通 RAW 缺口已用许可明确的公开 NEF 补齐。

**尚未全部完成整份清单验收。** 原生对话框操作仍等用户反馈；物理 DPI/跨屏/休眠和无 Node/WSL 干净机器仍缺环境。剪贴板和当前机压力补测已完成。正式签名与公开发布身份不属于用户批准的未签名内测范围。

用户已明确授权继续 P2 及后续 Windows 阶段，并确认名称“DevKit 图片工具”、0.1.0、未签名、不公开发布。已有 P0/P1 文件和文档改动被保留；本轮未提交或推送 Git。

## 产物

- 安装包：`release/DevKit-Images-0.1.0-win-x64.exe`
- 校验：同目录 `SHA256SUMS.txt`、`artifacts.json`
- 版本说明：同目录 `RELEASE_NOTES.md`
- 目录包：Windows checkout 的 `release/win-unpacked/DevKitImages.exe`
- 已安装副本：Windows checkout 的 `output/windows-install-test/app/DevKitImages.exe`

Windows checkout：

~~~text
C:\Users\Administrator\.codex\visualizations\2026\11\01\01a19809-3216-7fa3-a669-40a9309dcb7e\windows-desktop-p0
~~~

安装包、校验文件和说明另复制到 WSL 项目的 release 目录。目录包需保留整个 win-unpacked 文件夹。0.1.1 仅是升级验收夹具，位于被忽略的 output/desktop-upgrade，不是本轮交付版本。

配置：appId=`local.devkit.images`，版本 0.1.0，Windows x64，原创 16/32/48/256 ICO；按用户安装、无提权、无文件关联、无常驻/自动更新、publish never。公开发布者未声明；没有签名证书。已安装副本与交付目录包的 app.asar 校验一致，详细 SHA-256 见 artifacts.json。

## P2 实现

图片定义抽到 `src/tools/images/definitions.ts`，Web registry 与桌面共同引用，保留八个 id、组件、props 和懒加载。Web 完整菜单仍保留。

桌面仅加载图片工具入口，不加载 AI 设置、聊天或网站 SEO 页面。包含首页、八入口、版本、前进/后退、未知路由返回首页、加载失败重试。实际阻断动态模块请求后错误页可显示，恢复请求并重试可正常打开。Windows 最小 800×600 截图已人工查看，首页排版和中文正常。

Web 产物仍是 dist/index.html + SEO 静态页面；桌面为 dist-desktop/desktop.html，构建不运行网站预渲染。

## P3/P4 文件链路与迁移

平台契约位于 `src/platform/`：

- Web 使用 Blob URL，返回 dispatched，定时释放 URL，不误报“已经落盘”。
- Electron 按 Blob.slice 读取，每次最多 4 MiB；等上块写完再发送下一块，不对整份 ZIP 调用 arrayBuffer。
- main 验证主 frame、固定来源/路由、文件名、总大小、块长度、顺序、会话所有权；同一时刻仅一个对话框/保存会话。
- 原生对话框选定路径后，在目标目录创建独占临时文件；处理 OS 短写，sync/close 后 rename 替换。不会先删原文件。
- 取消、离页、任务失效、超时、窗口销毁、渲染崩溃和退出会清理本会话文件；旧任务不能在 begin/append/finish 前绕过有效性检查。
- 应用安装目录禁止作为导出位置，防止升级或卸载删除应用所导出的照片；UI 会提示另选目录。
- clipboard.writeText 适配锁定 Electron 的异步 API，并校验回读；失败时保留手动选择文本复制提示；后续测试已验证本机会话可正常复制。

已迁移 ImageTool 的图片/Base64/QR 文本、压缩单图、ZIP、文字水印、拼接、双重曝光、照片边框，以及九宫格网格单图/弹窗单图/ZIP 三类入口。未遗留这些工具中的 download 属性或 a.download 导出。修改仅涉及平台和导出路径，既有图片算法、容量限制、Nikon HE/HE★ 兼容规则未扩大。

LibRaw 的 Embind 动态函数例外限定为明确使用它的 raw-probe.worker、compress.worker、photo.worker；页面和其余 Worker 继续禁止 unsafe-eval。Web CSP/构建配置没有被改动。没有关闭 sandbox、webSecurity、contextIsolation。

## 实测结果

环境/依赖沿用 P1：Windows 11 10.0.26200.9711、Windows Node 24.13.0/npm 11.6.2，WSL Ubuntu 22.04.5/Node 22.22.2/npm 10.9.7；Electron 45.2.1、Chromium 156.0.8078.75、内置 Node 24.22.1、builder 26.18.0、playwright-core 1.64.1。

| 检查 | 结果 |
| --- | --- |
| WSL Vitest | 36 文件、746 项通过 |
| Windows Vitest | 后续测试 harness 兼容性修复后 36 文件、746 项通过；未改聊天业务 |
| 协议/保存 Node 测试 | WSL 18 通过；Windows 17 通过、1 跳过（符号链接创建权限） |
| Web build | 类型检查、Vite、36 pages + 404 通过 |
| 桌面 build / NSIS | 通过，x64、ASAR、未签名 |
| 八工具完整流程 | 目录包与已安装 exe 均通过，19 个图片/文本/ZIP 输出回读 |
| 六种静态格式 | PNG/JPG/WebP/AVIF/TIFF/BMP 均导出、重新导入；非 PNG 原格式保真字节一致 |
| ZIP | 九宫格 9 个条目及混合 ZIP，逐条读取与 CRC 校验通过 |
| 保存中断 | 取消、离页后延迟对话框返回、窗口退出、块顺序/大小/所有权、短写、错误注入通过 |
| Windows 文件占用 | 用 .NET FileShare.None 实际锁定目标；替换失败、原文不变、临时文件清除、UI 报错 |
| 真实空间不足 | 1 MiB tmpfs 经 Windows WSL UNC 接收 4 MiB 块；失败保护原文、临时文件清除；挂载已卸载 |
| 长路径 | 326 字符中文路径实际写入/回读通过；原生文件对话框长路径操作仍待人工 |
| 页面导入 | 拖放/粘贴 DOM 事件、10 MiB 拒绝、SVG 拒绝和全窗口 drop.preventDefault 通过 |
| 资源/安全 | 离线重载、WASM/Worker/动态模块/LOGO、404/403、无 Node globals、禁止外部导航/弹窗通过 |
| 恢复 | 模块加载失败重试、未知路由恢复、实际渲染进程崩溃后选择重载并恢复 DOM 通过 |
| 独立运行模拟 | 清空 PATH 后 exe 仍启动；不代替实际无 Node/WSL 的干净机器 |
| 安装生命周期 | 按用户静默安装 0.1.0 → 测试升级 0.1.1 → 卸载 → 重装 0.1.0，全通过；导出文件保留 |

自动化工具流程使用 Electron 的真实渲染、IPC 与文件系统，但为了确定目标/取消情形，测试进程替换了 dialog.showSaveDialog 的返回值。**这不等于已操作原生“另存为”界面。** Computer Use 两个入口均因 CreateProcessSecurityEnvironment failed (0x80070001) 无法启动，没有绕过安全 UI 或改变系统设置。文件占用与空间不足是真实 OS/文件系统条件，另有故障注入单测。

## RAW 和样本来源

用户提供 D:\test 下 HEIC 与两张 Nikon Z50II HE★，仅用于本机测试；来源/校验保留在 P1 记录。不进源码、public 或安装包，不公开分发，不记录 GPS/序列号或完整 EXIF。

新增公开普通 RAW：raw.pixls.us 的 Nikon D7000、14-bit lossless compressed NEF，条目 958。下载前核对该条目的 [CC0 许可](https://creativecommons.org/publicdomain/zero/1.0/)，下载后核对库提供的 SHA-256。

- [原始条目数据](https://raw.pixls.us/json/getrepository.php?set=all)，[样本库说明](https://raw.pixls.us/)。
- 文件大小：19,040,701 字节。
- SHA-256：`639945753240005d80488c0462c01e73a7ab82c96d3d1cdb6661f02e1b3c1319`。
- 本地 `output/desktop-p1/public-raw/source.json` 保存所选条目、许可、URL、大小和 SHA。原片仅放被忽略的测试输出，不放安装包。

开发和 ASAR 生产模式均完整解码此 NEF（非内嵌预览），crossOriginIsolated/SAB 正常。真实压缩工具输出 PNG 为 4948×3280、17,019,163 字节，跨 5 个 IPC 块保存，由独立 nativeImage 解码器从磁盘读取成功；照片边框输出 JPEG 2048×1588，同样回读成功。P1 普通 RAW 核心门槛已补齐。

HEIC 输出/回读 3024×4032；HE★ 严格分支拒绝，显式兼容分支使用 5568×3712 相机 JPEG。用户实际 HE★ 和 HEIC 也已完成照片边框原生保存。真实 HE（非 HE★）、无有效内嵌 JPEG RAW、其他机型仍不作全覆盖承诺，既有对应策略单元测试保留。

## P5 性能与界面边界

八工具测试包含真实 12 MP HEIC、20 MP HE★、3 个小图片的混合 ZIP，以及 24 次工具切换。最新安装版运行的工作集之和三次采样为 702640 / 705556 / 705160 KiB，500ms 采样观察峰值 736608 KiB（约 719 MiB）。其他运行曾观察到约 968 MiB；不同缓存/调度会影响结果。工作集相加包含共享页，不等于独占物理内存，不是精确瞬时峰值，也不足以证明长期无泄漏。普通 RAW 17 MB 输出的独立测试没有采样完整内存峰值。

双重曝光 1200px 保存步骤约 6.85s；其他步骤数据见 result.json 的 ms，包含各步骤等待/落盘，不能当作统一算法基准。大 ZIP、最大上限图像、长时间压力仍需目标机器测量。

八工具在 Electron 页面缩放 1/1.25/1.5/2 下共 32 组布局无横向溢出，800×600 最小窗口通过。**这是页面缩放测试，不是 Windows 物理 DPI、多屏拖动或休眠恢复验收。**

## 仍未验证 / 发布前待办

1. 原生保存对话框：手工选择、取消、覆盖提示、中文/长路径选择；真实系统拖放、Ctrl+C/V。
2. 系统剪贴板：后续串行测试已验证文本/图片复制和系统 Ctrl+C/V。此前“回读为空”来自测试并发写入/过早匹配状态，已更正，见后续记录。
3. Windows 物理 100%/125%/150%/200% DPI、跨屏与休眠恢复。
4. 无 Node/WSL 的干净 Windows 11 机器首次安装与全工具冒烟；本机仅清空 PATH 模拟，且 Windows Sandbox 未安装。
5. 大 ZIP/极限尺寸/反复使用补测已通过：6400 万像素、500 条目近限额 ZIP、上下限拒绝、取消、100 次覆盖、修正后的十分钟 388 轮循环及回收验证。更长实际使用可按脚本复跑，详见后续记录。
6. 公开发布者、代码签名、SmartScreen、依赖/素材分发义务复核；用户本轮仅批准未签名内部版。

## 复现与证据

`npm run desktop:dev / desktop:build / desktop:preview / desktop:pack / desktop:dist / desktop:test`；完整流程 `node scripts/desktop-suite.mjs [安装后的 exe 路径]`；可用样本设 `DESKTOP_SAMPLE_DIR` 指向用户授权目录。

补充脚本：desktop-smoke.mjs（--dev 或 exe）、desktop-raw-test.mjs、desktop-import-test.mjs、desktop-boundary-test.mjs、desktop-install-test.mjs、desktop-lock-test.mjs、desktop-enospc-test.mjs。锁测试需用已存在的系统 csc 编译 tests/fixtures/file-lock.cs 到 output/desktop-native-lock/file-lock.exe；空间不足脚本需先在固定工作区 output/desktop-enospc 挂载 1 MiB tmpfs，完成后必须 umount。不得对系统磁盘做填充实验。

Windows `output/desktop-p1/` 保存主日志，`output/playwright/` 保存每次测试的结果 JSON/截图，`output/windows-install-test/` 保存安装生命周期日志。关键结果另同步到 WSL output；这些日志、照片和测试构建均不进入 Git/安装包。

最终 ASAR 清单为 101 个文件/目录条目，包含 Worker、WASM、许可证和 LOGO 来源说明；没有 src、tests、output、node_modules，也没有 ChatTool/PromptTool/CodeEditor。应用不提供图片历史或内容日志，关闭进程终止 Worker，正常退出清理保存会话。
