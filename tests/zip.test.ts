import { describe, expect, it, vi } from 'vitest'
import { BlobReader, BlobWriter, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter, type ZipWriterAddDataOptions } from '@zip.js/zip.js'
import { processZip, scanZip, type ZipImageProcessor } from '../src/tools/images/zip-engine'
import { createZipNamer, safeZipPath, validateZipPaths, ZIP_LIMITS } from '../src/tools/images/zip-policy'
const text = (s: string) => new TextEncoder().encode(s)
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'))
async function pack(files: { name: string; data?: Uint8Array; options?: ZipWriterAddDataOptions }[]) {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, zip64: false })
  for (const file of files) await writer.add(file.name, file.data ? new Uint8ArrayReader(file.data) : undefined, { level: 0, ...file.options })
  return writer.close()
}
async function unpack(blob: Blob) {
  const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false, checkSignature: true })
  const result: Record<string, Uint8Array | null> = {}
  for (const entry of await reader.getEntries()) result[entry.filename] = entry.directory ? null : await entry.getData(new Uint8ArrayWriter())
  await reader.close(); return result
}
const keep: ZipImageProcessor = async buffer => ({ buffer, format: 'png', keptOriginal: true, notes: ['保留原图'] })
describe('ZIP paths and output naming', () => {
  it.each(['../a.png','/root/a.png','C:/a.png','a/../b.png','a//b.png','a/./b.png','a\0.png','a/nul.txt','a./b.png'])('rejects unsafe path %s', path => expect(() => safeZipPath(path, false)).toThrow())
  it('normalizes Windows separators and keeps unicode hierarchy', () => expect(safeZipPath('素材\\目录\\图.png', false)).toBe('素材/目录/图.png'))
  it('rejects duplicate, case-folding and file/directory conflicts', () => {
    for (const rows of [
      [{path:'a.png',directory:false},{path:'A.PNG',directory:false}],
      [{path:'a',directory:false},{path:'a/b',directory:false}],
      [{path:'a',directory:false},{path:'a/',directory:true}],
    ]) expect(() => validateZipPaths(rows)).toThrow()
  })
  it('reserves names of unchanged files, future conversions and implicit directories', () => {
    const name = createZipNamer(['a.png','a.webp','a-2.webp','a-3.webp/child.txt','b.jpg','b.png'])
    expect(name('a.png','webp')).toBe('a-4.webp')
    expect(name('a.webp','webp')).toBe('a.webp')
    expect(name('b.jpg','webp')).toBe('b.webp')
    expect(name('b.png','webp')).toBe('b-2.webp')
  })
})
describe('ZIP full engine', () => {
  it('passes RAW names to decoder and renames PNG fallback under original selection without collisions', async () => {
    const raw=text('raw decoder validates content')
    const input=await pack([{name:'camera.NEF',data:raw},{name:'camera.png',data:png}])
    const encoder=vi.fn(async (_buffer: ArrayBuffer, _level: unknown, _target: unknown, name?: string) => ({buffer:png.slice().buffer,format:'png' as const,keptOriginal:false,notes:[name ?? '']}))
    const result=await processZip(input,'preserve','original',encoder,()=>{})
    expect(encoder.mock.calls[0]?.[3]).toBe('camera.NEF')
    expect(result.rows[0].outputPath).toBe('camera-2.png')
    expect((await unpack(result.blob))['camera-2.png']).toEqual(png)
  })

  it('preserves folders, unicode, raw files, unsupported images and nested archives byte-for-byte', async () => {
    const nested = new Uint8Array(await (await pack([{name:'nested.txt',data:text('nested')}])).arrayBuffer())
    const input = await pack([{name:'空目录/',options:{directory:true}}, {name:'素材/图.png',data:png},{name:'readme.txt',data:text('中文资源说明')},{name:'animation.gif',data:text('GIF89a')},{name:'nested.zip',data:nested}])
    const scanned = await scanZip(input)
    expect(scanned.rows).toHaveLength(5)
    const result = await processZip(input,'preserve','original',keep,()=>{})
    const output = await unpack(result.blob)
    expect(output['空目录/']).toBeNull()
    expect(output['素材/图.png']).toEqual(png)
    expect(output['readme.txt']).toEqual(text('中文资源说明'))
    expect(output['animation.gif']).toEqual(text('GIF89a'))
    expect(output['nested.zip']).toEqual(nested)
    expect(result.rows.every(r=>r.status==='kept')).toBe(true)
  })
  it('converts supported magic even with other extension and resolves output collisions', async () => {
    const input = await pack([{name:'a.png',data:png},{name:'a.webp',data:text('original reserved')},{name:'a-2.webp',data:text('reserved too')},{name:'photo.bin',data:png}])
    const convert: ZipImageProcessor = async () => ({buffer:text('converted').buffer,format:'webp',keptOriginal:false,notes:[]})
    const result = await processZip(input,'light','webp',convert,()=>{})
    const output = await unpack(result.blob)
    expect(output['a-3.webp']).toEqual(text('converted'))
    expect(output['a.webp']).toEqual(text('original reserved'))
    expect(output['photo.webp']).toEqual(text('converted'))
    expect(result.rows.filter(r=>r.status==='failed')).toHaveLength(2)
  })
  it('keeps original filename when recompressing in original format', async () => {
    const input = await pack([{name:'assets/UPPER.PNG',data:png}])
    const result = await processZip(input,'light','original',async()=>({buffer:text('smaller').buffer,format:'png',keptOriginal:false,notes:[]}),()=>{})
    expect(Object.keys(await unpack(result.blob))).toEqual(['assets/UPPER.PNG'])
  })
  it('continues on corrupt image and encoder failure without losing bytes', async () => {
    const input = await pack([{name:'bad.png',data:text('corrupt')},{name:'timeout.png',data:png},{name:'ok.txt',data:text('kept')}])
    const encoder = vi.fn(async()=>{throw Error('图片处理超过 60 秒')})
    const result = await processZip(input,'light','webp',encoder,()=>{})
    expect(result.rows.map(r=>r.status)).toEqual(['failed','failed','kept'])
    expect((await unpack(result.blob))['timeout.png']).toEqual(png)
    expect(encoder).toHaveBeenCalledTimes(1)
  })
  it('retains invalid large image without invoking encoder', async () => {
    const input = await pack([{name:'large.png',data:new Uint8Array(10*1024*1024+1)}])
    const encoder=vi.fn(keep)
    const result = await processZip(input,'light','original',encoder,()=>{})
    expect(result.rows[0].status).toBe('failed'); expect(encoder).not.toHaveBeenCalled()
    expect((await unpack(result.blob))['large.png']?.length).toBe(10*1024*1024+1)
  })
  it('keeps animation as unsupported rather than an encoding failure', async () => {
    const chunk = new Uint8Array([0,0,0,8,97,99,84,76,0,0,0,2,0,0,0,0,0,0,0,0])
    const animated = new Uint8Array([...png.slice(0,33),...chunk,...png.slice(33)])
    const input = await pack([{name:'animated.png',data:animated}])
    const encoder = vi.fn(keep)
    const result = await processZip(input,'light','original',encoder,()=>{})
    expect(result.rows[0].status).toBe('kept')
    expect(result.rows[0].reason).toContain('APNG')
    expect((await unpack(result.blob))['animated.png']).toEqual(animated)
    expect(encoder).not.toHaveBeenCalled()
  })
  it('handles empty and image-free ZIPs', async () => {
    for (const input of [await pack([]),await pack([{name:'a.txt',data:text('hello')}])]) {
      const result=await processZip(input,'preserve','original',keep,()=>{})
      expect(result.imageBefore).toBe(0); expect(result.blob.size).toBeGreaterThan(0)
    }
  })
  it('rejects encrypted ZIPs', async () => {
    const blob=await pack([{name:'secret.txt',data:text('secret'),options:{password:'test-password',zipCrypto:true}}])
    await expect(scanZip(blob)).rejects.toThrow(/加密/)
  })
  it('rejects symlinks', async () => {
    const blob=await pack([{name:'link',data:text('target'),options:{unixMode:0o120777}}])
    await expect(scanZip(blob)).rejects.toThrow(/符号链接/)
  })
  it('rejects archive, count and declared expanded-size limits', async () => {
    const blob=await pack([{name:'a',data:text('12345')},{name:'b',data:text('12345')}])
    await expect(scanZip(blob,{...ZIP_LIMITS,archiveBytes:1})).rejects.toThrow(/50 MiB/)
    await expect(scanZip(blob,{...ZIP_LIMITS,entries:1})).rejects.toThrow(/500/)
    await expect(scanZip(blob,{...ZIP_LIMITS,expandedBytes:9})).rejects.toThrow(/大小/)
  })
  it('rejects unsafe paths from real archive', async () => {
    const blob=await pack([{name:'../escape.txt',data:text('bad')}])
    await expect(scanZip(blob)).rejects.toThrow()
  })
  it('stops on corrupt ZIP entry CRC instead of returning a partial archive', async () => {
    const bytes=new Uint8Array(await (await pack([{name:'a.txt',data:text('UNIQUE-DATA')}])).arrayBuffer())
    const offset=Buffer.from(bytes).indexOf('UNIQUE-DATA');bytes[offset]^=1
    await expect(processZip(new Blob([bytes]),'light','original',keep,()=>{})).rejects.toThrow()
  })
  it('enforces actual expansion against a forged size declaration', async () => {
    const bytes=new Uint8Array(await (await pack([{name:'a.txt',data:text('1234567890')}])).arrayBuffer())
    const view=new DataView(bytes.buffer)
    for(let i=0;i+46<bytes.length;i++) if(view.getUint32(i,true)===0x02014b50) view.setUint32(i+24,1,true)
    view.setUint32(22,1,true)
    await expect(processZip(new Blob([bytes]),'light','original',keep,()=>{}, {...ZIP_LIMITS,expandedBytes:5})).rejects.toThrow()
  })
  it('enforces converted-output and ZIP-output limits', async () => {
    const input=await pack([{name:'a.png',data:png}])
    await expect(processZip(input,'light','webp',async()=>({buffer:new ArrayBuffer(1000),format:'webp',keptOriginal:false,notes:[]}),()=>{}, {...ZIP_LIMITS,expandedBytes:500})).rejects.toThrow(/转换后/)
    await expect(processZip(input,'light','original',keep,()=>{}, {...ZIP_LIMITS,outputBytes:10})).rejects.toThrow(/输出大小/)
  })
})
