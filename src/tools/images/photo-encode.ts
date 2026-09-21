import { validatePhotoDimensions } from './photo-formats'

/** 24 位 Windows BMP：不支持透明，调用方先填白。 */
export function encodeBmp(pixels: ImageData): ArrayBuffer {
  const { width, height, data } = pixels
  validatePhotoDimensions(width, height)
  const stride = Math.ceil(width * 3 / 4) * 4
  const buffer = new ArrayBuffer(54 + stride * height), view = new DataView(buffer), bytes = new Uint8Array(buffer)
  bytes[0] = 66; bytes[1] = 77
  view.setUint32(2, buffer.byteLength, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true)
  view.setInt32(18, width, true); view.setInt32(22, height, true)
  view.setUint16(26, 1, true); view.setUint16(28, 24, true); view.setUint32(34, stride * height, true)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (y * width + x) * 4, target = 54 + (height - y - 1) * stride + x * 3
    bytes[target] = data[source + 2]; bytes[target + 1] = data[source + 1]; bytes[target + 2] = data[source]
  }
  return buffer
}
