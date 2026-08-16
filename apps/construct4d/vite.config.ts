import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works at any URL depth (GitHub Pages, subfolders, file hosting)
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['samples/sample-schedule.xml'],
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // pdf.js worker is ~1.4 MB
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,xml}'], // include the pdf.js .mjs worker
      },
      manifest: {
        name: 'Construct4D — 4D Construction Scheduler',
        short_name: 'Construct4D',
        description:
          '4D construction schedule animation linked live to Microsoft Project, with AI drawing interpretation.',
        theme_color: '#171716',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 2500,
  },
});
