import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], optimizeDeps: { include: ['pdfjs-dist'] }, build: { rollupOptions: { output: { manualChunks(id) { if (id.includes('/zod/')) return 'validation'; if (id.includes('/@xyflow/') || id.includes('/d3-')) return 'canvas-engine'; } } } }, server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } } });
