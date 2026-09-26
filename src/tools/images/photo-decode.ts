import { inspectImage } from './compression'
import { detectPhoto, RAW_EXTENSIONS, validatePhotoDimensions, type RawFormat } from './photo-formats'
import type { Metadata, RawImageData } from 'libraw-wasm'

export async function decodePhoto(buffer: ArrayBuffer, name: string) {
  const format = detectPhoto(new Uint8Array(buffer), name)
  const notes: string[] = []
  let bitmap: ImageBitmap
  if (RAW_EXTENSIONS.includes(format as RawFormat)) {
    if (!globalThis.crossOriginIsolated) throw Error('RAW 解码需要站点开启跨源隔离（COOP/COEP）；请联系站点管理员按部署说明配置，或先用相机软件导出 TIFF/JPG。')
    const url = new URL('/vendor/libraw/libraw.js', self.location.origin).href
    const { default: factory } = await import(/* @vite-ignore */ url)
    const module = await factory({ locateFile: (file: string) => new URL('/vendor/libraw/' + file, self.location.origin).href })
    const raw = new module.LibRaw()
    try {
      raw.open(new Uint8Array(buffer), { useCameraWb: true, outputColor: 1, outputBps: 8, halfSize: false })
      const metadata: Metadata = raw.metadata(false)
      validatePhotoDimensions(metadata.raw_width, metadata.raw_height)
      const image: RawImageData = raw.imageData()
      validatePhotoDimensions(image.width, image.height)
      if (image.bits !== 8 || image.colors !== 3 || image.data.length !== image.width * image.height * 3) throw Error('RAW 解码未返回有效的 8 位 RGB 图像')
      const rgba = new Uint8ClampedArray(image.width * image.height * 4)
      for (let i = 0, j = 0; i < image.data.length; i += 3, j += 4) {
        rgba[j] = image.data[i]; rgba[j + 1] = image.data[i + 1]; rgba[j + 2] = image.data[i + 2]; rgba[j + 3] = 255
      }
      bitmap = await createImageBitmap(new ImageData(rgba, image.width, image.height))
      notes.push('RAW 已完整解码为 8 位 sRGB，使用相机白平衡；观感可能不同于相机 JPEG，不保留传感器原始数据或拍摄元数据。')
    } catch (error) {
      throw Error('RAW 解码失败：该相机型号、压缩方式可能不受支持，或文件已损坏。' + (error instanceof Error ? error.message : String(error)))
    } finally { raw.delete() }
  } else if (format === 'heic') {
    const { default: factory } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs')
    const lib = await factory()
    const images = new lib.HeifDecoder().decode(new Uint8Array(buffer))
    try {
      if (!images.length) throw Error('HEIC/HEIF 解码失败，文件可能损坏或编码不受支持')
      if (images.length !== 1) throw Error('暂不支持包含多张图片的 HEIC/HEIF，请先导出单张照片')
      const image = images[0], width = image.get_width(), height = image.get_height()
      validatePhotoDimensions(width, height)
      const pixels = new ImageData(width, height)
      await new Promise<void>((resolve, reject) => image.display(pixels, (out: unknown) => out ? resolve() : reject(Error('HEIC 像素解码失败'))))
      bitmap = await createImageBitmap(pixels)
      notes.push('HEIC/HEIF 已转换为 8 位像素；不保留 HDR 增益图、景深、Live Photo 或原始元数据。')
    } finally { for (const image of images) image.free() }
  } else if (format === 'tiff') {
    const { default: tiff } = await import('utif')
    const images = tiff.decode(buffer)
    if (images.length !== 1) throw Error('仅支持单页 TIFF，不支持多页 TIFF')
    const image = images[0]
    if (image.t33421 || image.t50706) throw Error('检测到 RAW TIFF，请使用正确的 DNG/相机 RAW 扩展名导入')
    validatePhotoDimensions(image.t256?.[0], image.t257?.[0])
    if ((image.t274?.[0] ?? 1) !== 1) throw Error('此 TIFF 包含旋转方向标记，请先转正后导入')
    tiff.decodeImage(buffer, image, images)
    const pixels = tiff.toRGBA8(image)
    if (pixels.length !== image.width * image.height * 4) throw Error('TIFF 像素解码失败')
    bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(pixels), image.width, image.height))
    notes.push('TIFF 转换为 8 位 RGBA，不保留原始位深、ICC 或拍摄元数据。')
  } else {
    if (['png', 'jpg', 'webp'].includes(format)) {
      const inspected = inspectImage(new Uint8Array(buffer), true)
      if (inspected.additionalImages) notes.push('此 JPG 包含附加图像（可能是 HDR 增益图）；重新编码只处理浏览器解码的主图，附加图像不会进入转换结果。原格式保真档保留完整原文件。')
    }
    if (format === 'bmp') {
      const view = new DataView(buffer)
      if (buffer.byteLength < 54 || view.getUint32(14, true) < 40) throw Error('仅支持 Windows BMP 图片')
      validatePhotoDimensions(view.getInt32(18, true), Math.abs(view.getInt32(22, true)))
    }
    bitmap = await createImageBitmap(new Blob([buffer]))
  }
  try { validatePhotoDimensions(bitmap.width, bitmap.height) }
  catch (error) { bitmap.close(); throw error }
  return { bitmap, format, notes }
}

export async function previewBlob(bitmap: ImageBitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) throw Error('当前浏览器不支持本地图片预览')
  context.drawImage(bitmap, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}
