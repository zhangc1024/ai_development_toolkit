import { hashFile, type WorkerResult } from './core'
function send(message: WorkerResult) { self.postMessage(message) }
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const hashes = await hashFile(event.data, loaded => send({ type: 'progress', loaded }))
    send({ type: 'done', hashes })
  } catch {
    send({ type: 'error', message: '文件读取或计算失败，请重新选择文件后重试。' })
  }
}
