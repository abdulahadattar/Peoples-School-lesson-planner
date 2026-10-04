import { StudentRecord } from './googleSheetsService';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import timetableData from '../data/timetable.json';
import { triggerFileDownload } from '../utils/download';

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

/**
 * Normalises the "recorded by" field on an official register.
 *
 * This previously mapped every generic placeholder (and a blank value) to a
 * specific teacher's name, so a day that nobody signed was silently attributed
 * to that teacher. A real recorded name still passes through untouched; only
 * placeholders collapse to a neutral sentinel.
 */
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
    lower === ''
  ) {
    return UNASSIGNED_IN_CHARGE;
  }
  return trimmed;
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

export const DEFAULT_GRADE_ENROLLMENTS: ClassEnrollment[] = [
  { classKey: 'ECCE', romanName: 'ECCE', displayName: 'ECCE', enrolledBoys: 20, enrolledGirls: 15, totalEnrollment: 50 },
  { classKey: 'IA', romanName: 'I-A', displayName: 'I-A', enrolledBoys: 22, enrolledGirls: 14, totalEnrollment: 46 },
  { classKey: 'IB', romanName: 'I-B', displayName: 'I-B', enrolledBoys: 24, enrolledGirls: 11, totalEnrollment: 47 },
  { classKey: 'II', romanName: 'II', displayName: 'II', enrolledBoys: 28, enrolledGirls: 17, totalEnrollment: 58 },
  { classKey: 'IIIA', romanName: 'III-A', displayName: 'III-A', enrolledBoys: 15, enrolledGirls: 25, totalEnrollment: 48 },
  { classKey: 'IIIB', romanName: 'III-B', displayName: 'III-B', enrolledBoys: 20, enrolledGirls: 15, totalEnrollment: 47 },
  { classKey: 'IVA', romanName: 'IV-A', displayName: 'IV-A', enrolledBoys: 20, enrolledGirls: 12, totalEnrollment: 45 },
  { classKey: 'IVB', romanName: 'IV-B', displayName: 'IV-B', enrolledBoys: 18, enrolledGirls: 16, totalEnrollment: 47 },
  { classKey: 'V', romanName: 'V', displayName: 'V', enrolledBoys: 21, enrolledGirls: 14, totalEnrollment: 47 },
  { classKey: 'VIA', romanName: 'VI-A', displayName: 'VI-A', enrolledBoys: 7, enrolledGirls: 28, totalEnrollment: 45 },
  { classKey: 'VIB', romanName: 'VI-B', displayName: 'VI-B', enrolledBoys: 39, enrolledGirls: 0, totalEnrollment: 46 },
  { classKey: 'VII', romanName: 'VII', displayName: 'VII', enrolledBoys: 23, enrolledGirls: 16, totalEnrollment: 55 },
  { classKey: 'VIII', romanName: 'VIII', displayName: 'VIII', enrolledBoys: 20, enrolledGirls: 13, totalEnrollment: 44 },
  { classKey: 'IX', romanName: 'IX', displayName: 'IX', enrolledBoys: 31, enrolledGirls: 24, totalEnrollment: 67 },
  { classKey: 'XA', romanName: 'X-A', displayName: 'X-A', enrolledBoys: 8, enrolledGirls: 25, totalEnrollment: 45 },
  { classKey: 'XB', romanName: 'X-B', displayName: 'X-B', enrolledBoys: 26, enrolledGirls: 0, totalEnrollment: 41 },
  { classKey: 'XI', romanName: 'XI', displayName: 'XI', enrolledBoys: 11, enrolledGirls: 13, totalEnrollment: 55 },
  { classKey: 'XII', romanName: 'XII', displayName: 'XII', enrolledBoys: 12, enrolledGirls: 5, totalEnrollment: 37 },
];

export function computeEnrollmentsFromRecords(
  records: StudentRecord[],
  baseEnrollments?: ClassEnrollment[]
): ClassEnrollment[] {
  const classMap = new Map<string, { boys: number; girls: number }>();
  const activeBase = baseEnrollments && baseEnrollments.length > 0 ? baseEnrollments : DEFAULT_GRADE_ENROLLMENTS;

  records.forEach((r) => {
    // Basic dropout exclusion logic (customize if status matters more)
    if (r.status?.toLowerCase().includes('dropout') || r.status?.toLowerCase().includes('left')) return;

    let c = r.currentClass?.trim() || 'UNKNOWN';
    if (r.section?.trim()) {
      c += '-' + r.section.trim();
    }
    
    if (!classMap.has(c)) {
      classMap.set(c, { boys: 0, girls: 0 });
    }
    const counts = classMap.get(c)!;
    if (r.gender?.toLowerCase() === 'female' || r.gender?.toLowerCase() === 'girl') {
      counts.girls += 1;
    } else {
      counts.boys += 1; // Default to boy for ambiguous, or explicitly handle
    }
  });

  return activeBase.map(def => {
    const r = def.romanName.toLowerCase();
    const c = def.classKey.toLowerCase();
    
    let totalBoys = 0;
    let totalGirls = 0;
    
    Array.from(classMap.entries()).forEach(([k, counts]) => {
      const kl = k.toLowerCase().trim();
      
      // Exact match for class or class-section (e.g. IV-A matches IV-A)
      if (kl === r || kl === c) {
        totalBoys += counts.boys;
        totalGirls += counts.girls;
      }
      // If def is just a class (e.g. V) but the sheet has sections (e.g. V-A, V-B), aggregate them
      // ONLY if there isn't a specific def for that section.
      else if (!r.includes('-') && (kl.startsWith(r + '-') || kl.startsWith(c + '-'))) {
        // Check if there's a more specific def (like VI-A when def is VI)
        const hasSpecificDef = activeBase.some(d => d.romanName.toLowerCase() === kl || d.classKey.toLowerCase() === kl);
        if (!hasSpecificDef) {
          totalBoys += counts.boys;
          totalGirls += counts.girls;
        }
      }
    });

    if (totalBoys > 0 || totalGirls > 0) {
      return {
        ...def,
        enrolledBoys: totalBoys,
        enrolledGirls: totalGirls,
        totalEnrollment: totalBoys + totalGirls,
      };
    }
    return def;
  });
}

export function buildAttendanceRows(
  enrollments: ClassEnrollment[],
  inputs: Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }>,
  classTeachersMap?: Record<string, string>
): ClassAttendanceRow[] {
  return enrollments.map(enr => {
    const totalEnrolled = typeof enr.totalEnrollment === 'number' && enr.totalEnrollment > 0
      ? enr.totalEnrollment
      : (enr.enrolledBoys + enr.enrolledGirls);
    const input = inputs[enr.classKey] || { presentBoys: '', presentGirls: '', classTeacher: '' };

    const pb = typeof input.presentBoys === 'number' ? input.presentBoys : 0;
    const pg = typeof input.presentGirls === 'number' ? input.presentGirls : 0;

    const totalPresent = pb + pg;
    const absentBoys = Math.max(0, enr.enrolledBoys - pb);
    const absentGirls = Math.max(0, enr.enrolledGirls - pg);
    const absentTotal = Math.max(0, totalEnrolled - totalPresent);

    const percentage = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;
    const boysPercentage = enr.enrolledBoys > 0 ? Math.round((pb / enr.enrolledBoys) * 100) : 0;
    const girlsPercentage = enr.enrolledGirls > 0 ? Math.round((pg / enr.enrolledGirls) * 100) : 0;

    // Determine default class teacher from classTeachersMap or timetable
    let defaultTeacher = '';
    if (classTeachersMap && classTeachersMap[enr.classKey]) {
      defaultTeacher = classTeachersMap[enr.classKey];
    } else {
      const matchingClasses = timetableData.classes.filter(c => c.label === enr.romanName);
      if (matchingClasses.length > 0) {
        const teachers = Array.from(new Set(matchingClasses.map(c => c.classTeacher).filter(Boolean)));
        defaultTeacher = teachers.join(' / ');
      } else {
        // No timetable or enrollment record names a teacher for this class, so leave the
        // cell empty rather than attributing the row to an arbitrary staff member.
        defaultTeacher = '';
      }
    }

    return {
      ...enr,
      classTeacher: input.classTeacher || defaultTeacher,
      totalEnrolled,
      presentBoys: input.presentBoys,
      presentGirls: input.presentGirls,
      totalPresent,
      absentBoys,
      absentGirls,
      absentTotal,
      percentage,
      boysPercentage,
      girlsPercentage,
    };
  });
}

export function calculateSchoolSummary(date: string, rows: ClassAttendanceRow[]): SchoolAttendanceSummary {
  let totalEnrolled = 0;
  let enrolledBoys = 0;
  let enrolledGirls = 0;
  let totalPresent = 0;
  let presentBoys = 0;
  let presentGirls = 0;
  let totalAbsent = 0;
  let absentBoys = 0;
  let absentGirls = 0;

  rows.forEach(r => {
    totalEnrolled += r.totalEnrolled;
    enrolledBoys += r.enrolledBoys;
    enrolledGirls += r.enrolledGirls;
    totalPresent += r.totalPresent;
    presentBoys += typeof r.presentBoys === 'number' ? r.presentBoys : 0;
    presentGirls += typeof r.presentGirls === 'number' ? r.presentGirls : 0;
    totalAbsent += r.absentTotal;
    absentBoys += r.absentBoys;
    absentGirls += r.absentGirls;
  });

  return {
    totalEnrolled,
    enrolledBoys,
    enrolledGirls,
    totalPresent,
    presentBoys,
    presentGirls,
    totalAbsent,
    absentBoys,
    absentGirls,
    overallPercentage: totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0,
    boysPercentage: enrolledBoys > 0 ? Math.round((presentBoys / enrolledBoys) * 100) : 0,
    girlsPercentage: enrolledGirls > 0 ? Math.round((presentGirls / enrolledGirls) * 100) : 0,
  };
}

export async function saveClassEnrollments(
  enrollments: ClassEnrollment[],
  updatedBy: string = 'Admin'
): Promise<void> {
  const payload = {
    enrollments,
    updatedAt: Date.now(),
    updatedBy,
  };
  try {
    const docRef = doc(db, 'settings', 'classEnrollments');
    await setDoc(docRef, payload);
  } catch (error) {
    console.warn("Failed to save enrollments to Firestore, saving locally", error);
  }
  // Local persistence guarantee
  localStorage.setItem('school_class_enrollments', JSON.stringify(enrollments));
}

export async function loadClassEnrollments(): Promise<ClassEnrollment[]> {
  try {
    const docRef = doc(db, 'settings', 'classEnrollments');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.enrollments) && data.enrollments.length > 0) {
        return data.enrollments as ClassEnrollment[];
      }
    }
  } catch (error) {
    console.warn("Failed to load enrollments from Firestore, checking localStorage", error);
  }

  // Fallback to local storage
  const local = localStorage.getItem('school_class_enrollments');
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }

  return DEFAULT_GRADE_ENROLLMENTS;
}

export async function saveAttendanceRecord(record: DailyAttendanceRecord): Promise<void> {
  try {
    const docRef = doc(db, 'daily_attendance', record.date);
    await setDoc(docRef, record, { merge: true });
    // Also save locally as a fallback
    localStorage.setItem(`attendance_${record.date}`, JSON.stringify(record));
  } catch (error) {
    console.warn("Failed to save to Firestore, saving locally", error);
    localStorage.setItem(`attendance_${record.date}`, JSON.stringify(record));
  }
}

/**
 * Marks a daily attendance record as successfully synced to Google Sheets.
 */
export async function markAttendanceSyncedToSheet(date: string, timestamp: number = Date.now()): Promise<void> {
  try {
    const docRef = doc(db, 'daily_attendance', date);
    await setDoc(docRef, { syncedToSheetAt: timestamp }, { merge: true });
  } catch (error) {
    console.warn("Failed to update syncedToSheetAt in Firestore", error);
  }

  try {
    const localStr = localStorage.getItem(`attendance_${date}`);
    if (localStr) {
      const parsed = JSON.parse(localStr);
      parsed.syncedToSheetAt = timestamp;
      localStorage.setItem(`attendance_${date}`, JSON.stringify(parsed));
    }
  } catch (error) {
    console.warn("Failed to update syncedToSheetAt in localStorage", error);
  }
}

/**
 * Result of an attendance load.
 *
 * `status` exists so a failed read can never be mistaken for an empty day. The
 * record is saved with an unconditional setDoc, so a teacher who saw a blank
 * register after a transient outage would silently overwrite the real numbers
 * for that date. Callers must block saving when `status === 'error'`.
 */
export type AttendanceLoadResult =
  | { status: 'ok'; record: DailyAttendanceRecord | null }
  | { status: 'error'; error: string };

export async function loadAttendanceRecord(date: string): Promise<AttendanceLoadResult> {
  let firestoreFailed = false;
  let firestoreError = '';
  try {
    const docRef = doc(db, 'daily_attendance', date);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { status: 'ok', record: docSnap.data() as DailyAttendanceRecord };
    }
  } catch (error: any) {
    firestoreFailed = true;
    firestoreError = error?.message || String(error);
    console.warn("Failed to load from Firestore, trying local", error);
  }

  // Fallback to local storage
  try {
    const localStr = localStorage.getItem(`attendance_${date}`);
    if (localStr) {
      return { status: 'ok', record: JSON.parse(localStr) as DailyAttendanceRecord };
    }
  } catch (error: any) {
    // A corrupt local cache is also a failed read, not an empty day.
    return { status: 'error', error: `Local cache unreadable: ${error?.message || error}` };
  }

  if (firestoreFailed) {
    return {
      status: 'error',
      error: `Could not read attendance for ${date} from the server (${firestoreError}). ` +
        `No local copy exists either, so this date's record could not be loaded. ` +
        `Saving now would overwrite it.`,
    };
  }

  return { status: 'ok', record: null };
}

/** Sums present students across every class in a record. */
function countTotalPresent(record: DailyAttendanceRecord): number {
  return Object.values(record.classes || {}).reduce(
    (sum, c) => sum + (c.presentBoys || 0) + (c.presentGirls || 0),
    0
  );
}

/**
 * Attendance percentage for a record.
 *
 * This used to be a hardcoded 0, so every row in the history list rendered a
 * red "0%" regardless of the real figures. It derives the denominator from the
 * classes actually present in the record, comparing each class's present count
 * against that class's configured enrollment.
 */
export function resolveAttendancePercentage(record: DailyAttendanceRecord, totalPresent: number): number {
  const enrollments = loadCachedEnrollments();
  let denominator = 0;
  for (const [classKey, counts] of Object.entries(record.classes || {})) {
    const enrolled = enrollments.get(normalizeClassKey(classKey));
    if (enrolled && enrolled > 0) {
      denominator += enrolled;
    } else {
      // Without a known enrollment, the best available proxy is the number of
      // students recorded for that class, which keeps the metric bounded.
      denominator += (counts.presentBoys || 0) + (counts.presentGirls || 0);
    }
  }

  if (denominator <= 0) return 0;
  return Math.round((totalPresent / denominator) * 100);
}

function normalizeClassKey(key: string): string {
  return key.trim().toUpperCase();
}

/**
 * Enrollment totals, read from the local cache that saveClassEnrollments always
 * writes. Deliberately synchronous: the history list renders in a loop and
 * awaiting Firestore per record would stall it.
 */
function loadCachedEnrollments(): Map<string, number> {
  const map = new Map<string, number>();
  const push = (list: ClassEnrollment[]) => {
    for (const e of list) {
      if (!e?.classKey) continue;
      map.set(normalizeClassKey(e.classKey), e.totalEnrollment || (e.enrolledBoys + e.enrolledGirls));
    }
  };

  try {
    const local = localStorage.getItem('school_class_enrollments');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length) {
        push(parsed);
        return map;
      }
    }
  } catch {
    // fall through to the built-in defaults
  }

  push(DEFAULT_GRADE_ENROLLMENTS);
  return map;
}

export interface AttendanceHistoryEntry {
  date: string;
  totalPresent: number;
  percentage: number;
  syncedToSheetAt?: number;
}

export async function loadAttendanceDates(): Promise<AttendanceHistoryEntry[]> {
  try {
    const attCol = collection(db, 'daily_attendance');
    const q = query(attCol, orderBy('date', 'desc'), limit(30));
    const snapshot = await getDocs(q);
    const fromFirestore: AttendanceHistoryEntry[] = snapshot.docs.map(d => {
      const data = d.data() as DailyAttendanceRecord;
      const totalPresent = countTotalPresent(data);
      return {
        date: data.date,
        totalPresent,
        // Derived from the live enrollment totals so the history list is a real
        // metric rather than the constant 0% this used to return.
        percentage: resolveAttendancePercentage(data, totalPresent),
        syncedToSheetAt: data.syncedToSheetAt,
      };
    });

    // getDocs resolves with an EMPTY snapshot (it does not throw) whenever the
    // client cannot reach Firestore, so a pure `return` here rendered a blank
    // history list even though records were cached locally. Merge the local
    // records for any date Firestore did not return; Firestore stays the source
    // of truth for the dates it does return.
    const merged = new Map<string, AttendanceHistoryEntry>(fromFirestore.map(d => [d.date, d]));
    for (const local of readLocalAttendanceDates()) {
      if (!merged.has(local.date)) merged.set(local.date, local);
    }
    return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    console.warn("Error fetching attendance dates", err);
  }

  return readLocalAttendanceDates().sort((a, b) => b.date.localeCompare(a.date));
}

/** Attendance history from the local per-date cache written by saveAttendanceRecord. */
function readLocalAttendanceDates(): AttendanceHistoryEntry[] {
  const dates: AttendanceHistoryEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('attendance_')) {
      const str = localStorage.getItem(key);
      if (str) {
        try {
          const data = JSON.parse(str) as DailyAttendanceRecord;
          if (!data?.date) continue;
          const totalPresent = countTotalPresent(data);
          dates.push({
            date: data.date,
            totalPresent,
            percentage: resolveAttendancePercentage(data, totalPresent),
            syncedToSheetAt: data.syncedToSheetAt,
          });
        } catch {
          // A corrupt local entry should not abort the whole history list.
        }
      }
    }
  }
  return dates;
}

export function exportAttendanceCSV(date: string, rows: ClassAttendanceRow[], summary: SchoolAttendanceSummary): void {
  const headers = ['Grade', 'Enrolled Boys', 'Enrolled Girls', 'Total Enrolled', 'Present Boys', 'Present Girls', 'Total Present', 'Total Absent', 'Attendance %'];
  const data = rows.map(r => [
    r.displayName,
    r.enrolledBoys,
    r.enrolledGirls,
    r.totalEnrolled,
    typeof r.presentBoys === 'number' ? r.presentBoys : 0,
    typeof r.presentGirls === 'number' ? r.presentGirls : 0,
    r.totalPresent,
    r.absentTotal,
    `${r.percentage}%`
  ]);

  data.push([
    'TOTAL ATTENDANCE',
    summary.enrolledBoys,
    summary.enrolledGirls,
    summary.totalEnrolled,
    summary.presentBoys,
    summary.presentGirls,
    summary.totalPresent,
    summary.totalAbsent,
    `${summary.overallPercentage}%`
  ]);

  const csvContent = [headers.join(','), ...data.map(d => d.join(','))].join('\n');
  triggerFileDownload(csvContent, `Attendance_${date}.csv`, 'text/csv;charset=utf-8;');
}
