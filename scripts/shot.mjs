import { WebSocket } from 'ws';
import fs from 'node:fs';

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

const url = process.argv[2] || 'http://localhost:3000';
await rpc(ws, 'Page.navigate', { url });
await sleep(3500);

const info = await rpc(ws, 'Runtime.evaluate', {
  expression: `({
    url: location.href,
    title: document.title,
    h1: [...document.querySelectorAll('h1,h2')].slice(0,6).map(e=>e.textContent.trim().slice(0,50)),
    buttons: [...document.querySelectorAll('button')].slice(0,14).map(e=>e.textContent.trim().slice(0,26)).filter(Boolean),
    rootChildren: document.getElementById('root')?.children.length,
  })`, returnByValue: true,
});
console.log(JSON.stringify(info.result.value, null, 2));

for (const [w, h, tag] of [[1600, 900, 'wide'], [1024, 800, 'medium'], [768, 800, 'narrow']]) {
  await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const { data } = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`C:/Users/hp/AppData/Local/Temp/kilo/shot-${tag}.png`, Buffer.from(data, 'base64'));
  console.log(`saved shot-${tag}.png @ ${w}x${h}`);
}
await rpc(ws, 'Emulation.clearDeviceMetricsOverride');
ws.close();
process.exit(0);
