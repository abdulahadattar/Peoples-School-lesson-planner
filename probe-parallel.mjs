#!/usr/bin/env node
// probe-parallel.mjs — test every key against every model IN PARALLEL and
// report which keys are alive, which are rate-limited, and which are dead.
//
//   node probe-parallel.mjs            # test, print matrix
//   node probe-parallel.mjs --clean    # rewrite key file keeping only alive keys
//
// Statuses: OK | LIMIT | NO(404) | DEAD | TIMEOUT | ERR
//   OK      generateContent succeeded
//   LIMIT   429 / quota exhausted (key is fine, just throttled)
//   NO      model not available to this key (404)
//   DEAD    key invalid / leaked / suspended (400/403)
//   TIMEOUT no answer in time

import fs from 'node:fs';

const FILE = (process.argv.slice(2).find((a) => !a.startsWith('--'))) || '.env.local';
const CLEAN = process.argv.includes('--clean');
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_RE = /(?:AIza[0-9A-Za-z\-_]{35}|AQ\.[0-9A-Za-z\-_]{30,})/g;
const CONCURRENCY = 10;
const TIMEOUT = 20000;

const MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-4-argon',
  'gemma-4-26b-a4b-it',
];

const SHORT = (m) =>
  m
    .replace('gemini-', 'g')
    .replace('-flash-lite', 'fl')
    .replace('-flash-preview', 'f')
    .replace('-flash', 'f')
    .replace('-argon', 'arg')
    .replace('gemma-4-', 'ge');

const mask = (k) => `${k.slice(0, 10)}...${k.slice(-4)}`;

function readKeys(file) {
  return [...new Set(fs.readFileSync(file, 'utf-8').match(KEY_RE) || [])];
}

async function generate(key, model) {
  try {
    const res = await fetch(`${API_ROOT}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with the single word OK' }] }],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return 'OK';
    const msg = String(data?.error?.message || '');
    if (/reported as leaked/i.test(msg)) return 'LEAKED';
    if (res.status === 429 || /quota|rate limit|resource exhausted/i.test(msg)) return 'LIMIT';
    if (res.status === 404) return 'NO';
    if (res.status === 400 || res.status === 403) return 'DEAD';
    return `ERR${res.status}`;
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'TIMEOUT';
    return 'ERR';
  }
}

async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let i = 0;
  const run = async () => {
    while (i < tasks.length) {
      const idx = i++;
      out[idx] = await tasks[idx]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, run));
  return out;
}

(async () => {
  const keys = readKeys(FILE);
  if (!keys.length) {
    console.error(`No keys in ${FILE}`);
    process.exit(1);
  }
  console.log(`Testing ${keys.length} key(s) x ${MODELS.length} models in parallel (concurrency ${CONCURRENCY})\n`);
  console.log(`Models: ${MODELS.map(SHORT).join('  ')}\n`);

  const tasks = [];
  for (let k = 0; k < keys.length; k++) {
    for (let m = 0; m < MODELS.length; m++) {
      tasks.push(async () => ({ k, m, status: await generate(keys[k], MODELS[m]) }));
    }
  }
  const results = await pool(tasks, CONCURRENCY);

  const byKey = keys.map(() => ({}));
  for (const r of results) byKey[r.k][r.m] = r.status;

  const alive = [];
  for (let k = 0; k < keys.length; k++) {
    const row = byKey[k];
    const statuses = MODELS.map((_, m) => row[m]);
    const anyOK = statuses.includes('OK');
    const anyLeak = statuses.includes('LEAKED');
    // A key is usable ONLY if at least one model actually answered OK.
    // LIMIT alone (with everything else dead) is NOT usable.
    const usable = anyOK || (!anyLeak && statuses.some((s) => s === 'LIMIT') && !statuses.every((s) => s === 'LIMIT' || s === 'NO'));
    const verdict = anyOK ? 'USABLE' : anyLeak ? 'LEAKED' : usable ? 'LIMITED' : 'DEAD';
    if (usable) alive.push(keys[k]);

    const cells = MODELS.map((_, m) => `${SHORT(MODELS[m])}:${row[m]}`).join(' ');
    console.log(`[${verdict.padEnd(7)}] ${mask(keys[k])}  ${cells}`);
  }

  console.log(`\nUsable keys: ${alive.length}/${keys.length}`);
  const okModels = MODELS.filter((_, m) => keys.some((_, k) => byKey[k][m] === 'OK'));
  console.log(`Models that answered for at least one key: ${okModels.join(', ') || '(none)'}`);

  if (CLEAN) {
    const kept = keys.filter((_, k) => MODELS.some((_, m) => byKey[k][m] === 'OK'));
    fs.writeFileSync(FILE, kept.join('\n') + (kept.length ? '\n' : ''), 'utf-8');
    console.log(`\nRewrote ${FILE} with ${kept.length} usable key(s) (dropped leaked/dead keys).`);
  }
})();
