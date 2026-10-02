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

await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: 430, height: 880, deviceScaleFactor: 1, mobile: true });
await sleep(400);
await ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith('Student Records'));b&&b.click()})()`);
await sleep(2800);

const r = await ev(`(() => {
  const table = document.querySelector('table');
  if (!table) return { found: false };
  // Walk up to the nearest scrollable ancestor of the table.
  let el = table.parentElement, scroller = null;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    if (['auto','scroll'].includes(cs.overflowX)) { scroller = el; break; }
    el = el.parentElement;
  }
  const stickyCells = [...document.querySelectorAll('th,td')].filter(c => {
    const cs = getComputedStyle(c);
    return cs.position === 'sticky';
  });
  return {
    found: true,
    scrollerFound: !!scroller,
    scrollerOverflowX: scroller ? getComputedStyle(scroller).overflowX : null,
    scrollerScrolls: scroller ? scroller.scrollWidth > scroller.clientWidth : false,
    tableW: Math.round(table.getBoundingClientRect().width),
    vw: document.documentElement.clientWidth,
    stickyCellsOnMobile: stickyCells.length,
  };
})()`);
console.log(JSON.stringify(r, null, 2));
console.log('\nInterpretation:');
console.log(`  table scrolls horizontally : ${r.scrollerScrolls} (overflow-x: ${r.scrollerOverflowX})`);
console.log(`  table width vs viewport   : ${r.tableW}px in ${r.vw}px`);
console.log(`  sticky cells on mobile    : ${r.stickyCellsOnMobile} (0 = full width available to data)`);
ws.close(); process.exit(0);
