import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Official references — read before changing the bundler config:
 *   Vite guide          https://vite.dev/guide/
 *   Vite env vars       https://vite.dev/guide/env-and-mode
 *   vite-plugin-react   https://github.com/vitejs/vite-plugin-react
 *   Tailwind v4 + Vite  https://www.tailwindcss.com/docs/upgrade-guide
 *
 * Installed Vite is 6.4.3; upstream is 8.x. Vite 8 replaces esbuild/Rollup with
 * Rolldown/Oxc and renames build.rollupOptions -> build.rolldownOptions, so the
 * manualChunks block below would need reworking on a major bump:
 *   https://vite.dev/guide/migration
 * Version status: docs/VERIFIED_STACK.md section 3.
 *
 * Tailwind v4 is CSS-first: there is deliberately no tailwind.config.js, the
 * theme lives in index.css as @theme variables.
 */
export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
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