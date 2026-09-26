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
await rpc(ws, 'Page.enable'); await rpc(ws, 'Runtime.enable');
const ev = async (e) => (await rpc(ws, 'Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

const view = process.argv[2] || 'Student Records';
const width = Number(process.argv[3] || 430);
await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width, height: 880, deviceScaleFactor: 1, mobile: true });
await sleep(400);
await ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(view)}));b&&b.click()})()`);
await sleep(2500);

const r = await ev(`(() => {
  const clipped = [];
  for (const el of document.querySelectorAll('div,main,section,table')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const sy = ['auto','scroll'].includes(cs.overflowY), sx = ['auto','scroll'].includes(cs.overflowX);
    const decorative = el.className.includes('pointer-events-none');
    if (decorative) continue;
    const v = !sy && el.scrollHeight - el.clientHeight > 8;
    const h = !sx && el.scrollWidth - el.clientWidth > 8;
    if (v || h) clipped.push({ tag: el.tagName.toLowerCase(), kind: h ? 'h' : 'v',
      by: h ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight,
      cls: String(el.className).slice(0, 78),
      text: (el.textContent||'').trim().slice(0,34) });
  }
  const tiny = {};
  for (const el of document.querySelectorAll('button,a,[role="button"]')) {
    const b = el.getBoundingClientRect();
    if (b.height === 0 || b.width === 0) continue;
    if (b.height >= 28 && b.width >= 28) continue;
    if (el.closest('table') && el.closest('[class*="overflow-x-auto"]')) continue; // table scrolls
    const k = (el.getAttribute('aria-label') || el.title || el.textContent || '(icon)').trim().slice(0,32) + ' :: ' + String(el.className).slice(0,44);
    tiny[k] = (tiny[k]||0)+1;
  }
  return { clipped: clipped.slice(0,6),
    tiny: Object.entries(tiny).sort((a,b)=>b[1]-a[1]).slice(0,8),
    tinyTotal: Object.values(tiny).reduce((a,b)=>a+b,0) };
})()`);

console.log(`\n=== ${view} @ ${width}px ===`);
console.log(`clipped containers: ${r.clipped.length}`);
r.clipped.forEach(c => console.log(`  [${c.kind}] overflows ${c.by}px  <${c.tag}> "${c.text}"\n     ${c.cls}`));
console.log(`\nsmall controls: ${r.tinyTotal}`);
r.tiny.forEach(([k, v]) => console.log(`  x${v}  ${k}`));
ws.close(); process.exit(0);
