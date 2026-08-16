import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build for hosting the whole app as one self-contained HTML page
// (claude.ai artifact, email attachment, USB stick...). No PWA/service worker.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: 'dist-artifact',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100 * 1024 * 1024,
  },
});
