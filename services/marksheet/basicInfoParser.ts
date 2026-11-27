import { DEFAULT_MARKSHEET_CONFIG } from './config';
import {
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  SubjectKey,
} from './types';

function normText(val: unknown): string {
  return String(val ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const SUBJECT_ALIASES: Record<SubjectKey, string[]> = {
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

function decodeExcelDateCell(raw: string): string {
  const num = Number(raw);
  if (Number.isFinite(num) && num > 30000 && num < 70000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(num) * 86400000);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`;
  }
  return raw;
}

export function extractBasicInformationConfig(
  rows: unknown[][],
  base: MarksheetConfig = DEFAULT_MARKSHEET_CONFIG
): Partial<MarksheetConfig> | null {
  let looksLikeConfig = false;
  const patch: Partial<MarksheetConfig> = {};
  const teachers: Record<MarksheetGradeLevel, string> = { ...base.classTeachers };
  let activeSection: MarksheetExamType | null = null;
  let gradeCols: Array<{ grade: MarksheetGradeLevel; col: number }> = [
    { grade: 'IX', col: 13 },
    { grade: 'X', col: 15 },
    { grade: 'XI', col: 17 },
    { grade: 'XII', col: 19 },
  ];
  const maxMarksClone: MarksheetConfig['subjectMaxMarks'] = JSON.parse(
    JSON.stringify(base.subjectMaxMarks)
  );

  let isReportCardTab = false;
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = (rows[rIdx] || []).map((c) => String(c ?? '').trim());
    const joined = row.join(' ').toLowerCase();
    if (joined.includes('report card') || joined.includes('g.r. no')) {
      isReportCardTab = true;
    }
    if (
      joined.includes('active grading system') ||
      joined.includes('selected grading system') ||
      joined.includes('pre board marks') ||
      joined.includes('mid-term marks')
    ) {
      looksLikeConfig = true;
    }

    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const lower = row[cIdx].toLowerCase();
      const nextVal = row.slice(cIdx + 1).find((v) => v !== '') || '';

      if (lower.startsWith('school name') && nextVal) patch.schoolName = nextVal;
      if (lower.startsWith('school details') && nextVal) {
        patch.schoolAddress = nextVal;
        const boardCandidate = rows[rIdx + 1]?.[cIdx + 2] ?? rows[rIdx + 1]?.[cIdx + 1];
        const boardStr = String(boardCandidate ?? '').trim();
        if (boardStr && boardStr.toLowerCase().includes('board')) {
          patch.boardName = boardStr;
        }
      }
      if (lower.startsWith('academic year') && nextVal) patch.academicYear = nextVal;
      if (lower.startsWith('school reopen date') && nextVal) {
        patch.reopenDate = decodeExcelDateCell(nextVal);
      }
      if (
        lower.startsWith('total working days') &&
        Number.isFinite(Number(nextVal)) &&
        Number(nextVal) > 0
      ) {
        patch.totalWorkingDays = Number(nextVal);
      }
      if (lower.startsWith('principal name') && nextVal) patch.principalName = nextVal;
      if (lower.startsWith('selected grading system') && nextVal) {
        patch.activeGradingSystem = nextVal.toLowerCase().includes('classic') ? 'classic' : 'zueb';
      }
    }

    // Class teachers table: works whether grade sits at col 0 or col 1
    for (const cOffset of [0, 1]) {
      const gradeCell = row[cOffset];
      const teacherCell = row[cOffset + 1];
      if (
        (gradeCell === 'IX' || gradeCell === 'X' || gradeCell === 'XI' || gradeCell === 'XII') &&
        teacherCell &&
        !teacherCell.toLowerCase().includes('mark') &&
        !teacherCell.toLowerCase().includes('ziauddin')
      ) {
        teachers[gradeCell] = teacherCell;
      }
    }

    if (joined.includes('pre board marks')) activeSection = 'preboard';
    else if (joined.includes('mock test marks')) activeSection = 'mock';
    else if (joined.includes('mid-term marks')) activeSection = 'midterm';

    // Auto-detect Grade IX / X / XI / XII header column offset (col 12 vs col 13)
    const detectedPairs: Array<{ grade: MarksheetGradeLevel; col: number }> = [];
    row.forEach((cell, idx) => {
      const low = cell.toLowerCase().trim();
      if (low === 'grade ix') detectedPairs.push({ grade: 'IX', col: idx });
      else if (low === 'grade x') detectedPairs.push({ grade: 'X', col: idx });
      else if (low === 'grade xi') detectedPairs.push({ grade: 'XI', col: idx });
      else if (low === 'grade xii') detectedPairs.push({ grade: 'XII', col: idx });
    });
    if (detectedPairs.length >= 2) {
      gradeCols = detectedPairs;
    }

    if (activeSection) {
      for (const { grade, col } of gradeCols) {
        const subjRaw = normText(row[col]);
        const val = Number(row[col + 1]);
        if (!subjRaw || !Number.isFinite(val) || val <= 0) continue;
        for (const [key, aliases] of Object.entries(SUBJECT_ALIASES) as Array<[SubjectKey, string[]]>) {
          if (aliases.includes(subjRaw)) {
            maxMarksClone[activeSection][grade][key] = val;
          }
        }
      }
    }
  }

  if (!looksLikeConfig || isReportCardTab) return null;
  patch.classTeachers = teachers;
  patch.subjectMaxMarks = maxMarksClone;
  return patch;
}
