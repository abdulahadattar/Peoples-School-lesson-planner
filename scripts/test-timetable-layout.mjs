#!/usr/bin/env node
/**
 * Timetable sheet layout detector tests.
 *
 * The timetable is a hand-maintained display grid, so every write has to be
 * driven by the detector rather than by hardcoded ranges. These tests fetch the
 * REAL public CSV export of all 12 tabs, parse it with a small RFC4180 parser
 * (the title cell is quoted and contains an embedded newline, which is exactly
 * what shifts every row number by one when the CSV is split naively on lines),
 * and assert the detected layout per tab.
 *
 * Live ground truth after a correct CSV parse (all 12 tabs):
 *   row 1        title (two lines on 11 of 12 tabs, single line on IX)
 *   row 2        header: S.no | Time | Monday..Saturday (VII adds "Friday Time")
 *   rows 3-6     periods 1-4
 *   row 7        "Break-Time 10:50 to 11:20" (layout row, not a period)
 *   rows 8-10    periods 5-7
 *   row 11+      blank, the "Friday Schedule:" footnote, (VII) teacher table
 *
 * Usage: node --import tsx scripts/test-timetable-layout.mjs
 */
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m` };
let passed = 0, failed = 0;
const pass = (n, d = '') => { passed++; console.log(`  ${c.g('PASS')} ${n}${d ? c.d(' — ' + d) : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`  ${c.r('FAIL')} ${n}${c.r(' — ' + d)}`); };
const check = (ok, n, d = '') => (ok ? pass(n, d) : fail(n, d));
const eq = (actual, expected, n) => check(Object.is(actual, expected), n, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
const same = (actual, expected, n) =>
  check(Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected), n, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

const layout = await import('../services/timetableSheetLayout.ts');
const { detectLayout, colLetter, colIndex0, cellRef, readCell } = layout;
const { TIMETABLE_SHEET_TABS, timetableCsvUrl } = await import('../services/timetableSheetConfig.ts');

/* ------------------------------------------------------------------ *
 * CSV parsing
 * ------------------------------------------------------------------ */

/** RFC4180-ish parser: quoted fields may contain commas and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchGrid(tab) {
  const res = await fetch(timetableCsvUrl(tab.gid));
  if (!res.ok) throw new Error(`HTTP ${res.status} for tab ${tab.name}`);
  return parseCsv(await res.text());
}

console.log('\nCSV parser (the title cell is quoted and holds a newline)');
{
  const rows = parseCsv('"Time Table IV-A\nMiss Daniya",,,\nS.no.,Time,Monday\n1,8:15 to 8:50,"Urdu, Sindhi"\n');
  eq(rows.length, 3, 'an embedded newline does not split the row');
  eq(rows[0][0], 'Time Table IV-A\nMiss Daniya', 'the embedded newline is kept inside the title cell');
  eq(rows[2][2], 'Urdu, Sindhi', 'a quoted comma stays inside one field');
}

console.log('\nColumn letters');
eq(colLetter(0), 'A', "colLetter(0) === 'A'");
eq(colLetter(25), 'Z', "colLetter(25) === 'Z'");
eq(colLetter(26), 'AA', "colLetter(26) === 'AA'");
eq(colLetter(27), 'AB', "colLetter(27) === 'AB'");
eq(colIndex0('A'), 0, "colIndex0('A') === 0");
eq(colIndex0('AA'), 26, "colIndex0('AA') === 26");
eq(colLetter(colIndex0('AZ')), 'AZ', 'colLetter/colIndex0 round-trip (AZ)');
eq(colIndex0('!!'), -1, 'colIndex0 rejects punctuation instead of throwing');
eq(colIndex0('12'), -1, 'colIndex0 rejects digits instead of throwing');
eq(colIndex0(''), -1, 'colIndex0 rejects an empty string instead of throwing');

console.log('\nreadCell trims and collapses whitespace');
{
  const grid = [['  Science  '], ['a\r\nb']];
  eq(readCell(grid, 1, 0), 'Science', 'trailing and leading spaces are trimmed');
  eq(readCell(grid, 2, 0), 'a b', 'internal whitespace runs collapse to one space');
  eq(readCell(grid, 99, 0), '', 'an out-of-range row reads as empty');
  eq(readCell(grid, 1, 99), '', 'an out-of-range column reads as empty');
  eq(readCell(null, 1, 0), '', 'a null grid reads as empty');
}

console.log('\nDegenerate grids never throw');
{
  for (const [name, grid] of [
    ['empty array', []],
    ['grid of empty rows', [[], [], []]],
    ['garbage strings', [['@@@', '###'], [null, 42, { a: 1 }], [undefined]]],
    ['header only', [['S.no.', 'Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']]],
    ['no header at all', [['a', 'b', 'c'], ['d', 'e', 'f']]],
    ['not an array', 'nope'],
  ]) {
    let out = null, threw = null;
    try { out = detectLayout(grid); } catch (err) { threw = err; }
    check(threw === null && out && Array.isArray(out.periodRows) && Array.isArray(out.ignoredRows) && Array.isArray(out.warnings),
      `${name} returns a layout instead of throwing`, threw ? String(threw && threw.message) : `warnings=${out && out.warnings.length}`);
  }
  const g = detectLayout([]);
  eq(g.headerRow, 0, 'an empty grid reports headerRow 0');
  same(g.periodRows, [], 'an empty grid reports no period rows');
  check(g.warnings.length > 0, 'an empty grid still reports a warning');
  check(typeof cellRef(g, 3, 'mon') === 'string', 'cellRef on an empty layout returns a string');
}

console.log('\nHeader is detected, not assumed');
{
  // The header is on sheet row 5 here, and the grid has no S.no. header.
  const grid = [
    ['Time Table X-A'],
    ['some note'],
    ['blank'],
    ['blank'],
    ['', 'Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ['1', '8:15 to 8:50', 'Urdu', 'Urdu', 'Urdu', 'Urdu', 'Urdu', 'Urdu'],
    ['Break-Time 10:50 to 11:20', '', '', '', '', '', '', ''],
    ['2', '11:20 to 12:00', 'Sci', 'Sci', 'Sci', 'Sci', 'Sci', 'Sci'],
  ];
  const l = detectLayout(grid);
  eq(l.headerRow, 5, 'the header row is found by scanning, not assumed to be row 2');
  eq(l.snoColumnIndex, null, 'a blank S.no. header reports snoColumnIndex null');
  eq(l.timeColumnIndex, 1, 'the time column is the one headed "Time"');
  same(l.periodRows, [6, 8], 'period rows are found past a break row');
  check(l.breakRows.includes(7), 'the break row is reported');
  eq(l.classLabel, 'X-A', 'the class label is parsed from the title');
  eq(l.teacher, '', 'no teacher in a single-word title is reported as empty');
}

console.log('\nUnrecognised header cells are flagged, never guessed');
{
  const grid = [
    ['Time Table Test Grid'],
    ['S.no.', 'Time', 'Monday', 'Sunday', 'Tuesday', 'Subject', 'Wednesday'],
    ['1', '8:15 to 8:50', 'Urdu', 'X', 'Sci', 'Group A', 'Eng'],
  ];
  const l = detectLayout(grid);
  eq(l.columns.mon, 2, 'Monday maps to its own column');
  eq(l.columns.tue, 4, 'Tuesday maps to its own column');
  check(l.columns.sun === undefined, 'Sunday is not mapped to a day key');
  check(l.columns.sat === undefined, 'a missing Saturday column is omitted, not guessed');
  check(l.warnings.some((w) => /Sunday column .* ignored/.test(w)), 'the Sunday column is warned about', l.warnings.join(' | '));
  check(l.warnings.some((w) => /unknown header cell 'Subject'/.test(w)), 'an unknown header cell is warned about');
  eq(cellRef(l, 3, 'sat'), '', 'cellRef returns empty for a day with no column');
}

console.log('\n"Friday Time" is a time column, not a Friday column');
{
  const grid = [
    ['Time Table Friday-Test'],
    ['S.no.', 'Time', 'Friday Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ['1', '8:15 to 8:50', '8:15 to 8:50', 'Maths', 'Maths', 'Maths', 'Maths', 'Maths', 'Maths'],
  ];
  const l = detectLayout(grid);
  eq(l.hasFridayTimeColumn, true, 'hasFridayTimeColumn is true');
  eq(l.columns.fri, 7, 'the Friday subject column is column H, not the "Friday Time" column');
  eq(l.columns.mon, 3, 'Monday is column D when the Friday Time column is present');
  eq(l.timeColumnIndex, 1, 'the primary time column is still column B');
  check(l.warnings.some((w) => /unknown header cell 'Friday Time'/.test(w)), 'the extra time column is warned about');
}

console.log('\nLive tabs');
const EXPECTED_PERIOD_ROWS = [3, 4, 5, 6, 8, 9, 10];
const facts = [];
for (const tab of TIMETABLE_SHEET_TABS) {
  console.log(`\n  ${c.y(tab.name)}`);
  let grid = null, layout = null;
  try {
    grid = await fetchGrid(tab);
    layout = detectLayout(grid);
  } catch (err) {
    fail(`${tab.name}: CSV fetch`, String(err && err.message));
    continue;
  }

  const rows = layout.periodRows;
  facts.push({
    tab: tab.name,
    title: layout.title.replace(/\n/g, ' / '),
    classLabel: layout.classLabel,
    teacher: layout.teacher,
    header: layout.headerRow,
    periods: rows.length,
    periodRows: rows.join(','),
    breaks: layout.breakRows.join(','),
    mon: layout.columns.mon,
    time: colLetter(layout.timeColumnIndex),
    sno: layout.snoColumnIndex === null ? '-' : colLetter(layout.snoColumnIndex),
    friTime: layout.hasFridayTimeColumn ? 'yes' : 'no',
    lastRow: layout.lastPeriodRow,
    ignored: layout.ignoredRows.length,
    gridRows: grid.length,
    warnings: layout.warnings,
  });

  eq(layout.headerRow, 2, `${tab.name}: header row is 2`);
  eq(rows.length, 7, `${tab.name}: 7 period rows`);
  same(rows, EXPECTED_PERIOD_ROWS, `${tab.name}: period rows are 3,4,5,6,8,9,10`);
  eq(layout.firstPeriodRow, 3, `${tab.name}: firstPeriodRow is 3`);
  eq(layout.lastPeriodRow, 10, `${tab.name}: lastPeriodRow is 10`);
  check(layout.breakRows.includes(7), `${tab.name}: the Break-Time row 7 is detected`, `breakRows=${layout.breakRows.join(',')}`);
  check(layout.breakRows.every((r) => !rows.includes(r)), `${tab.name}: no break row is also a period row`);
  const leaked = layout.ignoredRows.filter((r) => rows.includes(r));
  check(leaked.length === 0, `${tab.name}: no ignored row is ever a period row`, leaked.length ? `leaked ${leaked.join(',')}` : `${layout.ignoredRows.length} ignored rows`);
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
    check(typeof layout.columns[day] === 'number', `${tab.name}: ${day} column mapped`);
  }
  const periodTimes = rows.map((r) => readCell(grid, r, layout.timeColumnIndex));
  check(periodTimes.every((t) => /\d{1,2}:\d{2}/.test(t)), `${tab.name}: every period row has a time range`, periodTimes.join(' | '));
  check(layout.classLabel.length > 0, `${tab.name}: class label parsed`, layout.classLabel);
  check(layout.teacher.length > 0, `${tab.name}: teacher parsed`, layout.teacher);

  // The contradicting footnote must never be a period row and never writable.
  const footnoteRow = grid.findIndex((row) => row.some((cell) => /^Friday Schedule/i.test(String(cell).trim())));
  check(footnoteRow >= 0, `${tab.name}: the "Friday Schedule:" footnote exists`);
  if (footnoteRow >= 0) {
    const r1 = footnoteRow + 1;
    check(!rows.includes(r1), `${tab.name}: the footnote row ${r1} is not a period row`);
    check(layout.ignoredRows.includes(r1), `${tab.name}: the footnote row ${r1} is in ignoredRows`, `ignored=${layout.ignoredRows.join(',')}`);
  }
  // Nothing after the grid may be writable.
  check(layout.ignoredRows.includes(grid.length), `${tab.name}: the last grid row ${grid.length} is ignored`);
  // Trailing-space subject values must read back equal to their trimmed form.
  const firstSubject = readCell(grid, 3, layout.columns.mon);
  check(firstSubject === firstSubject.trim() && firstSubject.length > 0, `${tab.name}: subject cells are trimmed`, firstSubject);
  check(cellRef(layout, 3, 'mon') === `${colLetter(layout.columns.mon)}3`, `${tab.name}: cellRef is a bare A1`, cellRef(layout, 3, 'mon'));
}

console.log('\nTab VII quirk: extra Friday Time column');
{
  const vii = facts.find((f) => f.tab === 'VII');
  check(!!vii && vii.friTime === 'yes', 'VII reports hasFridayTimeColumn', vii ? vii.friTime : 'missing');
  check(!!vii && vii.mon === 3, 'VII Monday is column D (index 3)', vii ? `index ${vii.mon}` : 'missing');
  check(!!vii && vii.ignored >= 16, 'VII ignores the footnote and the teacher table', vii ? `${vii.ignored} ignored rows` : 'missing');
}
console.log('\nTab IV-A baseline and XII quirk');
{
  const iva = facts.find((f) => f.tab === 'IV-A');
  const xii = facts.find((f) => f.tab === 'XII');
  check(!!iva && iva.mon === 2, 'IV-A Monday is column C (index 2)', iva ? `index ${iva.mon}` : 'missing');
  check(!!iva && iva.sno === 'A', 'IV-A has an S.no. header in column A', iva ? iva.sno : 'missing');
  check(!!xii && xii.sno === '-', 'XII has no S.no. header (snoColumnIndex null)', xii ? xii.sno : 'missing');
  check(!!xii && xii.mon === 2, 'XII Monday is column C (index 2)', xii ? `index ${xii.mon}` : 'missing');
  const ix = facts.find((f) => f.tab === 'IX');
  check(!!ix && ix.sno === 'A', 'IX "S.No" header is recognised', ix ? ix.sno : 'missing');
}

console.log('\nDetected layout per live tab');
console.log(c.d('  tab    class  title                              teacher              hdr  per  periodRows         break  mon  time  sno  fri  ignored'));
for (const f of facts) {
  console.log(
    c.d('  ') + f.tab.padEnd(6) + f.classLabel.padEnd(7) + f.title.slice(0, 32).padEnd(33) + f.teacher.slice(0, 21).padEnd(21) +
    String(f.header).padStart(3) + String(f.periods).padStart(5) + f.periodRows.padEnd(19) + f.breaks.padEnd(7) +
    String(f.mon).padStart(4) + f.time.padStart(6) + f.sno.padStart(5) + f.friTime.padStart(5) + String(f.ignored).padStart(9),
  );
  for (const w of f.warnings) console.log(c.d('         ! ') + w);
}

console.log(`\n${failed === 0 ? c.g('ALL PASS') : c.r('FAILURES')} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
