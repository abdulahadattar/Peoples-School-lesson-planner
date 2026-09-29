#!/usr/bin/env node
/**
 * Reads the live register and reports a specific student's current values, and
 * can verify a change landed. Used to prove the in-app edit actually writes to
 * Google Sheets (and to revert after a test).
 *
 * Usage: node scripts/inspect-register.mjs <grNo>
 */
const SHEET = 'https://docs.google.com/spreadsheets/d/11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0/export?format=csv&gid=1397470354';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const gr = process.argv[2];
const res = await fetch(SHEET);
if (!res.ok) { console.error('HTTP', res.status); process.exit(1); }
const rows = parseCsv(await res.text());
const header = rows[0];

// Column R (index 17) is GR# per the fix: metadata occupies A-Q.
const GR_IDX = 17;
const idx = (name) => header.findIndex((h) => h.trim().toUpperCase() === name.toUpperCase());

const dataRows = rows.slice(1).filter((r) => r[GR_IDX] && r[GR_IDX].trim() !== '');
const match = dataRows.find((r) => r[GR_IDX].trim() === String(gr));

if (!match) {
  console.log(`GR# ${gr} not found among ${dataRows.length} students`);
  console.log('sample GR numbers:', dataRows.slice(0, 8).map((r) => r[GR_IDX]).join(', '));
  process.exit(1);
}

console.log(`GR# ${gr} found (${dataRows.length} students total)`);
const fields = [
  'NAME OF STUDENT', 'B.FORM NO.', 'FATHER / GUARDIAN NAME', 'GENDER',
  'CLASS', 'SECTION', 'RESIDENTIAL ADDRESS', 'PARENT  GUARDIAN CONTACT',
  'EMERGENCY CONTACT', 'RELIGION', 'STATUS',
];
for (const f of fields) {
  const i = idx(f);
  if (i === -1) continue;
  console.log(`  [${String(i).padStart(2)}] ${f.padEnd(26)} = ${JSON.stringify(match[i] ?? '')}`);
}
console.log(`\n  metadata A-Q = ${JSON.stringify(match.slice(0, 17))}`);
