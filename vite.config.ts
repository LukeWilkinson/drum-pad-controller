import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// host: true exposes the server on the local network (https://192.168.x.x:5173).
// basicSsl gives a self-signed certificate so phones treat the page as a secure context.
// HTTP=1 turns it off for desktop-only checks (localhost is already a secure context).
const useHttps = !process.env.HTTP;

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  plugins: [
    useHttps && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Drum Pad Controller',
        short_name: 'Pads',
        description: 'Drum pads and MIDI controller',
        theme_color: '#2B2A28',
        background_color: '#2B2A28',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,flac}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
});
