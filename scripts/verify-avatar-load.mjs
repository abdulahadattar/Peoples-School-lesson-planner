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

await ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith('Student Records'));b&&b.click()})()`);
await sleep(3500);

// Force every lazy avatar to load, then report.
const r = await ev(`(async () => {
  const imgs = [...document.querySelectorAll('tbody tr img')];
  imgs.forEach(i => { i.loading = 'eager'; if (!i.complete) i.src = i.src; });
  await Promise.allSettled(imgs.map(i => i.complete ? null : new Promise(res => {
    i.addEventListener('load', res, { once: true });
    i.addEventListener('error', res, { once: true });
    setTimeout(res, 6000);
  })));
  return imgs.map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0,
    w: i.naturalWidth, h: i.naturalHeight,
    gr: i.closest('tr')?.querySelector('td:nth-child(1)')?.textContent.trim() }));
})()`);
console.log('Avatar images in the register:');
r.forEach(i => console.log(`  GR ${i.gr}: loaded=${i.loaded} ${i.w}x${i.h}px  ${i.src}`));
const good = r.filter(i => i.loaded).length;
console.log(`\n${good}/${r.length} avatar images loaded from the document archive`);
ws.close(); process.exit(0);
