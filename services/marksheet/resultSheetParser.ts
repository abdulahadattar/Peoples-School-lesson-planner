import { isHsscGrade, normalizeGradeLevel } from './calculations';
import {
  CodeOfConduct,
  MarksheetExamType,
  MarksheetGradeLevel,
  OptionalElective,
  OptionalLanguage,
  StudentMarkEntry,
  SubjectKey,
} from './types';

export { extractBasicInformationConfig } from './basicInfoParser';

function parseCellScore(raw: unknown): number | 'A' | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s || s === '-' || s === '—' || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') {
    return undefined;
  }
  if (s.startsWith('=')) return undefined;
  const upper = s.toUpperCase();
  if (upper === 'A' || upper === 'AB' || upper === 'ABS' || upper === 'ABSENT') {
    return 'A';
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseConduct(raw: unknown): CodeOfConduct | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'satisfactory') return 'Satisfactory';
  if (s === 'average') return 'Average';
  if (s === 'unsatisfactory') return 'Unsatisfactory';
  return undefined;
}

interface SubjectColOffsets {
  midterm: number;
  mock: number;
  preboard: number;
}

export const DEFAULT_RESULT_SHEET_COLS: {
  subjects: Record<SubjectKey, SubjectColOffsets>;
  totals: Record<MarksheetExamType, number>;
  workingDays: Record<MarksheetExamType | 'total', number>;
  conduct: number;
  fatherName: number;
  remarks: number;
} = {
  subjects: {
    english: { midterm: 4, mock: 7, preboard: 10 },
    mathematics: { midterm: 13, mock: 16, preboard: 19 },
    physics: { midterm: 22, mock: 25, preboard: 28 },
    biology: { midterm: 31, mock: 34, preboard: 37 },
    chemistry: { midterm: 40, mock: 43, preboard: 46 },
    islamicStudies: { midterm: 49, mock: 52, preboard: 55 },
    pakistanStudies: { midterm: 49, mock: 52, preboard: 55 },
    ict: { midterm: 58, mock: 61, preboard: 64 },
    sindhi: { midterm: 67, mock: 70, preboard: 73 },
    urdu: { midterm: 76, mock: 79, preboard: 82 },
  },
  totals: { midterm: 85, mock: 89, preboard: 93 },
  workingDays: { midterm: 98, mock: 99, preboard: 100, total: 101 },
  conduct: 102,
  fatherName: 104,
  remarks: 105,
};

export function isResultSheetLayout(rows: unknown[][]): boolean {
  const r0 = (rows[0] || []).map((c) => String(c ?? '').toLowerCase()).join(' ');
  const r1 = (rows[1] || []).map((c) => String(c ?? '').toLowerCase()).join(' ');
  const r3 = (rows[3] || []).map((c) => String(c ?? '').toLowerCase()).join(' ');
  return (
    (r0.includes('english') && r0.includes('grand total')) ||
    (r1.includes('mid-term') && r1.includes('mock test') && r1.includes('pre board')) ||
    (r3.includes('marks') && r3.includes('grade') && r0.includes('student information'))
  );
}

function cleanOptionalConflicts(
  gradeLevel: MarksheetGradeLevel,
  rawScores: Partial<Record<SubjectKey, number | 'A'>>
): {
  scores: Partial<Record<SubjectKey, number | 'A' | null>>;
  optionalLanguage: OptionalLanguage;
  optionalElective: OptionalElective;
} {
  const scores: Partial<Record<SubjectKey, number | 'A' | null>> = { ...rawScores };
  const hssc = isHsscGrade(gradeLevel);

  const sinVal = rawScores.sindhi;
  const urdVal = rawScores.urdu;
  const sinPos = typeof sinVal === 'number' && sinVal > 0;
  const urdPos = typeof urdVal === 'number' && urdVal > 0;

  let optionalLanguage: OptionalLanguage = 'Sindhi';
  if (urdPos && !sinPos) {
    optionalLanguage = 'Urdu';
    delete scores.sindhi;
  } else if (sinPos && !urdPos) {
    optionalLanguage = 'Sindhi';
    delete scores.urdu;
  } else if (urdVal === 'A' && sinVal !== 'A') {
    optionalLanguage = 'Urdu';
    delete scores.sindhi;
  } else if (sinVal === 'A' && urdVal !== 'A') {
    optionalLanguage = 'Sindhi';
    delete scores.urdu;
  }

  let optionalElective: OptionalElective = 'Biology';
  const bioVal = rawScores.biology;
  const bioPos = typeof bioVal === 'number' && bioVal > 0;

  if (hssc) {
    const mathVal = rawScores.mathematics;
    const mathPos = typeof mathVal === 'number' && mathVal > 0;
    if (mathPos && !bioPos) {
      optionalElective = 'Mathematics';
      delete scores.biology;
    } else if (bioPos && !mathPos) {
      optionalElective = 'Biology';
      delete scores.mathematics;
    } else if (mathVal === 'A' && bioVal !== 'A') {
      optionalElective = 'Mathematics';
      delete scores.biology;
    } else if (bioVal === 'A' && mathVal !== 'A') {
      optionalElective = 'Biology';
      delete scores.mathematics;
    }
  } else {
    const ictVal = rawScores.ict;
    const ictPos = typeof ictVal === 'number' && ictVal > 0;
    if (ictPos && !bioPos) {
      optionalElective = 'ICT';
      delete scores.biology;
    } else if (bioPos && !ictPos) {
      optionalElective = 'Biology';
      delete scores.ict;
    } else if (ictVal === 'A' && bioVal !== 'A') {
      optionalElective = 'ICT';
      delete scores.biology;
    } else if (bioVal === 'A' && ictVal !== 'A') {
      optionalElective = 'Biology';
      delete scores.ict;
    }
  }

  return { scores, optionalLanguage, optionalElective };
}

export function parseResultSheetAllExams(rows: unknown[][]): StudentMarkEntry[] {
  const layout = DEFAULT_RESULT_SHEET_COLS;
  const entries: StudentMarkEntry[] = [];
  const examTypes: MarksheetExamType[] = ['midterm', 'mock', 'preboard'];
  const now = Date.now();

  for (let r = 4; r < rows.length; r++) {
    const row = rows[r] || [];
    const grNo = String(row[1] ?? '').trim();
    const studentName = String(row[2] ?? '').trim();
    const gradeLevel = normalizeGradeLevel(String(row[3] ?? '').trim());
    if (!grNo || !gradeLevel) continue;

    const fatherName = String(row[layout.fatherName] ?? '').trim();
    const codeOfConduct = parseConduct(row[layout.conduct]);
    const rawRemarks = String(row[layout.remarks] ?? '').trim();
    const teacherRemarks = rawRemarks.startsWith('=') ? '' : rawRemarks;

    for (const examType of examTypes) {
      const sheetTotal = Number(row[layout.totals[examType]]);
      const hasSheetTotal = Number.isFinite(sheetTotal) && sheetTotal > 0;

      const rawScores: Partial<Record<SubjectKey, number | 'A'>> = {};
      const subjectKeys: SubjectKey[] = [
        'english',
        'mathematics',
        'physics',
        'biology',
        'chemistry',
        gradeLevel === 'IX' || gradeLevel === 'XI' ? 'islamicStudies' : 'pakistanStudies',
        ...(isHsscGrade(gradeLevel) ? ([] as SubjectKey[]) : (['ict'] as SubjectKey[])),
        'sindhi',
        'urdu',
      ];

      for (const key of subjectKeys) {
        const colIdx = layout.subjects[key]?.[examType];
        if (colIdx === undefined) continue;
        const parsed = parseCellScore(row[colIdx]);
        if (parsed !== undefined) {
          rawScores[key] = parsed;
        }
      }

      const anyPositiveOrAbsent = Object.values(rawScores).some(
        (v) => v === 'A' || (typeof v === 'number' && v > 0)
      );

      // Zeroes across every subject with zero grand total means exam scores have not been entered yet
      const finalRawScores =
        hasSheetTotal || anyPositiveOrAbsent ? rawScores : ({} as Partial<Record<SubjectKey, number | 'A'>>);

      const { scores, optionalLanguage, optionalElective } = cleanOptionalConflicts(
        gradeLevel,
        finalRawScores
      );

      const rawExamDays = Number(row[layout.workingDays[examType]]);
      const rawTotalDays = Number(row[layout.workingDays.total]);
      const daysPresent =
        Number.isFinite(rawExamDays) && rawExamDays > 0
          ? Math.round(rawExamDays)
          : Number.isFinite(rawTotalDays) && rawTotalDays > 0
            ? Math.round(rawTotalDays)
            : null;

      entries.push({
        grNo,
        studentName: studentName || `Student ${grNo}`,
        fatherName,
        currentClass: gradeLevel,
        optionalLanguage,
        optionalElective,
        scores,
        daysPresent,
        codeOfConduct,
        teacherRemarks,
        examType,
        updatedAt: now,
      });
    }
  }

  return entries;
}
