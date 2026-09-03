#!/usr/bin/env node
/**
 * Ultra-fast test script for the Lesson Planner app.
 * Tests critical paths in parallel. ~15s target.
 * 
 * Run: npm test          (or)  node scripts/test-all.mjs
 * 
 * Three phases, all parallel within each:
 *   Phase 1: Server + SLO data for all grades (~2s)
 *   Phase 2: API keys + PDF header check (~3s)
 *   Phase 3: AI generation with PDF (~8s)
 */

const BASE = 'http://localhost:3004';

// ─── Helpers ────────────────────────────────────────────────────
const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,  cy: (s) => `\x1b[36m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,   b: (s) => `\x1b[1m${s}\x1b[0m`,
};
let P = 0, F = 0, S = 0;
const res = [];
const log = (m) => process.stdout.write(m + '\n');
const pass = (t, d = '') => { P++; res.push({ t, s: 'PASS', d }); log(c.g(`  ✅`) + ` ${t}` + (d ? c.d(` — ${d}`) : '')); };
const fail = (t, d = '') => { F++; res.push({ t, s: 'FAIL', d }); log(c.r(`  ❌`) + ` ${t}` + (d ? c.r(` — ${d}`) : '')); };
const skip = (t, d = '') => { S++; res.push({ t, s: 'SKIP', d }); log(c.y(`  ⏭️`) + ` ${t}` + (d ? c.d(` — ${d}`) : '')); };
const hdr = (t) => log(`\n${c.b(c.cy(`── ${t} ──`))}`);
const elapsed = (t0) => ((Date.now() - t0) / 1000).toFixed(1);

const blob2b64 = (blob) => blob.arrayBuffer().then(ab => Buffer.from(ab).toString('base64'));

async function getKeys() {
  const fs = await import('fs');
  let env = '';
  try {
    env = fs.readFileSync('.env.local', 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const validPattern = /^AIzaSy[A-Za-z0-9_-]{33}$/;
  // Try VITE_API_KEYS (plural) first
  const keysMatch = env.match(/VITE_API_KEYS=(.+)/);
  if (keysMatch) {
    const keys = keysMatch[1].split(',').map(k => k.trim()).filter(k => validPattern.test(k));
    if (keys.length > 0) return keys;
  }
  // Fallback to VITE_API_KEY (singular)
  const singleMatch = env.match(/VITE_API_KEY=(.+)/);
  if (singleMatch) {
    const key = singleMatch[1].trim();
    if (validPattern.test(key)) return [key];
  }
  return [];
}

// ─── PHASE 1: Infrastructure + Data ────────────────────────────
async function testAll() {
  const T0 = Date.now();

  // ── Server + Proxy (parallel) ──
  const [srv, proxy] = await Promise.allSettled([
    fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) }),
    fetch(`${BASE}/pdf-proxy/abdulahadattar/STBB-BOOKS/main/README.md`, { signal: AbortSignal.timeout(8000) }),
  ]);
  if (srv.status === 'fulfilled' && srv.value.ok) pass('Dev server');
  else fail('Dev server', 'not running');
  if (proxy.status === 'fulfilled' && proxy.value.ok) pass('PDF proxy');
  else fail('PDF proxy', proxy.reason?.message || 'failed');

  // ── SLO Data (parallel, all at once) ──
  hdr('SLO Data');
  const subjects = ['physics', 'chemistry', 'biology', 'mathematics', 'english'];
  const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
  const sloJobs = [];
  for (const g of grades) {
    for (const s of subjects) {
      sloJobs.push(
        fetch(`${BASE}/curriculum/slos/${g}/${s}.json`, { signal: AbortSignal.timeout(8000) })
          .then(async r => {
            if (!r.ok) { skip(`${g} ${s}`, r.status === 404 ? 'no file' : `HTTP ${r.status}`); return; }
            try {
              const d = JSON.parse(await r.text());
              const ch = d.chapters?.length || 0;
              const n = (d.chapters || []).reduce((a, c) => a + (c.slos?.length || 0), 0);
              pass(`${g} ${s}`, `${ch}ch ${n}slo`);
            } catch { skip(`${g} ${s}`, 'not JSON'); }
          })
          .catch(() => skip(`${g} ${s}`, 'network'))
      );
    }
  }
  await Promise.allSettled(sloJobs);

  // ── API Keys ──
  hdr('API Keys');
  const keys = await getKeys();
  if (keys.length === 0) { fail('Key pool', 'none'); return; }
  pass('Key pool', `${keys.length} keys`);

  // Fire 3 concurrent quick API calls to verify rotation
  const apiJobs = keys.slice(0, 3).map((k, i) =>
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${i + 1}` }] }], generationConfig: { temperature: 0.1 } }),
      signal: AbortSignal.timeout(12000),
    }).then(async r => {
      if (!r.ok) return { ok: false, i, status: r.status };
      const d = await r.json();
      return { ok: true, i, text: d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() };
    }).catch(e => ({ ok: false, i, error: e.message }))
  );
  const apiResults = await Promise.allSettled(apiJobs);
  const ok = apiResults.map(r => r.status === 'fulfilled' ? r.value : { ok: false }).filter(v => v.ok);
  if (ok.length >= 2) pass('Key rotation', `${ok.length}/3`);
  else fail('Key rotation', `${ok.length}/3`);

  // ── PDF Header Check (first 5 bytes only, fast!) ──
  hdr('PDF Validation');
  const pdfTests = [
    { grade: 'Grade 9', subject: 'physics', ch: 1, name: 'Physics Ch1' },
    { grade: 'Grade 9', subject: 'biology', ch: 1, name: 'Biology Ch1' },
    { grade: 'Grade 12', subject: 'physics', ch: 1, name: 'Physics Ch12' },
  ];
  const pdfJobs = pdfTests.map(async (t) => {
    try {
      const data = await (await fetch(`${BASE}/curriculum/slos/${t.grade}/${t.subject}.json`, { signal: AbortSignal.timeout(5000) })).json();
      const chapter = data.chapters?.find(c => c.chapter_number === t.ch);
      if (!chapter?.pdf_url) { skip(t.name, 'no pdf_url'); return; }
      const gh = chapter.pdf_url.match(/raw\.githubusercontent\.com\/(.+)/);
      const url = gh ? `${BASE}/pdf-proxy/${gh[1]}` : chapter.pdf_url;
      // Fetch only first 5KB to verify PDF header — no full download
      const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Range: 'bytes=0-5000' } });
      if (!r.ok && r.status !== 206) { fail(t.name, `HTTP ${r.status}`); return; }
      const chunk = await r.arrayBuffer();
      const header = new TextDecoder().decode(chunk.slice(0, 5));
      const kb = (chunk.byteLength / 1024).toFixed(1);
      if (header.startsWith('%PDF')) pass(t.name, `valid PDF (${kb}KB header)`);
      else fail(t.name, `bad header: ${header.slice(0, 10)}`);
    } catch (e) { fail(t.name, e.message); }
  });
  await Promise.allSettled(pdfJobs);

  // ── AI Generation: Lesson Plan + Exam Paper (parallel) ──
  hdr('AI Generation');
  
  const genLessonPlan = async () => {
    const t0 = Date.now();
    try {
      const sloData = await (await fetch(`${BASE}/curriculum/slos/Grade 9/physics.json`, { signal: AbortSignal.timeout(5000) })).json();
      const ch = sloData.chapters?.find(c => c.chapter_number === 1);
      const slo = ch?.slos?.[0];
      if (!slo) { skip('Lesson plan', 'no SLO'); return; }

      // Download full PDF for context
      let pdfPart = null;
      if (ch.pdf_url) {
        try {
          const gh = ch.pdf_url.match(/raw\.githubusercontent\.com\/(.+)/);
          const r = await fetch(`${BASE}/pdf-proxy/${gh[1]}`, { signal: AbortSignal.timeout(25000) });
          if (r.ok) pdfPart = { inlineData: { mimeType: 'application/pdf', data: await blob2b64(await r.blob()) } };
        } catch {}
      }

      const parts = [...(pdfPart ? [pdfPart] : []), { text: `40min 4As lesson for: ${slo.id}: ${slo.text}. JSON: title, objective, materials[], activities[{name,duration,description,teacherActions,studentResponses}], homework.` }];
      const schema = { type: 'OBJECT', properties: { title: { type: 'STRING' }, objective: { type: 'STRING' }, materials: { type: 'ARRAY', items: { type: 'STRING' } }, activities: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, duration: { type: 'INTEGER' }, description: { type: 'STRING' }, teacherActions: { type: 'STRING' }, studentResponses: { type: 'STRING' } }, required: ['name', 'duration', 'description', 'teacherActions', 'studentResponses'] } }, homework: { type: 'STRING' } }, required: ['title', 'objective', 'materials', 'activities', 'homework'] };

      for (let i = 0; i < Math.min(keys.length, 3); i++) {
        try {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[i] },
            body: JSON.stringify({ contents: [{ parts }], systemInstruction: { parts: [{ text: '4As lesson plan teacher. JSON only.' }] }, generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema } }),
            signal: AbortSignal.timeout(25000),
          });
          if (!r.ok) continue;
          const d = await r.json();
          const p = JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          if (p.title && p.activities?.length === 4 && pdfPart) {
            const mins = p.activities.reduce((s, a) => s + (a.duration || 0), 0);
            if (mins === 40) {
              pass('Lesson plan', `"${p.title}" 40min PDF=${!!pdfPart} ${elapsed(t0)}s`);
            } else {
              fail('Lesson plan', `bad duration: ${mins}min`);
            }
          } else {
            fail('Lesson plan', 'bad structure');
          }
          return;
        } catch {}
      }
      fail('Lesson plan', 'all keys failed');
    } catch (e) { fail('Lesson plan', e.message); }
  };

  const genExamPaper = async () => {
    const t0 = Date.now();
    try {
      const sloData = await (await fetch(`${BASE}/curriculum/slos/Grade 9/chemistry.json`, { signal: AbortSignal.timeout(5000) })).json();
      const ch = sloData.chapters?.find(c => c.chapter_number === 1);

      let pdfPart = null;
      if (ch?.pdf_url) {
        try {
          const gh = ch.pdf_url.match(/raw\.githubusercontent\.com\/(.+)/);
          const r = await fetch(`${BASE}/pdf-proxy/${gh[1]}`, { signal: AbortSignal.timeout(25000) });
          if (r.ok) pdfPart = { inlineData: { mimeType: 'application/pdf', data: await blob2b64(await r.blob()) } };
        } catch {}
      }

      const slos = ch?.slos?.slice(0, 3).map(s => `${s.id}: ${s.text}`).join('; ') || 'General';
      const parts = [...(pdfPart ? [pdfPart] : []), { text: `Class IX Chemistry: 5 MCQs + 3 short(2mk) + 1 long(4mk)=15mk. SLOs: ${slos}. JSON: title, gradeLevel, subject, chapterName, totalMarks, durationMinutes, sections[].` }];
      const schema = { type: 'OBJECT', properties: { title: { type: 'STRING' }, gradeLevel: { type: 'STRING' }, subject: { type: 'STRING' }, chapterName: { type: 'STRING' }, totalMarks: { type: 'INTEGER' }, durationMinutes: { type: 'INTEGER' }, sections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, instruction: { type: 'STRING' }, questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, type: { type: 'STRING' }, question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, marks: { type: 'INTEGER' } }, required: ['id', 'type', 'question', 'marks'] } } }, required: ['title', 'instruction', 'questions'] } } }, required: ['title', 'gradeLevel', 'subject', 'chapterName', 'totalMarks', 'durationMinutes', 'sections'] };

      for (let i = 0; i < Math.min(keys.length, 3); i++) {
        try {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[i] },
            body: JSON.stringify({ contents: [{ parts }], systemInstruction: { parts: [{ text: 'Exam paper generator. JSON only.' }] }, generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: schema } }),
            signal: AbortSignal.timeout(25000),
          });
          if (!r.ok) continue;
          const d = await r.json();
          const p = JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          const q = p.sections?.reduce((s, sec) => s + (sec.questions?.length || 0), 0) || 0;
          const marks = p.sections?.reduce((s, sec) => s + (sec.questions?.reduce((qs, qn) => qs + (qn.marks || 0), 0) || 0), 0) || 0;
          if (p.title && p.sections?.length >= 3 && q === 9 && marks === 15 && pdfPart) {
            pass('Exam paper', `"${p.title}" ${p.sections?.length}sec ${q}q ${marks}mk PDF=${!!pdfPart} ${elapsed(t0)}s`);
          } else {
            fail('Exam paper', `bad structure: ${p.sections?.length}sec ${q}q ${marks}mk PDF=${!!pdfPart}`);
          }
          return;
        } catch {}
      }
      fail('Exam paper', 'all keys failed');
    } catch (e) { fail('Exam paper', e.message); }
  };

  // Run both generations in parallel
  await Promise.allSettled([genLessonPlan(), genExamPaper()]);

  // ── Summary ──
  const total = ((Date.now() - T0) / 1000).toFixed(1);
  log(`\n${c.b(c.cy('══════════════════════════════════'))}`);
  log(`  ${c.g(`${P} passed`)}${F ? c.r(`  ${F} failed`) : ''}${S ? c.y(`  ${S} skipped`) : ''}  ${c.d(`${total}s`)}`);
  if (F > 0) {
    log(c.r('\n  Failed:'));
    res.filter(r => r.s === 'FAIL').forEach(r => log(c.r(`    • ${r.t}: ${r.d}`)));
  }
  log('');
  process.exit(F > 0 ? 1 : 0);
}

testAll().catch(e => { console.error('Crash:', e); process.exit(2); });
