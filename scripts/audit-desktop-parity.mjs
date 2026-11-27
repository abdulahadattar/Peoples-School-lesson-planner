#!/usr/bin/env node
/**
 * Desktop vs mobile parity audit.
 *
 * The touch/Android pass is only acceptable if desktop is unharmed, so this
 * measures both form factors in the real browser and reports where desktop is
 * worse: horizontal overflow, oversized controls, tiny text, and cramped targets.
 *
 * Usage: node scripts/audit-desktop-parity.mjs
 */
const CDP = 'http://localhost:9444';
const BASE = 'http://localhost:3000';

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };

const version = await (await fetch(`${CDP}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } };
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetInfos } = await send('Target.getTargets');
const t = targetInfos.find((x) => x.type === 'page' && x.url.includes('localhost')) || targetInfos.find((x) => x.type === 'page');
const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Runtime.enable'); await S('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (x) => { const r = await S('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description }; return r.result.value; };

const PROFILES = {
  desktop: { width: 1440, height: 900, mobile: false, touch: false },
  mobile: { width: 390, height: 844, mobile: true, touch: true },
};

const VIEWS = [
  ['Home', /^home$/i],
  ['Student Records', /student records/i],
  ['Daily Attendance', /daily attendance/i],
  ['Document Archive', /document archive/i],
  ['Lesson Plans', /lesson plans/i],
  ['Exam Papers', /exam papers/i],
  ['History Archive', /history archive/i],
];

// Measured in the page: the things that actually differ between form factors.
const PROBE = `(() => {
  const de = document.documentElement;
  const vw = window.innerWidth;

  // Horizontal overflow
  const overflowing = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') return;
    if (r.right > vw + 2 || r.left < -2) {
      // ignore intentionally scrollable containers
      let p = el, scrollable = false;
      while (p && p !== document.body) {
        const pcs = getComputedStyle(p);
        if (/auto|scroll/.test(pcs.overflowX)) { scrollable = true; break; }
        p = p.parentElement;
      }
      if (!scrollable) overflowing.push({
        tag: el.tagName,
        cls: (el.className||'').toString().slice(0,60),
        right: Math.round(r.right), left: Math.round(r.left)
      });
    }
  });

  // Interactive control sizes
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    })
    .map(el => {
      const r = el.getBoundingClientRect();
      return {
        t: (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 22),
        w: Math.round(r.width), h: Math.round(r.height),
        font: parseFloat(getComputedStyle(el).fontSize),
      };
    });

  // Text legibility
  const texts = [...document.querySelectorAll('body *')]
    .filter(el => el.children.length === 0 && (el.textContent||'').trim().length > 0)
    .map(el => parseFloat(getComputedStyle(el).fontSize))
    .filter(n => n > 0);

  return {
    vw,
    docScrollW: de.scrollWidth,
    clientW: de.clientWidth,
    hOverflow: de.scrollWidth > de.clientWidth + 2,
    overflowCount: overflowing.length,
    overflowSample: overflowing.slice(0, 4),
    coarse: matchMedia('(pointer: coarse)').matches,
    controlCount: controls.length,
    under32: controls.filter(x => x.h < 32).length,
    over60: controls.filter(x => x.h > 60).length,
    tallSample: controls.filter(x => x.h > 60).slice(0, 4),
    minFont: texts.length ? Math.min(...texts) : null,
    tinyFont: texts.filter(n => n < 11).length,
  };
})()`;

const results = {};
for (const [name, profile] of Object.entries(PROFILES)) {
  await S('Emulation.setDeviceMetricsOverride', {
    width: profile.width, height: profile.height, deviceScaleFactor: 1,
    mobile: profile.mobile,
  });
  await S('Emulation.setTouchEmulationEnabled', { enabled: profile.touch });
  await S('Page.navigate', { url: BASE });
  await sleep(5500);
  await S('Page.bringToFront').catch(() => {});

  // Ensure we are past the login gate.
  const gated = await ev(`!![...document.querySelectorAll('button')].find(b=>/guest|demo mode/i.test(b.innerText||''))`);
  if (gated) {
    await ev(`[...document.querySelectorAll('button')].find(b=>/guest|demo mode/i.test(b.innerText||'')).click()`);
    await sleep(4500);
    await S('Page.bringToFront').catch(() => {});
  }

  results[name] = {};
  for (const [label, re] of VIEWS) {
    const clicked = await ev(`(() => {
      const hit = [...document.querySelectorAll('button, a, [role="button"]')]
        .find(b => b.offsetParent !== null && ${re.source}.test((b.innerText||'').trim()));
      if (!hit) return false;
      hit.click(); return true;
    })()`);
    if (!clicked) { results[name][label] = { missing: true }; continue; }
    await sleep(3200);
    await S('Page.bringToFront').catch(() => {});
    results[name][label] = await ev(PROBE);
  }
}

console.log(c.b('\n── Desktop (1440x900) ──'));
for (const [label, r] of Object.entries(results.desktop)) {
  if (r.missing) { console.log(`  ${c.y('?')}  ${label}: nav not reachable`); continue; }
  const flags = [];
  if (r.hOverflow) flags.push(c.r(`H-OVERFLOW ${r.docScrollW}>${r.clientW}`));
  if (r.under32) flags.push(c.y(`${r.under32} controls <32px`));
  if (r.over60) flags.push(c.y(`${r.over60} controls >60px`));
  if (r.tinyFont) flags.push(c.y(`${r.tinyFont} texts <11px`));
  if (r.minFont) flags.push(c.d(`min font ${r.minFont}px`));
  console.log(`  ${flags.length ? c.r('X') : c.g('ok')} ${label.padEnd(18)} ${flags.join('  ') || c.d('clean')}`);
  if (r.over60 && r.tallSample) console.log(`      ${c.d('oversized: ' + r.tallSample.map(x => `"${x.t}" ${x.w}x${x.h}`).join(', '))}`);
  if (r.hOverflow && r.overflowSample) console.log(`      ${c.d('overflow: ' + r.overflowSample.map(x => `${x.tag}.${x.cls.slice(0,28)} r=${x.right}`).join(' | '))}`);
}

console.log(c.b('\n── Mobile (390x844) ──'));
for (const [label, r] of Object.entries(results.mobile)) {
  if (r.missing) { console.log(`  ${c.y('?')}  ${label}: nav not reachable`); continue; }
  const flags = [];
  if (r.hOverflow) flags.push(c.r(`H-OVERFLOW ${r.docScrollW}>${r.clientW}`));
  if (r.under32) flags.push(c.y(`${r.under32} controls <32px`));
  if (r.minFont) flags.push(c.d(`min font ${r.minFont}px`));
  console.log(`  ${flags.length ? c.r('X') : c.g('ok')} ${label.padEnd(18)} ${flags.join('  ') || c.d('clean')}`);
  if (r.hOverflow && r.overflowSample) console.log(`      ${c.d('overflow: ' + r.overflowSample.map(x => `${x.tag}.${x.cls.slice(0,28)} r=${x.right}`).join(' | '))}`);
}

// --- parity summary ---
console.log(c.b('\n── Desktop regressions vs mobile ──'));
let issues = 0;
for (const [label, d] of Object.entries(results.desktop)) {
  const m = results.mobile[label];
  if (d.missing || m?.missing) continue;
  if (d.hOverflow && !m.hOverflow) { console.log(`  ${c.r('X')} ${label}: overflows on desktop only`); issues++; }
  if (d.over60 > 0 && m.over60 === 0) { console.log(`  ${c.r('X')} ${label}: ${d.over60} oversized controls on desktop only`); issues++; }
  if (d.minFont && m.minFont && d.minFont < m.minFont - 1) { console.log(`  ${c.y('!')} ${label}: desktop text smaller than mobile (${d.minFont} vs ${m.minFont}px)`); issues++; }
}
if (!issues) console.log(`  ${c.g('ok')} no desktop-only regressions detected`);

ws.close();
