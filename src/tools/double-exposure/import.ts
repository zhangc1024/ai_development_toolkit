import { inspectImage } from '../images/compression'
import { imageType, MAX_IMAGE_BYTES } from '../images/core'

/** Use photograph dimensions (64 MP), not the small utility-image limit (16 MP).
 * Inspect the encoded dimensions before asking the browser to allocate decoded pixels.
 */
export function inspectExposureImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw Error('单张图片必须非空且不超过 10 MiB')
  const type = imageType(bytes)
  if (type.ext === 'gif') throw Error('请使用 JPG、PNG 或 WebP 静态图片')
  return inspectImage(bytes, true)
}
