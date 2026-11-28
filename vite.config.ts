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
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/scheduler/')
              ) {
                return 'react';
              }
              if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) {
                return 'firebase';
              }
              if (id.includes('/node_modules/@google/genai/')) {
                return 'genai';
              }
              if (id.includes('/node_modules/docx/') || id.includes('/node_modules/file-saver/')) {
                return 'docx';
              }
              if (id.includes('/node_modules/pdf-lib/')) {
                return 'pdf';
              }
              if (
                id.includes('/node_modules/recharts/') ||
                id.includes('/node_modules/d3-') ||
                id.includes('/node_modules/victory-vendor/')
              ) {
                return 'charts';
              }
              if (
                id.includes('/node_modules/lucide-react/') ||
                id.includes('/node_modules/framer-motion/') ||
                id.includes('/node_modules/motion/')
              ) {
                return 'ui';
              }
              if (id.includes('/node_modules/idb-keyval/')) {
                return 'vendor';
              }
            },
          },
        },
      },
    };
});