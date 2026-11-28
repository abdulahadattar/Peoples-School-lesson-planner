import fs from 'fs';
import path from 'path';

// Load local .env / .env.local before importing app modules so env-dependent
// singletons (Gemini key pool, Autonoma secrets, etc.) read populated values.
for (const envFile of ['.env', '.env.local']) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

async function startServer(): Promise<void> {
  const { createApp } = await import('./services/app.js');
  const app = await createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`PHSSJ Portal server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
