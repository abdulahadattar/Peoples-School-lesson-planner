#!/usr/bin/env node
/**
 * Coverage-gap inventory: which exported functions have no test asserting them?
 *
 * This is a planning tool, not a test - it exits 0. It cross-references every
 * exported symbol in the pure-logic modules against every test file, so work
 * can be prioritised by what is actually unverified.
 *
 * Run: node scripts/test-coverage-gaps.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Pure-logic modules: safe to import under plain Node (no DOM, no Firebase).
const MODULES = [
  'services/mathDetection.ts',
  'services/latexSanitizer.ts',
  'services/jsonHelpers.ts',
  'services/paperLayout.ts',
  'services/curriculumHelpers.ts',
  'services/tierHelpers.ts',
  'services/teacherRoster.ts',
  'services/timetable.ts',
  'services/timetableConflictEngine.ts',
  'services/breakDuties.ts',
  'services/extractedNameGuard.ts',
  'services/sheetSyncQueue.ts',
  'services/localRecordsOverlay.ts',
  'services/timetableSheetLayout.ts',
  'services/timetableSheetConfig.ts',
  'utils/payloadOptimizer.ts',
];

const TEST_FILES = [
  'scripts/unit-tests.ts',
  'scripts/unit/localFirst.test.ts',
  'scripts/unit/extractedNameGuard.test.ts',
  'scripts/unit/teacherRoster.test.ts',
  'scripts/unit/availability.test.ts',
  'scripts/unit/selectors.test.ts',
  'scripts/unit/rendering.test.ts',
  'scripts/unit/timetableSync.test.ts',
  'scripts/unit/sheetPullSchedule.test.ts',
  'scripts/unit/recordBatch.test.ts',
  'scripts/unit/sharedEdits.test.ts',
  // compressImage needs a canvas, so it is asserted in the browser suite
  // rather than a Node unit suite. Including it here keeps the inventory honest.
  'scripts/e2e-smoke.mjs',
];

const testText = TEST_FILES
  .filter(f => fs.existsSync(path.join(ROOT, f)))
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n');

const rows = [];
let totalExports = 0;
let covered = 0;

for (const rel of MODULES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { rows.push({ mod: rel, sym: '(module missing)', covered: false }); continue; }
  const text = fs.readFileSync(full, 'utf8');
  const syms = new Set();
  for (const m of text.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) syms.add(m[1]);
  for (const m of text.matchAll(/^export\s+(?:const|let|class)\s+([A-Za-z0-9_]+)/gm)) syms.add(m[1]);

  for (const s of syms) {
    totalExports++;
    // A symbol counts as covered if a test file mentions it as a word.
    const re = new RegExp(`\\b${s.replace(/[$]/g, '\\$')}\\b`);
    const isCovered = re.test(testText);
    if (isCovered) covered++;
    rows.push({ mod: rel, sym: s, covered: isCovered });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\ncoverage-gap inventory\n${'='.repeat(78)}`);
console.log(`modules: ${MODULES.length}   exported symbols: ${totalExports}   mentioned in tests: ${covered}`);
console.log(`not yet asserted by a test: ${totalExports - covered}\n`);

const byMod = new Map();
for (const r of rows) {
  if (!byMod.has(r.mod)) byMod.set(r.mod, []);
  byMod.get(r.mod).push(r);
}

for (const [mod, list] of byMod) {
  const missing = list.filter(r => !r.covered).map(r => r.sym);
  const pct = Math.round(((list.length - missing.length) / list.length) * 100);
  console.log(`${pad(mod, 42)} ${pad(`${list.length - missing.length}/${list.length}`, 8)} ${pct}%`);
  if (missing.length) console.log(`   uncovered: ${missing.join(', ')}`);
}
console.log('');
