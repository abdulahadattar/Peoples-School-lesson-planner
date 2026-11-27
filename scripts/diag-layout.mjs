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
await rpc(ws, 'Page.enable'); await rpc(ws, 'Runtime.enable');

const ev = async (expr) => (await rpc(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

// Report containers that clip content they cannot scroll: the classic
// "page does not grow / does not adjust" symptom.
const CLIPPED = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,main,section,aside,table')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const overflowY = cs.overflowY, overflowX = cs.overflowX;
    const scrollsY = ['auto','scroll'].includes(overflowY);
    const scrollsX = ['auto','scroll'].includes(overflowX);
    const vClip = !scrollsY && el.scrollHeight - el.clientHeight > 4;
    const hClip = !scrollsX && el.scrollWidth - el.clientWidth > 4;
    if (vClip || hClip) {
      const r = el.getBoundingClientRect();
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 90),
        v: el.scrollHeight + '>' + el.clientHeight + ' (' + overflowY + ')',
        h: el.scrollWidth + '>' + el.clientWidth + ' (' + overflowX + ')',
        rect: Math.round(r.width) + 'x' + Math.round(r.height),
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  }
  return out.slice(0, 12);
})()`;

const clickNav = (label) => `(() => {
  const b = [...document.querySelectorAll('button,a')].find(e => e.textContent.trim().startsWith(${JSON.stringify(label)}));
  if (b) { b.click(); return 'clicked'; } return 'not found';
})()`;

for (const view of ['Home', 'Student Records', 'Document Archive', 'Daily Attendance', 'History Archive', 'School Admin']) {
  const r = await ev(clickNav(view));
  await sleep(2200);
  const clipped = await ev(CLIPPED);
  const dims = await ev(`({ vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
     docSW: document.documentElement.scrollWidth, bodySW: document.body.scrollWidth,
     main: (() => { const m = document.querySelector('main'); return m ? m.className.slice(0,70) : null; })() })`);
  console.log(`\n### ${view} (${r})  vw=${dims.vw} docSW=${dims.docSW} bodySW=${dims.bodySW}`);
  if (dims.docSW - dims.vw > 2) console.log(`   !! HORIZONTAL OVERFLOW ${dims.docSW - dims.vw}px`);
  if (clipped.length === 0) console.log('   no clipped containers');
  for (const c of clipped) console.log(`   clipped <${c.tag}> h=${c.h} v=${c.v} box=${c.rect}\n      class="${c.cls}"  "${c.text}"`);
}
ws.close();
process.exit(0);
