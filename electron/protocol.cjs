const path = require('node:path')
const fs = require('node:fs/promises')

const toolIds = new Set(['image-base64', 'qr-reader', 'watermark', 'image-stitch', 'moments-grid', 'double-exposure', 'image-compress', 'photo-frame'])
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
}
// Exception is confined to explicit packaged LibRaw consumer worker entries.
// The renderer and general codec worker retain wasm-unsafe-eval only.
const rawWorkerHeaders = { ...headers, 'Content-Security-Policy': headers['Content-Security-Policy'].replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'") }
function responseHeaders(file) {
  return /^(raw-probe|compress|photo)\.worker-[A-Za-z0-9_-]+\.js$/.test(path.basename(file)) ? rawWorkerHeaders : headers
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' }
function isToolRoute(value) {
  return value === '/' || toolIds.has(value.match(/^\/tools\/([^/]+)\/?$/)?.[1])
}
async function resolveResource(root, request) {
  if (!['GET', 'HEAD'].includes(request.method)) return { status: 405 }
  try {
    const url = new URL(request.url)
    if (url.protocol !== 'app:' || url.host !== 'bundle' || url.username || url.password) return { status: 403 }
    // Validate the raw path too: WHATWG URL parsing can normalize dot segments.
    const raw = request.url.replace(/^app:\/\/[^/]+/i, '').split(/[?#]/)[0]
    const decoded = decodeURIComponent(raw)
    if (decoded.includes('\\') || /[%\0:]/.test(decoded) || decoded.split('/').some(part => part === '..' || part === '.')) return { status: 403 }
    const pathname = decodeURIComponent(url.pathname)
    const relative = isToolRoute(pathname) ? 'desktop.html' : pathname.slice(1)
    if (!relative || (!isToolRoute(pathname) && path.extname(relative) === '.html')) return { status: 404 }
    const base = await fs.realpath(root)
    const target = path.resolve(base, relative)
    const within = value => value !== base && !path.relative(base, value).startsWith('..') && !path.isAbsolute(path.relative(base, value))
    if (!within(target)) return { status: 403 }
    const real = await fs.realpath(target)
    if (!within(real)) return { status: 403 }
    if (!(await fs.stat(real)).isFile()) return { status: 404 }
    return { status: 200, file: real, type: mime[path.extname(real).toLowerCase()] ?? 'application/octet-stream' }
  } catch (error) {
    return { status: error instanceof URIError ? 403 : 404 }
  }
}
function createHandler(root) {
  return async request => {
    const resource = await resolveResource(root, request)
    if (resource.status !== 200) {
      const route = /^app:\/\/bundle\/tools\/[^.?#]*\/?$/.test(request.url)
      const body = route ? '<!doctype html><meta charset="utf-8"><p>页面未找到</p><a href="/">返回首页</a>' : 'Resource unavailable'
      return new Response(request.method === 'HEAD' ? null : body, { status: resource.status, headers: route ? { ...headers, 'Content-Type': 'text/html; charset=utf-8' } : headers })
    }
    try {
      const bytes = request.method === 'HEAD' ? null : await fs.readFile(resource.file)
      return new Response(bytes, { headers: { ...responseHeaders(resource.file), 'Content-Type': resource.type } })
    } catch { return new Response(null, { status: 404, headers }) }
  }
}
module.exports = { createHandler, resolveResource, isToolRoute, headers, rawWorkerHeaders }
