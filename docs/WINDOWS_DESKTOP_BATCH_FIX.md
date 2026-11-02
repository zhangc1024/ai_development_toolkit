# 0.1.2：ZIP 批量 HEIC/NEF 修复

日期：2026-11-02。按用户反馈修复批量处理，并继续仅交付免安装 ZIP。

## 行为

- ZIP 原格式模式：包括 HEIC/RAW 的 PNG 转换结果在内，候选文件不小于输入时保留原件，保留原扩展名、字节和元数据；表格标记为“原样保留”，不会将较大的 PNG 算作压缩成功。主动选择 JPG/PNG/WebP 等目标格式则仍允许转换结果变大。
- ZIP 增加“尼康 HE/HE★ 兼容：使用相机内嵌 JPEG（非 RAW 原始像素）”复选框，默认关闭。开启后使用已存在且经过校验的相机 JPEG 解码分支，不调用会产生条纹的 HE/HE★ RAW 像素解码。普通 RAW 继续完整解码；无有效内嵌 JPEG、损坏文件仍报告失败并保留原件。
- 开关变化取消当前任务并清除旧结果。每项输出说明标记内嵌 JPEG 来源及实际像素尺寸。JPG 重编码不保留 RAW 数据或拍摄元数据。
- 当前修复范围为 ZIP 批量；单图模式 HEIC/RAW 原格式转换规则未调整。

## 验证

754 项单元测试通过，新增 HEIC/RAW 变大保留、主动格式转换及输出命名覆盖。Web 类型检查和生产构建通过。

使用用户授权的 D:\\test 样本（不随包分发）：
- 原格式：IMG_2930.HEIC 输出保留为 HEIC，1,292,964 字节，解包后与输入逐字节一致；未勾选兼容时两张 HE★ NEF 仍保留原件并明确提示。
- 勾选兼容，目标 JPG、均衡压缩：CHZ_0117.NEF → JPG 1,112,796 字节；CHZ_0120.NEF → JPG 2,048,147 字节，内嵌 JPEG 尺寸均为 5568×3712。
- 同一 JPG 均衡设置下，HEIC → JPG 813,026 字节。
- scripts/desktop-batch-fix-test.mjs 通过真实打包应用、IPC 保存、ZIP CRC 解包和输出图像解码验证。报告位于 output/desktop-batch-fix/result.json。

最终交付：release/DevKit-Images-0.1.2-win-x64-portable.zip，完整解压后运行 DevKitImages.exe。用户原桌面快捷方式仍指向历史版本。
