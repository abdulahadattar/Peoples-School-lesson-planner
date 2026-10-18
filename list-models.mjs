#!/usr/bin/env node
// list-models.mjs — print the real, live Gemini model IDs a key can use.
import fs from 'node:fs';

const FILE = process.argv[2] || '.env.local';
const text = fs.readFileSync(FILE, 'utf-8');
const key = (text.match(/AIza[0-9A-Za-z\-_]{35}/g) || [])[0];
if (!key) { console.error('No key found in ' + FILE); process.exit(1); }

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
  signal: AbortSignal.timeout(20000),
});
const body = await res.json();
if (!res.ok) { console.error(res.status, body?.error?.message); process.exit(1); }

const rows = (body.models || [])
  .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
  .map((m) => ({
    id: m.name.replace(/^models\//, ''),
    display: m.displayName || '',
    in: (m.inputTokenLimit || 0),
    out: (m.outputTokenLimit || 0),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

console.log(`${rows.length} models supporting generateContent:\n`);
for (const r of rows) console.log(`  ${r.id.padEnd(42)} ${r.display}`);
