/**
 * wiring-audit.mjs — who imports what, and what nothing imports.
 *
 * `npm run audit:wiring`
 *
 * Builds a module graph from every .ts/.tsx file in the app (excluding
 * node_modules, dist and scripts) and reports, per module:
 *   imports  — how many app files import it, and how many test files do
 *   exports  — how many named exports it declares
 *   used     — how many of those names appear anywhere else in the app
 *
 * A module with no app importer is unreachable from the UI. It is reported as
 * genuinely unreferenced only when no test imports it either; if a test does, it
 * is listed separately, because a suite asserting a function no user can reach
 * is a different problem from dead code.
 *
 * Exports are matched after stripping comments and strings, so a name that only
 * appears in a doc comment does not count as used.
 */
import fs from 'node:fs';
import path from 'node:path';

const APP_ROOTS = ['components', 'services', 'hooks', 'utils', 'types', 'api', 'curriculum', 'data'];
const LOOSE = ['App.tsx', 'index.tsx', 'server.ts'];
/** Tests are not "wiring" - a module only a test imports is still unreachable
 *  by a user, but it is asserted by a suite, so it must be reported separately
 *  rather than lumped in with genuinely dead code. */
const SCRIPT_ROOTS = ['scripts'];

/** True entry points: nothing in the app imports them, by design.
 *  Stored as normalised ids (extension stripped, `/index` collapsed) so they
 *  match the keys in `ids` - otherwise `server.ts` is flagged as dead even
 *  though `npm run dev` runs `tsx server.ts`. */
const ENTRY_POINTS = new Set(['App', 'server', 'index', 'api', 'curriculum', 'types']);

/** Module identity, so `./x`, `./x.js`, `./x.ts` and `./x/index.ts` all agree.
 *  The `.js` case is not hypothetical: `services/app.ts` and `api/index.ts` use
 *  NodeNext-style `.js` specifiers that point at `.ts` sources. Comparing raw
 *  paths made every module imported that way look unreferenced. */
const norm = p => p.split(path.sep).join('/')
  .replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')
  .replace(/\/index$/, '');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const appFiles = [
  ...APP_ROOTS.flatMap(r => walk(r)),
  ...LOOSE.filter(f => fs.existsSync(f)),
];
const testFiles = SCRIPT_ROOTS.flatMap(r => walk(r));

/* Names are matched app-wide, so a symbol used in a component counts even if
 * the importer reaches it through a re-export. */
const corpus = appFiles.map(f => ({ f, src: fs.readFileSync(f, 'utf8') }));
const testCorpus = testFiles.map(f => ({ f, src: fs.readFileSync(f, 'utf8') }));
const ids = new Map(corpus.map(c => [c.f, norm(c.f)]));

/** Strips comments and strings so a name only counts where it is code. */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '""');

function exportedNames(src) {
  const names = new Set();
  const re = /export\s+(?:async\s+)?(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  for (const b of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of b[1].split(',')) {
      const name = (part.includes(' as ') ? part.split(/\s+as\s+/).pop() : part).trim();
      if (/^[A-Za-z0-9_$]+$/.test(name)) names.add(name);
    }
  }
  if (/export\s+default\s+(?:async\s+)?function\s*\(/.test(src) || /export\s+default\s+[A-Za-z0-9_$]+/.test(src)) names.add('default');
  return [...names];
}

const IMPORT_RE = /(?:from\s*|import\s*\()\s*['"`]([^'"`]+)['"`]/g;

/** True when `src` reaches the module identified by `targetId`.
 *  Uses matchAll, not a shared global regex with exec + break: breaking out of
 *  an exec loop leaves `lastIndex` non-zero, so the next file would be scanned
 *  from a stale offset and its importers silently missed. */
function reaches(src, fromFile, targetId) {
  const dir = path.dirname(fromFile).split(path.sep).join('/');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    if (norm(path.posix.normalize(path.posix.join(dir, spec))) === targetId) return true;
  }
  return false;
}

function importersOf(file) {
  const targetId = ids.get(file);
  let app = 0;
  let test = 0;
  for (const { f, src } of corpus) if (f !== file && reaches(src, f, targetId)) app++;
  for (const { f, src } of testCorpus) if (reaches(src, f, targetId)) test++;
  return { app, test };
}

const rows = [];
for (const { f, src } of corpus) {
  const exports_ = exportedNames(src);
  const selfIdx = corpus.findIndex(c => c.f === f);
  const nameRe = name => new RegExp(`(?<![A-Za-z0-9_$.])${name.replace(/\$/g, '\\$')}\\b`);
  const appUses = name => name === 'default' || nameRe(name) && corpus.some((c, i) => i !== selfIdx && nameRe(name).test(strip(c.src)));
  const testUses = name => nameRe(name).test(strip(testCorpus.map(c => c.src).join('\n')));
  const imp = importersOf(f);
  const unused = exports_.filter(n => !appUses(n));
  rows.push({
    file: f.split(path.sep).join('/'),
    id: ids.get(f),
    app: imp.app,
    test: imp.test,
    exports: exports_.length,
    unused,
    unusedButTested: unused.filter(testUses),
  });
}

const isEntry = r => ENTRY_POINTS.has(r.id);
const unreferenced = rows.filter(r => r.app === 0 && !isEntry(r));
const dead = unreferenced.filter(r => r.test === 0 && r.exports > 0);
const testOnly = unreferenced.filter(r => r.test > 0);
const deadExports = rows.filter(r => r.unused.length).sort((a, b) => b.unused.length - a.unused.length);

console.log('\n=== Modules no app file imports (unreferenced) ===');
console.log(dead.length === 0 ? '  none' : dead.map(r => `  ${r.file}  (${r.exports} exports)`).join('\n'));

console.log('\n=== Unreferenced, but a test imports them (no user path) ===');
console.log(testOnly.length === 0 ? '  none' : testOnly.map(r => `  ${r.file}  (${r.exports} exports, ${r.test} test importer(s))`).join('\n'));

console.log('\n=== Exports no app file references ===');
if (deadExports.length === 0) console.log('  none');
for (const r of deadExports.slice(0, 45)) {
  const note = r.unusedButTested.length ? `  [${r.unusedButTested.length} asserted by tests]` : '';
  console.log(`  ${r.file}  (${r.app} app importer(s))${note}\n      ${r.unused.join(', ')}`);
}

const totalExports = rows.reduce((n, r) => n + r.exports, 0);
const totalUnused = rows.reduce((n, r) => n + r.unused.length, 0);
console.log(`\n${totalUnused} of ${totalExports} exported names are not referenced by any other app file.`);
console.log(`Entry points excluded by design: ${[...ENTRY_POINTS].join(', ')}.`);
console.log('An unreferenced module may still be intentional: a dev-only server path or a barrel.');
