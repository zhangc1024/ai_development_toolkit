import { zipErrorMessage } from './zip-policy'
import { processZip, scanZip, type ImageZipResult } from './zip-engine'
import type { CompressionLevel, TargetFormat } from './compression'
let pending: { id: number; resolve: (value: ImageZipResult) => void; reject: (error: Error) => void } | undefined
let sequence = 0
self.onmessage = async ({ data }: MessageEvent) => {
  if (data.type === 'image-result') {
    if (!pending || pending.id !== data.id) return
    const task = pending; pending = undefined
    if (data.error) task.reject(new Error(data.error))
    else task.resolve(data.result)
    return
  }
  try {
    if (data.type === 'scan') {
      self.postMessage({ type: 'scanned', ...await scanZip(data.file) })
    } else if (data.type === 'run') {
      const result = await processZip(data.file, data.level as CompressionLevel, data.target as TargetFormat,
        (buffer, level, target) => new Promise((resolve, reject) => {
          const id = ++sequence
          pending = { id, resolve, reject }
          self.postMessage({ type: 'image', id, buffer, level, target }, { transfer: [buffer] })
        }),
        progress => self.postMessage({ type: 'progress', ...progress }))
      self.postMessage({ type: 'done', ...result })
    }
  } catch (e) { self.postMessage({ type: 'error', error: zipErrorMessage(e) }) }
}
