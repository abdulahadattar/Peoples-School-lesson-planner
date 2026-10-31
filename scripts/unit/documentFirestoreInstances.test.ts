/**
 * Cross-instance Firestore integration for the document pipeline (C6).
 *
 * THE assertion: separate module instantiations (three child processes --
 * simulated Lambda instances) sharing ONE Firestore project see each other's
 * jobs, so a job created with expectedCount 1 on 'instance A', uploaded on
 * 'instance B' and finalized on 'instance C' ends at completed 1/1 instead
 * of the multi-instance "No documents were received" failure.
 *
 * Requires a running Firestore emulator:
 *   set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080   (npm i firebase-tools; npx firebase emulators:start --only firestore)
 * Skips gracefully when the env var is absent — this dev box has no Java 11+
 * runtime, so the emulator cannot be booted here (verified 2026-10-31:
 * `java -version` not installed); the gate therefore always runs in skip mode.
 *
 * Run: node --import tsx scripts/unit/documentFirestoreInstances.test.ts
 *      (or FIREWORKS via FIRESTORE_EMULATOR_HOST during `npm run test:unit`)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

type Harness = {
  describe: (name: string) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

const WORKER = path.join(HERE, 'firestoreInstanceWorker.ts');

async function runWorker(role: string, extra: string[]): Promise<{ role: string; [k: string]: unknown }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', WORKER, role, ...extra],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          VERCEL: '1',
          FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
            project_id: 'phssjportal-document-c6',
            client_email: 'workers@phssjportal-document-c6.iam.gserviceaccount.com',
            private_key: '-----BEGIN PRIVATE KEY-----emulator-only-----END PRIVATE KEY-----',
          }),
          NODE_OPTIONS: (process.env.NODE_OPTIONS || '') + ' --unhandled-rejections=strict',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += String(d)));
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('exit', (code) => {
      const lines = out.trim().split(/\r?\n/).filter(Boolean);
      const jsonLine = lines.reverse().find((l) => l.startsWith('{'));
      if (code === 0 && jsonLine) {
        try { resolve(JSON.parse(jsonLine)); return; } catch { /* fallthrough */ }
      }
      reject(new Error(`worker ${role} failed (exit ${code})\nstdout: ${out}\nstderr: ${err}`));
    });
  });
}

export async function runDocumentFirestoreInstancesTests(h: Harness) {
  const { describe, itAsync, eq } = h;

  describe('documentFirestoreInstances (C6): three Lambda instances share one store');
  await itAsync('create@A -> upload-single@B -> finalize@C reaches completed 1/1', async function () {
    const emulator = process.env.FIRESTORE_EMULATOR_HOST;
    if (!emulator) {
      console.log('  ⏭ SKIPPED: FIRESTORE_EMULATOR_HOST is not set (Firestore emulator needs Java 11+, absent here).');
      console.log('    Boot it locally to run: npx firebase emulators:start --only firestore, then re-run this suite.');
      return;
    }
    const a = await runWorker('A', []);
    const jobId = String(a.jobId || '');
    assert.ok(jobId, 'worker A must create and publish a job id');

    const b = await runWorker('B', [jobId]);
    eq(b.enqueued, 1, 'instance B must enqueue the upload into the SHARED job');

    const c = await runWorker('C', [jobId]);
    const job = c.job as any;
    assert.ok(job, 'finalize on instance C must return the shared job');
    eq(job.id, jobId);
    eq(job.totalFiles, 1, 'totalFiles must count the upload from instance B');
    eq(job.processedFiles, 1, 'finalize must see the processing done on instance B');
    eq(job.status, 'completed', 'THE bug this test pins: finalize must be terminal, not "No documents were received"');
  });
}
