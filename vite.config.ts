import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  worker: { format: 'es' },
  // Worker 动态依赖预先优化，避免用户首次操作时触发整页重载。
  optimizeDeps: { include: ['diff', 'qrcode', '@noble/hashes/legacy.js', '@noble/hashes/sha2.js', '@noble/hashes/hmac.js', 'sql-formatter', 'luxon', 'entities', '@codemirror/lang-sql'] },
})
