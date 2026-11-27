/**
 * Regression: FIX-4b hydration sweep vs. `saveTimer` temporal-dead-zone.
 *
 * `services/documentArchive/store.ts` calls reconcileInterruptedJobs() at
 * module-init time. With a persisted job left in 'processing'/'uploading' by
 * a previous process, the sweep is non-empty and saveStores() runs while the
 * module body is STILL EXECUTING — saveTimer was declared right after the
 * reconcile call, so in local 'debounce' mode saveStores() hits
 * "ReferenceError: Cannot access 'saveTimer' before initialization" and
 * `npm run dev` (server.ts) dies at import time.
 *
 * The aggregated suite (scripts/unit-tests.ts) cannot see this: it imports
 * store.ts after setting VERCEL=1, which selects 'sync' persistence and
 * never touches saveTimer. This standalone probe therefore imports the REAL
 * module in local layout (no VERCEL set) with cwd pointed at an isolated
 * temp dir so DATA_ROOT = <cwd>/data stays outside the repo. Standalone so
 * the process cannot have imported store.ts (or set VERCEL) beforehand.
 *
 * Run: npm run test:unit:storeinit
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phssj-storeinit-'));
process.chdir(workDir); // must happen BEFORE importing store.ts: DATA_ROOT is
                        // selected once at import time from process.cwd().

try {
  const fixtureJob = {
    id: 'storeinit-orphan',
    totalFiles: 1, processedFiles: 0, remainingFiles: 1,
    flaggedCount: 0, duplicateCount: 0, failedCount: 0, successCount: 0,
    status: 'processing',
    currentStage: 'AI_VISION',
    startedAt: new Date().toISOString(),
  };
  const fixtureJobId = fixtureJob.id;
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(
    path.join('data', 'document_jobs.json'),
    JSON.stringify({ [fixtureJob.id]: fixtureJob }, null, 2),
  );

  // This import runs the FIX-4b hydration sweep with a non-empty sweep list
  // in local 'debounce' mode — the exact path that crashed `npm run dev`.
  await import('../../services/documentArchive/store.js');

  // Local debounce mode coalesces flushes into a 250ms window by design —
  // give the write-behind timer its slot before reading the store back.
  const readFile = () => JSON.parse(fs.readFileSync('data/document_jobs.json', 'utf-8'));
  let swept: Record<string, { status?: string }> | null = null;
  for (let waited = 0; waited <= 2000; waited += 100) {
    swept = readFile();
    if (swept[fixtureJobId]?.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(swept![fixtureJobId]?.status, 'failed',
    'FIX-4b sweep must cap the orphaned job and persist it in local debounce mode');
  console.log('✅ documentStoreInit: store.ts initializes with a pending FIX-4b sweep (local debounce mode)');
} finally {
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
}
