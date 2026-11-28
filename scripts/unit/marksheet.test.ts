import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { DEFAULT_MARKSHEET_CONFIG } from '../../services/marksheet/config';
import {
  buildMarksheetRoster,
  computeStudentMarksheet,
  formatMarksheetPdfFilename,
  getCombinedMarksheetTitle,
  getGradeForPercentage,
  normalizeGradeLevel,
} from '../../services/marksheet/calculations';
import { importMarksheetWorkbook } from '../../services/marksheet/importer';
import {
  generateBatchMarksheetPdf,
  generateSingleMarksheetPdf,
} from '../../services/marksheet/pdfGenerator';
import type { StudentRecord } from '../../services/sheets/types';
import type { MarksheetRosterStudent, StudentMarkEntry } from '../../services/marksheet/types';

function getXlsxLib(): typeof XLSX {
  const mod = XLSX as any;
  return mod?.default?.utils ? mod.default : XLSX;
}

test('imports the SEF Mid-Term Grade IX-XII CSV configuration faithfully', () => {
  const rawCsv = [
    ',IX,Abdul Ahad',
    ',X,Rajab,,,,,,,Total Working Days:,244',
    ',XI,Bahadur',
    ',XII,Kamran',
    ',School Name:,People\'s Higher Secondary School Jamshoro',
    ',Academic Year:,2026-27,,,Principal Name:,Arsala Mewati',
    'Selected Grading System:,ZUEB',
    ',,,,,,,,,,,,Mid-Term Marks',
    ',,,,,,,,,,,,Grade IX,,Grade X,,Grade XI,,Grade XII',
    ',,,,,,,,,,,,English,50,English,50,English,25,English,25',
    ',,,,,,,,,,,,Pre Board Marks',
    ',,,,,,,,,,,,Chemistry,100,Chemistry,100,Chemistry,100,Chemistry,100',
  ].join('\n');
  const res = importMarksheetWorkbook(rawCsv, 'midterm');

  assert.ok(res.configPatch, 'Expected attached settings CSV to produce a configPatch');
  assert.equal(res.configPatch.schoolName, "People's Higher Secondary School Jamshoro");
  assert.equal(res.configPatch.academicYear, '2026-27');
  assert.equal(res.configPatch.totalWorkingDays, 244);
  assert.equal(res.configPatch.principalName, 'Arsala Mewati');
  assert.deepEqual(res.configPatch.classTeachers, {
    IX: 'Abdul Ahad',
    X: 'Rajab',
    XI: 'Bahadur',
    XII: 'Kamran',
  });
  assert.equal(res.configPatch.subjectMaxMarks?.midterm.IX.english, 50);
  assert.equal(res.configPatch.subjectMaxMarks?.midterm.XI.english, 25);
  assert.equal(res.configPatch.subjectMaxMarks?.preboard.XI.chemistry, 100);
});

test('grading scales, grade normalization, and filename formatting work accurately', () => {
  assert.equal(normalizeGradeLevel('Class 9-A'), 'IX');
  assert.equal(normalizeGradeLevel('10'), 'X');
  assert.equal(normalizeGradeLevel('XI (Pre-Medical)'), 'XI');
  assert.equal(normalizeGradeLevel('Grade XII'), 'XII');
  assert.equal(normalizeGradeLevel('VIII'), null);

  assert.equal(getGradeForPercentage(97, 'zueb').grade, 'A++');
  assert.equal(getGradeForPercentage(86, 'zueb').grade, 'A');
  assert.equal(getGradeForPercentage(39, 'zueb').grade, 'U');

  assert.equal(getGradeForPercentage(82, 'classic').grade, 'A1');
  assert.equal(getGradeForPercentage(35, 'classic').grade, 'E');
  assert.equal(getGradeForPercentage(31, 'classic').grade, 'Fail');

  assert.equal(getCombinedMarksheetTitle('IX', 'midterm'), 'SSC-I Mid-Term Marksheet');
  assert.equal(getCombinedMarksheetTitle('X', 'midterm'), 'SSC-II Mid-Term Marksheet');
  assert.equal(getCombinedMarksheetTitle('XI', 'mock'), 'HSSC-I Mock Test Marksheet');
  assert.equal(getCombinedMarksheetTitle('XII', 'preboard'), 'HSSC-II Pre-Board Marksheet');

  assert.equal(formatMarksheetPdfFilename('4', 'Ibrar Ali'), '4_Ibrar_Ali.pdf');
  assert.equal(formatMarksheetPdfFilename('102/A', 'Sana & Khan'), '102_A_Sana_Khan.pdf');
});

test('computes combined SSC & HSSC marksheets with optional subjects and absent handling', () => {
  const sscStudent: MarksheetRosterStudent = {
    grNo: '101',
    studentName: 'Ahsan Ali',
    fatherName: 'Ghulam Nabi',
    gradeLevel: 'X',
    currentClass: 'X',
    section: 'A',
    gender: 'Male',
    dob: '01/01/2010',
    status: 'Active',
    fromSheet: true,
  };
  const sscEntry: StudentMarkEntry = {
    grNo: '101',
    examType: 'midterm',
    optionalLanguage: 'Urdu',
    optionalElective: 'ICT',
    daysPresent: 220,
    codeOfConduct: 'Satisfactory',
    scores: {
      english: 45,
      chemistry: 44,
      physics: 42,
      pakistanStudies: 46,
      urdu: 43,
      mathematics: 48,
      ict: 47,
    },
  };

  const sscResult = computeStudentMarksheet(
    sscStudent,
    sscEntry,
    DEFAULT_MARKSHEET_CONFIG,
    'midterm',
    'zueb'
  );
  assert.equal(sscResult.sectionTier, 'SSC');
  assert.equal(sscResult.subjects.length, 7);
  assert.equal(sscResult.totalMaxMarks, 350);
  assert.equal(sscResult.totalObtainedMarks, 315);
  assert.equal(sscResult.overallPercentage, 90);
  assert.equal(sscResult.overallGrade, 'A');
  assert.equal(sscResult.resultStatus, 'PASS');
  assert.equal(sscResult.attendancePercentage, 90.2);

  const hsscStudent: MarksheetRosterStudent = {
    ...sscStudent,
    grNo: '205',
    gradeLevel: 'XI',
    currentClass: 'XI',
  };
  const hsscEntry: StudentMarkEntry = {
    grNo: '205',
    examType: 'midterm',
    optionalLanguage: 'Sindhi',
    optionalElective: 'Mathematics',
    scores: {
      english: 22,
      chemistry: 20,
      physics: 21,
      islamicStudies: 23,
      sindhi: 20,
      mathematics: 'A',
    },
  };
  const hsscResult = computeStudentMarksheet(
    hsscStudent,
    hsscEntry,
    DEFAULT_MARKSHEET_CONFIG,
    'midterm',
    'zueb'
  );
  assert.equal(hsscResult.sectionTier, 'HSSC');
  assert.equal(hsscResult.subjects.length, 6);
  assert.equal(hsscResult.totalMaxMarks, 150);
  assert.equal(hsscResult.totalObtainedMarks, 106);
  assert.equal(hsscResult.resultStatus, 'NEEDS IMPROVEMENT');
  assert.equal(hsscResult.subjects.find((s) => s.key === 'mathematics')?.grade, 'U');
});

test('parses multi-sheet Excel workbook and builds sorted IX-XII roster', () => {
  const xlsx = getXlsxLib();
  const wb = xlsx.utils.book_new();
  const ws9 = xlsx.utils.aoa_to_sheet([
    ['GR No', 'Student Name', 'Father Name', 'English', 'Chemistry', 'Physics', 'Islamiyat', 'Sindhi', 'Mathematics', 'Biology', 'Days Present'],
    ['12', 'Bilal Ahmed', 'Tariq Ahmed', 42, 40, 38, 44, 41, 45, 43, 210],
  ]);
  const ws12 = xlsx.utils.aoa_to_sheet([
    ['GR No', 'Student Name', 'Father Name', 'English', 'Chemistry', 'Physics', 'Pakistan Studies', 'Urdu', 'Mathematics'],
    ['301', 'Zoya Memon', 'Farooq Memon', 23, 21, 22, 24, 20, 24],
  ]);
  xlsx.utils.book_append_sheet(wb, ws9, 'Grade IX');
  xlsx.utils.book_append_sheet(wb, ws12, 'Grade XII');
  const buf = xlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const parsed = importMarksheetWorkbook(buf, 'midterm');
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].currentClass, 'IX');
  assert.equal(parsed.entries[1].currentClass, 'XII');

  const makeRecord = (
    rowNumber: number,
    grNo: string,
    studentName: string,
    fatherName: string,
    currentClass: string,
    status: string
  ): StudentRecord => ({
    rowNumber,
    grNo,
    studentName,
    bFormNo: '',
    fatherName,
    gender: 'Male',
    dobDay: '02',
    dobMonth: '03',
    dobYear: '2010',
    classAdmitted: currentClass,
    currentClass,
    parentCnic: '',
    religion: 'Islam',
    address: '',
    parentContact: '',
    emergencyContact: '',
    admissionDay: '',
    admissionMonth: '',
    admissionYear: '',
    section: 'A',
    partnerContact: '',
    shift: 'Morning',
    medium: 'English',
    picture: '',
    status,
  });

  const sheetRecords: StudentRecord[] = [
    makeRecord(2, '5', 'Dropped Student', 'X', 'IX', 'Drop Out'),
    makeRecord(3, '4', 'Ibrar Ali', 'Niaz Ali', 'IX', 'Studying'),
  ];
  const entryMap: Record<string, StudentMarkEntry> = {
    '12': parsed.entries[0],
    '301': parsed.entries[1],
  };
  const roster = buildMarksheetRoster(sheetRecords, entryMap, 'ALL', '');
  assert.deepEqual(
    roster.map((s) => s.grNo),
    ['4', '12', '301']
  );
});

test('generates single and batch A4 PDFs with exact expected page counts and dimensions', async () => {
  const phssjPng = fs.readFileSync(path.resolve(process.cwd(), 'public/logos/phssj.png'));
  const zuebPng = fs.readFileSync(
    path.resolve(process.cwd(), 'public/logos/ziauddin-university.png')
  );
  const sigPng = fs.readFileSync(
    path.resolve(process.cwd(), 'public/logos/principal-signature.png')
  );
  const logos = {
    phssjPngBytes: new Uint8Array(phssjPng),
    zuebPngBytes: new Uint8Array(zuebPng),
    principalSigPngBytes: new Uint8Array(sigPng),
  };

  const students: MarksheetRosterStudent[] = [
    {
      grNo: '4',
      studentName: 'Ibrar Ali',
      fatherName: 'Niaz Ali',
      gradeLevel: 'IX',
      currentClass: 'IX',
      section: 'A',
      gender: 'Male',
      dob: '',
      status: 'Active',
      fromSheet: true,
    },
    {
      grNo: '88',
      studentName: 'Hira Soomro',
      fatherName: 'Saleem',
      gradeLevel: 'X',
      currentClass: 'X',
      section: 'B',
      gender: 'Female',
      dob: '',
      status: 'Active',
      fromSheet: true,
    },
    {
      grNo: '301',
      studentName: 'Zoya Memon',
      fatherName: 'Farooq Memon',
      gradeLevel: 'XII',
      currentClass: 'XII',
      section: 'Pre-Eng',
      gender: 'Female',
      dob: '',
      status: 'Active',
      fromSheet: true,
    },
  ];

  const computed = students.map((st) =>
    computeStudentMarksheet(
      st,
      {
        grNo: st.grNo,
        examType: 'midterm',
        scores: { english: 20, chemistry: 19, physics: 21 },
      },
      DEFAULT_MARKSHEET_CONFIG,
      'midterm',
      'zueb'
    )
  );

  const singleBytes = await generateSingleMarksheetPdf(computed[0], DEFAULT_MARKSHEET_CONFIG, logos);
  const singleDoc = await PDFDocument.load(singleBytes);
  assert.equal(singleDoc.getPageCount(), 1);
  const { width, height } = singleDoc.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 1, `Expected A4 width ~595.28, got ${width}`);
  assert.ok(Math.abs(height - 841.89) < 1, `Expected A4 height ~841.89, got ${height}`);

  let lastProgress = 0;
  const batchBytes = await generateBatchMarksheetPdf(
    computed,
    DEFAULT_MARKSHEET_CONFIG,
    logos,
    (done) => {
      lastProgress = done;
    }
  );
  assert.equal(lastProgress, 3);
  const batchDoc = await PDFDocument.load(batchBytes);
  assert.equal(batchDoc.getPageCount(), 3);
});

function buildLiveResultSheetWorkbookBuffer(): Uint8Array {
  const xlsx = getXlsxLib();
  const wb = xlsx.utils.book_new();

  // Basic Information sheet with Excel serial date 46235 -> 8/1/2026 and Grade IX..XII at col 12/14/16/18
  const basicRows: unknown[][] = Array.from({ length: 16 }, () => Array(22).fill(''));
  basicRows[2][1] = 'School Name:';
  basicRows[2][2] = "People's Higher Secondary School Jamshoro";
  basicRows[2][9] = 'School Reopen Date:';
  basicRows[2][10] = 46235;
  basicRows[3][1] = 'School Details:';
  basicRows[3][2] = 'Jamshoro Campus';
  basicRows[3][9] = 'Total Working Days:';
  basicRows[3][10] = 244;
  basicRows[4][2] = 'Ziauddin University Examination Board';
  basicRows[5][1] = 'Academic Year:';
  basicRows[5][2] = '2026-27';
  basicRows[6][5] = 'Principal Name:';
  basicRows[6][6] = 'Arsala Mewati';
  basicRows[1][1] = 'IX';
  basicRows[1][2] = 'Abdul Ahad';
  basicRows[8][12] = 'Mid-Term Marks';
  basicRows[9][12] = 'Grade IX';
  basicRows[9][14] = 'Grade X';
  basicRows[9][16] = 'Grade XI';
  basicRows[9][18] = 'Grade XII';
  basicRows[10][12] = 'English';
  basicRows[10][13] = 50;
  basicRows[10][18] = 'English';
  basicRows[10][19] = 25;
  const wsBasic = xlsx.utils.aoa_to_sheet(basicRows);
  xlsx.utils.book_append_sheet(wb, wsBasic, 'Basic Information');

  // Result Sheet matching real 106-column structure
  const resRows: unknown[][] = Array.from({ length: 7 }, () => Array(106).fill(''));
  resRows[0][1] = 'Student Information';
  resRows[0][4] = 'English';
  resRows[0][85] = 'Grand Total';
  resRows[1][4] = 'Mid-Term';
  resRows[1][7] = 'Mock Test';
  resRows[1][10] = 'Pre Board';
  resRows[3][4] = 'Marks';
  resRows[3][6] = 'Grade';

  // Row 4: GR 145 SSC Grade IX (Sindhi=10, Urdu=0, Biology=32, ICT=0; Mock/PreBoard=0; =AI(...) remark)
  const r145 = resRows[4];
  r145[1] = '145';
  r145[2] = 'Aqsa Batool';
  r145[3] = 'IX';
  r145[4] = 38;
  r145[13] = 17;
  r145[22] = 41;
  r145[31] = 32;
  r145[40] = 19;
  r145[49] = 14;
  r145[58] = 0;
  r145[67] = 10;
  r145[76] = 0;
  r145[85] = 171;
  r145[7] = 0;
  r145[89] = 0;
  r145[10] = 0;
  r145[93] = 0;
  r145[98] = 0;
  r145[101] = 0;
  r145[102] = 'Satisfactory';
  r145[104] = 'Asghar Ali';
  r145[105] = '=AI("Generate comment")';

  // Row 5: GR 654 HSSC Grade XII (Sindhi='A', Urdu=19, Mathematics=15, Biology=0)
  const r654 = resRows[5];
  r654[1] = '654';
  r654[2] = 'Pirah Zafar';
  r654[3] = 'XII';
  r654[4] = 18;
  r654[13] = 15;
  r654[22] = 11;
  r654[31] = 0;
  r654[40] = 12;
  r654[49] = 10;
  r654[67] = 'A';
  r654[76] = 19;
  r654[85] = 85;
  r654[104] = 'Nawab Zafar Ali Punar';

  // Row 6: GR 28 SSC Grade X (Sindhi='A', Urdu=0 — absent student with no sibling > 0)
  const r28 = resRows[6];
  r28[1] = '28';
  r28[2] = 'Shaima';
  r28[3] = 'X';
  r28[4] = 30;
  r28[13] = 20;
  r28[22] = 25;
  r28[31] = 28;
  r28[40] = 22;
  r28[49] = 26;
  r28[67] = 'A';
  r28[76] = 0;
  r28[85] = 151;

  const wsRes = xlsx.utils.aoa_to_sheet(resRows);
  xlsx.utils.book_append_sheet(wb, wsRes, 'Result Sheet');

  // Include printable report-card tab that must NOT overwrite Basic Information academicYear
  const wsCombined = xlsx.utils.aoa_to_sheet([
    ['MID-TERM EXAMINATION REPORT CARD'],
    ['G.R. No:', '145', 'Academic Year:', '86'],
  ]);
  xlsx.utils.book_append_sheet(wb, wsCombined, 'SSC and HSSC Combined');

  const out = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Uint8Array(out);
}

test('parses live Result Sheet workbook layout across all exams and resolves optional subjects', () => {
  const buf = buildLiveResultSheetWorkbookBuffer();
  const parsed = importMarksheetWorkbook(buf, 'midterm');

  assert.equal(parsed.configPatch?.academicYear, '2026-27');
  assert.equal(parsed.configPatch?.reopenDate, '8/1/2026');
  assert.equal(parsed.configPatch?.totalWorkingDays, 244);

  const mid145 = parsed.entries.find((e) => e.grNo === '145' && e.examType === 'midterm');
  assert.ok(mid145);
  assert.equal(mid145.optionalLanguage, 'Sindhi');
  assert.equal(mid145.optionalElective, 'Biology');
  assert.equal(mid145.teacherRemarks, '');
  assert.equal(mid145.daysPresent, null);

  const mock145 = parsed.entries.find((e) => e.grNo === '145' && e.examType === 'mock');
  assert.ok(mock145);
  const compMock145 = computeStudentMarksheet(
    {
      grNo: '145',
      studentName: 'Aqsa Batool',
      fatherName: 'Asghar Ali',
      gradeLevel: 'IX',
      currentClass: 'IX',
      section: '',
      gender: '',
      dob: '',
      status: 'Live Sheet',
      fromSheet: false,
    },
    mock145,
    DEFAULT_MARKSHEET_CONFIG,
    'mock',
    'zueb'
  );
  assert.equal(compMock145.resultStatus, 'PENDING');

  const mid654 = parsed.entries.find((e) => e.grNo === '654' && e.examType === 'midterm');
  assert.ok(mid654);
  assert.equal(mid654.optionalLanguage, 'Urdu');
  assert.equal(mid654.optionalElective, 'Mathematics');
  const comp654 = computeStudentMarksheet(
    {
      grNo: '654',
      studentName: 'Pirah Zafar',
      fatherName: 'Nawab Zafar Ali Punar',
      gradeLevel: 'XII',
      currentClass: 'XII',
      section: '',
      gender: '',
      dob: '',
      status: 'Live Sheet',
      fromSheet: false,
    },
    mid654,
    DEFAULT_MARKSHEET_CONFIG,
    'midterm',
    'zueb'
  );
  assert.equal(comp654.totalObtainedMarks, 85);
  assert.equal(comp654.totalMaxMarks, 150);
  assert.equal(comp654.subjects.some((s) => s.key === 'sindhi'), false);
  assert.equal(comp654.subjects.find((s) => s.key === 'urdu')?.obtained, 19);

  const mid28 = parsed.entries.find((e) => e.grNo === '28' && e.examType === 'midterm');
  assert.ok(mid28);
  assert.equal(mid28.optionalLanguage, 'Sindhi');
  assert.equal(mid28.scores.sindhi, 'A');
});

test('marksheetsRouter validates IDs, detects HTML auth redirects, and serves parsed live xlsx data', async (t) => {
  const expressMod = await import('express');
  const httpMod = await import('node:http');
  const { createMarksheetsRouter } = await import('../../services/routes/marksheetsRouter.js');

  const app = expressMod.default();
  app.use('/api', createMarksheetsRouter());

  const server = httpMod.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // 1. Invalid spreadsheetId returns 400
  const badRes = await originalFetch(`${baseUrl}/api/marksheets/live?spreadsheetId=bad`);
  assert.equal(badRes.status, 400);

  // 2. HTML sign-in redirect returns 401 needsAuth: true
  globalThis.fetch = (async () =>
    new Response('<!doctype html><html><body>Sign in</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch;

  const htmlRes = await originalFetch(
    `${baseUrl}/api/marksheets/live?spreadsheetId=privateSheet12345&refresh=true`
  );
  assert.equal(htmlRes.status, 401);
  const htmlJson = (await htmlRes.json()) as { needsAuth?: boolean };
  assert.equal(htmlJson.needsAuth, true);

  // 3. Valid xlsx response returns parsed configPatch + entriesByKey
  const xlsxBytes = buildLiveResultSheetWorkbookBuffer();
  globalThis.fetch = (async () =>
    new Response(xlsxBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })) as typeof fetch;

  const okRes = await originalFetch(
    `${baseUrl}/api/marksheets/live?spreadsheetId=publicSheet123456&refresh=true`
  );
  assert.equal(okRes.status, 200);
  const okJson = (await okRes.json()) as {
    ok: boolean;
    count: number;
    entriesByKey: Record<string, StudentMarkEntry>;
  };
  assert.equal(okJson.ok, true);
  assert.equal(okJson.count, 3);
  assert.equal(okJson.entriesByKey['midterm::145']?.studentName, 'Aqsa Batool');
  assert.equal(okJson.entriesByKey['midterm::654']?.fatherName, 'Nawab Zafar Ali Punar');
});

test('mergeMarksheetEntries preserves custom GR entries and newer local edits during live sync', async () => {
  const { mergeMarksheetEntries } = await import('../../services/marksheet/storage');

  const localMap: Record<string, StudentMarkEntry> = {
    'midterm::custom999': {
      grNo: 'custom999',
      studentName: 'Custom Student',
      currentClass: 'IX',
      examType: 'midterm',
      scores: { english: 44.5 },
      updatedAt: 2000,
    },
    'midterm::145': {
      grNo: '145',
      examType: 'midterm',
      scores: { english: 49 },
      updatedAt: 5000,
    },
    'midterm::654': {
      grNo: '654',
      examType: 'midterm',
      scores: { english: 18 },
      updatedAt: 1000,
    },
  };

  const incomingMap: Record<string, StudentMarkEntry> = {
    'midterm::145': {
      grNo: '145',
      examType: 'midterm',
      scores: { english: 38 },
      // no updatedAt or older updatedAt -> local wins
    },
    'midterm::654': {
      grNo: '654',
      examType: 'midterm',
      scores: { english: 22 },
      updatedAt: 9000, // newer -> incoming wins
    },
    'midterm::28': {
      grNo: '28',
      examType: 'midterm',
      scores: { english: 30 },
    },
  };

  const merged = mergeMarksheetEntries(localMap, incomingMap);
  assert.equal(merged['midterm::custom999']?.studentName, 'Custom Student');
  assert.equal(merged['midterm::custom999']?.scores.english, 44.5);
  assert.equal(merged['midterm::145']?.scores.english, 49);
  assert.equal(merged['midterm::654']?.scores.english, 22);
  assert.equal(merged['midterm::28']?.scores.english, 30);
});

test('extractSpreadsheetId and buildSpreadsheetUrl handle URLs, raw IDs, and invalid inputs', async () => {
  const {
    extractSpreadsheetId,
    buildSpreadsheetUrl,
    getStoredMarksheetSpreadsheetId,
    MARKSHEET_SPREADSHEET_ID,
  } = await import('../../services/marksheet/config');

  assert.equal(
    extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1n3tS_K5RKRtEC3zNfO_g5wloQElN6i2t2dIleBhVqSs/edit?usp=sharing'
    ),
    '1n3tS_K5RKRtEC3zNfO_g5wloQElN6i2t2dIleBhVqSs'
  );
  assert.equal(
    extractSpreadsheetId('1AbCDefGhIjKlMnOpQrStUvWxYz0123456789'),
    '1AbCDefGhIjKlMnOpQrStUvWxYz0123456789'
  );
  assert.equal(extractSpreadsheetId('https://example.com/not-a-sheet'), null);
  assert.equal(extractSpreadsheetId('short'), null);

  assert.equal(
    buildSpreadsheetUrl('1n3tS_K5RKRtEC3zNfO_g5wloQElN6i2t2dIleBhVqSs'),
    'https://docs.google.com/spreadsheets/d/1n3tS_K5RKRtEC3zNfO_g5wloQElN6i2t2dIleBhVqSs/edit?usp=sharing'
  );
  assert.equal(getStoredMarksheetSpreadsheetId(), MARKSHEET_SPREADSHEET_ID);
});

test('marksheetsRouter returns deterministic contentHash and unchanged:true when knownHash matches', async (t) => {
  const expressMod = await import('express');
  const httpMod = await import('node:http');
  const { createMarksheetsRouter } = await import('../../services/routes/marksheetsRouter.js');

  const app = expressMod.default();
  app.use('/api', createMarksheetsRouter());
  const server = httpMod.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const xlsxBytes = buildLiveResultSheetWorkbookBuffer();
  globalThis.fetch = (async () =>
    new Response(xlsxBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })) as typeof fetch;

  const firstRes = await originalFetch(
    `${baseUrl}/api/marksheets/live?spreadsheetId=hashCheckSheet1234&refresh=true`
  );
  assert.equal(firstRes.status, 200);
  const firstJson = (await firstRes.json()) as {
    ok: boolean;
    unchanged?: boolean;
    contentHash?: string;
    entriesByKey?: Record<string, StudentMarkEntry>;
  };
  assert.equal(firstJson.ok, true);
  assert.equal(firstJson.unchanged, false);
  assert.ok(firstJson.contentHash && firstJson.contentHash.length >= 16);
  assert.ok(firstJson.entriesByKey && firstJson.entriesByKey['midterm::145']);

  const secondRes = await originalFetch(
    `${baseUrl}/api/marksheets/live?spreadsheetId=hashCheckSheet1234&refresh=true&knownHash=${encodeURIComponent(
      firstJson.contentHash!
    )}`
  );
  assert.equal(secondRes.status, 200);
  const secondJson = (await secondRes.json()) as {
    ok: boolean;
    unchanged?: boolean;
    contentHash?: string;
    entriesByKey?: Record<string, StudentMarkEntry>;
  };
  assert.equal(secondJson.ok, true);
  assert.equal(secondJson.unchanged, true);
  assert.equal(secondJson.contentHash, firstJson.contentHash);
  assert.equal(secondJson.entriesByKey, undefined);
});

test('applyPendingEditsToEntries overlays teacher subject edits and optional selections onto cached entries', async () => {
  const {
    applyPendingEditsToEntries,
    makePendingEditDocId,
  } = await import('../../services/marksheet/pendingEditsHelpers');

  assert.equal(makePendingEditDocId('midterm', 'GR-145'), 'midterm__GR-145');

  const baseEntries: Record<string, StudentMarkEntry> = {
    'midterm::145': {
      grNo: '145',
      studentName: 'Aqsa Batool',
      currentClass: 'IX',
      examType: 'midterm',
      optionalLanguage: 'Sindhi',
      optionalElective: 'Biology',
      scores: { english: 40, mathematics: 35, sindhi: 38 },
      updatedAt: 1000,
    },
  };

  const merged = applyPendingEditsToEntries(baseEntries, [
    {
      docId: 'midterm__145',
      grNo: '145',
      studentName: 'Aqsa Batool',
      gradeLevel: 'IX',
      examType: 'midterm',
      scores: { mathematics: 48, urdu: 42 },
      optionalLanguage: 'Urdu',
      updatedAt: 5000,
      updatedByUid: 'teacher-uid-1',
      updatedByEmail: 'teacher@phssj.edu',
    },
  ]);

  assert.equal(merged['midterm::145']?.scores.english, 40);
  assert.equal(merged['midterm::145']?.scores.mathematics, 48);
  assert.equal(merged['midterm::145']?.scores.urdu, 42);
  assert.equal(merged['midterm::145']?.optionalLanguage, 'Urdu');
  assert.equal(merged['midterm::145']?.updatedAt, 5000);
});

test('getSubjectsForGrade returns grade-specific subjects including Mathematics for IX-XII', async () => {
  const { getSubjectsForGrade } = await import('../../services/marksheet/calculations');

  const ixSubjects = getSubjectsForGrade('IX');
  assert.equal(ixSubjects.includes('mathematics'), true);
  assert.equal(ixSubjects.includes('islamicStudies'), true);
  assert.equal(ixSubjects.includes('ict'), true);
  assert.equal(ixSubjects.includes('pakistanStudies'), false);

  const xiiSubjects = getSubjectsForGrade('XII');
  assert.equal(xiiSubjects.includes('mathematics'), true);
  assert.equal(xiiSubjects.includes('pakistanStudies'), true);
  assert.equal(xiiSubjects.includes('islamicStudies'), false);
  assert.equal(xiiSubjects.includes('ict'), false);
});

test('mergePendingEditDelta, combinePendingEditLists, and applyPendingEditsToEntries protect unpushed teacher edits over newer sheet timestamps', async () => {
  const {
    applyPendingEditsToEntries,
    combinePendingEditLists,
    mergePendingEditDelta,
  } = await import('../../services/marksheet/pendingEditsHelpers');

  // Teacher A updates Mathematics (baseline sheet had 17)
  const editA = mergePendingEditDelta(undefined, {
    grNo: '145',
    studentName: 'Aqsa Batool',
    gradeLevel: 'IX',
    examType: 'midterm',
    changedScores: { mathematics: 48 },
    baseScores: { mathematics: 17, english: 38, physics: 41 },
    author: { uid: 'uid-math', name: 'Math Teacher', email: 'math@phssj.edu' },
    nowMs: 2000,
  });

  // Teacher B updates English on the same student without clobbering Mathematics
  const editAB = mergePendingEditDelta(editA, {
    grNo: '145',
    studentName: 'Aqsa Batool',
    gradeLevel: 'IX',
    examType: 'midterm',
    changedScores: { english: 45 },
    baseScores: { mathematics: 17, english: 38, physics: 41 },
    author: { uid: 'uid-eng', name: 'English Teacher', email: 'eng@phssj.edu' },
    nowMs: 3000,
  });

  assert.equal(editAB.scores.mathematics, 48);
  assert.equal(editAB.scores.english, 45);
  assert.equal(editAB.previousScores?.mathematics, 17);
  assert.equal(editAB.previousScores?.english, 38);
  assert.equal(editAB.fieldAuthors?.mathematics?.name, 'Math Teacher');
  assert.equal(editAB.fieldAuthors?.english?.name, 'English Teacher');

  // Local unpushed edit for a second student combines cleanly with remote pending list
  const localEdit = mergePendingEditDelta(undefined, {
    grNo: '654',
    studentName: 'Pirah Zafar',
    gradeLevel: 'XII',
    examType: 'midterm',
    changedScores: { sindhi: 21 },
    optionalLanguage: 'Sindhi',
    baseScores: { sindhi: 'A' },
    author: { uid: 'local' },
    nowMs: 4000,
  });
  const combined = combinePendingEditLists([editAB], [localEdit]);
  assert.equal(combined.length, 2);

  // Google Sheet refreshes with a newer updatedAt (9999999999999), updating physics=49 but still holding old math=17 & english=38
  const sheetEntries: Record<string, StudentMarkEntry> = {
    'midterm::145': {
      grNo: '145',
      studentName: 'Aqsa Batool',
      currentClass: 'IX',
      examType: 'midterm',
      optionalLanguage: 'Sindhi',
      optionalElective: 'Biology',
      scores: { english: 38, mathematics: 17, physics: 49, sindhi: 10 },
      updatedAt: 9999999999999,
    },
  };

  const protectedEntries = applyPendingEditsToEntries(sheetEntries, combined);
  // Pending unpushed teacher changes MUST survive even though sheet updatedAt is much newer
  assert.equal(protectedEntries['midterm::145']?.scores.mathematics, 48);
  assert.equal(protectedEntries['midterm::145']?.scores.english, 45);
  // Non-edited subjects still reflect latest Google Sheet updates
  assert.equal(protectedEntries['midterm::145']?.scores.physics, 49);
  assert.equal(protectedEntries['midterm::654']?.scores.sindhi, 21);
  assert.equal(protectedEntries['midterm::654']?.optionalLanguage, 'Sindhi');
});


