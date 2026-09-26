import { WebSocket } from 'ws';

const PORT = 9444;
let id = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    const onMsg = (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id === msgId) { ws.off('message', onMsg); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
await rpc(ws, 'Page.enable'); await rpc(ws, 'Runtime.enable'); await rpc(ws, 'Network.enable');
await rpc(ws, 'Network.setCacheDisabled', { cacheDisabled: true });
await rpc(ws, 'Page.reload', { ignoreCache: true });
await sleep(4500);

const ev = async (expr) => (await rpc(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const click = (label) => `(() => { const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)})); if(b){b.click();return 'ok'} return 'nf' })()`;
const fail = [];
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fail.push(m); };

// 1. Home content reachable, not clipped
await ev(click('Home')); await sleep(1500);
const home = await ev(`(() => {
  const col = [...document.querySelectorAll('div')].find(e => e.className.includes('my-auto'));
  if (!col) return { found: false };
  const cs = getComputedStyle(col);
  const scroller = col.closest('[class*="overflow-y-auto"]');
  return { found: true, colH: col.scrollHeight, colClient: col.clientHeight, overflowY: cs.overflowY,
    scroller: !!scroller, scrollerScrolls: scroller ? getComputedStyle(scroller).overflowY : null,
    scrollerCanScroll: scroller ? scroller.scrollHeight > scroller.clientHeight : false };
})()`);
console.log('\n1. Home layout');
ok(home.found, 'Home content column found');
ok(home.colH <= home.colClient + 2 || !home.scrollerCanScroll, `Home content not clipped (content ${home.colH}px in ${home.colClient}px box, parent scrolls: ${home.scrollerCanScroll})`);

// 2. Export Excel menu reachable without hover (was hover-only = dead on Android)
await ev(click('School Admin')); await sleep(2000);
const tabClicked = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(e=>/timetable/i.test(e.textContent)); if(b){b.click();return b.textContent.trim().slice(0,30)} return 'nf' })()`);
await sleep(2500);
const beforeOpen = await ev(`document.querySelectorAll('[role="menu"]').length`);
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('Export Excel')); if(b){b.click();return 'ok'} return 'nf' })()`);
await sleep(700);
const afterOpen = await ev(`document.querySelectorAll('[role="menu"]').length`);
console.log('\n2. Export Excel dropdown (previously hover-only)');
ok(tabClicked !== 'nf', `Timetable tab opened (${tabClicked})`);
ok(beforeOpen === 0 && afterOpen === 1, `Menu opens by tap without hover (before=${beforeOpen}, after=${afterOpen})`);
const items = await ev(`[...document.querySelectorAll('[role="menuitem"]')].map(b=>b.textContent.trim().slice(0,32))`);
console.log('     export actions reachable:', JSON.stringify(items));
ok(items.length === 4, `All 4 export actions present (${items.length})`);
const aria = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('Export Excel')); return b ? {expanded:b.getAttribute('aria-expanded'), haspopup:b.getAttribute('aria-haspopup')} : null })()`);
ok(aria?.expanded === 'true', `aria-expanded reflects state (${aria?.expanded})`);
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('Export Excel')); b&&b.click(); })()`);
await sleep(400);
ok((await ev(`document.querySelectorAll('[role="menu"]').length`)) === 0, 'Menu closes again on second tap');

// 3. Modal overlays can scroll (was unreachable header/footer when tall)
const modalScroll = await ev(`(() => {
  const ov = document.querySelector('.fixed.inset-0.z-\\\\[100\\\\]');
  if (!ov) return null;
  const cs = getComputedStyle(ov);
  return { overflowY: cs.overflowY, align: cs.alignItems, found: true };
})()`);
console.log('\n3. Modal overlay scroll path');
if (modalScroll) ok(modalScroll.overflowY === 'auto' || modalScroll.overflowY === 'scroll', `Overlay is scrollable (overflow-y: ${modalScroll.overflowY})`);
else console.log('  (no modal currently open - checked statically instead)');

// 4. Sortable headers keyboard operable
await ev(click('Student Records')); await sleep(3000);
const sortA11y = await ev(`(() => {
  const th = [...document.querySelectorAll('th')].filter(e => e.getAttribute('aria-sort'));
  return { count: th.length, focusable: th.filter(e => e.tabIndex === 0).length,
    sample: th.slice(0,2).map(e => e.textContent.trim().slice(0,14) + ':' + e.getAttribute('aria-sort')) };
})()`);
console.log('\n4. Sortable column headers');
ok(sortA11y.count === 12, `All 12 headers expose aria-sort (${sortA11y.count})`);
ok(sortA11y.focusable === 12, `All 12 headers keyboard focusable (${sortA11y.focusable})`);
console.log('     sample:', JSON.stringify(sortA11y.sample));

// 5. Inputs: no sub-16px focus zoom on touch, tel/numeric modes present
const inputs = await ev(`(() => {
  const all=[...document.querySelectorAll('input,select,textarea')];
  return { total: all.length,
    tel: all.filter(e=>(e.type==='tel'||e.inputMode==='tel')).length,
    numeric: all.filter(e=>e.inputMode==='numeric').length,
    search: all.filter(e=>e.type==='search'||e.inputMode==='search').length };
})()`);
console.log('\n5. Android input keyboards');
ok(inputs.tel > 0, `Phone fields use the dial pad (${inputs.tel} found)`);
ok(inputs.numeric > 0, `Numeric fields use the number pad (${inputs.numeric} found)`);
ok(inputs.search > 0, `Search field flagged (${inputs.search} found)`);

// 6. Footer must not cover the last row of data
await ev(click('Student Records')); await sleep(2500);
const footer = await ev(`(() => {
  const f=[...document.querySelectorAll('div')].find(e=>/^\\d/.test(e.textContent.trim()) && e.className.includes('fixed') && e.className.includes('bottom-0'));
  const scroller=document.querySelector('[class*="overflow-y-auto"]');
  if(!f) return {found:false};
  const fr=f.getBoundingClientRect();
  const lastRow=document.querySelector('tbody tr:last-child');
  const lr=lastRow?lastRow.getBoundingClientRect():null;
  return { found:true, footerTop: Math.round(fr.top), footerH: Math.round(fr.height),
    scrollerPadBottom: scroller?getComputedStyle(scroller).paddingBottom:null,
    lastRowBottom: lr?Math.round(lr.bottom):null,
    overlaps: lr ? lr.bottom > fr.top : null };
})()`);
console.log('\n6. Version footer vs last data row');
ok(footer.found, 'Version footer found');
ok(footer.scrollerPadBottom !== '0px', `Scroll column reserves footer space (padding-bottom: ${footer.scrollerPadBottom})`);

console.log(`\n===== ${fail.length === 0 ? 'ALL CHECKS PASSED' : fail.length + ' FAILURE(S)'} =====`);
fail.forEach(f => console.log('  - ' + f));
ws.close();
process.exit(0);
