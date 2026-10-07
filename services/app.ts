import express, { Express } from 'express';
import path from 'path';
import compression from 'compression';
import { createAutonomaRouter } from './routes/autonomaRouter.js';
import { createProxyRouter } from './routes/proxyRouter.js';
import { createSheetsRouter } from './routes/sheetsRouter.js';
import { createAttendanceRouter } from './routes/attendanceRouter.js';
import { createDocumentUploadRouter } from './routes/documentUploadRouter.js';
import { createDocumentManageRouter } from './routes/documentManageRouter.js';

export async function createApp(): Promise<Express> {
  const app = express();

  // Compression middleware - Compresses all responses down by 80-90%
  app.use(
    compression({
      level: 6,
      threshold: 256,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  // Body parser middleware
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Serve Vite's public/ assets
  app.use(express.static(path.join(process.cwd(), 'public'), { index: false }));

  // Helper to collect server Gemini keys
  const getDocumentApiKeys = () => {
    const rawKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
    if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
    if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
    if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));
    return Array.from(new Set(rawKeys.map(k => k.trim()).filter(Boolean)));
  };

  // Mount modular route handlers
  app.use(createAutonomaRouter());
  app.use(createProxyRouter());
  app.use('/api', createSheetsRouter());
  app.use('/api', createAttendanceRouter());
  app.use('/api', createDocumentUploadRouter(getDocumentApiKeys));
  app.use('/api', createDocumentManageRouter(getDocumentApiKeys));

  // SPA fallback
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile('index.html', { root: distPath }, err => {
        if (err) {
          console.error('[server] SPA fallback failed:', err);
          if (!res.headersSent) res.status(500).send('Failed to serve index.html');
        }
      });
    });
  }

  // Error handling middleware
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[server] Error:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: err.message });
  });

  return app;
}
