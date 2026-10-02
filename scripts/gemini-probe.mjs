#!/usr/bin/env node
/**
 * Probes the Gemini API to answer two questions with evidence:
 *   1. Which API keys in this project are actually usable?
 *   2. Do the model names hardcoded by the app (MODEL_CHAIN) really exist,
 *      and do they answer a generateContent call?
 *
 * Nothing is modified — this is a read-only diagnostic used by `npm test`.
 *
 *   node scripts/gemini-probe.mjs
 *
 * Exit code 0 when a usable key exists AND at least one model in the chain
 * answers (which is what the app actually requires — withKeyRotation returns
 * on the first model that works). Set STRICT_MODELS=1 to require every model.
 */
import path from 'path';
import {
  APP_MODEL_CHAIN, collectAllKeys, isDeadKeyMessage, isTransientApiError, listModels, tryGenerate,
} from './lib/gemini-keys.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

async function main() {
  const keys = collectAllKeys(ROOT);
  const report = { keyCount: keys.length, live: [], dead: [], supported: [], chain: {}, aliveKey: null };

  for (const key of keys) {
    const out = await listModels(key);
    if (out.ok) {
      report.live.push({ key: `${key.slice(0, 10)}...`, modelCount: out.models.length });
      if (!report.aliveKey) {
        report.aliveKey = key;
        report.supported = out.models;
      }
    } else {
      report.dead.push({
        key: `${key.slice(0, 10)}...`,
        status: out.status,
        error: out.error,
        permanent: isDeadKeyMessage(out.error),
      });
    }
  }

  if (report.aliveKey) {
    for (const model of APP_MODEL_CHAIN) {
      report.chain[model] = await tryGenerate(report.aliveKey, model);
    }
  }

  console.log(`\nAPI keys discovered: ${keys.length}  (usable ${report.live.length} / dead ${report.dead.length})`);
  report.dead.slice(0, 3).forEach(d =>
    console.log(`    dead ${d.key} HTTP ${d.status} ${d.error}${d.permanent ? '  [permanent]' : ''}`)
  );

  if (!report.aliveKey) {
    console.log('\n⚠️  No usable Gemini API key found — AI generation cannot be tested.\n');
    process.exitCode = 1;
    return;
  }

  console.log(`\nSupported generateContent models on this account: ${report.supported.length}`);
  const named = APP_MODEL_CHAIN.filter(m => report.supported.includes(m));
  console.log(`Model names present in ListModels: ${named.length}/${APP_MODEL_CHAIN.length} (${named.join(', ') || 'none'})`);

  console.log('\nApp MODEL_CHAIN verification (live generateContent call):');
  let working = 0;
  for (const model of APP_MODEL_CHAIN) {
    const r = report.chain[model];
    if (r.ok) {
      working++;
      const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      console.log(`  ✅ ${model} — responded "${String(text).trim().slice(0, 30)}"`);
    } else if (isTransientApiError(r.error)) {
      console.log(`  ⚠️  ${model} — temporarily unavailable: ${r.error}`);
    } else {
      console.log(`  ❌ ${model} — HTTP ${r.status} ${r.error}`);
    }
  }

  // The app's withKeyRotation() returns on the first model that answers, so
  // the pool is healthy as long as ONE model works. Failing on a dead last-resort
  // fallback would be wrong; a transient 503 is not a code defect either.
  const strict = process.env.STRICT_MODELS === '1';
  const chainOk = strict ? working === APP_MODEL_CHAIN.length : working > 0;
  if (!chainOk) {
    console.log('\n⚠️  No model in MODEL_CHAIN answered — AI generation cannot work.\n');
  } else if (working < APP_MODEL_CHAIN.length) {
    console.log(`\n   ${working}/${APP_MODEL_CHAIN.length} models answer; the app falls back automatically.`);
    console.log('   (Set STRICT_MODELS=1 to make unused fallbacks a hard failure.)\n');
  } else {
    console.log('');
  }
  process.exitCode = chainOk ? 0 : 1;
}

main().catch(err => { console.error('Probe crashed:', err); process.exit(2); });
