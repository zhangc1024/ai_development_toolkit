# 图片加水印

入口：图片工具 → 图片加水印，地址 `#/watermark`。

## 使用
1. 选择、拖放或粘贴静态 PNG / JPG / WebP、HEIC/HEIF 或 NEF 图片，最大 100 MiB、6400 万像素，单边 ≤ 16384。
2. 修改多行水印文字（每个最多 200 字符），默认带当天本地日期和平台认证用途。
3. 调整字号 8–512 px、文字透明度 0–100%、旋转 -180°–180°；文字背景始终透明。
4. 预设黑、白、红、黄。自定义支持 #RGB、#RRGGBB 或英文颜色名，如 red、gold、navy。透明度独立控制，不接受透明颜色或 CSS 表达式；无效输入阻止生成。
5. 点击文字选中并拖动；方向键每次移动原图 1 px，Shift + 方向键 10 px。Delete 删除。复制此水印生成独立副本（最多 30 个）；右侧列表可选择被覆盖的水印。
6. 选择 JPG / PNG / WebP，可勾选同时压缩，使用现有保真优先、轻度、均衡、强力四档。
7. 生成后复制图片或下载。改动文字、位置、颜色和导出设置会清除旧结果，需要重新生成。

水印位置和字号使用原图像素；预览缩放不影响导出。导出保持原图尺寸，超出边界部分裁掉，选中框不导出。至少需要一个非空、透明度大于 0% 的水印。可删除全部水印后重新添加。

## HEIC / NEF 导入（0.1.8，两端共用）

Web 与桌面版共用水印组件和照片解码 Worker；单图以及桌面文件夹批量均可直接导入 HEIC/HEIF、NEF 后加水印，无需手工先转换 JPG。默认导出 JPG，也可选 PNG / WebP；不会重新生成 HEIC 或 NEF。HEIC 仅处理单张静态主图，不保留 HDR、景深或 Live Photo，拒绝多图容器。普通 NEF 使用相机白平衡解码为 8 位 sRGB；Nikon HE/HE★ 使用经过验证的相机内嵌 JPEG，并展示兼容来源及实际尺寸，不声称完整 RAW 解码。源文件不修改；损坏或不支持的 NEF 报错，批量模式继续后续文件。

导入 Worker 可取消，超时 120 秒；桌面已具备跨源隔离，网页版 RAW 需要部署 COOP/COEP。输入支持上限 100 MiB、6400 万像素，不扩大到其他 RAW 格式。HEIC 无需跨源隔离也可使用。Web 同步包含文件选择、拖放、格式提示与 SEO 说明；原生文件夹选择仍属于桌面能力。

## 压缩衔接
页面直接复用 `src/tools/images/compress.worker.ts`，无需先下载再上传：
- 原图和水印合成 → 无损 PNG 中间图 → 现有 Worker 按输出格式编码。
- Worker 从不接收未加水印的原文件。先生成同格式的带水印基准图；压缩没有更小时保留这个带水印基准图；WebP 保真优先例外，始终使用无损编码结果，即使比浏览器有损基准图更大。
- 输出结果对比左侧压缩前、右侧压缩后，两边都带水印。
- 选择 JPG 时透明背景填白。即使关闭压缩，JPG 导出也是有损编码，WebP 使用浏览器高质量编码。
- 不保证体积降低，不按指定 KB 自动压缩。重新编码采用浏览器 8 位 sRGB，不保留原始 EXIF/ICC 元数据。
- 导入可取消，照片解码 Worker 120 秒超时；生成可取消，压缩 Worker 60 秒超时，离开页面会结束 Worker、释放位图和对象 URL。

## 0.1.8 Web 验证记录

- 759 项单元测试与 Web / Desktop 生产构建通过。
- Windows Edge 实际访问 Web 生产构建，无 Electron 桥接：HEIC → 带水印 JPG 3024×4032、普通 NEF → JPG 4284×2844、HE★ → JPG 5568×3712；下载文件名和内容有效，页面异常 0。
- 移除响应隔离头后，HEIC 仍可读取；NEF 明确提示需要跨源隔离，不伪装成已支持或返回错误缩略图。
- 证据：`output/playwright/web-watermark-1793604761161/result.json`；脚本 `scripts/web-watermark-photo-test.mjs`。
- 最终 Windows ZIP 解压复测通过：HEIC 单图导出、普通 NEF / HE★、HEIC/NEF 混合目录、损坏文件隔离、原件不变、取消。记录：`output/playwright/watermark-nef-1793604945239/result.json`。
- 交付：`release/DevKit-Images-0.1.8-win-x64-portable.zip` 和 `release/DevKit-Web-0.1.8.zip`（ZIP 根目录即 dist 内容）。两份 ZIP CRC 均通过，桌面 app.asar 与实测程序一致；各自 SHA-256 文件位于 release。
- 本轮更新共享代码和本地 dist，不代表已发布线上；部署需完整更新 dist，并保留 [部署说明](SEO_DEPLOYMENT.md) 中的响应头和 vendor/libraw 文件。

## 0.1.7 验证记录

- 759 项单元测试通过，包含 NEF 大于旧 10 MiB 上限、100 MiB 边界和不支持格式检查；Web / Desktop 构建及类型检查通过。
- Windows 最终 ZIP 解压程序验收通过：普通 NEF 完整解码、Nikon HE★ 导入和 5568×3712 JPG 输出、改变水印颜色后成品像素确实变化、混合损坏 NEF 的批量任务继续、源文件字节不变，以及取消 RAW 读取。页面异常为 0。
- 验收结果：`output/playwright/watermark-nef-1793604293757/result.json`。已有 PNG 和三工具批处理回归也通过：`output/playwright/folder-batch-1793604168886/result.json`。
- 交付：`release/DevKit-Images-0.1.7-win-x64-portable.zip`；CRC 校验通过，app.asar 与实测目录包一致，SHA-256 记录在同目录 `SHA256SUMS-0.1.7-portable.txt`。

## 复制与隐私
复制此水印是画布内复制对象；复制图片是将完整输出以 PNG 写入系统剪贴板。
剪贴板操作需要 HTTPS / localhost 和浏览器支持、用户授权。失败时提示下载；复制 PNG 的体积可能不同于 JPG/WebP 下载文件。
仅主动点击复制时写剪贴板；粘贴通过用户的粘贴事件读取。图片和水印不上传、不写入浏览器持久存储；刷新或离页后清空。
暂不支持 ZIP 批量加水印、动态图片或图片形式的水印。原有 ZIP 压缩入口保持不变。

## 实现与验证
- `src/tools/watermark/WatermarkTool.vue`：输入、编辑、预览、导出及压缩调度。
- `src/tools/watermark/import.ts`：单图与批量共用的输入检查和可取消 NEF 解码入口，复用已有照片 Worker。
- `src/tools/watermark/core.ts`：统一绘制、旋转命中检测、颜色与文件名处理。
- `tests/watermark.test.ts`：旋转命中、坐标缩放、导出文件名回归。
- 浏览器脚本在忽略目录 `output/playwright/watermark-smoke.js`。
- 2026-09-18：493 项 Vitest 测试通过，生产构建通过，git diff --check 通过。
- Windows Chrome 开发环境及生产构建：原图像素拖动定位与 PNG 导出一致、独立复制/删除、四种预设色、有效与无效自定义色、PNG/JPG/WebP × 四档压缩共 12 组合、水印保留、实际剪贴板 PNG 读回、WebP 文件名、390 px 窄屏、竖图比例、取消、清空和损坏输入验证通过。没有页面异常或外部图片上传请求。
- 浏览器使用合成素材验证，不代表所有实际证件、色彩配置及平台上传要求。Safari、Firefox、移动端真实触控与桌面壳尚未实机验收。

补充验证：保真 WebP 与带水印 PNG 基准图的解码像素哈希完全一致；模拟更大的压缩候选，回退结果仍逐像素保持带水印基准。最终首屏生成按钮可见，布局验收见项目根目录 design-qa.md。
