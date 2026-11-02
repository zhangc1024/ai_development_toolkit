import type { PlatformFiles, SaveResult } from './types'
const CHUNK_BYTES = 4 * 1024 * 1024
let active = false
export const electronFiles: PlatformFiles = {
  async saveBlob(blob, suggestedName, options) {
    const bridge = window.desktopFiles
    if (!bridge) return { status: 'failed', message: '桌面保存接口不可用' }
    if (active || options?.signal?.aborted || options?.isCurrent?.() === false) return { status: 'cancelled' }
    const cancelled = () => options?.signal?.aborted || options?.isCurrent?.() === false
    active = true
    let id: string | undefined
    try {
      const begin = await bridge.begin(suggestedName, blob.size)
      if (begin.status !== 'ready') return begin
      id = begin.id
      let sequence = 0
      for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
        if (cancelled()) return { status: 'cancelled' }
        const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer())
        if (cancelled()) return { status: 'cancelled' }
        const result = await bridge.append(id, sequence++, bytes)
        if (result.status !== 'saved') return result
      }
      if (cancelled()) return { status: 'cancelled' }
      const result = await bridge.finish(id)
      if (result.status === 'saved') id = undefined
      return result
    } catch { return { status: 'failed', message: '保存失败，请检查目标文件及可用空间后重试' } }
    finally { if (id) await bridge.cancel(id).catch(() => {}); active = false }
  },
  saveText(text, name, mime = 'text/plain;charset=utf-8', options) {
    return this.saveBlob(new Blob([text], { type: mime }), name, options)
  },
}
