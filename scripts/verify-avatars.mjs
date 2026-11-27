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

// 1. Does the file route actually serve the image?
console.log('1. Image serving route');
for (const gr of ['56', '1300']) {
  const dos = await (await fetch(`http://localhost:3000/api/documents/dossiers/${gr}`)).json().catch(() => null);
  const url = dos?.dossier?.avatarUrl;
  if (!url) { console.log(`   GR ${gr}: no avatarUrl in dossier`); continue; }
  const res = await fetch(`http://localhost:3000${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`   GR ${gr}: HTTP ${res.status} ${res.headers.get('content-type')} ${buf.length} bytes  <- ${url}`);
}

// 2. Does the register show real photos instead of letter circles?
await ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith('Student Records'));b&&b.click()})()`);
await sleep(4000);
const avatars = await ev(`(() => {
  const rows = [...document.querySelectorAll('tbody tr')].slice(0, 50);
  let photos = 0, initials = 0;
  const photoRows = [];
  for (const r of rows) {
    const cell = r.querySelector('td:nth-child(2)');
    if (!cell) continue;
    const img = cell.querySelector('img');
    const gr = (r.querySelector('td:nth-child(1)')?.textContent || '').trim();
    if (img) {
      photos++;
      photoRows.push({ gr, src: img.getAttribute('src'),
        loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth });
    } else if (cell.querySelector('.rounded-full')) { initials++; }
  }
  return { photos, initials, photoRows: photoRows.slice(0, 8) };
})()`);
console.log('\n2. Student register avatars');
console.log(`   rows with a photo: ${avatars.photos}   rows with letter fallback: ${avatars.initials}`);
avatars.photoRows.forEach(p => console.log(`   GR ${p.gr}: loaded=${p.loaded} (${p.w}px) ${p.src}`));

const loaded = avatars.photoRows.filter(p => p.loaded).length;
console.log(`\n===== ${loaded > 0 ? 'PHOTOS RENDER' : 'NO PHOTO RENDERED'} =====`);
ws.close(); process.exit(0);
