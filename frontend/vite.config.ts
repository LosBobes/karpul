import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app: the manifest below, and a Workbox service worker that
    // precaches the built shell (index.html, the hashed bundles, the fonts and
    // the icons) so the board opens offline and starts instantly on a phone.
    // The API is never cached: /api stays live, and the socket is not a fetch.
    VitePWA({
      // lib/pwa.ts registers the worker and turns "a new build is waiting" into
      // a toast instead of reloading under the user's fingers.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Karpul',
        short_name: 'Karpul',
        description: 'Firm carpooling: who is driving, who is riding along.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f6f8',
        theme_color: '#f5f6f8',
        lang: 'en',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Navigations fall back to the shell, except the backend's own pages:
        // the API, the OpenAPI docs and the schema are served by FastAPI.
        navigateFallbackDenylist: [/^\/api\//, /^\/docs/, /^\/redoc/, /^\/openapi\.json/],
        cleanupOutdatedCaches: true,
        // A build the user applies must take over the open page at once, or a
        // page the previous worker never controlled (the first visit) would see
        // no controller change and never reload (lib/pwa.ts).
        clientsClaim: true,
      },
    }),
  ],
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
