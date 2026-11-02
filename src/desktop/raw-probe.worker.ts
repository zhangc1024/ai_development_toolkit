import { decodePhoto, previewBlob } from '../tools/images/photo-decode'

// LibRaw's pinned Embind glue needs dynamic invocation. Only this worker gets
// a narrow CSP exception; the page and other workers keep unsafe-eval disabled.
self.onmessage = async ({ data }) => {
  try {
    if (data.action === 'probe') {
      const url = new URL('/vendor/libraw/libraw.js', self.location.origin).href
      const { default: factory } = await import(/* @vite-ignore */ url)
      const module = await factory({ locateFile: (file: string) => new URL('/vendor/libraw/' + file, self.location.origin).href })
      const raw = new module.LibRaw()
      raw.delete()
      self.postMessage({ rawModule: true, isolated: self.crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer })
      return
    }
    const decoded = await decodePhoto(data.buffer, data.name, { allowEmbeddedRawPreview: data.allowEmbeddedRawPreview === true })
    try {
      const png = await previewBlob(decoded.bitmap)
      const roundTrip = await createImageBitmap(png)
        const pngDimensions = [roundTrip.width, roundTrip.height]
        roundTrip.close()
        const bytes = new Uint8Array(await png.arrayBuffer())
      self.postMessage({ format: decoded.format, width: decoded.bitmap.width, height: decoded.bitmap.height, embeddedPreview: decoded.embeddedPreview, pngBytes: bytes.length, pngDimensions, pngSignature: [...bytes.subarray(0, 8)], notes: decoded.notes })
    } finally { decoded.bitmap.close() }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}
