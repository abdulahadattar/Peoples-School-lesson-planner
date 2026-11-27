#!/usr/bin/env node
/**
 * Focused diagnostic: why does Student Records not load?
 *
 * Dumps the rendered view text, every console message, and the status of each
 * network request the view makes (Sheets / Firestore / auth), for a given
 * origin. Unlike e2e-smoke.mjs this does NOT filter third-party errors -
 * filtering is exactly what hid the real problem.
 *
 *   TEST_BASE_URL=https://... node scripts/diagnose-records.mjs
 */
import fs from 'fs';
import path from 'path';
import { launchChromium, newGuestPage, waitForAppReady } from './lib/browser.mjs';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ARTIFACTS = path.resolve(import.meta.dirname, '..', 'test-artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const tag = BASE.includes('vercel.app') ? 'live' : 'local';
const out = [];
const say = (m = '') => { out.push(m); process.stdout.write(m + '\n'); };

const browser = await launchChromium();
const { context, page } = await newGuestPage(browser);

const console_ = [];
const requests = [];

page.on('console', m => console_.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => console_.push({ type: 'pageerror', text: e.message }));
page.on('response', async (res) => {
  const url = res.url();
  if (!/google|sheets|firebase|firestore|googleapis|firebaseapp/i.test(url)) return;
  let body = '';
  try { body = (await res.text()).slice(0, 300); } catch { /* ignore */ }
  requests.push({ status: res.status(), url: url.slice(0, 160), body });
});

try {
  say(`\n=== Student Records diagnostic: ${BASE} ===`);
  await waitForAppReady(page, BASE, 60000);

  // Student Records needs a Google account in the real app; report which
  // state we are in so a "no data" result is not misread as a bug.
  const signedIn = await page.evaluate(() => !!document.querySelector('header img[alt]'));
  say(`signed-in avatar present: ${signedIn}  (false => guest, Sheets/Firestore reads will be blocked)`);

  await page.locator('#nav-records').click();
  await page.waitForTimeout(9000);

  const text = await page.locator('main').first().innerText().catch(() => '');
  say(`\n--- rendered view (${text.length} chars) ---`);
  say(text.slice(0, 900));

  // The decisive check: are there actually student rows in the table?
  const rowInfo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('main table tbody tr')];
    const sample = rows.slice(0, 5).map(r =>
      [...r.querySelectorAll('td')].slice(0, 4).map(td => td.innerText.trim()).join(' | ')
    );
    return { rowCount: rows.length, sample };
  });
  say(`\n--- table rows: ${rowInfo.rowCount} ---`);
  rowInfo.sample.forEach(s => say(`  ${s}`));
  if (rowInfo.rowCount === 0) say('  !! NO STUDENT ROWS RENDERED - the register is empty in the DOM');
  else say('  student rows are present in the DOM');

  await page.screenshot({ path: path.join(ARTIFACTS, `records-${tag}.png`), fullPage: false });

  say(`\n--- network responses (${requests.length}) ---`);
  for (const r of requests) {
    say(`  [${r.status}] ${r.url}`);
    if (r.status >= 400 && r.body) say(`        ${r.body.replace(/\s+/g, ' ').slice(0, 240)}`);
  }

  const errors = console_.filter(m => m.type === 'error' || m.type === 'pageerror');
  say(`\n--- console errors (${errors.length}) ---`);
  [...new Set(errors.map(e => e.text))].slice(0, 12).forEach(t => say(`  ${t.slice(0, 300)}`));

  const warnings = console_.filter(m => m.type === 'warning');
  say(`\n--- console warnings (${warnings.length}) ---`);
  [...new Set(warnings.map(e => e.text))].slice(0, 8).forEach(t => say(`  ${t.slice(0, 220)}`));
} finally {
  fs.writeFileSync(path.join(ARTIFACTS, `records-${tag}.txt`), out.join('\n'));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
