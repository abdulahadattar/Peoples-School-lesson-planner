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
const ev = async (e) => (await rpc(ws, 'Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const click = (l) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(l)}));if(b){b.click();return'ok'}return'nf'})()`;
const fail = [];
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fail.push(m); };

// A. Daily Attendance carries the numeric roll-number entry
await ev(click('Daily Attendance')); await sleep(3000);
const att = await ev(`(() => { const all=[...document.querySelectorAll('input,select,textarea')];
  return { total: all.length, numeric: all.filter(e=>e.inputMode==='numeric').length,
           date: all.filter(e=>e.type==='date').length,
           smallest: Math.min(...all.map(e=>e.getBoundingClientRect().height).filter(h=>h>0) ) }; })()`);
console.log('\nA. Daily Attendance inputs');
console.log('     total=' + att.total + ' numeric=' + att.numeric + ' datePickers=' + att.date);
ok(att.numeric > 0, `Roll-number fields use the number pad (${att.numeric})`);
ok(att.smallest >= 28, `Smallest control is ${Math.round(att.smallest)}px tall`);

// B. Open the student edit modal and confirm the tel inputs
await ev(click('Student Records')); await sleep(3000);
const openedEdit = await ev(`(() => {
  const rows=[...document.querySelectorAll('tbody tr')];
  if(!rows.length) return 'no-rows';
  const btns=[...rows[0].querySelectorAll('button')];
  const edit=btns.find(b=>/edit/i.test(b.title||b.getAttribute('aria-label')||'')) || btns[0];
  edit && edit.click();
  return edit ? (edit.title||edit.getAttribute('aria-label')||'first-btn') : 'none';
})()`);
await sleep(1800);
const modal = await ev(`(() => {
  const ov=document.querySelector('.fixed.inset-0.z-\\\\[100\\\\]');
  const all=[...document.querySelectorAll('input,select,textarea')];
  return { modalOpen: !!ov, overlayOverflow: ov?getComputedStyle(ov).overflowY:null,
    total: all.length, tel: all.filter(e=>e.type==='tel'||e.inputMode==='tel').length,
    numeric: all.filter(e=>e.inputMode==='numeric').length }; })()`);
console.log('\nB. Student edit modal');
console.log('     row action clicked: ' + openedEdit);
ok(modal.modalOpen, 'Student edit modal opened');
ok(modal.tel >= 3, `Phone fields use the dial pad (${modal.tel} found)`);
ok(modal.numeric > 0, `GR / DD-MM-YYYY fields use the number pad (${modal.numeric} found)`);
ok(modal.overlayOverflow === 'auto' || modal.overlayOverflow === 'scroll', `Modal overlay is scrollable (overflow-y: ${modal.overlayOverflow})`);
if (modal.modalOpen) {
  await ev(`(()=>{const b=[...document.querySelectorAll('.fixed.inset-0.z-\\\\[100\\\\] button')].find(e=>/cancel|close|×/i.test(e.textContent+e.getAttribute('aria-label')));b&&b.click();})()`);
  await sleep(600);
}

console.log(`\n===== ${fail.length === 0 ? 'ALL CHECKS PASSED' : fail.length + ' FAILURE(S)'} =====`);
fail.forEach(f => console.log('  - ' + f));
ws.close(); process.exit(0);
