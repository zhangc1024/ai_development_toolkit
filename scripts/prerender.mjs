import { createServer } from 'vite'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
const started = performance.now()
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
// Vite compiles the same Vue components as development; no browser, service or extra install is needed.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { pages, render, siteOrigin } = await server.ssrLoadModule('/src/seo/render.ts')
  const template = await readFile('dist/index.html', 'utf8')
  let bytes = 0
  for (const page of [...pages, { id: 'not-found', path: '/404.html', title: '页面未找到 - DevKit', description: '请求的页面不存在，请返回首页选择已上线工具。', canonical: '' }]) {
    const content = await render(page.id)
    const head = page.canonical ? `<link rel="canonical" href="${escape(page.canonical)}" />` : '<meta name="robots" content="noindex" />'
    const html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(page.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/, `<meta name="description" content="${escape(page.description)}" />`)
      .replace('</head>', head + '</head>')
      .replace('<div id="app"></div>', `<div id="app">${content}</div>`)
    if (!html.includes('<h1') || !html.includes(content)) throw new Error(`Empty static page: ${page.path}`)
    const file = resolve('dist', page.path === '/404.html' ? '404.html' : '.' + page.path + 'index.html')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, html)
    bytes += Buffer.byteLength(html)
  }
  await writeFile('dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + pages.map(page => `  <url><loc>${escape(siteOrigin + page.path)}</loc></url>`).join('\n') + '\n</urlset>\n')
  await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`)
  console.log(`Static generation: ${pages.length} pages + 404; HTML ${(bytes / 1024).toFixed(1)} KiB; ${((performance.now() - started) / 1000).toFixed(2)}s`)
} finally {
  await server.close()
}
