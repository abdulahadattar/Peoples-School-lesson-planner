import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Production route (vercel.json) must mirror these dev proxies so
          // /pdf-proxy and /gh-releases work in production as well as locally.
          // Proxy GitHub release downloads to bypass CORS
          '/gh-releases': {
            target: 'https://github.com',
            changeOrigin: true,
            followRedirects: true,
            rewrite: (path) => path.replace(/^\/gh-releases\//, '/'),
          },
          // Proxy GitHub raw content to bypass CORS
          '/pdf-proxy': {
            target: 'https://raw.githubusercontent.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/pdf-proxy\//, '/'),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Accept', 'application/pdf');
              });
            },
          },
        },
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              genai: ['@google/genai'],
              docx: ['docx', 'file-saver'],
              vendor: ['idb-keyval'],
            },
          },
        },
      },
    };
});