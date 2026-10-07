import {
  ClassEnrollment,
  ClassAttendanceRow,
  DailyAttendanceRecord,
  SchoolAttendanceSummary,
  cleanAttendanceInCharge,
  saveAttendanceRecord,
  loadAttendanceRecord,
  loadAttendanceDates,
  markAttendanceSyncedToSheet,
  buildAttendanceRows,
  calculateSchoolSummary,
} from '../../services/attendanceService';
import { syncAttendanceToSheet } from '../../services/googleSheetsService';
import { getAccessToken } from '../../services/googleAuth';
import { AttendanceHistoryItem } from './AttendanceHistoryDrawer';

export async function saveAttendanceToDb(
  selectedDate: string,
  recordedBy: string,
  notes: string,
  attendanceRows: ClassAttendanceRow[]
): Promise<DailyAttendanceRecord> {
  const classesData: Record<string, { presentBoys: number; presentGirls: number; classTeacher?: string }> = {};
  attendanceRows.forEach((row) => {
    classesData[row.classKey] = {
      presentBoys: typeof row.presentBoys === 'number' ? row.presentBoys : 0,
      presentGirls: typeof row.presentGirls === 'number' ? row.presentGirls : 0,
      classTeacher: row.classTeacher || '',
    };
  });

  const inChargeName = cleanAttendanceInCharge(recordedBy);
  const record: DailyAttendanceRecord = {
    date: selectedDate,
    recordedBy: inChargeName,
    notes,
    updatedAt: Date.now(),
    classes: classesData,
  };

  await saveAttendanceRecord(record);
  return record;
}

export async function syncAttendanceWithSheet(
  targetDate: string,
  isCurrentDate: boolean,
  currentRows: ClassAttendanceRow[],
  currentSummary: SchoolAttendanceSummary,
  recordedBy: string,
  notes: string,
  enrollments: ClassEnrollment[],
  classTeachersMap: Record<string, string>
): Promise<{ ok: boolean; message: string; syncTimeStr: string }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google in the top bar to sync with Google Sheet.');
  }

  let rowsToSync = currentRows;
  let summaryToSync = currentSummary;
  let inCharge = cleanAttendanceInCharge(recordedBy);
  let notesToSync = notes;

  if (!isCurrentDate) {
    const histRes = await loadAttendanceRecord(targetDate);
    if (histRes.status === 'ok' && histRes.record) {
      const histRecord = histRes.record;
      const histInputs: Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }> = {};
      Object.entries(histRecord.classes || {}).forEach(([k, v]) => {
        histInputs[k] = {
          presentBoys: v.presentBoys,
          presentGirls: v.presentGirls,
          classTeacher: v.classTeacher,
        };
      });
      rowsToSync = buildAttendanceRows(enrollments, histInputs, classTeachersMap);
      summaryToSync = calculateSchoolSummary(targetDate, rowsToSync);
      inCharge = cleanAttendanceInCharge(histRecord.recordedBy);
      notesToSync = histRecord.notes || '';
    }
  }

  const result = await syncAttendanceToSheet(
    {
      date: targetDate,
      recordedBy: inCharge,
      notes: notesToSync,
      summary: {
        totalEnrolled: summaryToSync.totalEnrolled,
        totalPresent: summaryToSync.totalPresent,
        totalAbsent: summaryToSync.totalAbsent,
        overallPercentage: summaryToSync.overallPercentage,
      },
      rows: rowsToSync,
    },
    token
  );

  const now = Date.now();
  await markAttendanceSyncedToSheet(targetDate, now);
  const syncTimeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return { ok: true, message: result.message, syncTimeStr };
}

export async function fetchAttendanceHistoryList(): Promise<AttendanceHistoryItem[]> {
  try {
    const dates = await loadAttendanceDates();
    return dates.map((entry) => ({
      date: entry.date,
      totalPresent: entry.totalPresent,
      percentage: entry.percentage,
      syncedToSheetAt: entry.syncedToSheetAt,
    }));
  } catch (e) {
    console.warn('Error loading attendance history:', e);
    return [];
  }
}
