import {
  CodeOfConduct,
  GradeBand,
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  SubjectKey,
} from './types';

export const MARKSHEET_SPREADSHEET_ID = '1n3tS_K5RKRtEC3zNfO_g5wloQElN6i2t2dIleBhVqSs';
export const MARKSHEET_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1n3tS_K5RKRtEC3zNfO_g5wloQElN6i2t2dIleBhVqSs/edit?usp=sharing';

const SPREADSHEET_ID_PATTERN = /^[a-zA-Z0-9-_]{10,120}$/;
const SPREADSHEET_URL_PATTERN = /\/spreadsheets\/d\/([a-zA-Z0-9-_]{10,120})/;

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(SPREADSHEET_URL_PATTERN);
  if (urlMatch?.[1]) return urlMatch[1];
  if (SPREADSHEET_ID_PATTERN.test(trimmed)) return trimmed;
  return null;
}

export function buildSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;
}

export function getStoredMarksheetSpreadsheetId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('phssj_school_config');
      if (raw) {
        const parsed = JSON.parse(raw) as { marksheetSpreadsheetId?: string };
        const extracted = extractSpreadsheetId(parsed?.marksheetSpreadsheetId || '');
        if (extracted) return extracted;
      }
    }
  } catch {
    // Fallback to default
  }
  return MARKSHEET_SPREADSHEET_ID;
}

export const SUBJECT_LABELS: Record<SubjectKey, string> = {
  english: 'English',
  chemistry: 'Chemistry',
  physics: 'Physics',
  islamicStudies: 'Islamic Studies',
  pakistanStudies: 'Pakistan Studies',
  sindhi: 'Sindhi',
  urdu: 'Urdu',
  biology: 'Biology',
  ict: 'ICT',
  mathematics: 'Mathematics',
};

export const EXAM_TYPE_LABELS: Record<MarksheetExamType, string> = {
  midterm: 'Mid-Term Examination',
  mock: 'Mock Test',
  preboard: 'Pre-Board Examination',
};

export const CODE_OF_CONDUCT_OPTIONS: CodeOfConduct[] = [
  'Satisfactory',
  'Average',
  'Unsatisfactory',
];

export const ZUEB_GRADING_SCALE: GradeBand[] = [
  { minPct: 96, maxPct: 100, grade: 'A++', remarks: 'Extraordinary', displayRange: '96 - 100' },
  { minPct: 91, maxPct: 95, grade: 'A+', remarks: 'Exceptional', displayRange: '91 - 95' },
  { minPct: 86, maxPct: 90, grade: 'A', remarks: 'Outstanding', displayRange: '86 - 90' },
  { minPct: 81, maxPct: 85, grade: 'B++', remarks: 'Excellent', displayRange: '81 - 85' },
  { minPct: 76, maxPct: 80, grade: 'B+', remarks: 'Very Good', displayRange: '76 - 80' },
  { minPct: 71, maxPct: 75, grade: 'B', remarks: 'Good', displayRange: '71 - 75' },
  { minPct: 61, maxPct: 70, grade: 'C+', remarks: 'Fairly Good', displayRange: '61 - 70' },
  { minPct: 51, maxPct: 60, grade: 'C', remarks: 'Above Average', displayRange: '51 - 60' },
  { minPct: 40, maxPct: 50, grade: 'D', remarks: 'Emerging', displayRange: '40 - 50' },
  { minPct: 0, maxPct: 39, grade: 'U', remarks: 'Ungraded', displayRange: 'Below 40' },
];

export const CLASSIC_GRADING_SCALE: GradeBand[] = [
  { minPct: 80, maxPct: 100, grade: 'A1', remarks: 'Outstanding', displayRange: '80 - 100' },
  { minPct: 70, maxPct: 79, grade: 'A', remarks: 'Excellent', displayRange: '70 - 79' },
  { minPct: 60, maxPct: 69, grade: 'B', remarks: 'Very Good', displayRange: '60 - 69' },
  { minPct: 50, maxPct: 59, grade: 'C', remarks: 'Good', displayRange: '50 - 59' },
  { minPct: 40, maxPct: 49, grade: 'D', remarks: 'Fair', displayRange: '40 - 49' },
  { minPct: 33, maxPct: 39, grade: 'E', remarks: 'Satisfactory', displayRange: '33 - 39' },
  { minPct: 0, maxPct: 32, grade: 'Fail', remarks: 'Needs Improvement', displayRange: '0 - 32' },
];

export const DEFAULT_MARKSHEET_CONFIG: MarksheetConfig = {
  schoolName: "People's Higher Secondary School Jamshoro",
  schoolAddress: 'Sindh University Housing Society, Phase 1',
  boardName: 'Ziauddin University Examination Board',
  academicYear: '2026-27',
  division: '',
  reopenDate: '8/1/2026',
  totalWorkingDays: 244,
  principalName: 'Arsala Mewati',
  activeGradingSystem: 'zueb',
  classTeachers: {
    IX: 'Abdul Ahad',
    X: 'Rajab',
    XI: 'Bahadur',
    XII: 'Kamran',
  },
  subjectMaxMarks: {
    midterm: {
      IX: {
        english: 50,
        chemistry: 50,
        physics: 50,
        islamicStudies: 50,
        sindhi: 50,
        urdu: 50,
        biology: 50,
        ict: 50,
        mathematics: 50,
      },
      X: {
        english: 50,
        chemistry: 50,
        physics: 50,
        pakistanStudies: 50,
        sindhi: 50,
        urdu: 50,
        biology: 50,
        ict: 50,
        mathematics: 50,
      },
      XI: {
        english: 25,
        chemistry: 25,
        physics: 25,
        islamicStudies: 25,
        sindhi: 25,
        urdu: 25,
        biology: 25,
        mathematics: 25,
      },
      XII: {
        english: 25,
        chemistry: 25,
        physics: 25,
        pakistanStudies: 25,
        sindhi: 25,
        urdu: 25,
        biology: 25,
        mathematics: 25,
      },
    },
    mock: {
      IX: {
        english: 85,
        chemistry: 75,
        physics: 60,
        islamicStudies: 75,
        sindhi: 75,
        urdu: 75,
        biology: 75,
        ict: 75,
        mathematics: 75,
      },
      X: {
        english: 85,
        chemistry: 75,
        physics: 60,
        pakistanStudies: 75,
        sindhi: 75,
        urdu: 75,
        biology: 75,
        ict: 75,
        mathematics: 75,
      },
      XI: {
        english: 85,
        chemistry: 100,
        physics: 85,
        islamicStudies: 75,
        sindhi: 100,
        urdu: 100,
        biology: 100,
        mathematics: 100,
      },
      XII: {
        english: 85,
        chemistry: 85,
        physics: 85,
        pakistanStudies: 75,
        sindhi: 100,
        urdu: 100,
        biology: 100,
        mathematics: 100,
      },
    },
    preboard: {
      IX: {
        english: 85,
        chemistry: 75,
        physics: 75,
        islamicStudies: 75,
        sindhi: 75,
        urdu: 75,
        biology: 85,
        ict: 75,
        mathematics: 75,
      },
      X: {
        english: 85,
        chemistry: 75,
        physics: 75,
        pakistanStudies: 75,
        sindhi: 75,
        urdu: 75,
        biology: 85,
        ict: 75,
        mathematics: 75,
      },
      XI: {
        english: 85,
        chemistry: 100,
        physics: 100,
        islamicStudies: 75,
        sindhi: 100,
        urdu: 100,
        biology: 100,
        mathematics: 100,
      },
      XII: {
        english: 85,
        chemistry: 85,
        physics: 100,
        pakistanStudies: 75,
        sindhi: 100,
        urdu: 100,
        biology: 100,
        mathematics: 100,
      },
    },
  },
};

export const GRADE_ORDER: Record<MarksheetGradeLevel, number> = {
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};
