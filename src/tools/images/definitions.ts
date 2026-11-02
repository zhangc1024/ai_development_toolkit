import { defineAsyncComponent, h, type Component } from 'vue'
import type { ToolDefinition } from '../registry'
import ToolLoadError from './ToolLoadError.vue'
const lazy = (loader: () => Promise<{ default: Component }>) => defineAsyncComponent({ loader, timeout: 30_000, loadingComponent: { render: () => h('p', { role: 'status' }, '正在加载工具…') }, errorComponent: ToolLoadError })
export const imageTools: ToolDefinition[] = [
  { id: 'double-exposure', name: '双重曝光', description: '将风景融入人像轮廓，调整渐变与色调，本地高清导出', category: '图片工具', status: 'ready', component: lazy(() => import('../double-exposure/DoubleExposureTool.vue')) },
  { id: 'photo-frame', name: '照片水印边框', description: '品牌 LOGO、拍摄参数与虚化边框，支持 HEIC/RAW，本地高清导出', category: '图片工具', status: 'ready', component: lazy(() => import('../photo-frame/PhotoFrameTool.vue')) },
  { id: 'watermark', name: '图片加水印', description: '支持 JPG、PNG、WebP、HEIC、NEF，添加文字水印并本地导出', category: '图片工具', status: 'ready', component: lazy(() => import('../watermark/WatermarkTool.vue')) },
  { id: 'image-compress', name: '图片压缩 / 格式转换', description: '压缩图片，导入 HEIC/RAW，导出 JPG、PNG、WebP 等', category: '图片工具', status: 'ready', component: lazy(() => import('./ImageCompressTool.vue')) },
  { id: 'image-stitch', name: '图片拼接', description: '垂直、水平或宫格合并多张图片，调整间距与背景，本地导出', category: '图片工具', status: 'ready', component: lazy(() => import('../image-stitch/ImageStitchTool.vue')) },
  { id: 'moments-grid', name: '一图切九格', description: '裁剪九宫格，打包下载分享', category: '图片工具', status: 'ready', component: lazy(() => import('../moments-grid/MomentsGridTool.vue')) },
  { id: 'image-base64', name: '图片 ↔ Base64', description: '图片与 Base64 字符串互转', category: '图片工具', status: 'ready', component: lazy(() => import('./ImageTool.vue')), props: { kind: 'image-base64' } },
  { id: 'qr-reader', name: '二维码识别', description: '从图片中提取二维码内容', category: '图片工具', status: 'ready', component: lazy(() => import('./ImageTool.vue')), props: { kind: 'qr-reader' } },
 ]
