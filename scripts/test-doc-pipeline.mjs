#!/usr/bin/env node
/**
 * Full document pipeline + verification test against real enrolment scans.
 *
 * Runs the whole ingestion path the Document Archive UI uses:
 *   create-job -> upload-single (per file) -> finalize-job -> poll
 * then the verification path:
 *   GET  /api/documents/dossiers/:grNo      (what was extracted)
 *   POST /api/documents/audit/:grNo         (dossier vs Google Sheet record)
 *
 * Defaults live in the script so no shell quoting is needed for paths that
 * contain spaces (argv splitting silently truncated "D:\Enrollment 2026\...").
 *
 * Usage:
 *   node scripts/test-doc-pipeline.mjs
 *   GR=1297 MAXFILES=3 TIMEOUT=600000 node scripts/test-doc-pipeline.mjs
 *   DIR="D:\Enrollment 2026\X" GR=1300 node scripts/test-doc-pipeline.mjs
 */
import fs from 'fs';
import path from 'path';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const DIR = process.env.DIR || 'D:\\Enrollment 2026\\XI';
const GR = process.env.GR || '';
const MAX_FILES = Number(process.env.MAXFILES || 3);
const TIMEOUT = Number(process.env.TIMEOUT || 600000);
const POLL_MS = Number(process.env.POLLMS || 3000);

const c = {
  g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[2m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`, cy: s => `\x1b[36m${s}\x1b[0m`,
};
const log = (m = '') => process.stdout.write(m + '\n');

const api = async (p, init = {}, ms = 300000) => {
  const r = await fetch(`${BASE}${p}`, { ...init, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: r.status, json, text };
};
const postJson = (p, body) => api(p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Resolve which real files to test: a GR subfolder if GR is set, else the dir's own scans. */
function collectFiles() {
  if (!fs.existsSync(DIR)) throw new Error(`source dir not found: ${DIR}`);
  let pool;
  if (GR) {
    const sub = path.join(DIR, `${GR}_images`);
    pool = fs.existsSync(sub)
      ? fs.readdirSync(sub).map(f => path.join(sub, f))
      : fs.readdirSync(DIR)
        .filter(f => f.toLowerCase().startsWith(GR.toLowerCase()) && fs.statSync(path.join(DIR, f)).isFile())
        .map(f => path.join(DIR, f));
  } else {
    pool = fs.readdirSync(DIR)
      .map(f => path.join(DIR, f))
      .filter(p => fs.statSync(p).isFile() && /\.(pdf|png|jpe?g)$/i.test(p));
  }
  return pool
    .filter(p => fs.statSync(p).isFile())
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size) // smallest first
    .slice(0, MAX_FILES);
}

async function runIngestion(files) {
  const created = await postJson('/api/documents/create-job', { expectedCount: files.length });
  const job = created.json?.job;
  if (!job) {
    log(c.r(`\ncreate-job failed: HTTP ${created.status} ${created.text.slice(0, 200)}`));
    return { fatal: true };
  }
  const jobId = job.jobId ?? job.id;
  log(`\n${c.g('1.')} create-job -> ${c.b(jobId)}  (totalFiles=${job.totalFiles})`);

  log(`${c.g('2.')} uploading ${files.length} file(s)...`);
  let uploadFails = 0;
  for (const f of files) {
    const t0 = Date.now();
    const base64Data = fs.readFileSync(f).toString('base64');
    const r = await postJson('/api/documents/upload-single', {
      jobId,
      filename: path.basename(f),
      base64Data,
      grNo: GR || undefined,
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.status >= 200 && r.status < 300) {
      log(c.g(`   ok   ${path.basename(f)}`) + c.d(`  HTTP ${r.status} ${secs}s  ${(base64Data.length / 1024 / 1024).toFixed(1)} MB b64`));
    } else {
      uploadFails++;
      log(c.r(`   FAIL ${path.basename(f)}  HTTP ${r.status} ${r.text.slice(0, 160)}`));
    }
  }

  const fin = await postJson('/api/documents/finalize-job', { jobId });
  log(`${c.g('3.')} finalize-job -> HTTP ${fin.status} ${fin.text.slice(0, 120)}`);

  log(`${c.g('4.')} polling for terminal state (timeout ${TIMEOUT / 1000}s)...`);
  const deadline = Date.now() + TIMEOUT;
  const seen = new Set();
  let last = '';
  let finalJob = null;
  while (Date.now() < deadline) {
    const r = await api(`/api/documents/jobs/${jobId}`, {}, 20000);
    const j = r.json?.job;
    if (!j) { await new Promise(x => setTimeout(x, POLL_MS)); continue; }
    const line = `status=${j.status} ${j.processedFiles}/${j.totalFiles} ok=${j.successCount} fail=${j.failedCount} stage=${j.currentStage}`;
    if (line !== last) { log(c.d(`   ${line}`)); last = line; }
    for (const l of j.logs || []) {
      const key = `${l.stage}|${l.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const paint = l.level === 'error' ? c.r : l.level === 'warn' ? c.y : c.d;
      log(paint(`   [${l.level}] ${l.stage}: ${String(l.message).slice(0, 170)}`));
    }
    if (j.status === 'completed' || j.status === 'failed') { finalJob = j; break; }
    await new Promise(x => setTimeout(x, POLL_MS));
  }
  return { fatal: false, finalJob, uploadFails, jobId };
}

async function runVerification(grNo) {
  log(`\n${c.b(c.cy('── Verification ──'))}`);
  if (!grNo) {
    log(c.y('no GR number available, skipping dossier/audit check'));
    return;
  }
  const d = await api(`/api/documents/dossiers/${grNo}`, {}, 30000);
  if (d.status === 404) {
    log(c.y(`dossier GR ${grNo}: 404 (nothing linked to this GR yet)`));
  } else if (!d.json?.dossier) {
    log(c.y(`dossier GR ${grNo}: HTTP ${d.status} ${d.text.slice(0, 140)}`));
  } else {
    const dos = d.json.dossier;
    log(c.g(`dossier GR ${grNo} found`));
    for (const k of ['studentName', 'fatherName', 'currentClass', 'bForm', 'fatherCnic', 'photo', 'flags', 'status']) {
      if (k in dos) log(c.d(`         ${k} = ${JSON.stringify(dos[k]).slice(0, 90)}`));
    }
    log(c.d(`         keys: ${Object.keys(dos).slice(0, 14).join(', ')}`));
  }

  const au = await postJson(`/api/documents/audit/${grNo}`, { sheetRecord: {} });
  if (au.status >= 200 && au.status < 300) {
    const disc = au.json?.discrepancies;
    log(`audit vs sheet: HTTP ${au.status}  discrepancies=${Array.isArray(disc) ? disc.length : JSON.stringify(disc).slice(0, 100)}`);
    if (Array.isArray(disc) && disc.length) log(c.d(`         ${JSON.stringify(disc).slice(0, 300)}`));
  } else {
    log(c.y(`audit vs sheet: HTTP ${au.status} ${au.text.slice(0, 140)}`));
  }
}

async function main() {
  const files = collectFiles();
  log(c.b(c.cy(`\nDocument pipeline + verification test`)));
  log(`source : ${DIR}${GR ? `  (GR ${GR})` : ''}`);
  log(`files  : ${files.length}`);
  files.forEach(f => log(c.d(`         ${path.basename(f)}  ${(fs.statSync(f).size / 1024).toFixed(0)} KB`)));
  if (files.length === 0) { log(c.r('\nNo files selected.')); process.exitCode = 1; return; }

  const { fatal, finalJob, uploadFails } = await runIngestion(files);
  if (fatal) { process.exitCode = 1; return; }

  log(`\n${c.b(c.cy('── Ingestion verdict ──'))}`);
  if (!finalJob) {
    log(c.r(`TIMEOUT: no terminal state within ${TIMEOUT / 1000}s`));
    process.exitCode = 1;
    return;
  }
  const cls = {};
  for (const l of finalJob.logs || []) {
    const m = String(l.message || '').match(/AI Classification:\s*(\w+)/i);
    if (m) cls[m[1]] = (cls[m[1]] || 0) + 1;
  }
  log(`status         : ${finalJob.status === 'completed' ? c.g('COMPLETED') : c.r(finalJob.status)}`);
  log(`processed      : ${finalJob.processedFiles}/${finalJob.totalFiles}`);
  log(`succeeded      : ${finalJob.successCount}    failed: ${finalJob.failedCount}`);
  log(`classifications: ${JSON.stringify(cls)}`);

  await runVerification(GR || finalJob.grNo || '');

  const ok = finalJob.status === 'completed' && uploadFails === 0;
  log(`\n${ok ? c.g('RESULT: PASS') : c.r(`RESULT: FAIL  (uploadFails=${uploadFails}, status=${finalJob.status})`)}\n`);
  process.exitCode = ok ? 0 : 1;
}

main().catch(e => { console.error('Pipeline test crashed:', e); process.exitCode = 2; });
