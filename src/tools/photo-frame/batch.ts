import { batchFilename, checkAbort, runWorker, type BatchProcessor } from '../../platform/batch'
import { brandFor, layout, type Shooting, type Style, type Visibility } from './core'
import type { Logo } from './render'
export interface FrameBatchSettings {
  style: Style; visible: Visibility; edge: number | 'original'; format: string
  shooting?: Shooting; fixedLogo?: Logo; automaticLogo: boolean; nikonVariant: string
}
export function frameProcessor(settings: FrameBatchSettings): BatchProcessor {
  return async (file, signal) => {
    const buffer = await file.arrayBuffer(); checkAbort(signal)
    const decoded = await runWorker<{ bitmap: ImageBitmap; shooting: Shooting; notes: string[] }>(
      () => new Worker(new URL('./photo.worker.ts', import.meta.url), { type: 'module' }),
      { buffer, name: file.name }, signal, 120000, [buffer],
    )
    const photo = decoded.bitmap
    let logoBitmap: ImageBitmap | undefined
    try {
      checkAbort(signal)
      const shooting = settings.shooting ?? decoded.shooting
      let logo: Logo | undefined
      if (settings.automaticLogo) {
        const brand = brandFor(decoded.shooting.make, decoded.shooting.model)
        if (brand) {
          const color = brand !== 'nikon' || settings.nikonVariant !== 'word'
          const image = new Image()
          image.src = '/photo-frame/logos/' + brand + (color ? '-color' : '') + '.svg'
          await image.decode(); checkAbort(signal)
          logoBitmap = await createImageBitmap(image)
          logo = { image: logoBitmap, width: image.naturalWidth, height: image.naturalHeight, tint: !color }
        }
      } else if (settings.fixedLogo) {
        logoBitmap = await createImageBitmap(settings.fixedLogo.image as ImageBitmapSource)
        logo = { ...settings.fixedLogo, image: logoBitmap }
      }
      checkAbort(signal)
      const geometry = layout(photo.width, photo.height, settings.style, settings.edge)
      const data = await runWorker<{ blob: Blob }>(
        () => new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }),
        { photo, logo, geometry, style: settings.style, shooting, visible: settings.visible, format: settings.format },
        signal, 120000, logoBitmap ? [photo, logoBitmap] : [photo],
      )
      return { blob: data.blob, name: batchFilename(file.name, 'frame', data.blob.type === 'image/jpeg' ? 'jpg' : 'png'), notes: decoded.notes }
    } finally { photo.close(); logoBitmap?.close() }
  }
}
