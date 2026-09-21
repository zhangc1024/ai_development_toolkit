import { BlobReader, Uint8ArrayReader, ZipReader, ZipWriter, type Entry, type FileEntry } from '@zip.js/zip.js'
import { MAX_PHOTO_BYTES, detectPhoto } from './photo-formats'
import { inspectImage, type CompressionLevel, type ImageFormat, type TargetFormat } from './compression'
import { checkedSize, createZipNamer, looksLikeImage, safeZipPath, supportedImageCandidate, validateZipPaths, ZIP_LIMITS, type ZipLimits, type ZipRow } from './zip-policy'

export interface ImageZipResult { buffer: ArrayBuffer; format: ImageFormat; keptOriginal: boolean; notes: string[] }
export type ZipImageProcessor = (buffer: ArrayBuffer, level: CompressionLevel, target: TargetFormat, name?: string) => Promise<ImageZipResult>
export type ZipProgress = { phase: 'extract' | 'image' | 'pack'; index: number; total: number; path: string; row?: ZipRow }
export async function openZip(file: Blob, limits: ZipLimits = ZIP_LIMITS) {
  if (!file.size || file.size > limits.archiveBytes) throw Error('ZIP 必须非空且不超过 50 MiB')
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (head[0] !== 80 || head[1] !== 75 || !((head[2] === 3 && head[3] === 4) || (head[2] === 5 && head[3] === 6))) throw Error('不是支持的普通 ZIP 文件；不支持分卷包、自解压包或 RAR')
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false, checkSignature: true, checkOverlappingEntry: true, strictness: 'strict' })
  const entries: Entry[] = [], rows: ZipRow[] = []
  let total = 0
  try {
    for await (const entry of reader.getEntriesGenerator()) {
      if (entries.length >= limits.entries) throw Error('ZIP 最多包含 500 个文件或文件夹条目')
      if (entry.encrypted) throw Error('暂不支持加密 ZIP，请先解除密码')
      if (entry.diskNumberStart) throw Error('暂不支持分卷 ZIP')
      const mode = (entry.unixMode ?? 0) & 0xf000
      if (mode && mode !== 0x8000 && mode !== 0x4000) throw Error('ZIP 包含符号链接或特殊文件，不支持处理')
      const path = safeZipPath(entry.filename, entry.directory)
      checkedSize(entry.uncompressedSize, limits.expandedBytes)
      if (entry.directory && entry.uncompressedSize !== 0) throw Error('ZIP 文件夹条目包含异常数据')
      total += entry.uncompressedSize; checkedSize(total, limits.expandedBytes)
      entries.push(entry)
      rows.push({ path, directory: entry.directory, size: entry.uncompressedSize, status: 'pending', reason: entry.directory ? '文件夹' : '等待处理', image: !entry.directory && looksLikeImage(path) })
    }
    validateZipPaths(rows)
    return { reader, entries, rows, total }
  } catch (e) { await reader.close(); throw e }
}
export async function scanZip(file: Blob, limits: ZipLimits = ZIP_LIMITS) {
  const archive = await openZip(file, limits)
  try { return { rows: archive.rows, total: archive.total } }
  finally { await archive.reader.close() }
}
export async function processZip(file: Blob, level: CompressionLevel, target: TargetFormat, processImage: ZipImageProcessor, progress: (data: ZipProgress) => void, limits: ZipLimits = ZIP_LIMITS) {
  const archive = await openZip(file, limits)
  const nameFor = createZipNamer(archive.rows.map(row => row.path))
  const parts: Uint8Array<ArrayBuffer>[] = []
  let zipBytes = 0, expanded = 0, outputExpanded = 0, imageBefore = 0, imageAfter = 0
  const writer = new ZipWriter(new WritableStream<Uint8Array>({
    write(chunk) {
      zipBytes += chunk.byteLength
      if (zipBytes > limits.outputBytes) throw Error('结果 ZIP 超过输出大小限制，请减少文件数量')
      parts.push(new Uint8Array(chunk))
    },
  }), { useWebWorkers: false, zip64: false })
  const rows: ZipRow[] = []
  try {
    for (let index = 0; index < archive.entries.length; index++) {
      const entry = archive.entries[index], row = { ...archive.rows[index] }
      const notify = (phase: ZipProgress['phase']) => progress({ phase, index, total: archive.entries.length, path: row.path })
      notify('extract')
      if (entry.directory) {
        // Verify local headers/CRC even for directory entries, rejecting hidden payloads.
        const getData = (entry as unknown as Pick<FileEntry, 'getData'>).getData
        if (!getData) throw Error('ZIP 文件夹条目无法校验')
        await getData.call(entry, new WritableStream<Uint8Array>({ write(chunk) { if (chunk.length) throw Error('文件夹条目包含异常数据') } }), { checkSignature: true, checkOverlappingEntry: true })
        await writer.add(row.path, undefined, { directory: true })
        row.status = 'kept'; row.reason = '保留文件夹'; row.outputPath = row.path; row.outputSize = 0
      } else {
        const chunks: Uint8Array<ArrayBuffer>[] = []
        let actual = 0
        await entry.getData(new WritableStream<Uint8Array>({
          write(chunk) {
            actual += chunk.byteLength; expanded += chunk.byteLength
            checkedSize(expanded, limits.expandedBytes)
            if (actual > entry.uncompressedSize) throw Error('ZIP 条目实际大小与声明不符：' + row.path)
            chunks.push(new Uint8Array(chunk))
          },
        }), { checkSignature: true, checkOverlappingEntry: true })
        if (actual !== entry.uncompressedSize) throw Error('ZIP 条目大小不匹配：' + row.path)
        let original = new Uint8Array(actual), offset = 0
        for (const chunk of chunks) { original.set(chunk, offset); offset += chunk.byteLength }
        chunks.length = 0
        let output = original, outputPath = row.path
        row.image = looksLikeImage(row.path, original)
        row.status = 'kept'; row.reason = row.image ? '不支持此图片格式，保留原文件' : '原样保留'
        if (supportedImageCandidate(row.path, original)) {
          row.image = true
          try {
            if (actual > MAX_PHOTO_BYTES) throw Error('图片超过 100 MiB')
            const inputFormat = detectPhoto(original, row.path)
            if (['png', 'jpg', 'webp'].includes(inputFormat)) inspectImage(original, true)
            notify('image')
            const result = await processImage(original.slice().buffer, level, target, row.path)
            output = new Uint8Array(result.buffer)
            if (!result.keptOriginal && (target !== 'original' || result.format !== inputFormat)) outputPath = nameFor(row.path, result.format)
            row.status = result.keptOriginal ? 'kept' : 'processed'
            row.reason = result.notes.join('；') || (result.keptOriginal ? '保留原图' : '处理完成')
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e)
            const unsupported = /暂不支持 (?:APNG|动态 WebP|多图片 JPEG)|不支持 GIF 或动画/.test(reason)
            row.status = unsupported ? 'kept' : 'failed'
            row.reason = (unsupported ? '不支持此图片，保留原文件：' : '处理失败，保留原文件：') + reason
            output = original
          }
        }
        if (row.image) { imageBefore += actual; imageAfter += output.byteLength }
        outputExpanded += output.byteLength
        if (outputExpanded > limits.expandedBytes) throw Error('转换后的文件总大小超过 200 MiB，请减少文件或使用原格式')
        notify('pack')
        await writer.add(outputPath, new Uint8ArrayReader(output), { level: row.image ? 0 : 6, lastModDate: entry.lastModDate, useWebWorkers: false })
        row.outputPath = outputPath; row.outputSize = output.byteLength
        original = new Uint8Array(0)
      }
      rows.push(row)
      progress({ phase: 'pack', index: index + 1, total: archive.entries.length, path: row.path, row })
    }
    progress({ phase: 'pack', index: rows.length, total: rows.length, path: '生成最终 ZIP' })
    await writer.close()
    return { blob: new Blob(parts, { type: 'application/zip' }), rows, imageBefore, imageAfter, expanded }
  } finally {
    await archive.reader.close()
    // Worker termination owns cancellation. No partial ZIP is returned on any archive error.
  }
}
