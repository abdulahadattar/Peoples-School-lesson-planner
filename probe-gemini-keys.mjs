#!/usr/bin/env node
// probe-gemini-keys.mjs
// Tests every Gemini API key found in the key file against Google's API and
// reports which work and which are dead. Nothing is sent anywhere except
// generativelanguage.googleapis.com.
//
//   node probe-gemini-keys.mjs            # test every key, print results
//   node probe-gemini-keys.mjs --clean    # rewrite the file keeping only working keys
//
// File defaults to .env.local; pass a different path as an argument if needed.

import fs from 'node:fs';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_RE = /AIza[0-9A-Za-z\-_]{35}/g;

const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const ARG_FILE = args.find((a) => !a.startsWith('--'));
const FILE = ARG_FILE || '.env.local';

function mask(k) {
  return `${k.slice(0, 10)}...${k.slice(-4)}`;
}

function readKeys(file) {
  const text = fs.readFileSync(file, 'utf-8');
  return [...new Set(text.match(KEY_RE) || [])];
}

async function listModels(key) {
  const res = await fetch(`${API_ROOT}/models?key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.error?.message || `HTTP ${res.status}` };
  }
  const models = (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
  return { ok: true, models };
}

async function generate(key, model) {
  const res = await fetch(`${API_ROOT}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with the single word OK' }] }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: data?.error?.message || `HTTP ${res.status}` };
  }
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('') || '';
  return { ok: true, text: text.trim() };
}

// Order models so the newest usable flash model is tried first. A listed model
// can still 404 ("no longer available to new users"), so we try several.
function rankModels(models) {
  const score = (m) => {
    const ver = parseFloat((m.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
    const flash = m.includes('flash') ? 1000 : 0;
    const lite = m.includes('lite') ? -10 : 0;
    const preview = m.includes('preview') || m.includes('exp') ? -5 : 0;
    return flash + ver * 10 + lite + preview;
  };
  return [...models].sort((a, b) => score(b) - score(a));
}

(async () => {
  if (!fs.existsSync(FILE)) {
    console.error(`No key file found at ${FILE}`);
    process.exit(1);
  }
  const keys = readKeys(FILE);
  if (keys.length === 0) {
    console.error(`No AIza... keys found in ${FILE}. Paste your keys and re-run.`);
    process.exit(1);
  }

  console.log(`Testing ${keys.length} key(s) from ${FILE}\n`);

  const keep = [];
  for (const key of keys) {
    const lm = await listModels(key);
    if (!lm.ok) {
      console.log(`[DEAD]  ${mask(key)}  ${lm.status} ${lm.error}`);
      continue;
    }

    const candidates = rankModels(lm.models);
    let result = null;
    let usedModel = null;
    for (const model of candidates.slice(0, 6)) {
      const r = await generate(key, model);
      if (r.ok) {
        result = r;
        usedModel = model;
        break;
      }
      result = r;
      if (r.status !== 404) break; // quota / auth / etc — another model won't help
    }

    if (result && result.ok) {
      console.log(`[WORKS] ${mask(key)}  ${lm.models.length} models, ${usedModel} replied "${result.text.slice(0, 24)}"`);
      keep.push(key);
    } else if (result && result.status === 404) {
      console.log(`[VALID] ${mask(key)}  key accepted, but no generateContent model responded`);
      keep.push(key);
    } else {
      console.log(`[DEAD]  ${mask(key)}  ${result ? result.status : '?'} ${result ? result.error : 'no model'}`);
    }
  }

  console.log(`\n${keep.length} of ${keys.length} key(s) working.`);

  if (CLEAN) {
    fs.writeFileSync(FILE, keep.join('\n') + (keep.length ? '\n' : ''), 'utf-8');
    console.log(`Rewrote ${FILE} with only the ${keep.length} working key(s).`);
  }
})();
