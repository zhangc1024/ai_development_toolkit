import { render } from './render'
self.onmessage = async ({ data }) => {
  const { photo, logo, geometry, style, shooting, visible, format } = data
  let canvas: OffscreenCanvas | undefined
  try {
    canvas = new OffscreenCanvas(geometry.width, geometry.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw Error('无法创建导出画布，请降低尺寸')
    render(ctx, photo, photo, geometry, style, shooting, visible, logo)
    const blob = await canvas.convertToBlob({ type: format, quality: .95 })
    self.postMessage({ blob })
  } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : '导出失败，请降低尺寸' }) }
  finally { photo.close(); logo?.image.close(); if (canvas) canvas.width = canvas.height = 1 }
}
