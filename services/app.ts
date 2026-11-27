import express, { Express } from 'express';
import path from 'path';
import compression from 'compression';
import { createAutonomaRouter } from './routes/autonomaRouter.js';
import { createProxyRouter } from './routes/proxyRouter.js';
import { createSheetsRouter } from './routes/sheetsRouter.js';
import { createAttendanceRouter } from './routes/attendanceRouter.js';
import { getServerKeyOrder } from './gemini/serverKeyRotator.js';
import { createDocumentUploadRouter } from './routes/documentUploadRouter.js';
import { createDocumentManageRouter } from './routes/documentManageRouter.js';
import { createMarksheetsRouter } from './routes/marksheetsRouter.js';

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

  const getDocumentApiKeys = () => getServerKeyOrder();

  // Mount modular route handlers
  app.use('/api', createAutonomaRouter());
  app.use(createProxyRouter());
  app.use('/api', createSheetsRouter());
  app.use('/api', createAttendanceRouter());
  app.use('/api', createDocumentUploadRouter(getDocumentApiKeys));
  app.use('/api', createDocumentManageRouter(getDocumentApiKeys));
  app.use('/api', createMarksheetsRouter());

  // Prevent unmatched /api/* paths from falling through to Vite/SPA HTML fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

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
