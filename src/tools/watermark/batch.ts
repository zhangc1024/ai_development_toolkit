import { batchFilename, checkAbort, type BatchProcessor } from '../../platform/batch'
import { MIME, type CompressionLevel, type ImageFormat } from '../images/compression'
import { decodeWatermark } from './import'
import { compressionProcessor } from '../images/batch-compress'
import { canvasBlob, paint, type Watermark } from './core'
export function relativeMarks(marks: Watermark[], from: { width: number; height: number }, to: { width: number; height: number }): Watermark[] {
  const scale = Math.min(to.width, to.height) / Math.min(from.width, from.height)
  return marks.map(mark => ({ ...mark, x: mark.x / from.width * to.width, y: mark.y / from.height * to.height, size: mark.size * scale }))
}
export function watermarkProcessor(marks: Watermark[], source: { width: number; height: number }, format: ImageFormat, compress: boolean, level: CompressionLevel): BatchProcessor {
  return async (file, signal) => {
    const decoded = await decodeWatermark(file, signal)
    const bitmap = decoded.bitmap
    const canvas = document.createElement('canvas')
    try {
      checkAbort(signal)
      await document.fonts.ready; checkAbort(signal)
      canvas.width = bitmap.width; canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      paint(ctx, bitmap, relativeMarks(marks, source, bitmap), canvas.width)
      if (format === 'jpg') { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'source-over' }
      const png = await canvasBlob(canvas); checkAbort(signal)
      const before = format === 'png' ? png : await canvasBlob(canvas, MIME[format], .98)
      let blob = before, notes: string[] = []
      if (compress) {
        checkAbort(signal)
        const encoded = await compressionProcessor(level, format)(new File([png], 'watermarked.png'), signal)
        if (encoded.blob.size < before.size || (format === 'webp' && level === 'preserve')) { blob = encoded.blob; notes = encoded.notes ?? [] }
        else notes = ['本次压缩未减小体积，已保留未压缩的带水印图片。']
      }
      checkAbort(signal)
      return { blob, name: batchFilename(file.name, 'watermarked', format), notes: [...decoded.notes, ...notes] }
    } finally { bitmap.close(); canvas.width = canvas.height = 1 }
  }
}
