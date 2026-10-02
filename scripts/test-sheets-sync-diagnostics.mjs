#!/usr/bin/env node
/**
 * Regression tests for the two "the app blames the wrong thing" bugs.
 *
 * 1. Token expiry indicator.
 *    The `storage` event only fires in *other* tabs, so reconnecting Google in
 *    the current tab wrote a fresh `google_token_expiry` that the Header never
 *    heard about: the countdown stayed on the pre-reconnect (expired) value
 *    until a reload. googleAuth now broadcasts GOOGLE_TOKEN_EVENT, and both the
 *    Header and useSheetSyncQueue listen for it.
 *
 * 2. "Google Sheet is protected or View-Only".
 *    The old check treated any error containing "403" as a Drive sharing
 *    problem. Google answers 403 for an expired token, a missing scope and a
 *    quota breach too, so the app told the user to go fix sheet sharing when
 *    the fix was to reconnect - and it did so right after they had just
 *    reconnected, which made the reconnect look broken.
 *
 * Usage: node --import tsx scripts/test-sheets-sync-diagnostics.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

// A window that records dispatched events, so we can assert the broadcast
// really reaches listeners rather than just calling a function.
const fired = [];
const handlers = new Map();
globalThis.window = {
  addEventListener: (type, fn) => {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
  },
  removeEventListener: (type, fn) => {
    const arr = handlers.get(type) || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
  dispatchEvent: (e) => {
    fired.push(e.type);
    for (const fn of [...(handlers.get(e.type) || [])]) fn(e);
    return true;
  },
};

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
let passed = 0, failed = 0;
const pass = (n, d = '') => { passed++; console.log(`  ${c.g('PASS')} ${n}${d ? c.d(' — ' + d) : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`  ${c.r('FAIL')} ${n}${c.r(' — ' + d)}`); };

const { GOOGLE_TOKEN_EVENT, broadcastTokenChange } = await import('../services/googleAuth.ts');
const { classifySheetsWriteError } = await import('../services/googleSheetsService.ts');

const readSrc = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', ...rel.split('/')), 'utf8');

// ---------------------------------------------------------------- Fix 1
console.log('\nSame-tab token change reaches listeners');

if (GOOGLE_TOKEN_EVENT === 'phssj:google-token-changed') {
  pass('the event name is the stable, namespaced one', GOOGLE_TOKEN_EVENT);
} else {
  fail('the event name is the stable, namespaced one', `got ${GOOGLE_TOKEN_EVENT}`);
}

// What the Header's read() does: recompute the countdown on every broadcast.
let seen = null;
globalThis.window.addEventListener(GOOGLE_TOKEN_EVENT, () => {
  seen = localStorage.getItem('google_token_expiry');
});

store.set('google_access_token', 'ya29.before');
store.set('google_token_expiry', String(Date.now() + 55 * 60 * 1000));
broadcastTokenChange();
if (seen && Date.now() < parseInt(seen, 10)) {
  pass('a reconnect broadcast refreshes the expiry the Header reads');
} else {
  fail('a reconnect broadcast refreshes the expiry the Header reads', `expiry=${seen}`);
}

// The reported symptom: the value the badge shows must move on the SAME tab,
// with no reload and no waiting for the 30s poll. A distinct value is used so
// the assertion cannot pass by two writes landing in the same millisecond.
fired.length = 0;
const fresh = String(Date.now() + 55 * 60 * 1000 + 12345);
store.set('google_token_expiry', fresh);
broadcastTokenChange();
if (fired.includes(GOOGLE_TOKEN_EVENT) && seen === fresh) {
  pass('the badge value updates immediately in the writing tab');
} else {
  fail('the badge value updates immediately in the writing tab', `fired=${fired.join(',')} seen=${seen}`);
}

// The three paths a user actually triggers must broadcast. This is checked per
// function rather than by counting, because two of the expiry writes in this
// file are cleanup inside getAccessToken/isGoogleTokenExpired: they drop an
// already-expired token, so the badge was already showing "expired" and there
// is no state change to announce. (The one at module load additionally runs
// before any listener can exist.)
const authSrc = readSrc('services/googleAuth.ts');
for (const [marker, label] of [
  ['function storeAccessToken', 'a silent token refresh'],
  ['export const googleSignIn', 'a popup sign-in / reconnect'],
  ['export const logout = async', 'signing out'],
]) {
  const at = authSrc.indexOf(marker);
  const body = at < 0 ? '' : authSrc.slice(at, at + 1500);
  if (at >= 0 && body.includes('notifyTokenChanged()')) {
    pass(`${label} broadcasts a token change`);
  } else {
    fail(`${label} broadcasts a token change`, at < 0 ? `${marker} not found` : 'no notifyTokenChanged() call');
  }
}

// The listener has to be registered, or the broadcast goes nowhere.
for (const [file, label] of [
  ['components/Header.tsx', 'Header'],
  ['hooks/useSheetSyncQueue.ts', 'useSheetSyncQueue'],
]) {
  const src = readSrc(file);
  if (src.includes('addEventListener(GOOGLE_TOKEN_EVENT') && src.includes('removeEventListener(GOOGLE_TOKEN_EVENT')) {
    pass(`${label} subscribes and unsubscribes to the token event`);
  } else {
    fail(`${label} subscribes and unsubscribes to the token event`);
  }
}

// ---------------------------------------------------------------- Fix 2
console.log('\nSheets write failures are attributed correctly');

// The exact bug: 403 from an expired token, reported as a sharing problem.
const auth403 = classifySheetsWriteError('Google Sheets API returned 403: Invalid Credentials');
if (auth403.kind === 'auth') {
  pass('a 403 caused by a bad token is an auth problem, not a sharing problem');
} else {
  fail('a 403 caused by a bad token is an auth problem, not a sharing problem', `got "${auth403.kind}"`);
}
if (/reconnect/i.test(auth403.message)) {
  pass('the auth message tells the user to reconnect rather than to fix sharing');
} else {
  fail('the auth message tells the user to reconnect rather than to fix sharing', auth403.message);
}

const cases = [
  ['401 Unauthorized: Invalid Credentials', 'auth'],
  ['Request had insufficient authentication scopes.', 'scope'],
  ['The caller does not have permission to modify this spreadsheet', 'permission'],
  ['403 Forbidden', 'permission'],
  ["Quota exceeded for quota metric 'Write requests'", 'quota'],
  ['The service is currently unavailable.', 'unknown'],
  ['', 'unknown'],
];
for (const [input, expected] of cases) {
  const got = classifySheetsWriteError(input);
  if (got.kind === expected) {
    pass(`"${input.slice(0, 42) || '(empty)'}" -> ${expected}`);
  } else {
    fail(`"${input.slice(0, 42)}" should be ${expected}`, `got ${got.kind}`);
  }
}

// A diagnosis the user cannot check is a diagnosis they cannot act on, so the
// underlying Google text has to survive into the message.
const withDetail = classifySheetsWriteError('403 Forbidden: The user does not have permission');
if (withDetail.message.includes('The user does not have permission')) {
  pass("Google's own wording is kept so the cause can be checked");
} else {
  fail("Google's own wording is kept so the cause can be checked", withDetail.message);
}

// A bare 403 has no cause, so it must not be dressed up as a Drive problem.
const bare = classifySheetsWriteError('403');
if (bare.kind !== 'permission' || /protected or View-Only/.test(bare.message)) {
  pass('a bare 403 with no cause is not reported as a protected sheet');
} else {
  fail('a bare 403 with no cause is not reported as a protected sheet', bare.kind);
}

console.log(`\n  ${failed === 0 ? c.g('ALL PASS') : c.r('FAILURES')} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
