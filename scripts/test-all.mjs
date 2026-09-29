#!/usr/bin/env node
/**
 * Integration suite for the PHSSJ Lesson Planner.
 *
 * Covers the things unit tests cannot: the running dev server, the bundled
 * curriculum data, the PDF proxy, and real end-to-end Gemini generation.
 *
 * Run:  npm run test:integration     (or `npm test` for the full chain)
 *
 * Env:
 *   TEST_BASE_URL   target origin (default http://localhost:3000)
 *   STRICT_KEYS=1   also fail when dead/leaked keys are found in the pool
 *
 * Design notes (these were bugs in the previous version of this script):
 *   - The dev server is warmed up and polled on /api/health before anything
 *     else, so a cold Vite start no longer reports a false "not running".
 *   - Model names come from APP_MODEL_CHAIN in scripts/lib/gemini-keys.mjs
 *     (the same list services/geminiService.ts uses) instead of being
 *     hardcoded here and drifting away from the app.
 *   - Generation runs against a model that was *just proven* to respond,
 *     rather than assuming the first entry of the chain works.
 *   - Dead/leaked API keys are reported as their own category, not as a
 *     mysterious "all keys failed" application failure.
 *   - Exit uses process.exitCode so piped stdout is never truncated.
 */
import fs from 'fs';
import path from 'path';
import {
  APP_MODEL_CHAIN, collectAllKeys, classifyKeys, isTransientApiError, tryGenerate,
} from './lib/gemini-keys.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const STRICT_KEYS = process.env.STRICT_KEYS === '1';

const c = {
  g: s => `\x1b[32m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`,
  cy: s => `\x1b[36m${s}\x1b[0m`,
  d: s => `\x1b[2m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
let skipped = 0;
let warned = 0;
const failures = [];
const warnings = [];
const log = (m = '') => process.stdout.write(m + '\n');
const pass = (t, d = '') => { passed++; log(`${c.g('  ✅')} ${t}${d ? c.d(' — ' + d) : ''}`); };
const fail = (t, d = '') => { failed++; failures.push({ t, d }); log(`${c.r('  ❌')} ${t}${d ? c.r(' — ' + d) : ''}`); };
const skip = (t, d = '') => { skipped++; log(`${c.y('  ⏭️ ')} ${t}${d ? c.d(' — ' + d) : ''}`); };
const warn = (t, d = '') => { warned++; warnings.push({ t, d }); log(`${c.y('  ⚠️ ')} ${t}${d ? c.y(' — ' + d) : ''}`); };
const hdr = (t) => log(`\n${c.b(c.cy(`── ${t} ──`))}`);

const fetchT = (url, opts = {}, ms = 8000) =>
  fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
const blob2b64 = (blob) => blob.arrayBuffer().then(ab => Buffer.from(ab).toString('base64'));

/* ── 1. Dev server ────────────────────────────────────────────── */

/** Poll /api/health until the server answers or we give up. */
async function waitForServer(attempts = 20, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetchT(`${BASE}/api/health`, {}, 5000);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

async function testServer() {
  hdr('Dev server');
  const up = await waitForServer();
  if (!up) {
    fail('Dev server reachable', `${BASE} did not answer /api/health — run \`npm run dev\` first`);
    return false;
  }
  pass('Dev server reachable', BASE);

  try {
    const r = await fetchT(`${BASE}/`, {}, 20000);
    const html = await r.text();
    r.ok && html.includes('<div id="root"') && html.includes('/index.tsx')
      ? pass('Index HTML served', `${html.length} bytes`)
      : fail('Index HTML served', `status ${r.status}`);
  } catch (e) {
    fail('Index HTML served', e.message);
  }

  try {
    const r = await fetchT(`${BASE}/pdf-proxy/abdulahadattar/STBB-BOOKS/main/README.md`, {}, 20000);
    r.ok ? pass('GitHub PDF proxy') : fail('GitHub PDF proxy', `HTTP ${r.status}`);
  } catch (e) {
    fail('GitHub PDF proxy', e.message);
  }

  return true;
}

/* ── 2. Curriculum SLO data (static files, no AI) ─────────────── */

async function testSloData() {
  hdr('Curriculum SLO data');
  const slosRoot = path.join(ROOT, 'public', 'curriculum', 'slos');
  if (!fs.existsSync(slosRoot)) {
    fail('SLO data present', 'public/curriculum/slos is missing');
    return;
  }

  const grades = fs.readdirSync(slosRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const jobs = [];
  for (const grade of grades) {
    for (const file of fs.readdirSync(path.join(slosRoot, grade)).filter(f => f.endsWith('.json') && !f.startsWith('SUMMARY'))) {
      const subject = file.replace(/\.json$/, '');
      jobs.push({ grade, subject, file });
    }
  }

  let totalChapters = 0;
  let totalSlos = 0;
  let bad = 0;

  await Promise.all(jobs.map(async ({ grade, subject, file }) => {
    const label = `${grade} ${subject}`;
    // 1) the file must be valid JSON on disk
    try {
      const raw = fs.readFileSync(path.join(slosRoot, grade, file), 'utf-8');
      const data = JSON.parse(raw);
      const chapters = data.chapters || [];
      const slos = chapters.reduce((a, c2) => a + (c2.slos?.length || 0), 0);
      if (chapters.length === 0) { skip(label, 'no chapters'); return; }
      totalChapters += chapters.length;
      totalSlos += slos;
      // 2) and it must actually be served by the dev server
      try {
        const r = await fetchT(`${BASE}/curriculum/slos/${encodeURIComponent(grade)}/${file}`, {}, 8000);
        if (!r.ok) { fail(label, `served HTTP ${r.status}`); bad++; return; }
      } catch (e) { fail(label, `not served: ${e.message}`); bad++; return; }
      pass(label, `${chapters.length}ch ${slos}slo`);
    } catch (err) {
      bad++;
      fail(label, `invalid JSON: ${err.message}`);
    }
  }));

  if (bad === 0) pass('All SLO files parse and are served', `${grades.length} grades, ${totalChapters} chapters, ${totalSlos} SLOs`);
}

/* ── 3. Textbook PDFs reachable through the proxy ─────────────── */

async function testPdfProxy() {
  hdr('Textbook PDFs');
  const checks = [
    { grade: 'Grade 9', subject: 'physics', ch: 1 },
    { grade: 'Grade 9', subject: 'biology', ch: 1 },
    { grade: 'Grade 12', subject: 'physics', ch: 1 },
  ];
  await Promise.all(checks.map(async t => {
    const label = `${t.grade} ${t.subject} ch${t.ch}`;
    try {
      const r = await fetchT(`${BASE}/curriculum/slos/${encodeURIComponent(t.grade)}/${t.subject}.json`, {}, 8000);
      if (!r.ok) return skip(label, `SLO file HTTP ${r.status}`);
      const data = await r.json();
      const chapter = (data.chapters || []).find(c => c.chapter_number === t.ch);
      if (!chapter?.pdf_url) return skip(label, 'no pdf_url');
      const gh = chapter.pdf_url.match(/raw\.githubusercontent\.com\/(.+)/);
      const url = gh ? `${BASE}/pdf-proxy/${gh[1]}` : chapter.pdf_url;
      const res = await fetchT(url, { headers: { Range: 'bytes=0-5000' } }, 20000);
      if (!res.ok && res.status !== 206) return fail(label, `HTTP ${res.status}`);
      const chunk = await res.arrayBuffer();
      const header = new TextDecoder().decode(chunk.slice(0, 5));
      header.startsWith('%PDF')
        ? pass(label, `valid PDF header (${(chunk.byteLength / 1024).toFixed(1)}KB read)`)
        : fail(label, `bad header: ${JSON.stringify(header.slice(0, 10))}`);
    } catch (e) {
      fail(label, e.message);
    }
  }));
}

/* ── 4. API keys: dead vs usable ──────────────────────────────── */

async function testApiKeys() {
  hdr('API keys');
  const keys = collectAllKeys(ROOT);
  if (keys.length === 0) {
    fail('API key pool', 'no keys found in env or .env files');
    return { live: [], dead: [], workingModel: null };
  }
  pass('API key pool', `${keys.length} keys discovered`);

  const { live, dead } = await classifyKeys(keys);
  const leaked = dead.filter(d => d.permanent);

  for (const d of dead.slice(0, 5)) {
    const line = `HTTP ${d.status} ${d.error}`;
    if (STRICT_KEYS) fail('Dead key', `${d.key.slice(0, 10)}… ${line}`);
    else warn('Unusable key in pool', `${d.key.slice(0, 10)}… ${line}`);
  }
  if (dead.length > 5) log(c.d(`       … and ${dead.length - 5} more dead keys`));

  if (leaked.length > 0) {
    log(c.y(`       ${leaked.length} key(s) rejected as leaked/invalid — Google will never accept these again.`));
    log(c.d('       The app now cools these down immediately (isKeyPermanentlyBlocked) instead of retrying them.'));
  }

  if (live.length === 0) {
    fail('Usable API key', `all ${keys.length} keys are dead — cannot test AI generation`);
  } else {
    pass('Usable API keys', `${live.length} live / ${dead.length} dead`);
  }

  return { live, dead, workingModel: null };
}

/* ── 5. Model chain (proves the hardcoded names really exist) ──── */

async function testModelChain(live) {
  hdr('Model chain');
  if (live.length === 0) {
    skip('Model chain', 'no usable API key');
    return null;
  }
  const supported = new Set(live[0].models);
  const present = APP_MODEL_CHAIN.filter(m => supported.has(m));
  present.length === APP_MODEL_CHAIN.length
    ? pass('All MODEL_CHAIN names exist', `${present.length}/${APP_MODEL_CHAIN.length}`)
    : warn('Some MODEL_CHAIN names missing from ListModels',
      `${present.length}/${APP_MODEL_CHAIN.length}: missing ${APP_MODEL_CHAIN.filter(m => !supported.has(m)).join(', ')}`);

  // Find the first chain entry that actually answers, and use it downstream.
  for (const model of APP_MODEL_CHAIN) {
    for (const { key } of live) {
      const r = await tryGenerate(key, model, { timeout: 20000 });
      if (r.ok) {
        pass('Model responds', `${model} answered`);
        return { model, key };
      }
      if (isTransientApiError(r.error)) continue; // try the next key
    }
    log(c.y(`  ⚠️  ${model} did not answer`));
  }
  fail('Any model responds', 'the whole MODEL_CHAIN failed against every live key');
  return null;
}

/* ── 6. End-to-end AI generation ──────────────────────────────── */

/** Downloads a chapter's textbook PDF as a Gemini inline part. */
async function pdfPartFor(grade, subject, chapterNumber) {
  try {
    const r = await fetchT(`${BASE}/curriculum/slos/${encodeURIComponent(grade)}/${subject}.json`, {}, 8000);
    if (!r.ok) return null;
    const data = await r.json();
    const ch = (data.chapters || []).find(c => c.chapter_number === chapterNumber);
    if (!ch?.pdf_url) return null;
    const gh = ch.pdf_url.match(/raw\.githubusercontent\.com\/(.+)/);
    if (!gh) return null;
    const res = await fetchT(`${BASE}/pdf-proxy/${gh[1]}`, {}, 30000);
    if (!res.ok) return null;
    return { inlineData: { mimeType: 'application/pdf', data: await blob2b64(await res.blob()) } };
  } catch {
    return null;
  }
}

/** Rotates live keys and returns the raw text of a successful generation. */
async function generateDirect(model, keys, body, timeout = 90000) {
  let lastError = 'no live key';
  for (const key of keys) {
    const r = await tryGenerate(key, model, { body, timeout });
    if (r.ok) {
      const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { ok: true, text };
      lastError = 'response had no text';
    } else {
      lastError = `HTTP ${r.status} ${r.error}`;
    }
  }
  return { ok: false, error: lastError };
}

/**
 * Exercises the app's own server-side proxy (/api/gemini). This is the code
 * path used when the browser has no VITE_ keys configured, and it silently
 * 401'd until server.ts started loading .env.local.
 */
async function testServerProxy(model) {
  hdr('Server Gemini proxy');
  try {
    const r = await fetchT(`${BASE}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, userPrompt: 'Reply with the single word OK' }),
    }, 60000);
    if (r.status === 401) {
      fail('/api/gemini proxy', '401 — server has no keys; is .env.local loaded by `npm run dev`?');
      return;
    }
    if (!r.ok) {
      fail('/api/gemini proxy', `HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
      return;
    }
    const data = await r.json();
    typeof data.text === 'string' && data.text.length > 0
      ? pass('/api/gemini proxy', `returned ${data.text.length} chars`)
      : fail('/api/gemini proxy', 'response contained no text');
  } catch (e) {
    fail('/api/gemini proxy', e.message);
  }
}

/* ── 7. AI generation: lesson plan + exam paper ───────────────── */

const genConfig = (schema) => ({ temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema });

const LESSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    objective: { type: 'STRING' },
    materials: { type: 'ARRAY', items: { type: 'STRING' } },
    activities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          duration: { type: 'INTEGER' },
          description: { type: 'STRING' },
          teacherActions: { type: 'STRING' },
          studentResponses: { type: 'STRING' },
        },
        required: ['name', 'duration', 'description', 'teacherActions', 'studentResponses'],
      },
    },
    homework: { type: 'STRING' },
  },
  required: ['title', 'objective', 'materials', 'activities', 'homework'],
};

const PAPER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    gradeLevel: { type: 'STRING' },
    subject: { type: 'STRING' },
    chapterName: { type: 'STRING' },
    totalMarks: { type: 'INTEGER' },
    durationMinutes: { type: 'INTEGER' },
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          instruction: { type: 'STRING' },
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                type: { type: 'STRING' },
                question: { type: 'STRING' },
                options: { type: 'ARRAY', items: { type: 'STRING' } },
                marks: { type: 'INTEGER' },
              },
              required: ['id', 'type', 'question', 'marks'],
            },
          },
        },
        required: ['title', 'instruction', 'questions'],
      },
    },
  },
  required: ['title', 'gradeLevel', 'subject', 'chapterName', 'totalMarks', 'durationMinutes', 'sections'],
};

async function testLessonPlan(model, keys) {
  const pdf = await pdfPartFor('Grade 9', 'physics', 1);
  if (!pdf) return skip('AI lesson plan', 'no textbook PDF available');
  const r = await generateDirect(model, keys, {
    contents: [{ parts: [pdf, { text: '40-minute 4As lesson plan. JSON with title, objective, materials[], activities[4]{name,duration,description,teacherActions,studentResponses}, homework. Durations must total exactly 40.' }] }],
    systemInstruction: { parts: [{ text: 'You are a lesson-plan generator. Output JSON only.' }] },
    generationConfig: genConfig(LESSON_SCHEMA),
  });
  if (!r.ok) return fail('AI lesson plan', r.error);
  let p;
  try { p = JSON.parse(r.text); } catch { return fail('AI lesson plan', 'response was not valid JSON'); }
  if (!p.title) return fail('AI lesson plan', 'missing title');
  const activities = p.activities || [];
  if (activities.length !== 4) return fail('AI lesson plan', `expected 4 activities, got ${activities.length}`);
  const minutes = activities.reduce((s, a) => s + (a.duration || 0), 0);
  if (minutes !== 40) return fail('AI lesson plan', `activities total ${minutes} min, expected 40`);
  if (!Array.isArray(p.materials) || p.materials.length === 0) return fail('AI lesson plan', 'materials missing');
  pass('AI lesson plan', `"${String(p.title).slice(0, 40)}" 4 activities / 40 min, textbook PDF used`);
}

async function testExamPaper(model, keys) {
  const pdf = await pdfPartFor('Grade 9', 'chemistry', 1);
  if (!pdf) return skip('AI exam paper', 'no textbook PDF available');
  const r = await generateDirect(model, keys, {
    contents: [{ parts: [pdf, { text: 'Class IX Chemistry paper: 5 MCQs + 3 short (2 marks) + 1 long (4 marks) = 15 marks total. JSON only.' }] }],
    systemInstruction: { parts: [{ text: 'You are an exam paper generator. Output JSON only.' }] },
    generationConfig: genConfig(PAPER_SCHEMA),
  });
  if (!r.ok) return fail('AI exam paper', r.error);
  let p;
  try { p = JSON.parse(r.text); } catch { return fail('AI exam paper', 'response was not valid JSON'); }
  const sections = p.sections || [];
  const questions = sections.reduce((s, sec) => s + (sec.questions?.length || 0), 0);
  const marks = sections.reduce((s, sec) => s + (sec.questions || []).reduce((t, q) => t + (q.marks || 0), 0), 0);
  if (!p.title || sections.length < 3) return fail('AI exam paper', `expected >=3 sections, got ${sections.length}`);
  if (questions !== 9) return fail('AI exam paper', `expected 9 questions, got ${questions}`);
  if (marks !== 15) return fail('AI exam paper', `expected 15 marks, got ${marks}`);
  if (p.totalMarks !== 15) return fail('AI exam paper', `totalMarks field is ${p.totalMarks}, expected 15`);
  pass('AI exam paper', `"${String(p.title).slice(0, 40)}" ${sections.length} sections / ${questions}q / ${marks} marks`);
}

/* ── Runner ──────────────────────────────────────────────────── */

async function main() {
  const t0 = Date.now();
  log(c.d(`PHSSJ Lesson Planner — integration suite\ntarget: ${BASE}`));

  const serverUp = await testServer();
  if (!serverUp) return finish(t0);

  await testSloData();
  await testPdfProxy();

  const { live } = await testApiKeys();
  const chain = live.length > 0 ? await testModelChain(live) : skip('Model chain', 'no usable API key');

  if (chain) {
    await testServerProxy(chain.model);
    hdr('AI generation');
    const keys = live.map(l => l.key);
    await Promise.all([testLessonPlan(chain.model, keys), testExamPaper(chain.model, keys)]);
  } else {
    hdr('AI generation');
    skip('AI lesson plan', 'no working model/key');
    skip('AI exam paper', 'no working model/key');
  }

  finish(t0);
}

function finish(t0) {
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(`\n${c.b(c.cy('══════════════════════════════════'))}`);
  log(`  ${c.g(`${passed} passed`)}` +
    `${failed ? c.r(`  ${failed} failed`) : ''}` +
    `${skipped ? c.y(`  ${skipped} skipped`) : ''}` +
    `${warned ? c.y(`  ${warned} warning(s)`) : ''}  ${c.d(`${secs}s`)}`);

  if (warnings.length) {
    log(c.y('\n  Warnings (not failures):'));
    for (const w of warnings) log(c.y(`    • ${w.t}: ${w.d}`));
  }
  if (failures.length) {
    log(c.r('\n  Failures:'));
    for (const f of failures) log(c.r(`    • ${f.t}: ${f.d}`));
  }
  log('');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Suite crashed:', err);
  process.exitCode = 2;
});
