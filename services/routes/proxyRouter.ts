import { Router } from 'express';
import {
  buildModelTryOrder,
  extractSafeGithubProxyPath,
  withPromiseTimeout,
} from './proxyHelpers.js';
import {
  extractHttpStatus,
  getServerKeyPoolHandle,
  withServerKeyRotation,
} from '../gemini/client.js';
import {
  buildRestModelBody,
  sanitizeSdkCallForModel,
} from '../gemini/gemmaCompat.js';

const GEMINI_REQUEST_TIMEOUT_MS = 55_000;

export function createProxyRouter(): Router {
  const router = Router();

  // PDF Proxy for GitHub raw content (supports both /pdf-proxy/<owner>/<repo>/... and /pdf-proxy?path=...)
  router.use('/pdf-proxy', async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    try {
      const rawPath = (typeof req.query.path === 'string' && req.query.path) || req.path;
      const safePath = extractSafeGithubProxyPath(rawPath);
      if (!safePath) {
        res.status(400).json({ error: 'Invalid GitHub PDF path' });
        return;
      }

      const url = `https://raw.githubusercontent.com/${safePath}`;
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

      const serverPool = getServerKeyPoolHandle();
      if (serverPool.getPoolLength() === 0) {
        serverPool.refresh();
      }
      if (serverPool.getPoolLength() === 0) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please add an API key in Settings > Secrets.',
        });
        return;
      }

      const modelsToTry = buildModelTryOrder(model);
      const text = await withServerKeyRotation(async (key, currentModel) => {
        const requestBody = JSON.stringify(
          buildRestModelBody(currentModel, systemInstruction, userPrompt, schema, temperature, contextParts)
        );
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
            'User-Agent': 'aistudio-build',
          },
          body: requestBody,
          signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          const errText = await response.text();
          const err = new Error(errText || `Gemini API returned ${response.status}`) as Error & { status?: number };
          err.status = response.status;
          throw err;
        }

        const rawJson = await response.text();
        let data: any;
        try {
          data = JSON.parse(rawJson);
        } catch {
          const err = new Error('Upstream Gemini API returned non-JSON response.') as Error & { status?: number };
          err.status = 502;
          throw err;
        }
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }, modelsToTry);

      res.json({ text });
    } catch (err: any) {
      const status = extractHttpStatus(err);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: err?.message || 'Failed across all models and available API keys.',
      });
    }
  });

  // Server proxy endpoint used by services/gemini/client.ts when no client key is configured
  router.post('/api/gemini/generate', async (req, res) => {
    try {
      const {
        model = 'gemini-3.5-flash-lite',
        contents,
        config,
      } = req.body || {};

      const serverPool = getServerKeyPoolHandle();
      if (serverPool.getPoolLength() === 0) {
        serverPool.refresh();
      }
      if (serverPool.getPoolLength() === 0) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please add an API key in Settings > Secrets.',
        });
        return;
      }

      const modelsToTry = buildModelTryOrder(model);
      const { GoogleGenAI } = await import('@google/genai');

      const text = await withServerKeyRotation(async (key, currentModel) => {
        const payload = sanitizeSdkCallForModel(currentModel, contents, config);
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const response = await withPromiseTimeout(
          ai.models.generateContent({
            model: currentModel,
            contents: payload.contents,
            config: payload.config,
          }),
          GEMINI_REQUEST_TIMEOUT_MS,
          `Gemini ${currentModel}`
        );
        return response.text || '';
      }, modelsToTry);

      res.json({ text });
    } catch (err: any) {
      const status = extractHttpStatus(err);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: err?.message || 'Failed across all models and available API keys.',
      });
    }
  });

  return router;
}
