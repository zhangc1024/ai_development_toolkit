import type { PlatformFiles } from './types'
export const webFiles: PlatformFiles = {
  async saveBlob(blob, suggestedName, options) {
    if (options?.signal?.aborted || options?.isCurrent?.() === false) return { status: 'cancelled' }
    const url = URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = url; link.download = suggestedName; link.click()
      return { status: 'dispatched' }
    } finally { setTimeout(() => URL.revokeObjectURL(url), 60_000) }
  },
  saveText(text, name, mime = 'text/plain;charset=utf-8', options) {
    return this.saveBlob(new Blob([text], { type: mime }), name, options)
  },
}
