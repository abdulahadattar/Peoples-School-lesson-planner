#!/usr/bin/env node
/**
 * Google token freshness regression test.
 *
 * getAccessToken() ended with `return stored || null`, so the expiry check above
 * it had no effect: once the 55-minute window passed, the EXPIRED token was still
 * returned and sent to the Sheets API, which answered 401. The sync swallowed
 * that, so the sheet silently stopped receiving attendance while the app
 * reported success.
 *
 * Usage: node --import tsx scripts/test-token-freshness.mjs
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
let passed = 0, failed = 0;
const pass = (n, d = '') => { passed++; console.log(`  ${c.g('PASS')} ${n}${d ? c.d(' — ' + d) : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`  ${c.r('FAIL')} ${n}${c.r(' — ' + d)}`); };

const HOUR = 60 * 60 * 1000;
const { getAccessToken, isGoogleTokenExpired } = await import('../services/googleAuth.ts');

console.log('\nFresh token is returned');
store.set('google_access_token', 'ya29.fresh');
store.set('google_token_expiry', String(Date.now() + 30 * 60 * 1000));
let tok = await getAccessToken();
if (tok === 'ya29.fresh') pass('a valid token is returned');
else fail('a valid token is returned', `got ${tok}`);

console.log('\nExpired token is NOT returned');
// Move past the 55-minute window the app records at sign-in.
store.set('google_token_expiry', String(Date.now() - 1000));
tok = await getAccessToken();
if (tok === null) pass('an expired token is rejected instead of sent', 'returns null');
else fail('an expired token is rejected instead of sent', `leaked "${tok}"`);

console.log('\nExpired token is cleared, not left to be retried');
if (!store.has('google_access_token') && !store.has('google_token_expiry')) {
  pass('expired token and expiry are removed from storage');
} else {
  fail('expired token and expiry are removed from storage', `keys: ${[...store.keys()].join(',')}`);
}

console.log('\nMissing expiry is treated as expired');
store.set('google_access_token', 'ya29.no-expiry');
store.delete('google_token_expiry');
tok = await getAccessToken();
if (tok === null) pass('a token with no expiry is not trusted', 'returns null');
else fail('a token with no expiry is not trusted', `leaked "${tok}"`);

console.log('\nExpiry helper agrees');
store.set('google_access_token', 'ya29.x');
store.set('google_token_expiry', String(Date.now() - 1));
if (isGoogleTokenExpired() === true) pass('isGoogleTokenExpired reports expired');
else fail('isGoogleTokenExpired reports expired', 'reported valid');
store.set('google_token_expiry', String(Date.now() + HOUR));
if (isGoogleTokenExpired() === false) pass('isGoogleTokenExpired reports valid');
else fail('isGoogleTokenExpired reports valid', 'reported expired');

console.log('\nNo token at all');
store.clear();
tok = await getAccessToken();
if (tok === null) pass('signed-out state returns null');
else fail('signed-out state returns null', `got ${tok}`);

console.log(`\n${failed === 0 ? c.g('ALL PASS') : c.r('FAILURES')} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
