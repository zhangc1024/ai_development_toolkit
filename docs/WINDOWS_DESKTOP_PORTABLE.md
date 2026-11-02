# Windows 测试阶段免安装交付

2026-11-02 用户明确调整交付方式：测试阶段默认只交付免安装版；准备发布时再增加安装版。替代早期默认交付 NSIS 内测包的约定。

## 打包与使用

- 默认命令：npm run desktop:dist，生成 release/DevKit-Images-版本-win-x64-portable.zip。
- 解压 ZIP 的全部内容到本机目录，双击 DevKitImages.exe；不需要安装或管理员权限。必须保留 exe 旁的 resources、DLL、语言包等文件，不能只复制 exe。
- 更新时先关闭旧版，再解压到新的版本目录并运行新版 exe；原桌面快捷方式不会自动改指向。
- 这里“免安装”指无需安装程序；仍沿用 Electron 的用户数据目录规则，不承诺数据随 U 盘迁移。
- 准备发布时另用 npm run desktop:dist:installer 生成 NSIS 安装版；测试阶段不默认运行此命令。
- 既有安装包保留为历史产物，本轮不卸载旧应用，也不修改用户桌面入口。

## 0.1.1

功能与已验收的 0.1.1 保持一致：共享输入和拼接成品上限 6400 万像素，支持 2500 万像素照片。免安装 ZIP 不包含测试照片或日志。

验收：ZIP 全条目 CRC 校验通过；从 ZIP 解压副本运行 desktop-smoke.mjs 通过，包含离线重载、Worker/WASM 资源、安全配置、Base64 图片往返和导航。日志 output/desktop-25mp/portable-smoke.log。

最新 0.1.8 的图片加水印支持直接导入 HEIC/HEIF、NEF（单张与文件夹批量），共享组件也同步用于 Web 版，输入上限 100 MiB，默认输出 JPG；详见 [水印说明](WATERMARK.md)。0.1.6 的紧凑两行目录选择和默认收起清单继续保留。0.1.5 新增压缩转换、水印、照片边框的文件夹批量输入和目录输出，详见 [文件夹批量处理说明](WINDOWS_DESKTOP_FOLDER_BATCH.md)。0.1.4 的 HE★ 批量编码超时修复继续保留，见 [超时修复记录](WINDOWS_DESKTOP_BATCH_TIMEOUT.md)。
