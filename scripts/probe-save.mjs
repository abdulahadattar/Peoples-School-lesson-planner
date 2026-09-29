#!/usr/bin/env node
/**
 * Captures the network + console activity of a student-record save so the real
 * failure is visible instead of being swallowed by the UI.
 *
 * Usage: node --import ./scripts/test-hooks/alias-none.mjs scripts/probe-save.mjs
 */
const CDP = 'http://localhost:9444';
const version = await (await fetch(`${CDP}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const netLog = [];
const consoleLog = [];
const requests = new Map();

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === 'Network.requestWillBeSent') {
    const { requestId, request } = m.params;
    requests.set(requestId, request.url);
    if (/sheets\.googleapis|localhost:3000\/api/.test(request.url)) {
      netLog.push({ kind: 'req', id: requestId, method: request.method, url: request.url.slice(0, 150) });
    }
  }
  if (m.method === 'Network.responseReceived') {
    const { requestId, response } = m.params;
    if (requests.has(requestId) && /sheets\.googleapis|localhost:3000\/api/.test(response.url)) {
      netLog.push({ kind: 'res', id: requestId, status: response.status, url: response.url.slice(0, 150) });
    }
  }
  if (m.method === 'Network.loadingFailed') {
    netLog.push({ kind: 'fail', id: m.params.requestId, err: m.params.errorText, url: (requests.get(m.params.requestId) || '').slice(0, 120) });
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (/error|fail|denied|401|403|scope|token|Sheets/i.test(txt)) {
      consoleLog.push(`[${m.params.type}] ${txt.slice(0, 260)}`);
    }
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleLog.push('EXCEPTION: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 260));
  }
};

const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

const { targetInfos } = await send('Target.getTargets');
const t = targetInfos.find((x) => x.type === 'page' && x.url.includes('localhost:3000'));
const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Runtime.enable');
await S('Network.enable');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (x) => {
  const r = await S('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description };
  return r.result.value;
};

// Baseline check: is the token currently usable at all?
console.log('=== token state ===');
console.log(await ev(`(() => {
  const t = localStorage.getItem('google_access_token');
  const e = localStorage.getItem('google_token_expiry');
  return JSON.stringify({ hasToken: !!t, minutesLeft: e ? Math.round((parseInt(e,10)-Date.now())/60000) : null });
})()`));

// Do the whole edit-save cycle.
console.log('\n=== driving save ===');
console.log(await ev(`(() => {
  const label = b => (b.innerText||b.getAttribute('aria-label')||b.title||'');
  const row = [...document.querySelectorAll('tbody tr')].find(r => /Ibrar/i.test(r.innerText));
  if (!row) return 'no row';
  const edit = [...row.querySelectorAll('button')].find(b => /Edit Student Record/i.test(label(b)));
  if (!edit) return 'no edit btn';
  edit.click(); return 'edit opened';
})()`));
await sleep(2500);

console.log(await ev(`(() => {
  const els = [...document.querySelectorAll('input,textarea,select')];
  const addr = els.find(e => e.tagName === 'TEXTAREA' && (e.previousElementSibling?.innerText||'').toLowerCase().includes('residential address'));
  if (!addr) return 'no address';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(addr, addr.value + ' ZZTEST');
  addr.dispatchEvent(new Event('input', { bubbles: true }));
  const b = [...document.querySelectorAll('button')].find(x => /Review & Save/i.test(x.innerText||''));
  if (!b) return 'no review btn';
  b.click(); return 'review clicked';
})()`));
await sleep(2500);

console.log(await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Confirm & Update Sheet/i.test(x.innerText||''));
  if (!b) return 'no confirm btn';
  b.click(); return 'confirm clicked';
})()`));
await sleep(8000);

console.log('\n=== network (sheets + /api) ===');
for (const l of netLog) {
  if (l.kind === 'req') console.log(`  REQ  ${l.method} ${l.url}`);
  else if (l.kind === 'res') console.log(`  RES  ${l.status} ${l.url}`);
  else console.log(`  FAIL ${l.err} ${l.url}`);
}
if (!netLog.length) console.log('  (no sheets/api requests at all)');

console.log('\n=== console ===');
for (const l of consoleLog.slice(0, 12)) console.log('  ' + l);
if (!consoleLog.length) console.log('  (nothing logged)');

console.log('\n=== on-page result ===');
console.log(await ev(`(() => {
  const b = document.body.innerText;
  const m = b.match(/[^\\n]*(updated successfully|Error|error|failed|denied|expired|invalid)[^\\n]{0,160}/g);
  return JSON.stringify(m ? m.slice(0,4) : 'no message');
})()`));

ws.close();
