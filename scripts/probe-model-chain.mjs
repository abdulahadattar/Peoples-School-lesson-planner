#!/usr/bin/env node
/**
 * Read-only diagnostic: test a list of Gemini model ids against the live API.
 *
 * Answers "does model X actually answer generateContent on our account, and how
 * fast?" — which is the only trustworthy source of truth for MODEL_CHAIN. Model
 * ids get retired by Google without notice, so any model list in the repo is a
 * claim that must be re-verified, never assumed.
 *
 *   node scripts/probe-model-chain.mjs                     # probe the app chain
 *   node scripts/probe-model-chain.mjs gemini-3.8-flash    # probe specific ids
 *
 * Nothing is modified. Exit code is always 0 unless no usable key is found.
 */
import { collectAllKeys, listModels, tryGenerate } from './lib/gemini-keys.mjs';

const DEFAULT_CANDIDATES = [
  // The chain currently hardcoded in services/geminiService.ts
  'gemini-3.5-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  // Newer ids advertised by the official model docs — probed so the chain can
  // be upgraded on evidence instead of guesswork.
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
];

const candidates = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_CANDIDATES;

async function findLiveKey() {
  for (const key of collectAllKeys(process.cwd())) {
    const out = await listModels(key);
    if (out.ok) return { key, supported: out.models };
  }
  return null;
}

async function main() {
  const live = await findLiveKey();
  if (!live) {
    console.error('No usable Gemini API key found. Configure VITE_API_KEY / GEMINI_API_KEY.');
    process.exitCode = 1;
    return;
  }

  console.log(`Probing ${candidates.length} model id(s); account advertises ${live.supported.length}.\n`);
  for (const model of candidates) {
    const started = Date.now();
    // A single slow or hanging model must not abort the whole sweep, so each
    // probe is isolated and a timeout is reported as data rather than a crash.
    let r;
    try {
      r = await tryGenerate(live.key, model, { timeout: 60000 });
    } catch (err) {
      r = { ok: false, status: 0, error: `probe error: ${err?.message || err}` };
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const advertised = live.supported.includes(model);
    if (r.ok) {
      const text = String(r.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
      console.log(`  OK    ${model.padEnd(26)} ${secs.padStart(5)}s  -> "${text.slice(0, 30)}"${advertised ? '' : '  (not in ListModels)'}`);
    } else {
      console.log(`  FAIL  ${model.padEnd(26)} ${secs.padStart(5)}s  HTTP ${r.status} ${String(r.error).slice(0, 100)}`);
    }
    // Flush as we go so a crashed/long run still leaves usable partial output.
    console.log('');
  }
}

main().catch(err => { console.error('Probe crashed:', err); process.exitCode = 2; });