import { decodePhoto, previewBlob } from '../tools/images/photo-decode'
import avifFactory from '@jsquash/avif/codec/enc/avif_enc.js'
import avifWasm from '@jsquash/avif/codec/enc/avif_enc.wasm?url'
import { defaultOptions } from '@jsquash/avif/meta.js'

self.onmessage = async ({ data }) => {
  try {
    if (data.action === 'decode') {
      const decoded = await decodePhoto(data.buffer, data.name)
      try {
        const png = await previewBlob(decoded.bitmap)
        const roundTrip = await createImageBitmap(png)
        const pngDimensions = [roundTrip.width, roundTrip.height]
        roundTrip.close()
        const bytes = new Uint8Array(await png.arrayBuffer())
        self.postMessage({ format: decoded.format, width: decoded.bitmap.width, height: decoded.bitmap.height, pngBytes: bytes.length, pngDimensions, pngSignature: [...bytes.subarray(0, 8)], notes: decoded.notes })
      } finally { decoded.bitmap.close() }
      return
    }
    let dynamicEvalBlocked = false
    try { new Function('return 1')() } catch { dynamicEvalBlocked = true }
    const { default: heifFactory } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs')
    const heif = await heifFactory()
    const heic = typeof heif.HeifDecoder === 'function'
    const avif = await avifFactory({ locateFile: () => avifWasm })
    const pixels = new Uint8Array(4 * 4 * 4).fill(255)
    const encoded = avif.encode(pixels, 4, 4, { ...defaultOptions, speed: 10, quality: 60 })
    if (!encoded?.length) throw Error('AVIF 编码探测失败')
    const bitmap = await createImageBitmap(new Blob([encoded.slice()], { type: 'image/avif' }))
    const dimensions = [bitmap.width, bitmap.height]
    bitmap.close()
    self.postMessage({ isolated: self.crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer, dynamicImport: true, dynamicEvalBlocked, heicModule: heic, avifBytes: encoded.length, avifDimensions: dimensions })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}
