/**
 * Shared Playwright (playwright-core) launcher + helpers for the PHSSJ Lesson
 * Planner test suite.
 *
 * playwright-core ships no browser binaries, so the Chromium installed by
 * `npx playwright install chromium` is resolved from the Playwright cache
 * instead of hardcoding an executable path. Resolution order:
 *   1. PHSSJ_CHROME_PATH env var
 *   2. the Chromium revision declared in playwright-core/browsers.json
 *   3. the newest chromium-* folder in the Playwright cache
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

/** Playwright's default browser cache location per platform. */
function playwrightCacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'ms-playwright');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  }
  return path.join(os.homedir(), '.cache', 'ms-playwright');
}

/** Per-OS location of the browser binary inside a chromium-* install folder. */
function executableInside(dir) {
  const candidates = [
    path.join(dir, 'chrome-win', 'chrome.exe'),
    path.join(dir, 'chrome-win64', 'chrome.exe'),
    path.join(dir, 'chrome-linux', 'chrome'),
    path.join(dir, 'chrome-linux64', 'chrome'),
    path.join(dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
    path.join(dir, 'chrome-headless-shell-win', 'chrome-headless-shell.exe'),
    path.join(dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
  ];
  if (process.platform === 'darwin') {
    candidates.unshift(path.join(dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
  }
  return candidates.find(p => fs.existsSync(p)) || null;
}

/** Resolve the Chromium executable to drive, or null when none is installed. */
export function resolveChromiumExecutable() {
  if (process.env.PHSSJ_CHROME_PATH && fs.existsSync(process.env.PHSSJ_CHROME_PATH)) {
    return process.env.PHSSJ_CHROME_PATH;
  }

  const cache = playwrightCacheDir();
  if (!fs.existsSync(cache)) return null;

  let preferredRevision = null;
  try {
    const browsersJson = require('playwright-core/browsers.json');
    preferredRevision = (browsersJson.browsers || []).find(b => b.name === 'chromium')?.revision ?? null;
  } catch {
    /* browsers.json is optional */
  }
  if (preferredRevision) {
    const preferred = path.join(cache, `chromium-${preferredRevision}`);
    if (fs.existsSync(preferred)) {
      const exe = executableInside(preferred);
      if (exe) return exe;
    }
  }

  // Prefer the full Chromium build over the headless shell (the full build
  // supports PDF/download/print features that smoke tests may exercise).
  const folders = fs.readdirSync(cache)
    .filter(d => d.startsWith('chromium'))
    .sort((a, b) => {
      const full = x => (x.startsWith('chromium_headless_shell') ? 1 : 0);
      return full(a) - full(b) || b.localeCompare(a);
    });
  for (const folder of folders) {
    const exe = executableInside(path.join(cache, folder));
    if (exe) return exe;
  }

  // Last resort: a Chrome/Edge already installed on the machine.
  return systemBrowserExecutable();
}

/** Common per-OS install locations for Google Chrome, Chromium and Edge. */
export function systemBrowserExecutable() {
  const candidates = [];
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean);
    for (const root of roots) {
      candidates.push(
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge'
    );
  }
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

/**
 * Launch Chromium with the flags this sandboxed/CI environment needs.
 * Throws a clear, actionable error when no browser binary is available.
 */
export async function launchChromium(options = {}) {
  const executablePath = options.executablePath || resolveChromiumExecutable();
  if (!executablePath) {
    throw new Error(
      'No Chromium binary found for playwright-core. Install one with ' +
      '`npx playwright install chromium`, or point PHSSJ_CHROME_PATH at an existing chrome.exe.'
    );
  }
  const { chromium } = await import('playwright-core');
  return chromium.launch({
    executablePath,
    headless: options.headless !== false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(options.args || [])],
    ...(options.launchOptions || {}),
  });
}

/**
 * Third-party / offline noise that is not an application defect. The app talks
 * to Firebase, Google Fonts and CDN-hosted KaTeX/MathJax/pdfmake, none of which
 * are reachable in a sandboxed test run.
 */
export const IGNORED_CONSOLE_ERROR_PATTERNS = [
  /firebase/i,
  /firestore/i,
  /googleapis\.com/i,
  /fonts\.googleapis\.com/i,
  /cdn\.jsdelivr\.net/i,
  /cdnjs\.cloudflare\.com/i,
  /favicon/i,
  /manifest/i,
  /Download the React DevTools/i,
  /the server responded with a status of 40[0134]/i,
  /net::ERR_(INTERNET_DISCONNECTED|CONNECTION|NAME_NOT_RESOLVED|BLOCKED)/i,
];

export function isIgnorableConsoleError(text) {
  const t = String(text || '');
  return IGNORED_CONSOLE_ERROR_PATTERNS.some(re => re.test(t));
}

/**
 * Collects console messages and uncaught page errors from a page so every
 * browser test can assert "the app produced no console errors".
 */
export function attachConsoleRecorder(page) {
  const errors = [];
  const warnings = [];
  const logs = [];
  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text() };
    if (entry.type === 'error') errors.push(entry);
    else if (entry.type === 'warning') warnings.push(entry);
    else logs.push(entry);
  });
  page.on('pageerror', err => errors.push({ type: 'pageerror', text: err.message }));
  return { errors, warnings, logs };
}

/** Open a page with guest mode pre-set so the login gate does not block tests. */
export async function newGuestPage(browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('phssj_guest_mode', 'true');
    } catch {
      /* storage unavailable */
    }
  });
  const page = await context.newPage();
  return { context, page };
}

/** Wait until the React root has rendered real content. */
export async function waitForAppReady(page, baseUrl = BASE_URL, timeout = 45000) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return !!root && root.children.length > 0 && (root.textContent || '').trim().length > 20;
    },
    { timeout }
  );
}
