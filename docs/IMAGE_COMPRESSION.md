# 图片压缩与格式转换

入口：图片工具 → 图片压缩 / 格式转换，地址 `#/image-compress`。

## 已完成
- 单图选择、拖放、粘贴；每次第一张，本地文件不上传。
- ZIP 批量扫描、逐张处理、保留目录和其他文件、下载 ZIP，见 [ZIP_IMAGE_PROCESSING.md](ZIP_IMAGE_PROCESSING.md)。
- 四档：保真优先（默认）、轻度压缩、均衡压缩、强力压缩。
- 目标：原格式（默认）、WebP、PNG、JPG。
- 原图预览、原始/结果体积与变化率、结果下载。
- 同步对比滑块：左侧原图、右侧结果，适应宽度/100%/200%；透明背景采用棋盘格。
- 本地 Worker、60 秒超时、取消、选项变更丢弃结果、离页释放资源。

## 输入与输出约定
静态 PNG/JPG/WebP，最大 10 MiB、1600 万像素，单边不超过 16384。
先检查文件头、容器尺寸和动画标识，再在 Worker 内解码。拒绝 GIF、APNG、动态 WebP、MPO、多余或截断的 PNG/WebP 数据及无法解码的图片。
不根据文件扩展名或声明 MIME 判断真实类型。只接受本地文件，不支持远程 URL、相机或直接多选图片；ZIP 批量模式另见专门说明。
保留显示方向下的宽高，不缩放。带 EXIF 方向的照片可能在重新编码时交换宽高。
原格式输出大于或等于原文件时保留原文件；明确选择目标格式时仍提供转换结果，即使体积增加。
单图下载按真实格式命名；保留原文件使用 -original 后缀，其余使用 -compressed。ZIP 内原格式处理保留原路径和文件名。
PNG 量化保留透明支持，但半透明数值也可能随量化变化。JPG 透明区域合成白色。

## 编码策略
| 档位 | JPG / MozJPEG | WebP / libwebp | PNG / Imagequant 质量下限—目标 |
| --- | --- | --- | --- |
| 保真优先 | 原格式保留原文件；转换时质量 98，4:4:4 | 原格式保留原文件；转换时无损编码 | OxiPNG 无损优化，不量化 |
| 轻度 | 92，4:4:4 | 92 | 90—100 |
| 均衡 | 82，4:4:4 | 80 | 70—90 |
| 强力 | 65，4:2:0 | 60 | 45—70 |

这些数字是编码器参数，不是画质百分比或文件缩小比例。
PNG 无损优化使用 OxiPNG level 2，不修改全透明像素 RGB。原 PNG 直接优化原始文件，避免经过 8 位 Canvas。
PNG 有损档比较无损结果及不超过当前强度的量化候选，选择更小文件，避免减少颜色引起抖动后体积反增。候选失败或没有体积优势时保留无损结果。
WebP 使用 method 5、alpha_quality 100；保真转换采用 lossless。JPG 使用渐进编码。
质量下限属于量化器的内部评价，不等于保证肉眼看不出差异；实际效果需通过对比区判断。

## 色彩、元数据与保真边界
JPG/WebP 原格式保真档返回原始字节，不声称对它们实现了无损重压缩。
其他重新编码使用浏览器 createImageBitmap 解码、Canvas 的 8 位 sRGB 像素；EXIF/ICC 等原始元数据不写入新文件。广色域、HDR、16 位或专业印刷素材应优先保留原格式保真档。
跨格式无损编码仅指编码当前解码像素，并非原始文件字节或所有元数据无损。浏览器 HTMLImageElement 与 ImageBitmap 的 JPEG 解码可能存在细微舍入差异。
不保证压缩率与 TinyPNG 一致；没有对用户真实素材或 TinyPNG 结果做基准对比。

## 模块与运行环境
- `src/tools/images/compression.ts`：类型、档位、输入检查、输出选择与文件名。
- `compress.worker.ts`：解码、编码器加载、量化与候选选择。
- `ImageCompressTool.vue`：输入、状态、取消、预览、下载。
- WASM 通过构建资源 URL 本地加载，依赖不预打包；Imagequant 使用 vite-plugin-wasm。
- 采用模块 Worker、WebAssembly、OffscreenCanvas、createImageBitmap、顶层 await，需要现代浏览器。未提供不支持这些能力的旧浏览器回退编码器。
- OxiPNG 明确使用单线程版本，不需要跨域隔离响应头。
- 输入不保存到 localStorage、URL、日志或后端。下载由用户主动触发；保留原文件时原始元数据也会保留。
- 每个任务创建独立 Worker，完成/取消/超时终止。文件读取已开始时无法中止底层 arrayBuffer，但旧结果不会应用。
- 尚未在 Electron/Tauri 桌面壳、Safari/Firefox 中验收。

## 第三方依赖
锁定的实际版本见 package-lock.json。
- @jsquash/jpeg 1.6.0、@jsquash/webp 1.5.0、@jsquash/oxipng 2.3.0：[jSquash](https://github.com/jamsinclair/jSquash)，封装为 Apache-2.0，底层编码器各自许可见上游源码。
- imagequant 0.1.2：[imagequant-wasm](https://github.com/valterkraemer/imagequant-wasm)，npm 声明 GPL v3；其底层为 libimagequant。不是 MIT 依赖，产品分发时需将其 GPL 许可要求纳入发布方案。
- vite-plugin-wasm：构建时使用，不调用远程转换服务。
- 随静态资源保留 `public/licenses/` 下的许可证和来源说明。本次未发布站点，也未改变项目本身的许可证。

## 验证（2026-09-17）
- 全部 361 项 Vitest 测试通过，其中 14 项新增检查输入尺寸、动画/截断拒绝、保留原文件、输出扩展名等。
- Windows Chrome 开发环境：16 种档位/目标格式组合，透明度、JPG 白底、下载文件名、取消、错误文件、桌面及 390px 宽度检查通过。
- Windows Chrome 生产构建：PNG/JPG/WebP × 四档 × 四目标共 48 种组合通过。
- 生产样图验证：PNG 原格式保真像素一致；JPG/WebP 原格式保真字节一致；保真转 PNG/WebP 与 ImageBitmap 解码像素一致。
- 生产拒绝 APNG、动态 WebP、损坏图片；选项变更清除旧结果。正常压缩无页面异常、无外部图片上传请求。
- 样图由 Canvas 生成，包含渐变、文字、色块、透明区域，覆盖三种输入格式；不代表所有摄影素材或色彩配置。
- 另以模拟时钟和拦截编码器加载验证 60 秒超时终止；粘贴、离页取消、重新进入时状态清空通过。
- 自动化脚本位于忽略目录 `output/playwright/compression-*.js`。桌面/窄屏截图已检查。
