import {
  ClassAttendanceRow,
  DailyAttendanceRecord,
  AttendanceSaveOutcome,
  cleanAttendanceInCharge,
  saveAttendanceRecord,
  loadAttendanceDates,
} from '../../services/attendanceService';
import { AttendanceHistoryItem } from './AttendanceHistoryDrawer';

export async function saveAttendanceToDb(
  selectedDate: string,
  recordedBy: string,
  notes: string,
  attendanceRows: ClassAttendanceRow[]
): Promise<{ record: DailyAttendanceRecord; outcome: AttendanceSaveOutcome }> {
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

  const outcome = await saveAttendanceRecord(record);
  return { record, outcome };
}

export async function fetchAttendanceHistoryList(): Promise<AttendanceHistoryItem[]> {
  try {
    const dates = await loadAttendanceDates();
    return dates.map((entry) => ({
      date: entry.date,
      totalPresent: entry.totalPresent,
      percentage: entry.percentage,
    }));
  } catch (e) {
    console.warn('Error loading attendance history:', e);
    return [];
  }
}
