/**
 * Regression tests for services/extractedNameGuard.ts.
 *
 * These are the assertions that prove model prose cannot reach the student
 * register as a "name". The guard was written after a real pipeline run stored
 * 457 characters of the model's own reasoning in extractedData.studentNameUrdu.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/extractedNameGuard.test.ts
 */
import {
  MAX_NAME_LENGTH, MAX_NAME_WORDS,
  containsArabicScript, containsNadraLikeNumber,
  normalizeNameValue, describeNameRejection, sanitizeScriptNameField,
} from '../../services/extractedNameGuard';

let pass = 0, fail = 0;
const failures: string[] = [];
let suite = '';
const log = (m = '') => process.stdout.write(m + '\n');
const describe = (n: string) => { suite = n; log(`\n── ${n} ──`); };
function it(name: string, fn: () => void) {
  try { fn(); pass++; log(`  ✅ ${name}`); }
  catch (e: any) {
    fail++; failures.push(`[${suite}] ${name}\n        ${String(e.message).split('\n')[0]}`);
    log(`  ❌ ${name}\n       ${String(e.message).split('\n')[0]}`);
  }
}
const eq = (a: unknown, b: unknown, m = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}\n  expected: ${B}\n  actual:   ${A}`);
};

/* The exact 457-character value a real run wrote into studentNameUrdu. */
const REAL_BAD_URDU =
  'محمد یامین (اردو متن مترجم از سندھی بصورت متبادل پیش پیش نہیں ہوا, اصل سندھی متن استعمال کیا گیا ہے اور اسے انگریزی میں نقل کیا گیا ہے). نوٹ: اس فارم میں چار بچے درج ہیں، فہرست درج ذیل ہے: 1. محمد يامين (41506-0504781-7), 2. محمد يامين (41506-0504782-3), 3. طهيره (41506-0716443-4), 4. محمد ياسين (41506-0504789-1). تمام بچے ذیل کی فہرست میں شامل ہیں.';

describe('rejection — prose and identifiers must never become a name');

it('rejects the real 457-character reasoning paragraph', () => {
  eq(sanitizeScriptNameField(REAL_BAD_URDU), undefined);
});
it('rejects a value longer than the cap, accepts one exactly at it', () => {
  eq(sanitizeScriptNameField('A'.repeat(MAX_NAME_LENGTH + 1)), undefined);
  eq(sanitizeScriptNameField('A'.repeat(MAX_NAME_LENGTH)), 'A'.repeat(MAX_NAME_LENGTH));
});
it('rejects an embedded NADRA number in hyphenated or bare form', () => {
  eq(sanitizeScriptNameField('Ali 41506-0504781-7'), undefined);
  eq(sanitizeScriptNameField('CNIC 4120426490735'), undefined);
  eq(sanitizeScriptNameField('B-Form 4150605047817'), undefined);
});
it('rejects narration markers', () => {
  for (const v of ['Note: the name is not legible', 'translated from the original',
    'This document shows the name', 'unable to read', 'illegible']) {
    eq(sanitizeScriptNameField(v), undefined, JSON.stringify(v));
  }
});
it('rejects a value containing a line break', () => {
  eq(sanitizeScriptNameField('Ali\nHassan'), undefined);
  eq(sanitizeScriptNameField('Ali\tHassan'), undefined);
});
it('rejects more words than the cap and accepts exactly the cap', () => {
  eq(sanitizeScriptNameField('one two three four five six seven'), undefined);
  eq(sanitizeScriptNameField('one two three four five six'), 'one two three four five six');
});
it('rejects empty, blank and non-string input', () => {
  eq(sanitizeScriptNameField(''), undefined);
  eq(sanitizeScriptNameField('    '), undefined);
  eq(sanitizeScriptNameField(undefined), undefined);
  eq(sanitizeScriptNameField(null), undefined);
});
it('rejects an Arabic-script value that is mostly long Latin words', () => {
  eq(sanitizeScriptNameField('محمد the student name could not be determined from this form'), undefined);
});

describe('preservation — real names must survive untouched');

it('preserves Urdu and Sindhi names byte for byte', () => {
  const urdu = 'محمد یامین';
  eq(sanitizeScriptNameField(urdu), urdu);
  eq(sanitizeScriptNameField('اللہ بچايو عمراني'), 'اللہ بچايو عمراني');
  eq(sanitizeScriptNameField('محمد يامين'), 'محمد يامين');
});
it('preserves Latin names, including patronymics', () => {
  eq(sanitizeScriptNameField('Muhammad Yameen'), 'Muhammad Yameen');
  eq(sanitizeScriptNameField('Ghulam Muhammad Shahid Khan'), 'Ghulam Muhammad Shahid Khan');
  eq(sanitizeScriptNameField('Abdul Sattar'), 'Abdul Sattar');
});
it('never transliterates or strips Arabic script', () => {
  eq(containsArabicScript('محمد'), true);
  eq(containsArabicScript('﷽'), true, 'Arabic Presentation Forms count as script');
  eq(containsArabicScript('Muhammad'), false);
  eq(containsArabicScript('12345'), false);
});

describe('normalisation');

it('collapses internal whitespace and trims', () => {
  eq(normalizeNameValue('  Ali    Hassan  '), 'Ali Hassan');
  eq(sanitizeScriptNameField('Ali    Hassan'), 'Ali Hassan');
});
it('strips wrapping quotes, brackets and dangling punctuation', () => {
  eq(sanitizeScriptNameField('"Ali Hassan"'), 'Ali Hassan');
  eq(sanitizeScriptNameField('(Ali Hassan)'), 'Ali Hassan');
  eq(sanitizeScriptNameField('[Ali Hassan]'), 'Ali Hassan');
  eq(sanitizeScriptNameField('Ali Hassan.'), 'Ali Hassan');
  eq(sanitizeScriptNameField('Ali Hassan, '), 'Ali Hassan');
});

describe('helpers and diagnostics');

it('containsNadraLikeNumber finds identity numbers only', () => {
  eq(containsNadraLikeNumber('41506-0504781-7'), true);
  eq(containsNadraLikeNumber('4120426490735'), true);
  eq(containsNadraLikeNumber('Ali Hassan'), false);
  eq(containsNadraLikeNumber('Class IX-A'), false);
});
it('describeNameRejection gives a stable, actionable reason, or null for a real name', () => {
  const r = describeNameRejection(REAL_BAD_URDU);
  eq(typeof r, 'string');
  eq(String(r).includes('too long'), true, String(r));
  eq(describeNameRejection(REAL_BAD_URDU), r, 'reason must be stable across calls');
  eq(describeNameRejection('محمد یامین'), null);
  eq(describeNameRejection(''), 'empty');
  eq(String(describeNameRejection('Ali 41506-0504781-7')).includes('NADRA'), true);
});
it('onReject receives the reason and the raw text, and fires only on real rejections', () => {
  let got: { reason: string; raw: string } | null = null;
  sanitizeScriptNameField(REAL_BAD_URDU, (reason, raw) => { got = { reason, raw }; });
  eq(!!got, true, 'sink must be called on rejection');
  eq((got as any).raw, REAL_BAD_URDU, 'raw text preserved for the operator');
  let called = 0;
  sanitizeScriptNameField('محمد یامین', () => { called++; });
  eq(called, 0, 'sink must NOT fire for a valid name');
  let blank = 0;
  sanitizeScriptNameField('   ', () => { blank++; });
  eq(blank, 0, 'a blank value is not worth logging');
});
it('cap constants are the documented values', () => {
  eq(MAX_NAME_LENGTH, 60);
  eq(MAX_NAME_WORDS, 6);
});

log(`\n${'='.repeat(60)}`);
log(`  ${pass} passed${fail ? `, ${fail} failed` : ''}`);
if (failures.length) { log('\n  Failed:'); failures.forEach(f => log(`    • ${f}`)); }
log('');
process.exitCode = fail > 0 ? 1 : 0;

