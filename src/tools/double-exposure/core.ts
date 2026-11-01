export interface Transform { x: number; y: number; scale: number }
export function placement(iw: number, ih: number, width: number, height: number, t: Transform, cover = false) {
  if (![iw, ih, width, height, t.scale].every(v => Number.isFinite(v) && v > 0) || ![t.x, t.y].every(Number.isFinite)) throw Error('无效图片尺寸或位置')
  const ratio = (cover ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih)) * t.scale
  return { x: (width - iw * ratio) / 2 + t.x * width, y: (height - ih * ratio) / 2 + t.y * height, width: iw * ratio, height: ih * ratio }
}
export function fadeStops(center: number, softness: number) {
  return [Math.max(0, center - softness / 2), Math.min(1, center + softness / 2)] as const
}
/** Remove only matching pixels connected to the selected background point. */
export function removeConnectedBackground(data: Uint8ClampedArray, width: number, height: number, seed: number, tolerance: number) {
  const count = width * height
  if (!Number.isInteger(count) || width <= 0 || height <= 0 || data.length !== count * 4 || !Number.isInteger(seed) || seed < 0 || seed >= count || !Number.isFinite(tolerance) || tolerance < 0) throw Error('无效背景选区')
  const result = new Uint8ClampedArray(data), visited = new Uint8Array(count), queue = new Int32Array(count)
  const r = data[seed * 4], g = data[seed * 4 + 1], b = data[seed * 4 + 2]
  let head = 0, tail = 0
  const add = (p: number) => {
    if (visited[p]) return
    visited[p] = 1
    const i = p * 4
    if (data[i + 3] !== 0 && Math.max(Math.abs(data[i] - r), Math.abs(data[i + 1] - g), Math.abs(data[i + 2] - b)) > tolerance) return
    queue[tail++] = p
  }
  add(seed)
  while (head < tail) {
    const p = queue[head++]; result[p * 4 + 3] = 0
    if (p % width) add(p - 1)
    if (p % width < width - 1) add(p + 1)
    if (p >= width) add(p - width)
    if (p < count - width) add(p + width)
  }
  return result
}

/** Gradient runs from transparent to visible; angle 0 points right, 90 down. */
export function gradientLine(width: number, height: number, angle: number) {
  const radians = angle * Math.PI / 180, dx = Math.cos(radians), dy = Math.sin(radians)
  const length = Math.abs(dx) * width + Math.abs(dy) * height
  return { x0: (width - dx * length) / 2, y0: (height - dy * length) / 2, x1: (width + dx * length) / 2, y1: (height + dy * length) / 2 }
}
