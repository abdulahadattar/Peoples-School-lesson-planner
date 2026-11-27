import * as XLSX from 'xlsx';
import { buildAttendanceWorkbook } from '../../services/attendance/excelExport';
import { isOfflineError, isPermissionError } from '../../services/attendance/repository';
import { applySharedEdits } from '../../services/sharedRecords/applyEdits';
import type { ClassAttendanceRow, SchoolAttendanceSummary } from '../../services/attendance/types';
import type { StudentRecord } from '../../services/googleSheetsService';
import type { SharedRecordEdit } from '../../services/sharedRecords/types';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export function runAttendanceAndRecordsUiTests(h: Harness) {
  const { describe, it, eq } = h;

  describe('attendance.excelExport');
  it('builds valid multi-sheet .xlsx workbook with classwise totals and summary', () => {
    const rows: ClassAttendanceRow[] = [
      {
        classKey: 'IX-A',
        romanName: 'IX-A',
        displayName: 'IX-A',
        enrolledBoys: 20,
        enrolledGirls: 15,
        totalEnrolled: 35,
        presentBoys: 18,
        presentGirls: 14,
        totalPresent: 32,
        absentBoys: 2,
        absentGirls: 1,
        absentTotal: 3,
        percentage: 91,
        boysPercentage: 90,
        girlsPercentage: 93,
        classTeacher: 'Sir Abdul Ahad',
      },
      {
        classKey: 'X-A',
        romanName: 'X-A',
        displayName: 'X-A',
        enrolledBoys: 12,
        enrolledGirls: 18,
        totalEnrolled: 30,
        presentBoys: 11,
        presentGirls: 17,
        totalPresent: 28,
        absentBoys: 1,
        absentGirls: 1,
        absentTotal: 2,
        percentage: 93,
        boysPercentage: 92,
        girlsPercentage: 94,
        classTeacher: 'Miss Uzma',
      },
    ];
    const summary: SchoolAttendanceSummary = {
      enrolledBoys: 32,
      enrolledGirls: 33,
      totalEnrolled: 65,
      presentBoys: 29,
      presentGirls: 31,
      totalPresent: 60,
      absentBoys: 3,
      absentGirls: 2,
      totalAbsent: 5,
      overallPercentage: 92,
      boysPercentage: 91,
      girlsPercentage: 94,
    };

    const wb = buildAttendanceWorkbook('2026-11-25', rows, summary, 'Principal Office', 'Morning Assembly');
    eq(wb.SheetNames, ['Classwise Attendance', 'Summary']);

    const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = XLSX.read(bytes, { type: 'buffer' });
    eq(parsed.SheetNames, ['Classwise Attendance', 'Summary']);

    const classAoa = XLSX.utils.sheet_to_json<Array<string | number>>(parsed.Sheets['Classwise Attendance'], { header: 1 });
    const totalRow = classAoa.find((r) => r[0] === 'TOTAL');
    eq(Boolean(totalRow), true);
    eq(totalRow?.[3], 65);
    eq(totalRow?.[6], 60);
    eq(totalRow?.[7], 5);

    const summaryAoa = XLSX.utils.sheet_to_json<Array<string | number>>(parsed.Sheets['Summary'], { header: 1 });
    const dateRow = summaryAoa.find((r) => r[0] === 'Date');
    eq(dateRow?.[1], '2026-11-25');
    const overallRow = summaryAoa.find((r) => r[0] === 'Overall Attendance %');
    eq(overallRow?.[1], '92%');
  });

  describe('records.realTimeOverlaySync');
  it('merges real-time Firestore student updates & additions cleanly while protecting sheet-owned identity columns', () => {
    const base: StudentRecord[] = [
      {
        rowNumber: 2,
        grNo: '1042',
        studentName: 'Ali Raza',
        fatherName: 'Ahmed Raza',
        currentClass: 'IX',
        section: 'A',
        parentContact: '0300-1111111',
      } as StudentRecord,
    ];

    const edits: SharedRecordEdit[] = [
      {
        docId: '2',
        rowNumber: 2,
        kind: 'update',
        updatedAt: 1000,
        updatedBy: 'uid1',
        updatedByName: 'Teacher A',
        updatedByEmail: 'a@school.pk',
        record: {
          ...base[0],
          parentContact: '0300-9999999',
        },
      },
      {
        docId: 'add-2099',
        rowNumber: -42,
        kind: 'add',
        updatedAt: 2000,
        updatedBy: 'uid2',
        updatedByName: 'Teacher B',
        updatedByEmail: 'b@school.pk',
        record: {
          rowNumber: -42,
          grNo: '2099',
          studentName: 'Sana Mir',
          fatherName: 'Tariq Mir',
          currentClass: 'VIII',
          section: 'A',
          parentContact: '0333-1234567',
        } as StudentRecord,
      },
    ];

    const merged = applySharedEdits(base, edits);
    eq(merged.length, 2);
    const updatedAli = merged.find((r) => r.grNo === '1042');
    const addedSana = merged.find((r) => r.grNo === '2099');
    eq(updatedAli?.parentContact, '0300-9999999');
    eq(addedSana?.studentName, 'Sana Mir');
  });

  describe('attendance.connectivityClassification');
  it('distinguishes offline/network failures from server permission denials', () => {
    eq(isOfflineError({ code: 'unavailable', message: 'The operation was aborted' }), true);
    eq(isOfflineError(new Error('Failed to get document because the client is offline.')), true);
    eq(isOfflineError(new Error('Load attendance timed out after 2500ms')), true);
    eq(isOfflineError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), false);

    eq(isPermissionError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), true);
    eq(isPermissionError(new Error('FirebaseError: Missing or insufficient permissions.')), true);
    eq(isPermissionError(new Error('Failed to get document because the client is offline.')), false);
  });
}
