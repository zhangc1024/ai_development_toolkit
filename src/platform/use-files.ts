import { onBeforeUnmount, ref } from 'vue'
import { files } from './index'
import type { SaveResult } from './types'

// Each tool owns its save lifetime. Navigating away or invalidating output
// aborts an outstanding dialog/write before finish commits the temporary file.
export function useFiles(report: (message: string, failed: boolean) => void) {
  const saving = ref(false)
  let controller: AbortController | undefined
  let generation = 0
  function cancelSave() { generation++; controller?.abort() }
  async function save(blob: Blob, name: string, valid: () => boolean = () => true): Promise<SaveResult> {
    if (saving.value || !valid()) return { status: 'cancelled' }
    saving.value = true
    const token = generation
    controller = new AbortController()
    const task = controller
    // Validity can change while a native dialog is open.
    const watch = setInterval(() => { if (!valid()) task.abort() }, 50)
    try {
      const result = await files.saveBlob(blob, name, { signal: task.signal, isCurrent: () => token === generation && valid() })
      if (token === generation && valid()) {
        if (result.status === 'failed') report(result.message, true)
        else if (result.status === 'saved') report('已保存', false)
        else if (result.status === 'dispatched') report('已开始下载', false)
      }
      return result
    } finally { clearInterval(watch); if (controller === task) controller = undefined; saving.value = false }
  }
  async function saveUrl(url: string, name: string, valid: () => boolean = () => true) {
    const token = generation
    const current = () => token === generation && valid()
    try {
      if (!current()) return { status: 'cancelled' } as SaveResult
      const blob = await (await fetch(url)).blob()
      return await save(blob, name, current)
    } catch { if (current()) report('无法读取待保存结果，请重新生成', true); return { status: 'failed', message: '无法读取待保存结果' } as SaveResult }
  }
  onBeforeUnmount(cancelSave)
  return { save, saveUrl, saving, cancelSave }
}
