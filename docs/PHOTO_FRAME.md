# 照片水印边框

入口：/tools/photo-frame/。独立于原有文字水印工具，所有照片、LOGO 和拍摄信息在浏览器本地处理，不上传、不保存历史。

## 使用与实现边界

- 单张 JPG、PNG、WebP、HEIC/HEIF 或 RAW，最大 100 MiB、6400 万像素、单边 16384 px。RAW 的传感器边缘也计入尺寸限制。
- 白底参数栏默认显示曝光参数和时间；9:16 竖版海报默认显示型号和时间；3:2 横版卡片默认显示型号和曝光参数。各字段可修改、隐藏，空值自动省略。切换模板/恢复默认会重置模板样式和字段显示，保留填写内容。
- 内置 Nikon、Canon、Sony、Fujifilm、Leica 及 15 个手机品牌的实际 LOGO，默认保留品牌原色。Nikon 有彩色方标和可随文字颜色变化的字标。来源见 public/photo-frame/logos/SOURCES.md。自定义 LOGO 支持 PNG/WebP/JPG，最大 10 MiB、1600 万像素。
- 普通图片/HEIC 从原文件读取 EXIF；WebP 提取 RIFF EXIF 块交给 exifr；RAW 从 LibRaw 获取元数据。EXIF 的无时区时间保留相机墙上时间；直接 WASM 返回的 RAW 时间戳先转换为 Date，再按 UTC 字段格式化，不随浏览器时区变化。
- 更换照片会清空旧拍摄信息、重新匹配初始品牌，保留当前模板样式。缺失信息不会用当前时间或文件时间填充。
- 几何布局基于原图，预览和导出使用同一渲染函数。解码及导出分别使用可终止 Worker，120 秒超时；换图、取消及离页会使旧结果失效并释放资源。
- 默认 JPG 质量 95%，可选 PNG；长边 2048/4096 px 或原尺寸级输出，不放大主体照片。最终画布最多 3200 万像素、单边 16384 px，原尺寸级输出超限时需降低尺寸。
- 尼康高效率 HE/HE★ NEF：当前 WASM 不支持其传感器像素解码。照片水印边框明确使用内嵌相机 JPEG，并显示实际尺寸；没有有效内嵌图时拒绝处理。JPEG 方向优先按自身 EXIF 处理，没有方向标记时使用 RAW 方向，避免二次旋转。无损/普通压缩 NEF 保持 RAW 解码。
- 输出为普通合成图，不保留原始 EXIF/ICC、RAW 传感器数据或 HDR。RAW 使用相机白平衡、8 位 sRGB，可能与相机 JPEG 色彩不同。没有批处理、自由拖拽排版或后台服务。

## 部署

沿用 docs/IMAGE_COMPRESSION.md 的 RAW 部署要求。必须发布完整 dist，包含 assets 下的两个新 Worker、EXIF 动态模块、HEIC WASM，以及 vendor/libraw 和 photo-frame/logos。

HTTPS 文档与 Worker 响应需要：

~~~nginx
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
~~~

注意现有 Nginx location 中的 add_header（例如 Cache-Control）可能覆盖 server 层头的继承；应在这些 location 中同时配置隔离头，或按所用 Nginx 版本设置正确的继承策略。JS/CSS/WASM 返回正确 MIME，品牌素材同源加载。Vite dev/preview 已包含隔离头，但不能据此断言线上配置正确。

上线后检查：
1. 工具 HTML、photo.worker/export.worker、EXIF 分块、HEIC 和 RAW WASM 均返回成功。
2. 在工具页控制台确认 crossOriginIsolated === true，并用真实 RAW 完成导入和导出。
3. 保留旧版本哈希资源，避免发布过程中正在使用的页面加载不到 Worker。
4. 缺少隔离头时 RAW 必须显示明确配置提示；JPG/PNG/WebP/HEIC 仍可使用。

2026-10-30 只读检查 https://tools.zhangc.net/：HTML 未返回 COOP/COEP；/vendor/libraw/libraw.wasm 返回 200，MIME 为 application/wasm。本次没有修改生产服务器或部署站点，上线前需要补齐响应头。

## 验证记录（2026-10-30）

- Vitest：新增布局、缺失/非法元数据、时间、品牌识别、隐藏字段、WebP EXIF 容器及实际 EXIF 解析测试。全项目 32 个测试文件、681 项测试通过，生产构建及 git diff --check 通过。
- 生产构建：静态生成 35 页及 404，工具页和 sitemap 包含 photo-frame，两个 Worker 成功独立打包。生产预览验证解码、EXIF 动态加载和导出成功。
- Chromium：桌面 1440 px 与窄屏 390 × 844，实测无横向溢出。三个模板 JPG 导出分别为 4096×3195、2304×4096、4096×2731；自定义透明 LOGO 和 PNG 导出成功。
- JPG 样本：exif-js example/DSCN0614_small.jpg，识别 Nikon E4600 和 2006-06-13 15:44:45。
- HEIC 样本：exifr test/fixtures/heic-iphone.heic，解码 4032×3024，识别 iPhone XS Max 和 2019-08-21 10:57:23。libheif examples/example.heic 为多图文件，按预期拒绝。
- NEF 样本：raw.pixls.us 编号 8365，Nikon D5300 12-bit lossy，解码 6016×4016，读取曝光参数和 2025-07-20 09:18:32，完成三个模板导出。
- ARW 样本：LibRaw-Wasm example-sony.ARW，Sony ILME-FX30，解码 6240×4168并读取型号。首次实测发现直接 WASM 秒级时间戳与包声明 Date 不同，已在共享解码器转换。
- 合成方向测试：80×40 JPEG 带 EXIF Orientation=6，导入显示40×80，导出成功；没有再次应用 EXIF 旋转。
- 异常交互：取消 RAW 解码、RAW 尚未完成时换成 JPG、损坏文件、超长型号、自定义透明 LOGO、所有品牌切换、故意阻断导出 Worker 后恢复可重试状态。
- 导出取消后没有触发旧下载，随后重新导出成功；三种模板 PNG 与预览的每通道平均像素差分别约 0.046、0.027、0.080（0–255），存在文字边缘抗锯齿差异，不声明逐像素相同。
- 通过浏览器拦截移除文档隔离头，确认 crossOriginIsolated=false；RAW 明确报配置错误，随后 JPG 仍能导入。
- 截图在忽略目录 output/playwright/photo-frame-*.png；大体积测试原片留在 /tmp/photo-frame-samples，不纳入仓库。

未逐一实测 NRW/CR2/CR3/DNG/RAF/ORF/RW2/PEF/SRW 或所有相机压缩变体；这些格式沿用已有 LibRaw 支持范围。尚未进行真实 iOS/Android 设备、Safari/Firefox 兼容性验收，也不承诺保留广色域/HDR。

样本来源：
- https://github.com/exif-js/exif-js/blob/master/example/DSCN0614_small.jpg
- https://github.com/MikeKovarik/exifr/tree/master/test/fixtures
- https://github.com/strukturag/libheif/blob/master/examples/example.heic
- https://raw.pixls.us/ （编号 8365，CC0）
- https://github.com/ybouane/LibRaw-Wasm/blob/main/example-sony.ARW

新增 exifr 7.1.3 使用 MIT 许可，文本随站点保存于 public/licenses/exifr-MIT.txt。

## Z50II 高效率 NEF 彩条修复（2026-10-30）

复现：raw.pixls.us 的 Z50_2 DX 三个 CC0 样本。编号 7762（无损）正常；7763（HE★）和 7764（HE）在旧路径输出彩色条纹，但 WASM 返回成功和正常长度的 RGB 数组。因此仅检查尺寸/数组长度无法识别此失败。

修复：NEF/NRW 请求完整 MakerNote，依据 Nikon NEFCompression=13（HE）、14（HE★）在调用 imageData 之前拦截。仅照片水印边框显式启用 allowEmbeddedRawPreview，提取 thumbnailData 的相机 JPEG，经文件头、真实尺寸和方向校验后用于预览及导出，页面保留显式兼容提示。样本内嵌 JPEG 均为 5568×3712。其他调用方默认禁止降级并给出明确格式错误，避免压缩工具继续生成彩条；未改动 LibRaw 二进制文件。

兼容策略与方向变换有单元测试；真实 Z50II 无损/HE/HE★ 与 D5300 NEF 均完成浏览器检查。方向测试覆盖 LibRaw flip 与 JPEG EXIF 的优先级及八种变换边界。尚未拿到用户本人的 NEF，复现与验证使用同机型公开样本。

压缩类型标识参考 ExifTool Nikon MakerNote 定义：
https://github.com/exiftool/exiftool/blob/master/lib/Image/ExifTool/Nikon.pm

修复验证结果：33 个测试文件、693 项测试通过，生产构建通过；HE/HE★ 在生产构建预览中正常显示并完成 JPG 导出，实际画布 4096×2731，内嵌源图 5568×3712。修复后的截图为 output/playwright/production-fixed-z50ii-HEstar.NEF.png 和 production-fixed-z50ii-HE.NEF.png。

## 手机品牌与型号解析（2026-10-30）

- 支持 Apple、华为、荣耀、小米、Redmi、POCO、三星、OPPO、vivo、iQOO、一加、realme、Google、Nothing、Motorola。读取 EXIF Make/Model，RAW 元数据沿用同一归一化规则；iPhone、Pixel 等已有可读名称直接保留。
- 本地机型表收录 53 组机型、147 个精确型号代码，例如 23127PN0CC → Xiaomi 14、SM-S928B → Galaxy S24 Ultra、PHY110 → OPPO Find X7 Ultra、V2309A → vivo X100、HBN-AL00 → HUAWEI Pura 70 Pro。不按代码前缀猜测型号。
- 缺失品牌时，只根据已收录代码或明确的品牌/产品名称补齐。Xiaomi 旗下 Redmi/POCO、vivo 旗下 iQOO 可按型号细分。其他品牌冲突保留原型号，相机数据保持原有行为。未收录、无法区分变体的代码保留原值，不从文件名、文件时间推断。
- 手机品牌在品牌选项中使用本地实际 LOGO 素材，保留品牌原色；仍可选择不显示或上传自定义 LOGO。字段名称调整为“设备型号”，所有字段仍可编辑、隐藏。
- 机型表维护于 src/tools/photo-frame/devices.ts，照片处理时无需联网。主流品牌识别不等于收录全部历史/地区版本；新型号需补充精确映射。社交平台压缩或截图可能没有 EXIF，无法自动恢复拍摄设备。

型号核对来源：

- Google 官方公开设备清单：https://storage.googleapis.com/play_public/supported_devices.csv （本次读取并选取机型；排除通用的 Xiaomi for arm64 等非精确代码）。
- 华为官方型号清单：https://consumer.huawei.com/cn/support/content/zh-cn16102077/ （Mate 60/70、Pura 70/80 部分机型；LMR-AL10 等共享代码未作具体机型映射）。

本次验证：33 个测试文件、720 项测试通过，生产构建通过。Chromium 使用合成三星 SM-S928B EXIF JPEG 验证自动填入 Galaxy S24 Ultra、15 个手机文字标识切换和 JPG 导出；390px 窄屏检查无横向溢出。另用真实 iPhone HEIC 样本确认 Apple / iPhone XS Max 读取正确，最终构建 390×844 检查无横向溢出。合成样本用于验证解析链路，不代表全部手机原片或真实 iOS/Android 设备兼容性。浏览器环境缺少中文字形，中文视觉验收仍需在实际使用环境确认。

## 新版 iPhone HEIC 拍摄信息读取修复（2026-10-30）

复现：用户提供的 IMG_2930.HEIC 能正常解码为 3024×4032，但品牌、型号及曝光字段为空。文件 EXIF 完整；exifr 7.1.3 在文件类型检测阶段将超过 50 字节的 ftyp 直接拒绝，而该原片的 ftyp 为 52 字节。

修复：通过 exifr 公开 fileParsers 注册接口扩展 HEIC 检测，复用项目 detectPhoto 的文件头、品牌和长度校验，后续容器/EXIF 解析保持由 exifr 负责。没有改写原文件、裁剪文件头或修改依赖包；EXIF 绝对偏移保持不变。此次兼容范围是文件类型检测，不承诺涵盖所有 HEIF 容器变体。

验证：新增不含用户照片数据的合成容器回归测试，覆盖 52 字节 ftyp、扩展 mdat、旧 HEIC、heix/mif1、无 EXIF 及非法长度；修复前 3 项失败，修复后通过。34 个测试文件、726 项测试及生产构建通过。浏览器用用户原片复测，正确读出 Apple / iPhone 16 Pro Max、曝光参数与时间，自动选择 Apple 文字标识，并完成 JPG 导出。未部署线上站点。

上游问题：https://github.com/MikeKovarik/exifr/issues/138

## 全品牌原色 LOGO（2026-10-30）

补齐 15 个手机品牌的真实图形/字标，并为现有相机品牌提供原色版本，共 20 个品牌。Google 使用多色字标；小米、华为、三星、OPPO、vivo、一加、摩托罗拉、Redmi、POCO、iQOO 等保留对应品牌色；Apple、Sony、荣耀、Nothing、realme 使用核实后的黑色官方风格。荣耀采用官网当前的环形图案加字标，Nothing 使用公司字标，不使用 Nothing OS 标识。

去除手机品牌的 Canvas 临时字体绘制。预览与导出复用本地原色 SVG，不再将原色图像染为文字色。Nikon 默认在所有模板中使用彩色方标，仍可手动切换跟随文字色的单色字标。来源、素材处理及署名记录在 public/photo-frame/logos/SOURCES.md。

本次 LOGO 验证：生产构建与差异格式检查通过；20 个品牌在三个模板中完成 60 次 JPG 实际导出，全部成功；Google 预览页脚存在彩色像素，导出图人工检查保留多色；尼康单色字标切换正常；390px 无横向溢出。素材核对总览为 output/playwright/brand-logos-final.png，浏览器工具页没有错误或警告。未部署线上站点。
