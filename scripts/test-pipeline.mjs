const BASE = 'http://localhost:3000';
const fs = await import('node:fs');

const files = process.argv.slice(2);
const jobRes = await fetch(`${BASE}/api/documents/create-job`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ expectedCount: files.length }),
});
const job = (await jobRes.json()).job;
const jobId = job.jobId ?? job.id;
console.log('jobId:', jobId, 'totalFiles:', job.totalFiles);

for (const f of files) {
  const buf = fs.readFileSync(f);
  const r = await fetch(`${BASE}/api/documents/upload-single`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      filename: f.split(/[\\/]/).pop(),
      base64Data: buf.toString('base64'),
    }),
  });
  const t = await r.text();
  console.log(`upload ${f.split(/[\\/]/).pop()}: HTTP ${r.status} ${t.slice(0, 200)}`);
}

await fetch(`${BASE}/api/documents/finalize-job`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId }),
});

const deadline = Date.now() + 240000;
let last = '';
while (Date.now() < deadline) {
  const j = (await (await fetch(`${BASE}/api/documents/jobs/${jobId}`)).json()).job;
  const line = `status=${j.status} ${j.processedFiles}/${j.totalFiles} ok=${j.successCount} fail=${j.failedCount} stage=${j.currentStage}`;
  if (line !== last) { console.log(line); last = line; }
  const n = (j.logs || []).length;
  for (let i = Math.max(0, (globalThis.__seen ?? 0)); i < n; i++) {
    const l = j.logs[i];
    console.log(`   [${l.level}] ${l.stage}: ${l.message}`);
  }
  globalThis.__seen = n;
  if (j.status === 'completed' || j.status === 'failed') {
    console.log(`\nVERDICT: ${j.status.toUpperCase()} in ${j.processedFiles} processed, ok=${j.successCount}, fail=${j.failedCount}`);
    const cls = {};
    for (const l of (j.logs || [])) {
      const m = l.message?.match(/AI Classification: (\w+)/);
      if (m) cls[m[1]] = (cls[m[1]] || 0) + 1;
    }
    console.log('classifications:', JSON.stringify(cls));
    process.exit(0);
  }
  await new Promise(r => setTimeout(r, 3000));
}
console.log('\nVERDICT: TIMEOUT (no terminal state within 240s)');
process.exit(1);
