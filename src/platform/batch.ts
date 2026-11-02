export interface BatchEntry { id: string; name: string; relative: string; size: number; reason?: string }
export interface BatchInput { id: string; path: string; entries: BatchEntry[] }
export interface BatchOutput { id: string; path: string; excluded: string[] }
export interface BatchSaveResult { status: 'ready' | 'saved' | 'skipped' | 'cancelled' | 'failed'; message?: string; path?: string; id?: string }
export interface BatchBridge {
  input(recursive: boolean): Promise<BatchInput | null>
  output(input: string): Promise<BatchOutput | null>
  read(input: string, file: string): Promise<Uint8Array>
  begin(input: string, output: string, file: string, name: string, size: number, conflict: 'rename' | 'skip'): Promise<BatchSaveResult>
  append(id: string, sequence: number, bytes: Uint8Array): Promise<BatchSaveResult>
  finish(id: string): Promise<BatchSaveResult>
  cancel(): Promise<void>
  release(): Promise<void>
  open(output: string): Promise<void>
}
declare global { interface Window { desktopBatch?: Readonly<BatchBridge> } }
export interface BatchResult { blob: Blob; name: string; notes?: string[] }
export type BatchProcessor = (file: File, signal: AbortSignal) => Promise<BatchResult>
export type BatchFactory = () => Promise<{ process: BatchProcessor; dispose?: () => void }> | { process: BatchProcessor; dispose?: () => void }
// Keep the processing suffix and extension within the desktop save limit.
export function batchFilename(name: string, suffix: string, extension: string): string {
  const ending = '-' + suffix + '.' + extension
  const limit = 240 - ending.length
  let stem = name.replace(/\.[^.]+$/, '').slice(0, limit)
  // Do not split a UTF-16 surrogate pair at the truncation boundary.
  if (/[\uD800-\uDBFF]$/.test(stem)) stem = stem.slice(0, -1)
  return stem + ending
}
export function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('已取消', 'AbortError')
}
export function runWorker<T>(create: () => Worker, payload: unknown, signal: AbortSignal, timeout = 60_000, transfer: Transferable[] = []): Promise<T> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const worker = create()
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate() }
    const fail = (error: Error) => { finish(); reject(error) }
    const abort = () => fail(new DOMException('已取消', 'AbortError'))
    const timer = setTimeout(() => fail(Error('单张图片处理超时，已停止')), timeout)
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => { finish(); data.error ? reject(Error(data.error)) : resolve(data) }
    worker.onerror = () => fail(Error('图片处理线程异常'))
    worker.onmessageerror = () => fail(Error('无法读取处理结果'))
    try { worker.postMessage(payload, transfer) } catch (error) { fail(error as Error) }
  })
}
