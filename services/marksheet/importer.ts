import * as XLSX from 'xlsx';
import type { StudentRecord } from '../sheets/types';
import { DEFAULT_MARKSHEET_CONFIG, SUBJECT_LABELS } from './config';
import { normalizeGradeLevel, resolveActiveSubjects } from './calculations';
import {
  extractBasicInformationConfig,
  isResultSheetLayout,
  parseResultSheetAllExams,
} from './resultSheetParser';
import {
  CodeOfConduct,
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  StudentMarkEntry,
  SubjectKey,
} from './types';

function getXlsx(): typeof XLSX {
  const mod = XLSX as any;
  return mod?.default?.read ? mod.default : XLSX;
}

function normHeader(val: unknown): string {
  return String(val ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export const SUBJECT_HEADER_ALIASES: Record<SubjectKey, string[]> = {
  english: ['english', 'eng'],
  chemistry: ['chemistry', 'chem'],
  physics: ['physics', 'phy'],
  islamicStudies: ['islamicstudies', 'islamiat', 'islamiyat', 'islamic', 'isl'],
  pakistanStudies: ['pakistanstudies', 'pakstudies', 'pst', 'pakstudy'],
  sindhi: ['sindhi', 'sin'],
  urdu: ['urdu'],
  biology: ['biology', 'bio'],
  ict: ['ict', 'computer', 'computerscience', 'cs'],
  mathematics: ['mathematics', 'maths', 'math'],
};

function inferGradeFromSheetName(sheetName: string): MarksheetGradeLevel | null {
  const upper = sheetName.toUpperCase();
  if (/\bXII\b|\b12\b/.test(upper)) return 'XII';
  if (/\bXI\b|\b11\b/.test(upper)) return 'XI';
  if (/\bIX\b|\b9\b/.test(upper)) return 'IX';
  if (/\bX\b|\b10\b/.test(upper)) return 'X';
  return null;
}

function parseScoreCell(raw: unknown): number | 'A' | null | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s || s === '-' || s === '—' || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') {
    return undefined;
  }
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

export function extractConfigFromMatrix(
  rows: unknown[][],
  base: MarksheetConfig = DEFAULT_MARKSHEET_CONFIG
): Partial<MarksheetConfig> | null {
  return extractBasicInformationConfig(rows, base);
}

export interface WorkbookImportResult {
  entries: StudentMarkEntry[];
  configPatch: Partial<MarksheetConfig> | null;
  detectedSheets: string[];
  skippedRows: number;
}

export function parseMarksheetMatrix(
  rows: unknown[][],
  sheetName: string,
  defaultExamType: MarksheetExamType
): { entries: StudentMarkEntry[]; skippedRows: number } {
  let headerRowIdx = -1;
  let colMap: {
    grNo?: number;
    studentName?: number;
    fatherName?: number;
    currentClass?: number;
    section?: number;
    gender?: number;
    daysPresent?: number;
    codeOfConduct?: number;
    teacherRemarks?: number;
    subjects: Partial<Record<SubjectKey, number>>;
  } = { subjects: {} };

  const scanLimit = Math.min(rows.length, 20);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r] || [];
    const candidate: typeof colMap = { subjects: {} };

    row.forEach((cell, idx) => {
      const h = normHeader(cell);
      if (!h) return;
      if (['gr', 'grno', 'grnum', 'grnumber', 'grn'].includes(h)) candidate.grNo = idx;
      else if (['studentname', 'nameofstudent', 'name', 'fullname'].includes(h)) candidate.studentName = idx;
      else if (['fathername', 'fathersname', 'fatherguardianname', 'guardianname'].includes(h)) candidate.fatherName = idx;
      else if (['class', 'grade', 'currentclass', 'std'].includes(h)) candidate.currentClass = idx;
      else if (['section', 'div', 'division'].includes(h)) candidate.section = idx;
      else if (['gender', 'sex'].includes(h)) candidate.gender = idx;
      else if (['dayspresent', 'presentdays', 'daysattended', 'attendance'].includes(h)) candidate.daysPresent = idx;
      else if (['codeofconduct', 'conduct'].includes(h)) candidate.codeOfConduct = idx;
      else if (['remarks', 'teacherremarks', 'comments'].includes(h)) candidate.teacherRemarks = idx;
      else {
        for (const [subjKey, aliases] of Object.entries(SUBJECT_HEADER_ALIASES) as Array<[SubjectKey, string[]]>) {
          if (aliases.includes(h) && candidate.subjects[subjKey] === undefined) {
            candidate.subjects[subjKey] = idx;
          }
        }
      }
    });

    const subjectMatchCount = Object.keys(candidate.subjects).length;
    if (candidate.grNo !== undefined && (subjectMatchCount >= 1 || candidate.studentName !== undefined)) {
      headerRowIdx = r;
      colMap = candidate;
      break;
    }
  }

  if (headerRowIdx === -1 || colMap.grNo === undefined) {
    return { entries: [], skippedRows: 0 };
  }

  const inferredClass = inferGradeFromSheetName(sheetName);
  const entries: StudentMarkEntry[] = [];
  let skippedRows = 0;

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawGr = String(row[colMap.grNo] ?? '').trim();
    if (!rawGr) continue;

    const scores: Partial<Record<SubjectKey, number | 'A' | null>> = {};
    for (const [subjKey, colIdx] of Object.entries(colMap.subjects) as Array<[SubjectKey, number]>) {
      const parsed = parseScoreCell(row[colIdx]);
      if (parsed !== undefined) scores[subjKey] = parsed;
    }

    const rawClass =
      colMap.currentClass !== undefined ? String(row[colMap.currentClass] ?? '').trim() : '';
    const resolvedGrade = normalizeGradeLevel(rawClass) || inferredClass;
    if (!resolvedGrade && Object.keys(scores).length === 0) {
      skippedRows++;
      continue;
    }

    const daysVal =
      colMap.daysPresent !== undefined ? Number(String(row[colMap.daysPresent] ?? '').trim()) : NaN;

    entries.push({
      grNo: rawGr,
      studentName: colMap.studentName !== undefined ? String(row[colMap.studentName] ?? '').trim() : undefined,
      fatherName: colMap.fatherName !== undefined ? String(row[colMap.fatherName] ?? '').trim() : undefined,
      currentClass: resolvedGrade || rawClass || undefined,
      section: colMap.section !== undefined ? String(row[colMap.section] ?? '').trim() : undefined,
      gender: colMap.gender !== undefined ? String(row[colMap.gender] ?? '').trim() : undefined,
      scores,
      daysPresent: Number.isFinite(daysVal) && daysVal >= 0 ? daysVal : undefined,
      codeOfConduct: colMap.codeOfConduct !== undefined ? parseConduct(row[colMap.codeOfConduct]) : undefined,
      teacherRemarks:
        colMap.teacherRemarks !== undefined ? String(row[colMap.teacherRemarks] ?? '').trim() : undefined,
      examType: defaultExamType,
      updatedAt: Date.now(),
    });
  }

  return { entries, skippedRows };
}

export function importMarksheetWorkbook(
  data: ArrayBuffer | Uint8Array | string,
  defaultExamType: MarksheetExamType
): WorkbookImportResult {
  const xlsx = getXlsx();
  const wb =
    typeof data === 'string'
      ? xlsx.read(data, { type: 'string' })
      : xlsx.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: 'array' });

  const allEntries: StudentMarkEntry[] = [];
  let configPatch: Partial<MarksheetConfig> | null = null;
  let skippedRows = 0;

  for (const sheetName of wb.SheetNames) {
    const lowerName = sheetName.toLowerCase();
    if (lowerName.includes('combined') || lowerName.includes('report card')) {
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    const maybeConfig = extractConfigFromMatrix(rows);
    if (maybeConfig) {
      configPatch = { ...(configPatch || {}), ...maybeConfig };
      continue;
    }
    if (lowerName.includes('result sheet') || isResultSheetLayout(rows)) {
      allEntries.push(...parseResultSheetAllExams(rows));
      continue;
    }
    const parsed = parseMarksheetMatrix(rows, sheetName, defaultExamType);
    allEntries.push(...parsed.entries);
    skippedRows += parsed.skippedRows;
  }

  return {
    entries: allEntries,
    configPatch,
    detectedSheets: wb.SheetNames,
    skippedRows,
  };
}

export function downloadMarksheetExcelTemplate(
  students: StudentRecord[],
  entriesMap: Record<string, StudentMarkEntry>,
  examType: MarksheetExamType,
  config: MarksheetConfig
): void {
  const xlsx = getXlsx();
  const wb = xlsx.utils.book_new();
  const grades: MarksheetGradeLevel[] = ['IX', 'X', 'XI', 'XII'];

  for (const grade of grades) {
    const subjects: SubjectKey[] =
      grade === 'IX'
        ? ['english', 'chemistry', 'physics', 'islamicStudies', 'sindhi', 'urdu', 'biology', 'ict', 'mathematics']
        : grade === 'X'
          ? ['english', 'chemistry', 'physics', 'pakistanStudies', 'sindhi', 'urdu', 'biology', 'ict', 'mathematics']
          : grade === 'XI'
            ? ['english', 'chemistry', 'physics', 'islamicStudies', 'sindhi', 'urdu', 'biology', 'mathematics']
            : ['english', 'chemistry', 'physics', 'pakistanStudies', 'sindhi', 'urdu', 'biology', 'mathematics'];

    const headers = [
      'GR No',
      'Student Name',
      'Father Name',
      'Class',
      'Section',
      ...subjects.map((s) => SUBJECT_LABELS[s]),
      'Days Present',
      'Code of Conduct',
      'Teacher Remarks',
    ];

    const gradeStudents = students.filter(
      (s) =>
        normalizeGradeLevel(s.currentClass) === grade &&
        !(s.status || '').toLowerCase().includes('drop') &&
        !(s.status || '').toLowerCase().includes('left')
    );

    const rows = [
      headers,
      ...gradeStudents.map((st) => {
        const key = `${examType}::${String(st.grNo || '').trim()}`;
        const entry = entriesMap[key];
        const scores = entry?.scores || {};
        // Ensure active selection still matches cleanly
        resolveActiveSubjects(grade, examType, config, entry);
        return [
          st.grNo,
          st.studentName,
          st.fatherName,
          grade,
          st.section || '',
          ...subjects.map((subj) => scores[subj] ?? ''),
          entry?.daysPresent ?? '',
          entry?.codeOfConduct ?? 'Satisfactory',
          entry?.teacherRemarks ?? '',
        ];
      }),
    ];

    const ws = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, `Grade ${grade}`);
  }

  xlsx.writeFile(wb, `PHSSJ_Marksheet_Template_${examType}_${config.academicYear}.xlsx`);
}
