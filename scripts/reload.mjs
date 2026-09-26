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

await rpc(ws, 'Page.enable');
await rpc(ws, 'Runtime.enable');
await rpc(ws, 'Network.enable');
await rpc(ws, 'Network.setCacheDisabled', { cacheDisabled: true });
// Hard reload, ignoring the HTTP cache.
await rpc(ws, 'Page.reload', { ignoreCache: true });
await sleep(5000);
const r = await rpc(ws, 'Runtime.evaluate', {
  expression: `({ title: document.title,
    homeClass: (() => { const d = [...document.querySelectorAll('div')].find(e => e.textContent.trim().startsWith('Academic Portal') && e.className.includes('min-h-full')); return d ? d.className : 'not found'; })() })`,
  returnByValue: true,
});
console.log(JSON.stringify(r.result.value, null, 2));
ws.close();
process.exit(0);
