import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { brand } from './src/config';
export default defineConfig(({ mode }) => {
  const serverPort = process.env.PORT || loadEnv(mode, process.cwd(), 'PORT').PORT || '8787';
  return {
    plugins: [react(), { name: 'mt-info-brand', transformIndexHtml: html => html.replace('__APP_TITLE__', `${brand.name} · ${brand.description}`).replace('__APP_DESCRIPTION__', brand.description) }],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': `http://127.0.0.1:${serverPort}` } },
    build: { manifest: true, chunkSizeWarningLimit: 900, rollupOptions: { input: { main: 'index.html', cards: 'cards.html' }, output: { manualChunks: { map: ['maplibre-gl'] } } } },
  };
});
