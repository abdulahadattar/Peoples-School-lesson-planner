export interface ClassEnrollment {
  classKey: string;
  romanName: string;
  displayName: string;
  enrolledBoys: number;
  enrolledGirls: number;
  totalEnrollment?: number;
}

export interface ClassAttendanceRow extends ClassEnrollment {
  classTeacher?: string;
  totalEnrolled: number;
  presentBoys: number | '';
  presentGirls: number | '';
  totalPresent: number;
  absentBoys: number;
  absentGirls: number;
  absentTotal: number;
  percentage: number;
  boysPercentage: number;
  girlsPercentage: number;
}

export interface DailyAttendanceRecord {
  date: string;
  recordedBy: string;
  notes: string;
  updatedAt: number;
  syncedToSheetAt?: number;
  classes: Record<string, { presentBoys: number; presentGirls: number; classTeacher?: string }>;
}

export interface AttendanceHistoryEntry {
  date: string;
  totalPresent: number;
  percentage: number;
  syncedToSheetAt?: number;
}

export interface SchoolAttendanceSummary {
  totalEnrolled: number;
  enrolledBoys: number;
  enrolledGirls: number;
  totalPresent: number;
  presentBoys: number;
  presentGirls: number;
  totalAbsent: number;
  absentBoys: number;
  absentGirls: number;
  overallPercentage: number;
  boysPercentage: number;
  girlsPercentage: number;
}

export type AttendanceLoadResult =
  | { status: 'ok'; record: DailyAttendanceRecord | null }
  | { status: 'error'; error: string };

export const UNASSIGNED_IN_CHARGE = 'Unassigned';

export function cleanAttendanceInCharge(val?: string): string {
  const trimmed = (val || '').trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === 'class in-charge' ||
    lower === 'class in charge' ||
    lower === 'class teacher' ||
    lower === 'in-charge' ||
    lower === 'in charge' ||
    lower === 'incharge' ||
    lower === 'teacher' ||
    lower === 'class incharge' ||
    lower === 'unknown' ||
    lower === 'n/a' ||
    lower === 'none' ||
    lower === ''
  ) {
    return UNASSIGNED_IN_CHARGE;
  }
  return trimmed;
}

export const DEFAULT_GRADE_ENROLLMENTS: ClassEnrollment[] = [
  { classKey: 'ECE', romanName: 'ECE', displayName: 'ECE', enrolledBoys: 13, enrolledGirls: 14, totalEnrollment: 27 },
  { classKey: 'I', romanName: 'I', displayName: 'I', enrolledBoys: 27, enrolledGirls: 34, totalEnrollment: 61 },
  { classKey: 'II', romanName: 'II', displayName: 'II', enrolledBoys: 28, enrolledGirls: 36, totalEnrollment: 64 },
  { classKey: 'III', romanName: 'III', displayName: 'III', enrolledBoys: 34, enrolledGirls: 32, totalEnrollment: 66 },
  { classKey: 'IV', romanName: 'IV', displayName: 'IV', enrolledBoys: 36, enrolledGirls: 31, totalEnrollment: 67 },
  { classKey: 'V', romanName: 'V', displayName: 'V', enrolledBoys: 27, enrolledGirls: 37, totalEnrollment: 64 },
  { classKey: 'VI', romanName: 'VI', displayName: 'VI', enrolledBoys: 46, enrolledGirls: 45, totalEnrollment: 91 },
  { classKey: 'VII', romanName: 'VII', displayName: 'VII', enrolledBoys: 49, enrolledGirls: 49, totalEnrollment: 98 },
  { classKey: 'VIII', romanName: 'VIII', displayName: 'VIII', enrolledBoys: 64, enrolledGirls: 44, totalEnrollment: 108 },
  { classKey: 'IX', romanName: 'IX', displayName: 'IX', enrolledBoys: 47, enrolledGirls: 39, totalEnrollment: 86 },
  { classKey: 'X', romanName: 'X', displayName: 'X', enrolledBoys: 26, enrolledGirls: 18, totalEnrollment: 44 },
  { classKey: 'XI', romanName: 'XI', displayName: 'XI', enrolledBoys: 11, enrolledGirls: 13, totalEnrollment: 55 },
  { classKey: 'XII', romanName: 'XII', displayName: 'XII', enrolledBoys: 12, enrolledGirls: 5, totalEnrollment: 37 },
];
