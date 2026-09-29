#!/usr/bin/env node
/**
 * Browser E2E smoke suite for the PHSSJ Lesson Planner (alpha).
 *
 * Drives the real app in a headless browser and verifies that every top-level
 * view mounts, that interactive controls respond, and that the app never emits
 * an uncaught error or an unexplained console error.
 *
 * Run (dev server must already be running on :3000):
 *   node scripts/e2e-smoke.mjs
 *
 * Env:
 *   TEST_BASE_URL       target origin (default http://localhost:3000)
 *   PHSSJ_CHROME_PATH   explicit chrome/msedge executable
 *   PHSSJ_KEEP_OPEN=1   leave the browser open at the end (debugging)
 *   PHSSJ_HEADED=1      run with a visible window
 */
import fs from 'fs';
import path from 'path';
import {
  launchChromium,
  newGuestPage,
  waitForAppReady,
  attachConsoleRecorder,
  isIgnorableConsoleError,
  resolveChromiumExecutable,
  BASE_URL,
} from './lib/browser.mjs';

const ARTIFACTS = path.resolve(import.meta.dirname, '..', 'test-artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const c = {
  g: s => `\x1b[32m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`,
  cy: s => `\x1b[36m${s}\x1b[0m`,
  d: s => `\x1b[2m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
const failures = [];
const log = m => process.stdout.write(m + '\n');
const pass = (t, d = '') => { passed++; log(`${c.g('  ✅')} ${t}${d ? c.d(' — ' + d) : ''}`); };
const fail = (t, d = '') => { failed++; failures.push({ t, d }); log(`${c.r('  ❌')} ${t}${d ? c.r(' — ' + d) : ''}`); };
const hdr = t => log(`\n${c.b(c.cy(`── ${t} ──`))}`);

/** Every navigable view, with a marker proving the view actually mounted. */
const VIEWS = [
  { id: 'records', label: 'Student Records', marker: /Student|Records|Sign in|Register/i },
  { id: 'archive', label: 'Document Archive', marker: /Archive|Document|Dossier|Upload|Scan/i },
  { id: 'attendance', label: 'Daily Attendance', marker: /Attendance|Present|Absent/i },
  { id: 'lesson', label: 'Lesson Plans', marker: /Class|Subject|Chapter|Lesson/i },
  { id: 'paper', label: 'Exam Papers', marker: /Paper|Marks|MCQ|Generat/i },
  { id: 'live', label: 'Live Monitor', marker: /Live|Period|Staff|Teacher/i },
  { id: 'history', label: 'History Archive', marker: /History|Archive|Saved|No /i },
  { id: 'settings', label: 'School Admin', marker: /Settings|Teacher|Class|Timetable|Admin/i },
  { id: 'home', label: 'Home', marker: /Lesson Plans|Exam Papers|Document/i },
];

async function main() {
  const exe = resolveChromiumExecutable();
  if (!exe) {
    fail('Browser binary available', 'run `npx playwright install chromium`');
    return;
  }
  log(c.d(`browser: ${exe}`));
  log(c.d(`target : ${BASE_URL}`));

  const browser = await launchChromium({ headless: process.env.PHSSJ_HEADED !== '1' });
  const { context, page } = await newGuestPage(browser);
  const recorded = attachConsoleRecorder(page);

  try {
    // ── 1. Boot ───────────────────────────────────────────────────
    hdr('Boot');
    const t0 = Date.now();
    await waitForAppReady(page);
    pass('App boots', `${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const title = await page.title();
    title.includes('PHSSJ') ? pass('Document title', title) : fail('Document title', title);

    const gateCount = await page.getByText('Continue as Guest').count();
    gateCount === 0
      ? pass('Guest mode bypasses login gate')
      : fail('Guest mode bypasses login gate', 'login gate still visible');

    (await page.locator('header').first().isVisible())
      ? pass('Header renders')
      : fail('Header renders', 'not visible');

    const navCount = await page.locator('aside nav button').count();
    navCount === VIEWS.length
      ? pass('Sidebar navigation', `${navCount} items`)
      : fail('Sidebar navigation', `expected ${VIEWS.length}, got ${navCount}`);

    await page.screenshot({ path: path.join(ARTIFACTS, '00-home.png') });

    // ── 2. Navigate every view ────────────────────────────────────
    hdr('View navigation');
    for (const view of VIEWS) {
      const nav = page.locator(`#nav-${view.id}`);
      if ((await nav.count()) === 0) {
        fail(`${view.label} view`, 'nav button missing');
        continue;
      }
      const before = recorded.errors.length;
      await nav.click();
      // Wait for the view's async data to land instead of a fixed sleep, so we
      // never measure (or pass on) the loading skeleton.
      const mainText = await waitForStableMain(page);
      const newErrors = recorded.errors
        .slice(before)
        .filter(e => !isIgnorableConsoleError(e.text));

      if (!view.marker.test(mainText)) {
        fail(`${view.label} view`, 'expected content not found');
      } else if (newErrors.length > 0) {
        fail(`${view.label} view`, `console error: ${newErrors[0].text.slice(0, 80)}`);
      } else {
        pass(`${view.label} view`, `${mainText.trim().length} chars rendered`);
      }
      await page.screenshot({ path: path.join(ARTIFACTS, `view-${view.id}.png`) });
    }
    // ── 3. Theme toggle ───────────────────────────────────────────
    hdr('Theme');
    // Header renders aria-label/title as "Switch to dark mode" | "Switch to light mode".
    const themeBtn = page.locator('header button[aria-label^="Switch to" i]').first();
    if ((await themeBtn.count()) === 0) {
      fail('Theme toggle present', 'button not found in header');
    } else {
      const darkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      await themeBtn.click();
      await page.waitForTimeout(450);
      const darkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      const stored = await page.evaluate(() => localStorage.getItem('theme'));
      darkBefore !== darkAfter
        ? pass('Dark mode toggles', `${darkBefore} -> ${darkAfter}`)
        : fail('Dark mode toggles', 'class on <html> did not change');
      stored === (darkAfter ? 'dark' : 'light')
        ? pass('Theme persisted to localStorage', stored)
        : fail('Theme persisted to localStorage', String(stored));
      await themeBtn.click();
      await page.waitForTimeout(350);
    }

    // ── 4. Reload resilience ──────────────────────────────────────
    hdr('Reload');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const reloaded = await page.locator('#root').innerText().catch(() => '');
    reloaded.trim().length > 20
      ? pass('App re-renders after reload')
      : fail('App re-renders after reload', '#root is empty');

    // ── 5. Responsive layout ──────────────────────────────────────
    hdr('Mobile layout (390x844)');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const hamburger = page.locator('header button[aria-label="Open navigation"]');
    if ((await hamburger.count()) === 0) {
      fail('Mobile hamburger', 'not found');
    } else {
      (await hamburger.isVisible())
        ? pass('Mobile hamburger visible')
        : fail('Mobile hamburger visible', 'hidden at 390px wide');
      await hamburger.click();
      await page.waitForTimeout(500);
      (await page.locator('aside').first().isVisible())
        ? pass('Mobile sidebar opens')
        : fail('Mobile sidebar opens', 'sidebar still hidden');
      await page.screenshot({ path: path.join(ARTIFACTS, 'mobile-nav.png') });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (err) {
    fail('E2E run', (err && err.message) || String(err));
    await page.screenshot({ path: path.join(ARTIFACTS, 'crash.png') }).catch(() => {});
  } finally {
    if (process.env.PHSSJ_KEEP_OPEN !== '1') {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  reportConsole(recorded);
}

/**
 * Wait until the main region's text length stops growing, so a data-heavy view
 * is measured after its async fetch has landed rather than on the loading
 * skeleton. Returns the settled text.
 *
 * A fixed sleep made Student Records report ~950 chars (the skeleton) instead
 * of ~11,400 (the 857-row register), which hid real regressions.
 */
async function waitForStableMain(page, { settleMs = 600, maxMs = 12000, minChars = 40 } = {}) {
  const deadline = Date.now() + maxMs;
  let last = -1;
  let stableSince = Date.now();
  let text = '';
  while (Date.now() < deadline) {
    text = await page.locator('main').first().innerText().catch(() => '');
    if (text.length !== last) {
      last = text.length;
      stableSince = Date.now();
    } else if (text.length >= minChars && Date.now() - stableSince >= settleMs) {
      return text;
    }
    await page.waitForTimeout(200);
  }
  return text;
}

function reportConsole(recorded) {
  hdr('Console hygiene');
  const real = recorded.errors.filter(e => !isIgnorableConsoleError(e.text));
  if (real.length === 0) {
    pass('No application console errors', `${recorded.warnings.length} warning(s) seen`);
    return;
  }
  [...new Set(real.map(e => e.text))].slice(0, 8)
    .forEach(t => fail('Console error', t.slice(0, 160)));
}

function summary() {
  log(`\n${c.b(c.cy('══════════════════════════════════'))}`);
  log(`  ${c.g(`${passed} passed`)}${failed ? c.r(`  ${failed} failed`) : ''}`);
  if (failures.length) {
    log(c.r('\n  Failed:'));
    failures.forEach(f => log(c.r(`    • ${f.t}: ${f.d}`)));
  }
  log('');
}

main()
  .then(() => { summary(); process.exitCode = failed > 0 ? 1 : 0; })
  .catch(err => { console.error('Crash:', err); process.exitCode = 2; });
