import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function geminiServerPlugin(): Plugin {
  return {
    name: 'gemini-server-plugin',
    configureServer(server) {
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok' }));
      });

      server.middlewares.use('/api/gemini', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const { model = 'gemini-3.5-flash-lite', systemInstruction, userPrompt, schema, temperature, contextParts } = JSON.parse(body || '{}');
            const rawKeys: string[] = [];
            if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
            if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
            if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
            if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));

            const serverKeys = Array.from(new Set(rawKeys.map(k => k.trim()).filter(Boolean)));

            if (serverKeys.length === 0) {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: 'GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY in your environment.'
              }));
              return;
            }

            const parts: any[] = [];
            if (contextParts && Array.isArray(contextParts)) {
              for (const part of contextParts) {
                parts.push(part);
              }
            }
            if (userPrompt) {
              parts.push({ text: userPrompt });
            }

            const reqBody = JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: temperature ?? 0.2,
                responseMimeType: 'application/json',
                responseSchema: schema,
              },
              systemInstruction: systemInstruction ? {
                parts: [{ text: systemInstruction }],
              } : undefined,
            });

            let lastErrText = '';
            let lastStatus = 500;

            for (const key of serverKeys) {
              try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                const response = await fetch(geminiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key,
                  },
                  body: reqBody,
                });

                if (response.ok) {
                  const data = await response.json();
                  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ text }));
                  return;
                }

                lastStatus = response.status;
                lastErrText = await response.text();
              } catch (fetchErr) {
                lastErrText = (fetchErr as Error).message;
              }
            }

            res.statusCode = lastStatus;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: lastErrText || `Failed with model ${model} across all available API keys.` }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
      });
    },
  };
}

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
      plugins: [react(), tailwindcss(), geminiServerPlugin()],
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