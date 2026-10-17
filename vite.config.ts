import { defineConfig } from 'vite';
import { pdfjsAssets } from './config/vite/pdfjs-assets.ts';

export default defineConfig({
  root: 'client',
  base: '/',
  plugins: [pdfjsAssets()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:7317' } },
});
