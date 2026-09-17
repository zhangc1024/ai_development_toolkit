import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [vue(), wasm()],
  base: './',
  build: { target: 'esnext' },
  worker: { format: 'es', plugins: () => [wasm()] },
  // WASM codecs explicitly resolve their bundled assets; do not prebundle them.
  optimizeDeps: {
    exclude: ['@zip.js/zip.js', '@jsquash/jpeg', '@jsquash/webp', '@jsquash/oxipng', 'imagequant'],
    include: ['node-forge', 'jsqr', 'diff', 'qrcode', '@noble/hashes/legacy.js', '@noble/hashes/sha2.js', '@noble/hashes/hmac.js', 'sql-formatter', 'luxon', 'entities', '@codemirror/lang-sql'],
  },
})
