import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// host: true exposes the server on the local network (the "Network" address Vite prints).
// basicSsl gives a self-signed certificate so phones treat the page as a secure context.
// HTTP=1 turns it off for desktop-only checks (localhost is already a secure context).
const useHttps = !process.env.HTTP;

const LICENSE_FILE = 'third-party-licenses.md';

// Vite's licence file only covers the main bundle. The service worker's Workbox runtime is
// generated later by vite-plugin-pwa, so its licence (all Workbox packages share it) is added here.
function workboxLicense(): Plugin {
  let outDir = '';
  return {
    name: 'workbox-license',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const file = join(outDir, LICENSE_FILE);
      if (!existsSync(file)) return;
      const text = readFileSync('node_modules/workbox-core/LICENSE', 'utf8').trim();
      appendFileSync(file, `\n## workbox (core, expiration, precaching, routing, strategies; in sw.js) (MIT)\n\n${text}\n`);
    },
  };
}

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  // The minified bundle drops the libraries' licence comments, so Vite writes their licences
  // (Tone.js and its dependencies, workbox-window) to one file served beside the page.
  build: { license: { fileName: LICENSE_FILE } },
  plugins: [
    useHttps && basicSsl(),
    workboxLicense(),
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
