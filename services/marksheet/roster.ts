import type { StudentRecord } from '../sheets/types';
import { GRADE_ORDER } from './config';
import type { MarksheetGradeLevel, MarksheetRosterStudent, StudentMarkEntry } from './types';

export function normalizeGradeLevel(rawClass?: string | null): MarksheetGradeLevel | null {
  if (!rawClass) return null;
  const cleaned = rawClass.toUpperCase().replace(/CLASS|GRADE/g, '').trim();
  const token = cleaned.split(/[\s\-(/]+/)[0];
  if (token === 'IX' || token === '9') return 'IX';
  if (token === 'X' || token === '10') return 'X';
  if (token === 'XI' || token === '11') return 'XI';
  if (token === 'XII' || token === '12') return 'XII';
  return null;
}

export function buildMarksheetRoster(
  sheetRecords: StudentRecord[],
  entriesMap: Record<string, StudentMarkEntry>,
  gradeFilter: 'ALL' | MarksheetGradeLevel = 'ALL',
  searchQuery = ''
): MarksheetRosterStudent[] {
  const byGr = new Map<string, MarksheetRosterStudent>();

  for (const r of sheetRecords) {
    const statusLower = (r.status || '').toLowerCase();
    if (statusLower.includes('drop') || statusLower.includes('left')) continue;

    const gradeLevel = normalizeGradeLevel(r.currentClass);
    if (!gradeLevel) continue;

    const grNo = String(r.grNo || '').trim();
    if (!grNo) continue;

    const dob = [r.dobDay, r.dobMonth, r.dobYear].filter(Boolean).join('/');
    byGr.set(grNo, {
      grNo,
      studentName: (r.studentName || '').trim() || `Student ${grNo}`,
      fatherName: (r.fatherName || '').trim(),
      gradeLevel,
      currentClass: (r.currentClass || gradeLevel).trim(),
      section: (r.section || '').trim(),
      gender: (r.gender || '').trim(),
      dob,
      status: (r.status || '').trim(),
      fromSheet: true,
    });
  }

  for (const entry of Object.values(entriesMap)) {
    const grNo = String(entry.grNo || '').trim();
    if (!grNo) continue;
    const existing = byGr.get(grNo);
    if (existing) {
      if (!existing.fatherName && entry.fatherName?.trim()) {
        existing.fatherName = entry.fatherName.trim();
      }
      if (entry.currentClass) {
        const entryGrade = normalizeGradeLevel(entry.currentClass);
        if (entryGrade) existing.gradeLevel = entryGrade;
      }
      continue;
    }
    const gradeLevel = normalizeGradeLevel(entry.currentClass) || 'IX';
    byGr.set(grNo, {
      grNo,
      studentName: entry.studentName?.trim() || `Student ${grNo}`,
      fatherName: entry.fatherName?.trim() || '',
      gradeLevel,
      currentClass: entry.currentClass?.trim() || gradeLevel,
      section: entry.section?.trim() || '',
      gender: entry.gender?.trim() || '',
      dob: entry.dob?.trim() || '',
      status: 'Live Sheet',
      fromSheet: false,
    });
  }

  let list = Array.from(byGr.values());
  if (gradeFilter !== 'ALL') {
    list = list.filter((s) => s.gradeLevel === gradeFilter);
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (s) =>
        s.grNo.toLowerCase().includes(q) ||
        s.studentName.toLowerCase().includes(q) ||
        s.fatherName.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    const ga = GRADE_ORDER[a.gradeLevel] || 99;
    const gb = GRADE_ORDER[b.gradeLevel] || 99;
    if (ga !== gb) return ga - gb;
    const na = Number(a.grNo);
    const nb = Number(b.grNo);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.grNo.localeCompare(b.grNo);
  });

  return list;
}
