import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// If invoked directly via plain `node server.ts` in container/production,
// re-exec with `--import tsx` so TypeScript modules resolve smoothly.
const isTsx =
  process.execArgv.some((arg) => arg.includes('tsx') || arg.includes('loader.mjs')) ||
  process.env.__TSX_ACTIVE__ === 'true';

if (!isTsx) {
  const child = spawn(process.execPath, ['--import', 'tsx', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, __TSX_ACTIVE__: 'true' },
  });
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.on('SIGINT', () => child.kill('SIGINT'));
  // Suspend outer runner process while child process executes
  await new Promise(() => {});
}

// Local dev only: load .env files so the Autonoma secrets and the Gemini/Google
// API keys are present in process.env. This has to happen before ./services/app
// is evaluated, because that module reads process.env at import time to build
// the Autonoma handler and the Gemini key pool. A static `import` is hoisted
// above this code, so the service is pulled in dynamically.
//
// Vercel injects real environment variables, so this is skipped there.
//
// Which files, and in which order?
//
// Node's process.loadEnvFile() never overwrites a variable that is already set,
// and values exported by the shell win over everything. Loading the files in
// the intuitive low -> high order (.env first, then .env.local) would therefore
// make .env the winner - the exact opposite of Vite, where .env.local overrides
// .env. Loading highest priority FIRST fixes that with the no-overwrite rule:
// the most specific file claims each variable, less specific files only fill
// gaps, and real shell/CI variables still beat every file.
//
// This file previously opened only `.env`. Three of the five local keys
// (VITE_GOOGLE_API_KEY, VITE_API_KEY, VITE_API_KEYS) live in `.env.local`, so
// `npm run dev` booted with none of them and every AI generation answered
// "GEMINI_API_KEY is not configured on the server" even though the key was
// sitting in the file next to it.
const MODE = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const ENV_FILES = [`.env.${MODE}.local`, '.env.local', `.env.${MODE}`, '.env'];

// The keys the server actually reads. Reported at boot because every one of
// them fails with an error that looks like something else (a missing Gemini key
// reads as an outage, a missing Autonoma secret reads as a bad HMAC signature),
// so "is my .env being picked up" is the first thing to rule out.
const APP_ENV_KEYS = [
  'AUTONOMA_SHARED_SECRET',
  'AUTONOMA_SIGNING_SECRET',
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
  'VITE_API_KEY',
  'VITE_API_KEYS',
];

function describeEnv(): string {
  const present = APP_ENV_KEYS.filter((k) => (process.env[k] || '').trim().length > 0);
  const missing = APP_ENV_KEYS.filter((k) => !(process.env[k] || '').trim());
  const parts = [];
  parts.push(present.length ? `present: ${present.join(', ')}` : 'present: none');
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
  return parts.join(' | ');
}

if (!process.env.VERCEL) {
  const loaded: string[] = [];
  for (const name of ENV_FILES) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
      loaded.push(name);
    } catch (err) {
      // A malformed line should not stop the server from booting; say exactly
      // which file is broken so it is a one-second fix.
      console.error(`[server] Could not parse ${name}: ${(err as Error).message}`);
    }
  }

  // A VERCEL_OIDC_TOKEN left behind in .env.local by a `vercel` CLI login is
  // dead on arrival locally, but it is the kind of value that makes someone
  // believe they are authenticated against Vercel when they are not.
  if (process.env.VERCEL_OIDC_TOKEN) {
    console.warn(
      '[server] VERCEL_OIDC_TOKEN is set from a local .env file. It is only valid ' +
        'inside a Vercel deployment - delete it from .env.local to avoid confusion.'
    );
  }

  console.log(`[server] Loaded env files: ${loaded.length ? loaded.join(', ') : 'none'}`);
  console.log(`[server] Server env keys  : ${describeEnv()}`);

  const hasGeminiKey =
    (process.env.GEMINI_API_KEY || '').trim() || (process.env.GEMINI_API_KEYS || '').trim() ||
    (process.env.VITE_API_KEY || '').trim() || (process.env.VITE_API_KEYS || '').trim();
  if (!hasGeminiKey) {
    console.warn(
      '[server] No Gemini key found in any env file. AI generation will return ' +
        '"GEMINI_API_KEY is not configured on the server". Put GEMINI_API_KEY (or ' +
        'VITE_API_KEY) in .env.local.'
    );
  }
}

const { createApp } = await import('./services/app');

async function startServer() {
  const app = await createApp();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Export for Vercel
export default createApp;

// Start server if not in Vercel
if (!process.env.VERCEL) {
  startServer();
}
