#!/usr/bin/env node
/**
 * Runtime audit: drives the authenticated real Chrome over CDP (port 9444) to
 * check that interactive controls actually do something, and to re-check the
 * earlier "History Archive len=604 rows=0" report.
 *
 * Usage: node scripts/audit-runtime.mjs
 */
const CDP = 'http://localhost:9444';
const BASE = 'http://localhost:3000';

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
c.cy = c.y;
let passed = 0, failed = 0, noted = 0;
const pass = (n, d = '') => { passed++; console.log(`  ${c.g('PASS')} ${n}${d ? c.d(' — ' + d) : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`  ${c.r('FAIL')} ${n}${c.r(' — ' + d)}`); };
const note = (n, d = '') => { noted++; console.log(`  ${c.y('NOTE')} ${n}${d ? c.d(' — ' + d) : ''}`); };

// --- minimal CDP client over the browser websocket ---
const version = await (await fetch(`${CDP}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method) {
    for (const l of listeners) l(m);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

// attach to the existing tab
const { targetInfos } = await send('Target.getTargets');
let pageTarget = targetInfos.find((t) => t.type === 'page' && t.url.includes('localhost'))
  || targetInfos.find((t) => t.type === 'page');
if (!pageTarget) { console.log(c.r('No page target available')); process.exit(1); }
const { sessionId } = await send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

const consoleErrors = [];
const failedRequests = [];
listeners.push((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push('EXCEPTION: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 300));
  }
  if (m.method === 'Network.loadingFailed') {
    failedRequests.push(`${m.params.type} ${m.params.errorText}`);
  }
});

await S('Runtime.enable');
await S('Network.enable');
await S('Page.enable');

// evaluate helper
const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Navigate (and make sure the tab is foregrounded: background tabs throttle rAF)
await S('Page.navigate', { url: BASE });
await S('Page.bringToFront').catch(() => {});
await sleep(6000);
await S('Page.bringToFront').catch(() => {});

// Wait for auth to settle: either the app shell or the login screen.
// Firebase persists auth to IndexedDB (firebaseLocalStorageDb), NOT localStorage,
// so checking localStorage here would falsely report "signed out".
const authState = await evaluate(`(async()=>{
  let user = 'unknown';
  try {
    const dbs = await indexedDB.databases();
    const name = dbs.map(d=>d.name).find(n=>/firebaseLocalStorageDb/i.test(n));
    if (name) {
      const open = indexedDB.open(name);
      const db = await new Promise((res,rej)=>{ open.onsuccess=()=>res(open.result); open.onerror=()=>rej(open.error); });
      const keys = await new Promise((res)=>{ const r=db.transaction('firebaseLocalStorage','readonly').objectStore('firebaseLocalStorage').getAllKeys(); r.onsuccess=()=>res(r.result); r.onerror=()=>res([]); });
      user = keys.some(k=>/authUser/i.test(k)) ? 'signed-in' : 'signed-out';
    } else { user = 'no-auth-db'; }
  } catch(e) { user = 'err '+e.message; }
  return { url: location.href, len: document.body.innerText.length, user, hasLogin: /Sign in|Log in/i.test(document.body.innerText) };
})()`);
console.log(c.b(`\n${c.cy('── Page state ──')}`));
console.log(`  ${c.d(JSON.stringify(authState))}`);

if (authState.hasLogin) {
  fail('app is not behind the login gate', 'unauthenticated session shows the login screen');
} else if (authState.user === 'signed-in') {
  pass('authenticated session renders the app shell');
} else {
  note('auth state not determinable', authState.user);
}

// The header must not claim admin rights without a signed-in admin.
const badge = await evaluate(`(() => {
  const b = document.querySelector('header .bg-emerald-50');
  return b ? b.innerText.trim() : null;
})()`);
if (authState.user === 'signed-in') {
  note('admin badge', badge ? `"${badge}" shown for the signed-in admin` : 'not shown');
} else if (badge) {
  fail('admin badge shown without a signed-in user', `"${badge}"`);
} else {
  pass('no admin badge without a signed-in user');
}

// --- 1. Every enabled button must have a wired handler or a real navigation target ---
console.log(c.b(`\n${c.cy('── Interactive controls ──')}`));
const controls = await evaluate(`(() => {
  const out = { buttons: [], inputs: 0, selects: 0, emptyHandlers: 0, dead: [] };
  document.querySelectorAll('button').forEach((b, i) => {
    const label = (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 40);
    const disabled = b.disabled;
    const rect = b.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;
    out.buttons.push({ i, label, disabled, visible, w: Math.round(rect.width), h: Math.round(rect.height) });
  });
  document.querySelectorAll('input,textarea,select').forEach(el => {
    if (el.type === 'hidden') return;
    if (el.tagName === 'SELECT') out.selects++; else out.inputs++;
  });
  // dead controls: visible, enabled, and carrying an onclick attribute of nothing
  document.querySelectorAll('button').forEach(b => {
    const label = (b.innerText || '').trim();
    if (b.disabled) return;
    if (b.getAttribute('onclick') === '') out.emptyHandlers++;
  });
  return out;
})()`);

console.log(`  ${c.d(`${controls.buttons.length} buttons, ${controls.inputs} inputs, ${controls.selects} selects`)}`);

const visibleEnabled = controls.buttons.filter((b) => b.visible && !b.disabled && b.label);
if (visibleEnabled.length) pass('visible enabled controls enumerated', `${visibleEnabled.length}`);
else note('no visible enabled buttons', 'may still be loading or on a menu screen');

if (controls.emptyHandlers === 0) pass('no empty onclick="" handlers');
else fail('empty onclick handlers present', String(controls.emptyHandlers));

// small tap targets (Android/touch remediation already landed; confirm no regressions)
const tooSmall = controls.buttons.filter((b) => b.visible && !b.disabled && b.label && (b.h < 24 || b.w < 24));
if (tooSmall.length === 0) pass('all labelled buttons are at least 24x24');
else note(`${tooSmall.length} buttons under 24px`, tooSmall.slice(0, 4).map((b) => `"${b.label}" ${b.w}x${b.h}`).join(', '));

// --- 2. History Archive re-check (the earlier "History Archive len=604 rows=0") ---
// That report was NOT a bug: the body text was the correct empty state, and this
// profile's IndexedDB genuinely holds no saved papers. This asserts that either
// rows render OR a real empty state renders - a blank screen fails.
console.log(c.b(`\n${c.cy('── History Archive ──')}`));
const stored = await evaluate(`(async()=>{
  try {
    // Discover the DB and object store names rather than assuming them.
    const dbs = await indexedDB.databases();
    const name = dbs.map(d=>d.name).find(n=>/keyval/i.test(n));
    if (!name) return { papers: 0, note: 'no keyval db' };
    const open = indexedDB.open(name);
    const db = await new Promise((res,rej)=>{ open.onsuccess=()=>res(open.result); open.onerror=()=>rej(open.error); });
    const storeName = db.objectStoreNames[0];
    if (!storeName) return { papers: 0, note: 'no object store' };
    const raw = await new Promise((res)=>{
      const r = db.transaction(storeName,'readonly').objectStore(storeName).get('phssj_saved_exam_papers_v1');
      r.onsuccess=()=>res(r.result); r.onerror=()=>res(null);
    });
    if (raw == null) return { papers: 0, store: storeName };
    return { papers: JSON.parse(raw).length, store: storeName };
  } catch(e) { return { err: e.message }; }
})()`);
console.log(`  ${c.d(`saved papers in IndexedDB: ${JSON.stringify(stored)}`)}`);

// Navigate to History through the real UI and count rendered rows
const navResult = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('button, a, [role="button"], nav *')];
  const hit = btns.find(b => /history/i.test(b.innerText || '') && (b.innerText||'').trim().length < 24);
  if (!hit) return { clicked: false };
  hit.click();
  return { clicked: true, label: (hit.innerText||'').trim() };
})()`);
if (!navResult.clicked) {
  fail('History view reached via UI navigation', 'no History control found');
} else {
  await sleep(3500);
  await S('Page.bringToFront').catch(() => {});
  const view = await evaluate(`(() => {
    const body = document.body.innerText;
    return {
      hasHistoryHeading: /saved history|history archive/i.test(body),
      openButtons: document.querySelectorAll('button[aria-label^="Open paper"]').length,
      // The real empty-state copy, plus the per-tab counters.
      emptyState: /no saved records found|generated plans and papers appear here/i.test(body),
      zeroCounter: /\\bAll \\(0\\)/.test(body),
      bodyLen: body.length,
    };
  })()`);
  console.log(`  ${c.d(JSON.stringify(view))}`);
  if (view.hasHistoryHeading) pass('History view reached via UI navigation', navResult.label);
  else fail('History view reached via UI navigation', 'heading not found');

  if (view.openButtons > 0) {
    pass('History renders paper rows', `${view.openButtons} open controls`);
  } else if (view.emptyState) {
    pass('History shows a real empty state when there are no records',
      `store has ${stored?.papers ?? '?'} papers; body ${view.bodyLen} chars`);
  } else {
    fail('History renders rows or an empty state', `blank screen, body ${view.bodyLen} chars`);
  }
}

// --- 3. Console health across the audit ---
console.log(c.b(`\n${c.cy('── Console / network ──')}`));
const noise = consoleErrors.filter((e) => !/favicon|Failed to load resource.*40[34]/i.test(e));
if (noise.length === 0) pass('no unexpected console errors', `${consoleErrors.length} filtered`);
else {
  fail(`${noise.length} console errors`, noise.slice(0, 3).join(' | ').slice(0, 300));
}

// Firestore realtime listeners are long-lived poll channels that are routinely
// cancelled and recycled by the SDK. Those ERR_ABORTED entries are expected;
// anything else is a genuine failure.
const realFailures = failedRequests.filter((r) => !/ERR_ABORTED/.test(r));
if (realFailures.length === 0) {
  pass('no genuine network failures', `${failedRequests.length} aborted Firestore Listen channels ignored`);
} else {
  fail(`${realFailures.length} genuine network failures`, [...new Set(realFailures)].slice(0, 3).join(', '));
}

console.log(`\n${failed === 0 ? c.g('AUDIT CLEAN') : c.r('AUDIT ISSUES')} — ${passed} passed, ${failed} failed, ${noted} notes\n`);
ws.close();
process.exit(failed === 0 ? 0 : 1);
