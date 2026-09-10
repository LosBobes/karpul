import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // The vendored fancy components (src/fancy) import from '@/lib/utils'.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:8000',
        changeOrigin: true,
        // /api/ws is the live-updates socket.
        ws: true,
      },
    },
  },
})
