import { RAW_EXTENSIONS, type RawFormat } from '../tools/images/photo-formats'
function request(message: Record<string, unknown>, raw = false, transfer: Transferable[] = []): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const worker = raw
      ? new Worker(new URL('./raw-probe.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./probe.worker.ts', import.meta.url), { type: 'module' })
    const timer = setTimeout(() => { worker.terminate(); reject(Error('诊断超过 120 秒，已终止')) }, 120_000)
    const stop = () => { clearTimeout(timer); worker.terminate() }
    worker.onerror = event => { stop(); reject(Error(event.message || '诊断 Worker 启动失败')) }
    worker.onmessage = ({ data }) => { stop(); data.error ? reject(Error(data.error)) : resolve(data) }
    worker.postMessage(message, transfer)
  })
}
export async function probe() {
  let rendererEvalBlocked = false
  try { new Function('return 1')() } catch { rendererEvalBlocked = true }
  const worker = await request({ action: 'probe' })
  const raw = await request({ action: 'probe' }, true)
  const logo = await fetch('/photo-frame/logos/nikon.svg')
  if (!logo.ok || !(await logo.text()).includes('<svg')) throw Error('品牌 LOGO 资源加载失败')
  return { rendererEvalBlocked, pageIsolated: crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer, node: typeof (globalThis as Record<string, unknown>).require, worker: { ...worker, ...raw }, logo: true }
}
export function decodeSample(buffer: ArrayBuffer, name: string, allowEmbeddedRawPreview = false) {
  return request({ action: 'decode', buffer, name, allowEmbeddedRawPreview }, RAW_EXTENSIONS.includes((name.split('.').pop()?.toLowerCase() ?? '') as RawFormat), [buffer])
}
