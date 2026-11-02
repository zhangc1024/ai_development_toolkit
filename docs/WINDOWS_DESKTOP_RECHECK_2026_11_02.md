# 桌面版 0.1.4 功能复查

日期：2026-11-02（Asia/Shanghai）。本记录来自本次重新执行，不沿用历史通过结论。

## 结论

本次覆盖的核心功能全部通过，未复现阻断使用的问题。未修改业务代码。测试对象为 Windows 原生 release/win-unpacked/DevKitImages.exe（0.1.4）。

一致性：Windows 副本与 WSL 当前 src、electron、scripts 及关键配置共 149 个文件一致（忽略 CRLF）；成品 ASAR 内 electron 与 dist-desktop 共 92 个文件和 Windows 构建副本逐字节一致。

## 本次结果

| 检查 | 结果 |
| --- | --- |
| WSL npm test | 36 个文件、754 项通过 |
| WSL npm run desktop:test | 18 项通过 |
| WSL npm run desktop:build | 类型检查及生产构建通过 |
| desktop-suite.mjs | 八工具导入、处理、导出通过；PNG/JPG/WebP/AVIF/TIFF/BMP 成品回读、ZIP CRC 通过 |
| 保存与剪贴板 | 字节往返、覆盖已有测试文件、取消、切换工具取消待保存任务、原生剪贴板往返通过 |
| 运行稳定性 | 24 次工具切换无页面异常；模拟渲染进程崩溃后重载恢复通过 |
| desktop-smoke.mjs | 成品受控离线启动/重载、Worker/WASM、路由刷新/前进/后退通过 |
| desktop-boundary-test.mjs | 空 PATH 启动、加载失败重试、未知路由恢复、100/125/150/200% 页面缩放、326 字符中文长路径、退出清理保存会话通过 |
| desktop-batch-fix-test.mjs | 两张真实 HE★ NEF 与一张 HEIC，原格式保真、JPG 均衡、原格式轻度/均衡/强力、PNG 强力共六轮通过，未复现超时 |
| desktop-raw-test.mjs | 普通 Nikon D7000 NEF 完整解码与导出通过：PNG 4948×3280、29,118,817 字节；边框 JPG 2048×1588 |
| desktop-import-test.mjs | 六种成品格式重新导入、页面拖放/粘贴事件、输入容量限制、SVG 拒绝通过 |
| 截图检查 | 800×600 窗口首页中文、导航、卡片布局正常，无横向溢出 |

HE★ 兼容结果使用相机内嵌 JPEG，不是 RAW 原始像素完整解码。普通 RAW 已由独立脚本实测；smoke 日志中的 ordinaryRawDecoded=false 仅表示该次 smoke 未提供 RAW 样本。

## 验证边界

- 保存脚本替换系统对话框返回值，真实 IPC、磁盘写入和成品回读均执行；没有据此宣称 Windows 原生对话框的目录选择、覆盖确认交互已人工通过。
- 拖放/粘贴使用页面合成事件，未验证从资源管理器拖入及系统图片剪贴板快捷键。
- 页面缩放不等于 Windows 系统 DPI；多显示器、休眠唤醒、干净 Windows 机器仍待验证。
- 离线通过 Chromium 离线模式及网络限制模拟，未物理断开网卡。本轮未重跑安装/卸载、磁盘耗尽、长时间压力及 2500 万像素专门测试。
- 本轮未修改或重新分发 ZIP；执行的是现有目录版程序。

## 日志

Windows 副本：C:\Users\Administrator\.codex\visualizations\2026\11\01\01a19809-3216-7fa3-a669-40a9309dcb7e\windows-desktop-p0

其 output/review-{suite,smoke,boundary,batch,raw,import}.log 为本次运行日志。八工具成品及截图：output/playwright/desktop-suite/run-g1gjrr/。

WSL 日志：/tmp/devkit-review-test.log、/tmp/devkit-review-native.log、/tmp/devkit-review-build.log。
