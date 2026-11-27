export const DEFAULT_SPREADSHEET_ID = '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0';
export const DEFAULT_GID = '1397470354';
export const DEFAULT_SHEET_TITLE = 'Jamshoro South Final SPD (2)';
export const DEFAULT_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0/edit?gid=1397470354#gid=1397470354';
export const ATTENDANCE_SPREADSHEET_ID = '1J5eEmFnpqzgrNCZkV0e3bYOdTBE2B-pjczeBq_OYfbA';

export interface StudentRecord {
  rowNumber: number; // 1-based row index in the spreadsheet (header is row 1)
  rawMetadata?: string[]; // cols 0 to 16 preserved (optional in compact mode)

  // Visible columns requested for school record:
  grNo: string; // Col 17: GR#
  studentName: string; // Col 18: NAME OF STUDENT
  bFormNo: string; // Col 19: B.FORM NO.
  fatherName: string; // Col 20: FATHER / GUARDIAN NAME
  gender: string; // Col 21: GENDER
  dobDay: string; // Col 22: DD
  dobMonth: string; // Col 23: MM
  dobYear: string; // Col 24: YYYY
  classAdmitted: string; // Col 25: CLASS ADMITTED
  currentClass: string; // Col 26: CURRENT CLASS
  parentCnic: string; // Col 27: PARENT/GUARDIANCNICNO
  religion: string; // Col 28: RELIGION
  address: string; // Col 29: RESIDENTIAL ADDRESS
  parentContact: string; // Col 30: PARENT  GUARDIAN CONTACT
  emergencyContact: string; // Col 31: EMERGENCY CONTACT
  admissionDay: string; // Col 32: DD2
  admissionMonth: string; // Col 33: MM3
  admissionYear: string; // Col 34: YYYY4
  section: string; // Col 35: SECTION
  partnerContact: string; // Col 36: PARTNER CONTACT NUMBER
  shift: string; // Col 37: SHIFT
  medium: string; // Col 38: MEDIUM OF INSTRUCTION -
  picture: string; // Col 39: PICTURE
  status: string; // Col 40: STATUS
}

export const VISIBLE_COLUMNS = [
  { key: 'grNo', label: 'GR#', colIdx: 17, required: true },
  { key: 'studentName', label: 'NAME OF STUDENT', colIdx: 18, required: true },
  { key: 'bFormNo', label: 'B.FORM NO.', colIdx: 19 },
  { key: 'fatherName', label: 'FATHER / GUARDIAN NAME', colIdx: 20, required: true },
  { key: 'gender', label: 'GENDER', colIdx: 21 },
  { key: 'dobDay', label: 'DD', colIdx: 22 },
  { key: 'dobMonth', label: 'MM', colIdx: 23 },
  { key: 'dobYear', label: 'YYYY', colIdx: 24 },
  { key: 'classAdmitted', label: 'CLASS ADMITTED', colIdx: 25 },
  { key: 'currentClass', label: 'CURRENT CLASS', colIdx: 26, required: true },
  { key: 'parentCnic', label: 'PARENT/GUARDIANCNICNO', colIdx: 27 },
  { key: 'religion', label: 'RELIGION', colIdx: 28 },
  { key: 'address', label: 'RESIDENTIAL ADDRESS', colIdx: 29 },
  { key: 'parentContact', label: 'PARENT  GUARDIAN CONTACT', colIdx: 30 },
  { key: 'emergencyContact', label: 'EMERGENCY CONTACT', colIdx: 31 },
  { key: 'admissionDay', label: 'DD2', colIdx: 32 },
  { key: 'admissionMonth', label: 'MM3', colIdx: 33 },
  { key: 'admissionYear', label: 'YYYY4', colIdx: 34 },
  { key: 'section', label: 'SECTION', colIdx: 35 },
  { key: 'partnerContact', label: 'PARTNER CONTACT NUMBER', colIdx: 36 },
  { key: 'shift', label: 'SHIFT', colIdx: 37 },
  { key: 'medium', label: 'MEDIUM OF INSTRUCTION -', colIdx: 38 },
  { key: 'picture', label: 'PICTURE', colIdx: 39 },
  { key: 'status', label: 'STATUS', colIdx: 40 },
] as const;

export interface FetchSheetResult {
  records: StudentRecord[];
  spreadsheetId: string;
  gid: string;
  sheetTitle: string;
  lastSynced: Date;
  isLive: boolean;
  schoolMetadata?: string[];
  fromCache?: boolean;
}

export interface EnrollmentSummaryResult {
  totalEnrolled: number;
  totalBoys: number;
  totalGirls: number;
  classCounts: Record<string, { boys: number; girls: number; total: number }>;
  count: number;
}

export interface BatchRecordWriteFailure {
  rowNumber: number;
  message: string;
}

export interface BatchRecordWriteResult {
  updated: number;
  failures: BatchRecordWriteFailure[];
  requests: number;
}

export type SheetsWriteErrorKind = 'auth' | 'scope' | 'permission' | 'quota' | 'unknown';
