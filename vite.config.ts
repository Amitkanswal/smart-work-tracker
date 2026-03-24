import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import manifest from './manifest.config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, 'src/shared'),
    },
  },
  build: {
    /** Extension service workers must not pull UI vendor chunks via import preload graphs. */
    modulePreload: false,
    rollupOptions: {
      input: {
        dashboard: path.resolve(rootDir, 'dashboard.html'),
      },
    },
  },
});
