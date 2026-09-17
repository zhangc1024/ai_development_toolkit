import { generateKeys, processRsa, type WorkerRequest } from './core'
self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.action === 'generate') self.postMessage({ keys: await generateKeys(data.bits, data.format) })
    else self.postMessage({ result: processRsa(data) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'RSA 操作失败' })
  }
}
