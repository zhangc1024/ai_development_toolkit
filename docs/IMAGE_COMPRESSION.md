# 图片压缩与格式转换

入口：图片工具 → 图片压缩 / 格式转换，地址 `#/image-compress`。

## 已完成
- 单图选择、拖放、粘贴；每次第一张，本地文件不上传。
- ZIP 批量扫描、逐张处理、保留目录和其他文件、下载 ZIP，见 [ZIP_IMAGE_PROCESSING.md](ZIP_IMAGE_PROCESSING.md)。
- 四档：保真优先（默认）、轻度压缩、均衡压缩、强力压缩。
- 目标：原格式（默认）、WebP、PNG、JPG、AVIF、TIFF、BMP。HEIC/RAW 的原格式选项转为 PNG，页面明确提示。
- 原图预览、原始/结果体积与变化率、结果下载。
- 同步对比滑块：左侧原图、右侧结果，适应宽度/100%/200%；透明背景采用棋盘格。
- 本地 Worker、60 秒超时、取消、选项变更丢弃结果、离页释放资源。

## 输入与输出约定
静态 PNG/JPG/WebP、HEIC/HEIF、AVIF、TIFF、BMP，以及 NEF/NRW/CR2/CR3/ARW/DNG/RAF/ORF/RW2/PEF/SRW，最大 100 MiB、6400 万像素，单边不超过 16384。
先检查文件头、容器尺寸和动画标识，再在 Worker 内解码。拒绝 GIF、APNG、动态 WebP、多余或截断的 PNG/WebP 数据及无法解码的图片。带 MPF 附加图像的 JPG 可导入；重新编码只处理浏览器解码的主图，保真原格式保留完整原文件。
通用图片按文件头识别，RAW 扩展名用于选择 LibRaw 解码器，文件内容仍由解码器验证。相机型号、压缩变体可能不受支持，不承诺所有设备。只接受本地文件，不支持远程 URL、相机或直接多选图片；ZIP 批量模式另见专门说明。
保留显示方向下的宽高，不缩放。带 EXIF 方向的照片可能在重新编码时交换宽高。
可编码原格式输出大于或等于原文件时保留原文件；HEIC/RAW 自动转 PNG 时始终返回真正 PNG，不退回原片；明确选择目标格式时仍提供转换结果，即使体积增加。
单图下载按真实格式命名；保留原文件使用 -original 后缀，其余使用 -compressed。ZIP 内同格式处理保留原路径和文件名；HEIC/RAW 自动转 PNG 会更改扩展名并避让重名。
PNG 量化保留透明支持，但半透明数值也可能随量化变化。JPG/BMP 透明区域合成白色。TIFF 写入未压缩 8 位 RGBA，使用非预乘透明标记。AVIF 保真档使用无损模式；其他档质量 80/60/40；固定单线程编码，不要求跨源隔离。TIFF/BMP 档位不改变编码，文件可能明显增大。

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
除 PNG 外，可编码格式的原格式保真档返回原始字节，不声称对它们实现了无损重压缩。
HEIC 使用 libheif；RAW 使用 LibRaw 完整解码与相机白平衡，不使用内嵌缩略图；TIFF 使用 UTIF；其余由浏览器解码。输出经过 8 位 sRGB 像素；EXIF/ICC 等原始元数据不写入新文件。广色域、HDR、16 位或专业印刷素材应另行保存原始文件；HEIC/RAW 转换无法保留其原始数据。HEIC 不保留 HDR 增益图、景深或 Live Photo。当前拒绝多图 HEIC、AVIF 序列、多页 TIFF，以及带非默认方向标记的 TIFF。
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

## RAW 部署要求（2026-09-21）

LibRaw-Wasm 1.6.0 的 WASM 使用共享内存，需要安全上下文（HTTPS 或 localhost）和跨源隔离。Vite dev/preview 已设置响应头；线上静态服务器需对文档和 Worker 等响应配置：

~~~nginx
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
~~~

必须部署完整 dist，包括 vendor/libraw/libraw.js、libraw.wasm、libraw.js.map。
没有响应头时，HEIC 与通用格式仍可使用，RAW 会给出配置提示，不静默返回缩略图。
跨源隔离可能影响外部嵌入或跨窗口交互；本工具资源同源。用户配置的 Ollama 请求仍需目标服务允许 CORS。
RAW 峰值内存可达数百 MiB 以上，手机大图可能失败或触发 60 秒超时；不自动降低分辨率。64 MP 边界也应用于 RAW 传感器尺寸（包括边缘像素）。

不提供 HEIC/NEF/CR2 等编码器。不能把普通图片恢复为相机传感器原始数据，也不把修改扩展名当作转换。

## 新增依赖与静态资源

- libheif-js 1.23.2：LGPL-3.0，按需加载。来源 https://github.com/catdad-experiments/libheif-js
- libraw-wasm 1.6.0：封装 ISC，内含 LibRaw 0.22.1（LGPL-2.1/CDDL 双许可，此处附 LGPL 文本）、Little CMS 2.19.1（MIT）及上游编解码依赖。来源及构建脚本 https://github.com/ybouane/LibRaw-Wasm/tree/v1.6.0
- public/vendor/libraw 三个文件逐字复制自对应 npm 包 dist；升级时须一起替换。可用上游源码与 compileLibraw.sh 重建后替换这些同名资源，不需要修改应用代码。
- @jsquash/avif：Apache-2.0 封装，底层 libavif/AOM 等许可见上游 jSquash 源码。实际版本在 package-lock.json。
- utif 3.1.0：MIT，TIFF 解码及编码；其 pako 依赖为 MIT/Zlib。
- 许可与来源说明随 public/licenses 部署。未修改第三方解码器源码；不从 CDN 动态加载代码。

## 格式扩展验证（2026-09-21）

- 534 项 Vitest 全部通过；生产构建及 git diff --check 通过。
- Windows Chrome 开发环境：公开 HEIC 样本 1440×960、Sony ARW 6240×4168（30.32 MiB）、Nikon NEF 4284×2844（10.16 MiB）完整解码；两种 RAW 转 JPG 成功，未降采样。
- HEIC 转 AVIF/TIFF/BMP/PNG/WebP 后独立使用 Pillow 检查实际签名、格式、尺寸；保真档 RGBA 像素与 PNG 基准逐字节相同。
- 生产构建：HEIC 解码，AVIF/TIFF/BMP 导出及重新导入通过；透明测试图的 AVIF/TIFF alpha=0/128 保留，BMP 透明填白、半透明合成白底。
- 生产 ZIP：HEIC 在原格式选项转 PNG，避让已有 PNG；损坏 NEF 与普通文本原样保留，下载 ZIP 的 CRC 校验通过。
- 移除 COOP/COEP 后实际检测到 crossOriginIsolated=false，RAW 返回配置提示。
- 未逐一取得 CR2/CR3/DNG/RAF/ORF/RW2/PEF/SRW/NRW 真实样本，也未覆盖所有型号、RAW 压缩变体、Safari/Firefox、移动设备内存极限。不把库宣称的格式覆盖视为逐机型验证。
- 测试照片来自 libheif-js、LibRaw-Wasm、rawpy 上游公开测试样本；样本及下载结果仅放在临时目录，未加入站点资源。
