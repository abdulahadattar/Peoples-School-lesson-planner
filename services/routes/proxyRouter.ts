import { Router } from 'express';

export function createProxyRouter(): Router {
  const router = Router();

  // PDF Proxy for GitHub raw content
  router.get('/pdf-proxy', async (req, res) => {
    try {
      const path = req.query.path || req.originalUrl.replace('/pdf-proxy', '').replace(/^\//, '');
      const url = `https://raw.githubusercontent.com/${path}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PHSSJ-Lesson-Planner/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        res.status(response.status).json({ error: `GitHub returned ${response.status}` });
        return;
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error('[server] pdf-proxy error:', error);
      res.status(500).json({ error: 'PDF proxy failed' });
    }
  });

  // Unified endpoint for Gemini to keep API keys secure on server with key rotation and model fallback
  router.post('/api/gemini', async (req, res) => {
    try {
      const {
        model = 'gemini-3.5-flash-lite',
        systemInstruction,
        userPrompt,
        schema,
        temperature,
        contextParts,
      } = req.body || {};

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

      const modelsToTry = Array.from(new Set([
        model,
        'gemini-3.5-flash-lite',
        'gemma-4-26b-a4b-it',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash',
        'gemini-flash-latest',
      ]));
      let lastErrText = '';
      let lastStatus = 500;

      for (const currentModel of modelsToTry) {
        for (const key of serverKeys) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;
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
          } catch (fetchErr) {
            lastErrText = (fetchErr as Error).message;
          }
        }
      }

      res.status(lastStatus).json({ error: lastErrText || `Failed across all models and available API keys.` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
