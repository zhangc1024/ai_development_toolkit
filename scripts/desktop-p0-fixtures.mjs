import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { simd } from 'wasm-feature-detect'
import QRCode from 'qrcode'
import jpegEncode, { init as initJpeg } from '@jsquash/jpeg/encode.js'
import webpEncode, { init as initWebp } from '@jsquash/webp/encode.js'
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader, ZipReader } from '@zip.js/zip.js'

// P0 fixtures contain only generated geometry and reserved example.com QR text.
// Run from the repository root; generated files stay in ignored output/.
const directory = resolve('output/desktop-p0/samples')
await mkdir(directory, { recursive: true })
const width = 320
const height = 200
const data = new Uint8ClampedArray(width * height * 4)
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    data.set([x < width / 2 ? 240 : 30, y < height / 2 ? 180 : 60, 100, 255], offset)
  }
}
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, bytes) {
  const body = Buffer.concat([Buffer.from(type), bytes])
  const length = Buffer.alloc(4)
  const crc = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
function png(pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
await initJpeg(await WebAssembly.compile(await readFile(new URL('../node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', import.meta.url))))
const useSimd = await simd()
await initWebp(await WebAssembly.compile(await readFile(new URL('../node_modules/@jsquash/webp/codec/enc/' + (useSimd ? 'webp_enc_simd.wasm' : 'webp_enc.wasm'), import.meta.url))))
const jpeg = Buffer.from(await jpegEncode({ width, height, data }))
const webp = Buffer.from(await webpEncode({ width, height, data }))
// APP1 TIFF orientation=6; expected display dimensions are 200 x 320.
const exif = Buffer.alloc(32)
exif.write('Exif\0\0', 0, 'binary')
exif.write('II', 6)
exif.writeUInt16LE(42, 8)
exif.writeUInt32LE(8, 10)
exif.writeUInt16LE(1, 14)
exif.writeUInt16LE(0x0112, 16)
exif.writeUInt16LE(3, 18)
exif.writeUInt32LE(1, 20)
exif.writeUInt16LE(6, 24)
const app1 = Buffer.alloc(4)
app1[0] = 0xff
app1[1] = 0xe1
app1.writeUInt16BE(exif.length + 2, 2)
const oriented = Buffer.concat([jpeg.subarray(0, 2), app1, exif, jpeg.subarray(2)])
const transparent = data.slice()
for (let i = 3; i < transparent.length; i += 4) transparent[i] = (i / 4) % width < width / 2 ? 0 : 128
const qrText = 'DevKit P0 本地测试 https://example.com/desktop-p0'
const files = [
  ['色块 中文.png', png(data), 'RGBA PNG; 320x200; four color quadrants'],
  ['色块 中文.jpg', jpeg, 'JPEG; 320x200'],
  ['色块 中文.webp', webp, 'WebP; 320x200'],
  ['透明 半透明.png', png(transparent), 'RGBA PNG; alpha 0 and 128'],
  ['方向-6.jpg', oriented, 'JPEG EXIF orientation 6; stored 320x200, display 200x320; no GPS'],
  ['二维码.png', await QRCode.toBuffer(qrText, { scale: 6, margin: 4 }), 'QR text: ' + qrText],
]
const zip = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, zip64: false, lastModDate: new Date(2026, 0, 1), extendedTimestamp: false })
for (const [name, bytes] of files.slice(0, 3)) await zip.add('图片/' + name, new Uint8ArrayReader(bytes), { level: 0 })
await zip.add('说明.txt', new Uint8ArrayReader(new TextEncoder().encode('P0 synthetic fixture; 中文文件名; no personal data.')), { level: 0 })
await zip.add('损坏.png', new Uint8ArrayReader(new TextEncoder().encode('intentionally invalid PNG')), { level: 0 })
files.push(['混合样本.zip', await zip.close(), '3 valid images, UTF-8 text, deliberately invalid PNG; 5 entries'])
// Read every ZIP entry and verify CRC before publishing the manifest.
const reader = new ZipReader(new Uint8ArrayReader(files.at(-1)[1]), { useWebWorkers: false })
for (const entry of await reader.getEntries()) await entry.getData(new Uint8ArrayWriter(), { checkSignature: true })
await reader.close()
const manifest = []
for (const [name, bytes, purpose] of files) {
  await writeFile(resolve(directory, name), bytes)
  manifest.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose, source: 'scripts/desktop-p0-fixtures.mjs', rights: 'Project-generated synthetic test data; may be used and redistributed with this project.' })
}
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ directory, files: manifest.length, zipCrc: 'passed', missingRealSamples: ['HEIC', 'ordinary NEF/ARW', 'Nikon HE', 'Nikon HE★'] }, null, 2))
