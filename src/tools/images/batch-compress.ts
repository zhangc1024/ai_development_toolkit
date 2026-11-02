import { batchFilename, runWorker, checkAbort, type BatchProcessor } from '../../platform/batch'
import { MIME, type CompressionLevel, type TargetFormat, type ImageFormat } from './compression'
export function compressionProcessor(level: CompressionLevel, target: TargetFormat, embedded = true): BatchProcessor {
  return async (file, signal) => {
    const buffer = await file.arrayBuffer()
    checkAbort(signal)
    const data = await runWorker<{ buffer: ArrayBuffer; format: ImageFormat; keptOriginal: boolean; notes: string[] }>(
      () => new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' }),
      { action: 'compress', buffer, name: file.name, level, target, allowEmbeddedRawPreview: embedded }, signal,
    )
    const extension = data.keptOriginal ? file.name.split('.').pop()! : data.format
    return { blob: new Blob([data.buffer], { type: MIME[data.format] }), name: batchFilename(file.name, 'compressed', extension), notes: data.notes }
  }
}
