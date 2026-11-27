/**
 * Roster integrity check — every timetable cell resolves to the expected
 * teacher(s) via the REAL resolveSlot/resolveTeacher code.
 *
 * Run:  npx esbuild scripts/verify_roster.ts --bundle --platform=node --format=cjs --outfile=/tmp/verify-roster.cjs --log-level=error && node /tmp/verify-roster.cjs
 *
 * Fails loudly when the roster (data/teachers.json) drifts from the
 * timetable (data/timetable.json) — the exact bug class that produced
 * misassigned teachers before the per-subject-section roster.
 */
import { readFileSync } from 'fs';
import { DayKey, resolveSlot } from '../services/timetable';

const teachers = (JSON.parse(readFileSync('data/teachers.json', 'utf-8')) as any).teachers;
const tt = JSON.parse(readFileSync('data/timetable.json', 'utf-8'));

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Spot checks: section + day + periodIndex(0-based) + subject-part → expected teacher name
const SPOTS: Array<[string, string, number, string, string]> = [
  ['X-A', 'mon', 3, 'P.ST', 'Miss Madiha'],
  ['X-A', 'thu', 0, 'P.ST', 'Miss Madiha'],
  ['X-B', 'tue', 5, 'P.ST', 'Miss Madiha'],
  ['XII', 'wed', 4, 'PST', "Ma'am Layla Abrejo"],
  ['XII', 'mon', 5, 'PST', "Ma'am Layla Abrejo"],
  ['IV-A', 'tue', 1, 'Islam', 'Miss Narjis'],
  ['IV-A', 'fri', 3, 'Islam', 'Miss Narjis'],
  ['IV-B', 'mon', 6, 'Islam', 'Miss Shahida'],
  ['IV-B', 'sat', 1, 'Islam', 'Miss Shahida'],
  ['IV-A', 'sat', 1, 'Sci', 'Miss Daniya'],
  ['IV-A', 'mon', 5, 'Sci', 'Miss Daniya'],
  ['IV-B', 'mon', 0, 'Science', 'Miss Fatima Qureshi'],
  ['V', 'mon', 1, 'Maths', 'Miss Daniya'],
  ['VI-B', 'tue', 3, 'Math', 'Sir Atta Muhammad Joyo'],
  ['VII', 'thu', 2, 'LIB', 'Sir Shuhban'],
  ['VII', 'mon', 5, 'LIB', 'Sir Shuhban'],
  ['IV-A', 'tue', 3, 'Eng Lib', 'Sir Hashim'],
  ['IV-A', 'mon', 4, 'Eng Lib', 'Sir Hashim'],
  ['VI-B', 'sat', 3, 'Eng Lib', 'Sir Shuhban'],
  ['VI-B', 'thu', 1, 'Eng Lib', 'Sir Shuhban'],
  ['VIII', 'mon', 3, 'English', 'Sir Shuhban'],
  ['VIII', 'mon', 1, 'Maths', 'Sir Atta Muhammad Joyo'],
  ['VIII', 'mon', 0, 'S.S', 'Miss Madiha'],
  ['VIII', 'mon', 2, 'Science', 'Miss Fatima Qureshi'],
  ['VIII', 'mon', 5, 'Islamiat', 'Miss Shahida'],
  ['VIII', 'mon', 6, 'Sindhi', 'Sir Kamran'],
  ['VIII', 'mon', 4, 'Eng Lib', 'Sir Shuhban'],
  ['VIII', 'sat', 0, 'ICT', 'Sir Faizan Shaikh'],
  ['VIII', 'tue', 0, 'ART', 'Miss Shagufta'],
  ['VIII', 'sat', 2, 'P.E', 'Sir Abdul Karim'],
  ['IX', 'mon', 5, 'Biology / ICT', 'Miss Asra'],
  ['IX', 'mon', 5, 'Biology / ICT', 'Sir Faizan Shaikh'],
  ['X-A', 'mon', 5, 'Asan Urdu / Sindhi', "Ma'am Arsala"],
  ['X-A', 'mon', 5, 'Asan Urdu / Sindhi', 'Sir Kamran'],
  ['XII', 'mon', 0, 'Urdu / Sindhi', 'Sir Feroz'],
  ['XII', 'mon', 0, 'Urdu / Sindhi', 'Sir Kamran'],
  ['XI', 'mon', 1, 'Maths / Biology', 'Sir Bahadur'],
  ['XI', 'mon', 1, 'Maths / Biology', 'Miss Asra'],
  ['XI', 'mon', 0, 'P.E', 'Sir Abdul Karim'],
  ['XI', 'fri', 3, 'Urdu / Asan Urdu', 'Sir Feroz'],
  ['XI', 'fri', 3, 'Urdu / Asan Urdu', "Ma'am Arsala"],
  ['XII', 'wed', 3, 'Physics', 'Sir Abdul Ahad'],
  ['XII', 'mon', 1, 'Chemistry', 'Sir Muhammad Rajab'],
  ['XII', 'wed', 1, 'English', 'Sir Abdul Razzaq'],
  ['V', 'mon', 3, 'Sindhi', 'Miss Aneela'],
  ['V', 'tue', 3, 'Urdu', 'Miss Narjis'],
  ['V', 'tue', 6, 'ISLAMIAT', 'Miss Narjis'],
  ['V', 'mon', 6, 'SCIENCE', 'Miss Narjis'],
  ['V', 'thu', 6, 'ICT', 'Sir Faizan Shaikh'],
  ['VI-A', 'tue', 4, 'Feroz', 'Sir Feroz'],
  ['VI-A', 'mon', 0, 'Sindhi', 'Miss Aneela'],
  ['IX', 'mon', 1, 'English', 'Sir Shuhban'],
  ['IX', 'mon', 3, 'Chemistry', 'Sir Muhammad Rajab'],
  ['XII', 'mon', 3, 'Maths / Biology', 'Miss Asra'],
  ['XII', 'mon', 3, 'Maths / Biology', 'Sir Bahadur'],
  ['X-B', 'mon', 4, 'Biology / ICT', 'Miss Asra'],
  ['X-B', 'mon', 4, 'Biology / ICT', 'Sir Faizan Shaikh'],
  ['IV-B', 'wed', 5, 'ICT', 'Sir Faizan Shaikh'],
];

let pass = 0, fail = 0;

function teacherNames(slot: any): string[] {
  return slot.parts.map((p: any) => p.teacher?.name).filter(Boolean) as string[];
}

// Spot checks
for (const [section, day, periodIdx, cellLabel, expected] of SPOTS) {
  const entry = tt.classes.find((c: any) => c.label === section)!;
  const slot = resolveSlot(entry, day as DayKey, periodIdx, teachers as any);
  const names = teacherNames(slot);
  // For parallel cells, match by part index: find the part whose label contains the expected subject
  const match = slot.parts.some((p: any) =>
    p.subject.toLowerCase().includes(cellLabel.toLowerCase().split(' ')[0].toLowerCase()) &&
    p.teacher?.name === expected,
  );
  const ok = names.includes(expected) || match;
  if (ok) { pass++; }
  else { fail++; console.log(`❌ ${section} ${day} P${periodIdx + 1} "${cellLabel}" → expected ${expected}, got [${names.join(', ')}] (parts: ${slot.parts.map((p: any) => `${p.subject}=${p.teacher?.name ?? '—'}`).join(' | ')})`); }
}

// Full sweep: every non-empty cell should resolve to at least one teacher
let unresolved: string[] = [];
for (const entry of tt.classes) {
  entry.periods.forEach((p: any, i: number) => {
    for (const day of DAYS) {
      const raw = p[day]?.trim();
      if (!raw) continue;
      const slot = resolveSlot(entry, day, i, teachers as any);
      if (slot.parts.some((part: any) => !part.teacher)) {
        unresolved.push(`${entry.label} ${day} P${p.no} "${raw}" → ${slot.parts.map((x: any) => `${x.subject}=${x.teacher?.name ?? 'NO TEACHER'}`).join(' | ')}`);
      }
    }
  });
}

console.log(`\nSpot checks: ${pass} passed, ${fail} failed`);
if (unresolved.length === 0) {
  console.log('Full sweep: every cell resolves to a teacher ✅');
} else {
  console.log(`Full sweep: ${unresolved.length} cells with unresolved parts:`);
  unresolved.slice(0, 25).forEach(u => console.log('  ' + u));
}