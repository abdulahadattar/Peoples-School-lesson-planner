import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
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
      plugins: [react()],
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
              vendor: ['idb-keyval', 'react-dropzone'],
            },
          },
        },
      },
    };
});