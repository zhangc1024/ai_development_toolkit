import { defineConfig, mergeConfig } from 'vite'
import webConfig from './vite.config'
import { createRequire } from 'node:module'
const { headers, rawWorkerHeaders, isToolRoute } = createRequire(import.meta.url)('./electron/protocol.cjs')

export default mergeConfig(webConfig, defineConfig({
  plugins: [{ name: 'desktop-dev-policy', configureServer(server) { server.middlewares.use((request, response, next) => {
    const policy = ['/src/desktop/raw-probe.worker.ts', '/src/tools/images/compress.worker.ts', '/src/tools/photo-frame/photo.worker.ts'].includes(request.url?.split('?')[0] ?? '') ? rawWorkerHeaders : headers
    for (const [key, value] of Object.entries(policy)) response.setHeader(key, String(value).replace("connect-src 'self' blob:", "connect-src 'self' blob: ws://127.0.0.1:5179"))
    if (isToolRoute((request.url ?? '').split('?')[0])) request.url = '/desktop.html'
    next()
  }) } }],
  server: { host: '127.0.0.1', port: 5179, strictPort: true, open: false },
  build: { outDir: 'dist-desktop', emptyOutDir: true, rollupOptions: { input: 'desktop.html' } },
  optimizeDeps: { include: ['exifr'] },
  appType: 'mpa',
}))
