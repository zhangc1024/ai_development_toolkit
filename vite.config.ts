import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [vue(), wasm()],
  base: '/',
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  build: { target: 'esnext' },
  worker: { format: 'es', plugins: () => [wasm()] },
  // WASM codecs explicitly resolve their bundled assets; do not prebundle them.
  optimizeDeps: {
    exclude: ['@zip.js/zip.js', '@jsquash/avif', 'libheif-js', 'libraw-wasm', '@jsquash/jpeg', '@jsquash/webp', '@jsquash/oxipng', 'imagequant'],
    include: ['utif', 'node-forge', 'jsqr', 'diff', 'qrcode', '@noble/hashes/legacy.js', '@noble/hashes/sha2.js', '@noble/hashes/hmac.js', 'sql-formatter', 'luxon', 'entities', '@codemirror/lang-sql'],
  },
})
