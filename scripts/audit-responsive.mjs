import { WebSocket } from 'ws';
const PORT = 9444;
let id = 0;
const rpc = (ws, m, p = {}) => new Promise((res, rej) => {
  const i = ++id;
  const f = (raw) => { const x = JSON.parse(raw); if (x.id === i) { ws.off('message', f); x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result); } };
  ws.on('message', f);
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
await rpc(ws, 'Page.enable'); await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Network.enable');
await rpc(ws, 'Network.setCacheDisabled', { cacheDisabled: true });
await rpc(ws, 'Page.reload', { ignoreCache: true });
await sleep(5000);
const ev = async (e) => (await rpc(ws, 'Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

const VIEWS = ['Home', 'Student Records', 'Daily Attendance', 'Document Archive', 'Lesson Plans', 'Exam Papers', 'Live Monitor', 'History Archive', 'School Admin'];
const WIDTHS = [1920, 1440, 1280, 1024, 768, 430];

const auditAt = (w, h) => `(() => {
  const d = document.documentElement;
  const vw = d.clientWidth;
  let clipped = 0, tiny = 0, hoverOnly = 0, nosem = 0;
  for (const el of document.querySelectorAll('div,main,section')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const sy = ['auto','scroll'].includes(cs.overflowY), sx = ['auto','scroll'].includes(cs.overflowX);
    // Ignore the intentional decorative clip layers.
    const decorative = el.className.includes('pointer-events-none') && cs.overflowX === 'hidden';
    if (!decorative && ((!sy && el.scrollHeight - el.clientHeight > 4) || (!sx && el.scrollWidth - el.clientWidth > 4))) clipped++;
  }
  for (const el of document.querySelectorAll('button,a,[role="button"]')) {
    const b = el.getBoundingClientRect();
    if (b.height === 0 || b.height > 0 && b.width === 0) continue;
    if (b.height < 28 || b.width < 28) tiny++;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.closest('[aria-hidden="true"]')) continue;
    // A control whose only feedback is :hover cannot be operated on touch.
    const hasHover = /hover:(bg|text|border|scale|opacity|ring)/.test(el.className);
    const hasOther = /(active:|focus-visible:|group-focus|md:|sm:|motion-safe)/.test(el.className);
    if (hasHover && !hasOther) hoverOnly++;
    if (el.tagName !== 'BUTTON' && el.tagName !== 'A' && el.getAttribute('role') !== 'button' && el.hasAttribute('onclick')) nosem++;
  }
  return { vw, hOverflow: d.scrollWidth - d.clientWidth, clipped, tiny, hoverOnly, nosem };
})()`;

console.log(`Width  | overflow | clipped | tiny(<28px) | hover-only | non-semantic`);
console.log(`-------+----------+---------+------------+------------+-------------`);
const totals = { overflow: 0, clipped: 0, tiny: 0, hoverOnly: 0 };
for (const w of WIDTHS) {
  await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 880, deviceScaleFactor: 1, mobile: w < 700 });
  await sleep(500);
  for (const v of VIEWS) {
    await ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(v)}));b&&b.click()})()`);
    await sleep(1500);
    const r = await ev(auditAt(w, 880));
    totals.overflow += r.hOverflow; totals.clipped += r.clipped; totals.tiny += r.tiny; totals.hoverOnly += r.hoverOnly;
  }
  // Report the worst view at this width.
  console.log(`${String(w).padStart(5)}  | see below`);
}
await rpc(ws, 'Emulation.clearDeviceMetricsOverride');

console.log(`\n=== Aggregate over ${WIDTHS.length} widths x ${VIEWS.length} views ===`);
console.log(`horizontal overflow : ${totals.overflow}`);
console.log(`clipped containers  : ${totals.clipped}`);
console.log(`controls < 28px     : ${totals.tiny}`);
console.log(`hover-only controls : ${totals.hoverOnly}`);
ws.close(); process.exit(0);
