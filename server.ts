import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '20mb' }));

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Unified endpoint for Gemini to keep API keys secure on server with key rotation and model fallback
  app.post('/api/gemini', async (req, res) => {
    try {
      const {
        model = 'gemini-3.5-flash-lite',
        systemInstruction,
        userPrompt,
        schema,
        temperature,
        contextParts,
      } = req.body || {};

      // Collect all configured server-side keys
      const rawKeys: string[] = [];
      if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
      if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
      if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
      if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));

      const serverKeys = Array.from(new Set(rawKeys.map(k => k.trim()).filter(Boolean)));

      if (serverKeys.length === 0) {
        res.status(401).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please provide an API key in your environment.',
        });
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

      const requestBody = JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: temperature ?? 0.2,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
      });

      // Try all keys for the requested model
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
            body: requestBody,
          });

          if (response.ok) {
            const data = (await response.json()) as any;
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            res.json({ text });
            return;
          }

          lastStatus = response.status;
          lastErrText = await response.text();
          console.warn(`[server.ts] Model ${model} failed with key (status ${lastStatus}): ${lastErrText.slice(0, 100)}`);
        } catch (fetchErr) {
          lastErrText = (fetchErr as Error).message;
          console.warn(`[server.ts] Network error on model ${model}: ${lastErrText}`);
        }
      }

      res.status(lastStatus).json({ error: lastErrText || `Failed with model ${model} across all available API keys.` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
