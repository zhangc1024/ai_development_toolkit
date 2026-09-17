import { inspectImage, MIME, QUALITY, selectOutput, type CompressionLevel, type TargetFormat } from './compression'
import { validateDimensions } from './core'
import jpegWasm from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url'
import webpWasm from '@jsquash/webp/codec/enc/webp_enc.wasm?url'
import webpSimdWasm from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url'
import oxiWasm from '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url'

self.onmessage = async ({ data }: MessageEvent<{ action: 'inspect' | 'compress'; buffer: ArrayBuffer; level: CompressionLevel; target: TargetFormat }>) => {
  let bitmap: ImageBitmap | undefined
  try {
    const { buffer, level, target, action } = data
    const info = inspectImage(new Uint8Array(buffer))
    const format = target === 'original' ? info.format : target
    if (!QUALITY[level] || !MIME[format]) throw Error('无效的压缩选项')
    bitmap = await createImageBitmap(new Blob([buffer], { type: MIME[info.format] }))
    validateDimensions(bitmap.width, bitmap.height)
    const width = bitmap.width, height = bitmap.height
    if (action === 'inspect') { self.postMessage({ width, height, format: info.format }); return }
    const notes: string[] = []
    let encoded: ArrayBuffer
    if (level === 'preserve' && target === 'original' && info.format !== 'png') {
      encoded = buffer
      notes.push('保真优先：保留原始文件，避免对已有 JPG/WebP 再次有损编码。可选择轻度压缩进一步减小体积。')
    } else {
      const q = QUALITY[level]
      if (format === 'png') {
        const oxi = await import('@jsquash/oxipng/codec/pkg/squoosh_oxipng.js')
        await oxi.default(oxiWasm)
        // Original PNG optimisation keeps its color profile and avoids an 8-bit canvas round-trip.
        const lossless = () => {
          if (info.format === 'png') return oxi.optimise(new Uint8Array(buffer), 2, false, false).slice().buffer as ArrayBuffer
          const pixels = getPixels(bitmap!, false)
          return oxi.optimise_raw(pixels.data, width, height, 2, false, false).slice().buffer as ArrayBuffer
        }
        encoded = lossless()
        if (level !== 'preserve') {
          const pixels = getPixels(bitmap, false)
          const { Imagequant, ImagequantImage } = await import('imagequant')
          const tiers = (['light', 'balanced', 'strong'] as const)
          let quantized = false
          let rejected = false
          for (const tier of tiers.slice(0, tiers.indexOf(level) + 1)) {
            const quant = new Imagequant()
            try {
              const quality = QUALITY[tier]
              quant.set_quality(quality.pngMin, quality.pngTarget); quant.set_speed(4)
              // process consumes ImagequantImage, including its error path.
              const image = new ImagequantImage(new Uint8Array(pixels.data.buffer), width, height, 0)
              let reduced: Uint8Array
              try { reduced = quant.process(image) }
              catch { rejected = true; continue }
              const candidate = oxi.optimise(reduced, 2, false, false).slice().buffer as ArrayBuffer
              if (candidate.byteLength < encoded.byteLength) {
                encoded = candidate
                quantized = true
              }
            } finally { quant.free() }
          }
          if (quantized) notes.push('已进行颜色量化并选择较小候选，最多 256 色；保留透明支持，但颜色及透明度数值可能变化。')
          else notes.push(rejected
            ? '颜色量化未通过质量要求或未完成，已回退无损 PNG 优化。'
            : '颜色量化没有带来体积收益，使用无损 PNG 优化结果。')
        }
      } else {
        const pixels = getPixels(bitmap, format === 'jpg')
        if (format === 'jpg') {
          const jpeg = await import('@jsquash/jpeg/encode.js')
          await jpeg.init({ locateFile: () => jpegWasm })
          encoded = await jpeg.default(pixels, { quality: q.jpeg, progressive: true, optimize_coding: true, auto_subsample: false, chroma_subsample: level === 'strong' ? 2 : 1 })
          notes.push('JPG 使用 MozJPEG 编码；透明区域填白。JPG 转换始终为有损编码。')
        } else {
          const webp = await import('@jsquash/webp/encode.js')
          await webp.init({ locateFile: (path: string) => path.includes('simd') ? webpSimdWasm : webpWasm })
          encoded = await webp.default(pixels, { quality: q.webp, lossless: level === 'preserve' ? 1 : 0, method: 5, alpha_quality: 100, exact: 1 })
          notes.push(level === 'preserve' ? 'WebP 无损编码当前解码像素。' : 'WebP 有损编码，透明通道质量保持为 100。')
        }
      }
      if (!(format === 'png' && info.format === 'png' && (level === 'preserve' || !notes.some(n => n.startsWith('已进行'))))) {
        notes.push('重新编码按浏览器解码后的 sRGB、8 位像素处理，不保留 EXIF/ICC 等原始元数据；广色域、16 位图片可能变化。')
      }
    }
    const chosen = selectOutput(buffer, encoded!, target)
    if (chosen.keptOriginal) {
      notes.length = 0
      notes.push(level === 'preserve' && info.format !== 'png'
        ? '保真优先：保留原始 JPG/WebP，避免再次损失画质；可选择轻度压缩进一步减小体积。'
        : '原图已较优，本次未减小体积，已保留原文件。')
    }
    self.postMessage({ ...chosen, width, height, format, notes }, { transfer: [chosen.buffer] })
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) })
  } finally { bitmap?.close() }
}
function getPixels(bitmap: ImageBitmap, white: boolean) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
  if (!context) throw Error('当前浏览器不支持本地图片处理')
  if (white) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height) }
  context.drawImage(bitmap, 0, 0)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}
