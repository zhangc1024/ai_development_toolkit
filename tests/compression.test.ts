import { describe, expect, it } from 'vitest'
import { inspectImage, selectOutput, outputFilename, QUALITY } from '../src/tools/images/compression'
function chunk(name: string, data: number[] = []) {
  const out = new Uint8Array(data.length + 12)
  new DataView(out.buffer).setUint32(0, data.length)
  out.set([...name].map(c => c.charCodeAt(0)), 4); out.set(data, 8)
  return [...out]
}
function png(width = 10, height = 20, extra: number[] = []) {
  const header = new Uint8Array(13), view = new DataView(header.buffer)
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6
  return new Uint8Array([137,80,78,71,13,10,26,10, ...chunk('IHDR',[...header]), ...extra, ...chunk('IDAT'), ...chunk('IEND')])
}
function webp(name = 'VP8L', payload = [0x2f, 9, 0xc0, 4, 0]) {
  const out = new Uint8Array(20 + payload.length + payload.length % 2), view = new DataView(out.buffer)
  out.set([...('RIFF')].map(c => c.charCodeAt(0))); view.setUint32(4, out.length - 8, true)
  out.set([...('WEBP' + name)].map(c => c.charCodeAt(0)), 8)
  view.setUint32(16, payload.length, true); out.set(payload,20)
  return out
}
describe('compression input boundaries', () => {
  it('reads PNG dimensions before bitmap allocation', () => expect(inspectImage(png())).toEqual({ format:'png',width:10,height:20 }))
  it('rejects PNG animation chunks', () => {
    for (const name of ['acTL','fcTL','fdAT']) expect(() => inspectImage(png(10,20,chunk(name)))).toThrow(/动画/)
  })
  it('rejects oversized or zero dimensions', () => {
    for (const [w,h] of [[0,1],[16385,1],[4001,4000]]) expect(() => inspectImage(png(w,h))).toThrow(/尺寸/)
  })
  it('rejects truncated and forged chunks', () => {
    expect(() => inspectImage(png().subarray(0,32))).toThrow()
    const bytes = png(); new DataView(bytes.buffer).setUint32(33, 0xffffffff)
    expect(() => inspectImage(bytes)).toThrow(/结构/)
  })
  it('rejects trailing PNG data', () => expect(() => inspectImage(new Uint8Array([...png(),0]))).toThrow())
  it('reads lossless WebP dimensions', () => expect(inspectImage(webp())).toEqual({format:'webp',width:10,height:20}))
  it('rejects animated WebP flags and chunks', () => {
    expect(() => inspectImage(webp('VP8X',[2,0,0,0,9,0,0,19,0,0]))).toThrow(/动态/)
    expect(() => inspectImage(webp('ANIM',[]))).toThrow(/动态/)
  })
  it('rejects invalid RIFF size', () => {
    const bytes = webp(); bytes[4] = 0
    expect(() => inspectImage(bytes)).toThrow(/结构/)
  })
  it('reads JPEG SOF dimensions', () => {
    const bytes = new Uint8Array([255,216,255,192,0,11,8,0,20,0,10,1,1,17,0,255,218])
    expect(inspectImage(bytes)).toEqual({format:'jpg',width:10,height:20})
  })
  it('rejects GIF, SVG, empty input and files above limit', () => {
    for (const bytes of [new Uint8Array(),new Uint8Array([71,73,70,56,57,97]),new TextEncoder().encode('<svg/>'),new Uint8Array(10*1024*1024+1)]) expect(() => inspectImage(bytes)).toThrow()
  })
})
describe('output decisions', () => {
  it('keeps original for larger and equal original-format results', () => {
    const original = new ArrayBuffer(100)
    for (const size of [100,101]) {
      const result = selectOutput(original,new ArrayBuffer(size),'original')
      expect(result.keptOriginal).toBe(true); expect(result.buffer).toBe(original)
    }
  })
  it('uses smaller results and always honors explicit conversion', () => {
    const original = new ArrayBuffer(100), small = new ArrayBuffer(80), large = new ArrayBuffer(120)
    expect(selectOutput(original,small,'original').buffer).toBe(small)
    expect(selectOutput(original,large,'png').buffer).toBe(large)
  })
  it('uses correct output extension and safe file name', () => {
    expect(outputFilename('photo.jpeg','webp',false)).toBe('photo-compressed.webp')
    expect(outputFilename('a:b.png','png',true)).toBe('a_b-original.png')
  })
  it('quality floors decrease by tier and never exceed target', () => {
    expect(QUALITY.light.pngMin).toBeGreaterThan(QUALITY.balanced.pngMin)
    expect(QUALITY.balanced.pngMin).toBeGreaterThan(QUALITY.strong.pngMin)
    for (const q of Object.values(QUALITY)) expect(q.pngMin).toBeLessThanOrEqual(q.pngTarget)
  })
})
