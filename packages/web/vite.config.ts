import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ command }) => {
  const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || process.env.VITE_API_URL
  if (command === 'serve' && !apiProxyTarget) {
    throw new Error(
      'Missing API proxy target. Set VITE_DEV_API_PROXY_TARGET (recommended for dev) or VITE_API_URL.'
    )
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
        manifest: {
          name: 'NexRAD — WiFi Management',
          short_name: 'NexRAD',
          description: 'Modern RADIUS management — tokens, branches, reports',
          theme_color: '#6366f1',
          background_color: '#0f0f13',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
          categories: ['productivity', 'utilities'],
          shortcuts: [
            {
              name: 'Generate Token',
              url: '/tokens?action=generate',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
            },
            {
              name: 'Live Dashboard',
              url: '/dashboard',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/.*\/api\/stats\//,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-stats',
                expiration: { maxAgeSeconds: 60, maxEntries: 10 },
              },
            },
            {
              urlPattern: /^https?:\/\/.*\/api\/plans/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'api-plans',
                expiration: { maxAgeSeconds: 3600, maxEntries: 20 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@nexrad/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      proxy: apiProxyTarget
        ? { '/api': { target: apiProxyTarget, changeOrigin: true } }
        : undefined,
    },
  }
})
