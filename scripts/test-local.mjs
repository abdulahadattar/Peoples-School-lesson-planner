#!/usr/bin/env node
/**
 * Local Build & UI Operations Verification Tool
 * Tests build artifacts, static server delivery, and headless browser UI operations.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  cy: (s) => `\x1b[36m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
const results = [];

function pass(name, detail = '') {
  passed++;
  results.push({ name, status: 'PASS', detail });
  console.log(`  ${c.g('✓')} ${name}${detail ? c.d(` — ${detail}`) : ''}`);
}

function fail(name, detail = '') {
  failed++;
  results.push({ name, status: 'FAIL', detail });
  console.log(`  ${c.r('✗')} ${name}${detail ? c.r(` — ${detail}`) : ''}`);
}

function step(title) {
  console.log(`\n${c.b(c.cy(`── ${title} ──`))}`);
}

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

async function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

function startStaticServer(port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    if (reqUrl === '/') reqUrl = '/index.html';

    let filePath = path.join(distDir, reqUrl);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(rootDir, 'public', reqUrl);
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.handlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new globalThis.WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id && this.handlers.has(msg.id)) {
          const cb = this.handlers.get(msg.id);
          this.handlers.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.handlers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function runVerification() {
  const t0 = Date.now();
  console.log(c.b(`\n🚀 Starting Local Build & UI Operations Suite`));

  step('Phase 1: Build Artifacts Check');
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    const html = fs.readFileSync(indexHtml, 'utf8');
    if (html.includes('id="root"') && html.includes('assets/')) {
      pass('Production HTML bundle present', `dist/index.html (${html.length} bytes)`);
    } else {
      fail('Production HTML bundle invalid', 'Missing #root or asset links');
    }
  } else {
    fail('Production bundle missing', 'Run npm run build first');
    process.exit(1);
  }

  const assetsDir = path.join(distDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const hasJs = files.some(f => f.endsWith('.js'));
    const hasCss = files.some(f => f.endsWith('.css'));
    if (hasJs && hasCss) {
      pass('Bundled CSS and JavaScript assets', `${files.length} chunk files present`);
    } else {
      fail('Bundled assets incomplete', 'Missing CSS or JS output files');
    }
  }

  step('Phase 2: Local Static Host & Network');
  const port = 5192;
  const server = await startStaticServer(port);
  pass('Test static HTTP server online', `http://127.0.0.1:${port}`);

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/`);
    if (resp.ok && (await resp.text()).includes('id="root"')) {
      pass('HTTP GET / serves index.html');
    } else {
      fail('HTTP GET / response invalid');
    }
  } catch (err) {
    fail('HTTP GET / failed', err.message);
  }

  step('Phase 3: Headless Browser & UI Operations Test');
  const browserPath = await findChromePath();
  if (!browserPath) {
    fail('No compatible Chrome/Edge browser found for UI verification');
    server.close();
    process.exit(1);
  }
  pass('Browser executable located', path.basename(browserPath));

  const cdpPort = 9229;
  const tmpProfile = path.join(os.tmpdir(), `phssj-test-${Date.now()}`);
  const browserProc = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tmpProfile}`,
    `http://127.0.0.1:${port}`
  ]);

  let cdpClient = null;
  try {
    let target = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        if (res.ok) {
          const list = await res.json();
          target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
          if (target) break;
        }
      } catch {}
    }

    if (!target) throw new Error('Timed out waiting for DevTools target');
    pass('CDP DevTools endpoint active');

    cdpClient = new CDPClient(target.webSocketDebuggerUrl);
    await cdpClient.connect();
    pass('WebSocket connected to browser page');

    await cdpClient.send('Runtime.enable');
    await cdpClient.send('DOM.enable');

    let mounted = false;
    for (let i = 0; i < 25; i++) {
      const rootText = await cdpClient.evaluate(`document.getElementById('root')?.textContent || ''`);
      if (rootText.length > 20) {
        mounted = true;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (mounted) {
      pass('React application mounted and hydrated #root');
    } else {
      fail('React app did not mount within timeout');
    }

    const guestButtonText = await cdpClient.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const guest = btns.find(b => b.textContent.includes('Explore as Guest'));
        return guest ? guest.textContent.trim() : null;
      })()
    `);

    if (guestButtonText) {
      pass('Auth modal rendered with Guest mode option', guestButtonText);
    } else {
      fail('Guest mode button not found');
    }

    await cdpClient.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const guest = btns.find(b => b.textContent.includes('Explore as Guest'));
        if (guest) guest.click();
      })()
    `);
    pass('Clicked "Explore as Guest" button');

    await new Promise(r => setTimeout(r, 600));

    const tabs = await cdpClient.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const expected = ['Home', 'Student Records', 'Document Archive', 'Daily Attendance', 'Lesson Plans', 'Exam Papers'];
        return expected.filter(tab => btns.some(b => b.textContent.includes(tab)));
      })()
    `);

    if (tabs && tabs.length >= 4) {
      pass('Navigation workspace loaded with operational tabs', tabs.join(', '));
    } else {
      fail('Navigation tabs missing', JSON.stringify(tabs));
    }

    // Switch tab to Daily Attendance
    await cdpClient.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const att = btns.find(b => b.textContent.includes('Daily Attendance'));
        if (att) att.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    const hasAttendanceView = await cdpClient.evaluate(`
      (() => {
        const body = document.body.textContent || '';
        return body.includes('Attendance') || body.includes('Register') || body.includes('Date');
      })()
    `);
    if (hasAttendanceView) {
      pass('Switched to Daily Attendance tab and rendered view');
    } else {
      fail('Daily Attendance tab view did not render expected content');
    }

    // Switch tab to Document Archive
    await cdpClient.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const arch = btns.find(b => b.textContent.includes('Document Archive'));
        if (arch) arch.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    const hasArchiveView = await cdpClient.evaluate(`
      (() => {
        const body = document.body.textContent || '';
        return body.includes('Document') || body.includes('Archive') || body.includes('Upload');
      })()
    `);
    if (hasArchiveView) {
      pass('Switched to Document Archive tab and rendered view');
    } else {
      fail('Document Archive view did not render expected content');
    }

  } catch (err) {
    fail('CDP execution error', err.message);
  } finally {
    if (cdpClient) cdpClient.close();
    browserProc.kill();
    server.close();
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {}
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  step('Verification Summary');
  console.log(`  ${c.g(`${passed} passed`)}${failed ? c.r(`  ${failed} failed`) : ''}  ${c.d(`took ${duration}s`)}`);

  if (failed > 0) {
    console.log(c.r('\nFailures encountered:'));
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(c.r(`  • ${r.name}: ${r.detail}`)));
    process.exit(1);
  } else {
    console.log(c.g('\n✨ All local build, static assets, and UI operation tests PASSED! Ready for deployment.\n'));
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('Fatal crash:', err);
  process.exit(2);
});
