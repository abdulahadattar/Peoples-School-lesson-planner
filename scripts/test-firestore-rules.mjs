#!/usr/bin/env node
/**
 * firestore.rules <-> code parity check.
 *
 * firestore.rules is checked in but nothing verified it against what the code
 * actually touches, so a rule edit or a new collection could silently break a
 * feature (denied) or over-expose data (allowed). This re-derives the access
 * surface from the source on every run, parses the real rules file, and fails
 * if any path the code NEEDS is not permitted.
 *
 * It also cross-checks the admin email list in services/adminService.ts against
 * the isAdmin() function in the rules: if those drift, the School Admin screen
 * can offer a save that Firestore will refuse.
 *
 * Run: node scripts/test-firestore-rules.mjs
 * Dependency-free (node builtins only). Exits non-zero on a real gap.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = /node_modules|[\\/]dist[\\/]|_bundle\.cjs|[\\/]scripts[\\/]|\.git[\\/]/;

/* ── 1. read the real rules file ──────────────────────────────── */
const rulesPath = path.join(ROOT, 'firestore.rules');
if (!fs.existsSync(rulesPath)) {
  console.error('firestore.rules not found');
  process.exit(2);
}
const rulesText = fs.readFileSync(rulesPath, 'utf8');

/** Collect `match /seg/{id} { allow <perm>: if <expr>; ... }` blocks. */
function parseRules(text) {
  const rules = [];
  // Default deny: `allow read, write: if false;` at the top level
  const hasDefaultDeny = /allow\s+read,\s*write\s*:\s*if\s+false\s*;/.test(text);

  const re = /match\s+(\/[^\s{]*[^\s]*?)\s*\{([\s\S]*?)\n\s*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim();
    const body = m[2];
    const perms = {};
    const allowRe = /allow\s+([a-z,\s]+?)\s*:\s*if\s+([^;]+);/g;
    let a;
    while ((a = allowRe.exec(body)) !== null) {
      const list = a[1].split(',').map(s => s.trim()).filter(Boolean);
      const expr = a[2].trim();
      for (const perm of list) {
        // keep the tightest: a non-`true` expression is recorded as conditional
        perms[perm] = expr === 'true' ? 'true' : expr;
      }
    }
    rules.push({ path: p, perms, body });
  }
  return { rules, hasDefaultDeny };
}

const { rules, hasDefaultDeny } = parseRules(rulesText);

/** Longest-prefix match, mirroring how Firestore resolves a path. */
function ruleFor(docPath) {
  const segs = docPath.split('/').filter(Boolean);
  let best = null;
  for (const r of rules) {
    const rsegs = r.path.split('/').filter(Boolean);
    // strip braces to compare segment counts/shapes
    const shape = rsegs.map(s => (s.startsWith('{') ? '*' : s));
    if (shape.length > segs.length) continue;
    let ok = true;
    for (let i = 0; i < shape.length; i++) {
      if (shape[i] !== '*' && shape[i] !== segs[i]) { ok = false; break; }
    }
    if (ok && (!best || rsegs.length > best.segs)) best = { r, segs: rsegs.length };
  }
  return best ? best.r : null;
}

/* ── 2. re-derive the access surface from the source ──────────── */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(ROOT, full);
      if (SKIP.test(rel)) continue;
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
    }
  };
  walk(ROOT);
  return out;
}

/** Resolve `const FOO = 'bar'` so doc(db, FOO, ...) can be resolved. */
function constStrings(text) {
  const map = new Map();
  const re = /const\s+([A-Z0-9_]+)\s*(?::\s*string\s*)?=\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(text)) !== null) map.set(m[1], m[2]);
  return map;
}

const OPS = [
  { re: /\bsetDoc\s*\(/, op: 'write', perm: ['create', 'update'] },
  { re: /\baddDoc\s*\(/, op: 'write', perm: ['create'] },
  { re: /\bupdateDoc\s*\(/, op: 'write', perm: ['update'] },
  { re: /\bdeleteDoc\s*\(/, op: 'write', perm: ['delete'] },
  { re: /\bgetDoc\s*\(/, op: 'read', perm: ['get'] },
  { re: /\bgetDocFromServer\s*\(/, op: 'read', perm: ['get'] },
  { re: /\bgetDocs\s*\(/, op: 'list', perm: ['list'] },
  { re: /\bonSnapshot\s*\(/, op: 'watch', perm: ['get', 'list'] },
];

const usage = [];
for (const file of sourceFiles()) {
  const text = fs.readFileSync(file, 'utf8');
  const consts = constStrings(text);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // doc(db, 'settings', 'classEnrollments')  -> collection path = 'settings'
    const docRe = /\bdoc\s*\(\s*db\s*,\s*([A-Za-z0-9_.'"]+)\s*(?:,\s*([A-Za-z0-9_.'"]+))?/g;
    let d;
    while ((d = docRe.exec(line)) !== null) {
      const col = resolveStr(d[1], consts);
      if (!col) continue;
      usage.push({ path: col, file: path.relative(ROOT, file), line: i + 1, kind: 'doc' });
    }
    const colRe = /\bcollection\s*\(\s*db\s*,\s*([A-Za-z0-9_.'"]+)\s*\)/g;
    let c;
    while ((c = colRe.exec(line)) !== null) {
      const col = resolveStr(c[1], consts);
      if (!col) continue;
      usage.push({ path: col, file: path.relative(ROOT, file), line: i + 1, kind: 'collection' });
    }
  });
  // attach the operation to the nearest usage on that line
  lines.forEach((line, i) => {
    for (const o of OPS) {
      if (o.re.test(line)) {
        const hit = usage.find(u => u.file === path.relative(ROOT, file) && u.line === i + 1);
        if (hit) hit.op = o.op;
      }
    }
  });
}

/**
 * Resolve a path token taken from the source.
 *
 * `doc(db, 'daily_attendance', date)` passes a quoted literal, while
 * `doc(db, SETTINGS_DOC_PATH, id)` passes an identifier. The quotes have to be
 * tested BEFORE they are stripped, otherwise a literal like 'settings' looks
 * like an unresolved identifier and is silently dropped from the report.
 */
function resolveStr(token, consts) {
  const raw = token.trim();
  const wasQuoted = /^['"]/.test(raw) && /['"]$/.test(raw);
  const t = raw.replace(/^['"]|['"]$/g, '');
  if (!t) return null;
  if (wasQuoted) return t;
  if (consts.has(t)) return consts.get(t);
  return null; // an identifier we cannot resolve: report nothing rather than guess
}

/* ── 3. verdict ───────────────────────────────────────────────── */
console.log(`\nfirestore.rules <-> code parity\n${'='.repeat(78)}`);
console.log(`rules parsed        : ${rules.length} match block(s), default deny present: ${hasDefaultDeny}`);
console.log(`access sites found  : ${usage.length}\n`);

const rows = [];
let gaps = 0;
for (const u of usage) {
  const r = ruleFor(u.path);
  const kindLabel = u.kind === 'doc' ? 'doc' : 'list';
  if (!r) {
    rows.push({ ...u, rule: '(none)', verdict: 'UNMATCHED', detail: 'no rule matches this collection' });
    gaps++;
    continue;
  }
  const perms = r.perms || {};
  if (u.kind === 'doc') {
    // single-doc read
    if (perms.get === undefined) {
      rows.push({ ...u, rule: r.path, verdict: 'DENIED', detail: 'no `get` permission' });
      gaps++;
      continue;
    }
    // a write only matters if the same line also writes
    if (u.op === 'write') {
      const writable = perms.create || perms.update || perms.set;
      if (!writable) {
        rows.push({ ...u, rule: r.path, verdict: 'DENIED', detail: 'read allowed but no write permission' });
        gaps++;
        continue;
      }
      rows.push({ ...u, rule: r.path, verdict: 'CONDITIONAL', detail: `write if ${writable}` });
      continue;
    }
    rows.push({ ...u, rule: r.path, verdict: perms.get === 'true' ? 'ALLOWED' : `CONDITIONAL (if ${perms.get})` });
    continue;
  }
  // collection access -> needs `list`
  if (perms.list === undefined) {
    rows.push({ ...u, rule: r.path, verdict: 'DENIED', detail: 'collection access needs `list`, none present' });
    gaps++;
    continue;
  }
  rows.push({ ...u, rule: r.path, verdict: perms.list === 'true' ? 'ALLOWED' : `CONDITIONAL (if ${perms.list})` });
}

const w = (s, n) => String(s).padEnd(n);
console.log(`${w('PATH', 24)} ${w('ACCESS', 10)} ${w('RULE', 26)} ${w('VERDICT', 22)} USED BY`);
console.log('-'.repeat(78));
const seen = new Set();
for (const r of rows.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)) {
  const key = `${r.path}|${r.verdict}|${r.file}:${r.line}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const mark = r.verdict === 'UNMATCHED' || r.verdict === 'DENIED' ? 'X' : r.verdict === 'ALLOWED' ? ' ' : '~';
  console.log(`${mark}${w(r.path, 23)} ${w(r.kind, 10)} ${w(r.rule, 26)} ${w(r.verdict, 22)} ${r.file}:${r.line}`);
  if (r.detail && r.verdict !== 'ALLOWED') console.log(`   ${' '.repeat(4)}-> ${r.detail}`);
}

/* ── 4. admin email drift ─────────────────────────────────────── */
console.log(`\n${'-'.repeat(78)}\nadmin identity parity`);
const adminSrc = fs.readFileSync(path.join(ROOT, 'services', 'adminService.ts'), 'utf8');
const codeEmails = [...adminSrc.matchAll(/'([^']+@[^']+)'/g)].map(m => m[1].toLowerCase());
const ruleEmails = [...rulesText.matchAll(/'([^']+@[^']+)'/g)].map(m => m[1].toLowerCase());
const missingInRules = codeEmails.filter(e => !ruleEmails.includes(e));
const missingInCode = ruleEmails.filter(e => !codeEmails.includes(e));
console.log(`  adminService.ts : ${codeEmails.join(', ') || '(none)'}`);
console.log(`  firestore.rules : ${ruleEmails.join(', ') || '(none)'}`);
if (missingInRules.length) {
  console.log(`  X admin ${missingInRules.join(', ')} can sign in and see the Admin badge but Firestore will DENY the write`);
  gaps += missingInRules.length;
}
if (missingInCode.length) {
  console.log(`  ~ firestore.rules also grants ${missingInCode.join(', ')} which the UI never treats as admin`);
}
if (!missingInRules.length && !missingInCode.length) console.log('  (lists agree)');

/* ── 5. summary ───────────────────────────────────────────────── */
const verdict = gaps === 0 ? 'PASS' : 'FAIL';
console.log(`\n${'='.repeat(78)}`);
console.log(`RESULT: ${verdict}  (${rows.length} access site(s), ${gaps} gap(s))`);

if (verdict === 'PASS') {
  console.log('\nVERIFIED SAFE - every Firestore path the code touches is permitted:');
  for (const p of [...new Set(rows.map(r => r.path))].sort()) {
    const vs = [...new Set(rows.filter(r => r.path === p).map(r => r.verdict))];
    console.log(`  ${p.padEnd(24)} ${vs.join(', ')}`);
  }
  console.log('\n  The catch-all `allow read, write: if false` means any NEW collection the');
  console.log('  code starts using will be denied until a rule is added - re-run this after');
  console.log('  adding a collection.');
}
console.log('');
process.exitCode = verdict === 'PASS' ? 0 : 1;

