// Measures horizontal/vertical overflow of the app at several window widths using
// the real Chrome instance over CDP, so responsive regressions are observed and not
// guessed at.
import { WebSocket } from 'ws';

const PORT = 9444;
const URL_TO_OPEN = process.argv[2] || 'http://localhost:3000';
const WIDTHS = [1600, 1280, 1024, 900, 768, 600, 430];

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

let id = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    const onMsg = (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id === msgId) {
        ws.off('message', onMsg);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const list = await targets();
let page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) throw new Error('no page target; is Chrome running with --remote-debugging-port=' + PORT);

const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

await rpc(ws, 'Page.enable');
await rpc(ws, 'Runtime.enable');

// Force layout to actually recompute on resize (rAF is throttled in background tabs).
const MEASURE = `(() => {
  const d = document.documentElement, b = document.body;
  const de = d.scrollWidth - d.clientWidth;
  const be = b.scrollWidth - b.clientWidth;
  let worst = null;
  const vw = d.clientWidth;
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const over = Math.round(r.right - vw);
    if (over > 2 && (!worst || over > worst.over)) {
      worst = { over, tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0,110)) || '',
        text: (el.textContent || '').trim().slice(0,45) };
    }
  }
  return { de, be, vw, vh: d.clientHeight, worst };
})()`;

console.log(`\nURL: ${URL_TO_OPEN}\n`);
for (const w of WIDTHS) {
  await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
    width: w, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(700);
  const r = await rpc(ws, 'Runtime.evaluate', { expression: MEASURE, returnByValue: true });
  const v = r.result.value;
  const bad = v.de > 2 || v.be > 2;
  console.log(
    `${String(w).padStart(5)}px  vw=${v.vw}  hOverflow=${bad ? 'YES' : 'no '}` +
    `  docOverflow=${v.de}px bodyOverflow=${v.be}px`
  );
  if (bad && v.worst) {
    console.log(`        worst: <${v.worst.tag} class="${v.worst.cls}"> overflows by ${v.worst.over}px  "${v.worst.text}"`);
  }
}
await rpc(ws, 'Emulation.clearDeviceMetricsOverride');
ws.close();
console.log('\ndone');
process.exit(0);
