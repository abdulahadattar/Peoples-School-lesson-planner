import { Teacher } from '../../types';
import type { TimetableClassEntry } from '../timetable';

export interface PeriodTiming {
  no: number;
  name: string;
  start: string;
  end: string;
  friStart?: string;
  friEnd?: string;
  durationMinutes?: number;
  isBreak?: boolean;
}

export interface ClassTeacherConfig {
  classKey: string;
  displayName: string;
  romanName: string;
  classTeacher: string;
  enrolledBoys: number;
  enrolledGirls: number;
  totalEnrollment?: number;
  subjects?: string[];
  gradeLevel?: string;
  section?: string;
  sections?: string[];
  sectionTeachers?: Record<string, string>;
  roomNumber?: string;
  capacity?: number;
}

export interface SchoolConfig {
  // Institutional Details
  schoolName: string;
  affiliation: string;
  academicSession: string;
  principalName: string;
  vicePrincipalName?: string;
  coordinatorName?: string;
  schoolAddress?: string;
  contactEmail?: string;
  schoolLogoUrl?: string;
  affiliationLogoUrl?: string;
  principalSignatureUrl?: string;

  // Attendance & Enrollment Mode
  enrollmentMode: 'manual' | 'google_sheet';

  // Google Sheet Edit Permissions Control
  sheetEditingEnabled: boolean;
  sheetEditingLockedMessage?: string;

  // Marksheets Live Sync Source (admin-configurable, synced to all users)
  marksheetSpreadsheetId?: string;
  marksheetSpreadsheetUrl?: string;

  // Classes, Teachers & Timetable
  classes: ClassTeacherConfig[];
  teachers: Teacher[];
  periods: PeriodTiming[];
  customTimetable?: TimetableClassEntry[];
  timetableNote?: string;

  updatedAt: number;
  updatedBy: string;
}
