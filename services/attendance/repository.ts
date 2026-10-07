import { db } from '../firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  ClassEnrollment,
  DailyAttendanceRecord,
  AttendanceHistoryEntry,
  AttendanceLoadResult,
  DEFAULT_GRADE_ENROLLMENTS,
} from './types';
import { countTotalPresent, resolveAttendancePercentage } from './calculations';

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
    console.warn('Failed to save enrollments to Firestore, saving locally', error);
  }
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
    console.warn('Failed to load enrollments from Firestore, checking localStorage', error);
  }

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
    localStorage.setItem(`attendance_${record.date}`, JSON.stringify(record));
  } catch (error) {
    console.warn('Failed to save to Firestore, saving locally', error);
    localStorage.setItem(`attendance_${record.date}`, JSON.stringify(record));
  }
}

export async function markAttendanceSyncedToSheet(date: string, timestamp: number = Date.now()): Promise<void> {
  try {
    const docRef = doc(db, 'daily_attendance', date);
    await setDoc(docRef, { syncedToSheetAt: timestamp }, { merge: true });
  } catch (error) {
    console.warn('Failed to update syncedToSheetAt in Firestore', error);
  }

  try {
    const localStr = localStorage.getItem(`attendance_${date}`);
    if (localStr) {
      const parsed = JSON.parse(localStr);
      parsed.syncedToSheetAt = timestamp;
      localStorage.setItem(`attendance_${date}`, JSON.stringify(parsed));
    }
  } catch (error) {
    console.warn('Failed to update syncedToSheetAt in localStorage', error);
  }
}

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
    console.warn('Failed to load from Firestore, trying local', error);
  }

  try {
    const localStr = localStorage.getItem(`attendance_${date}`);
    if (localStr) {
      return { status: 'ok', record: JSON.parse(localStr) as DailyAttendanceRecord };
    }
  } catch (error: any) {
    return { status: 'error', error: `Local cache unreadable: ${error?.message || error}` };
  }

  if (firestoreFailed) {
    return {
      status: 'error',
      error:
        `Could not read attendance for ${date} from the server (${firestoreError}). ` +
        `No local copy exists either, so this date's record could not be loaded. ` +
        `Saving now would overwrite it.`,
    };
  }

  return { status: 'ok', record: null };
}

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
          // ignore corrupted local item
        }
      }
    }
  }
  return dates;
}

export async function loadAttendanceDates(): Promise<AttendanceHistoryEntry[]> {
  try {
    const attCol = collection(db, 'daily_attendance');
    const q = query(attCol, orderBy('date', 'desc'), limit(30));
    const snapshot = await getDocs(q);
    const fromFirestore: AttendanceHistoryEntry[] = snapshot.docs.map((d) => {
      const data = d.data() as DailyAttendanceRecord;
      const totalPresent = countTotalPresent(data);
      return {
        date: data.date,
        totalPresent,
        percentage: resolveAttendancePercentage(data, totalPresent),
        syncedToSheetAt: data.syncedToSheetAt,
      };
    });

    const merged = new Map<string, AttendanceHistoryEntry>(fromFirestore.map((d) => [d.date, d]));
    for (const local of readLocalAttendanceDates()) {
      if (!merged.has(local.date)) merged.set(local.date, local);
    }
    return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    console.warn('Error fetching attendance dates', err);
  }

  return readLocalAttendanceDates().sort((a, b) => b.date.localeCompare(a.date));
}
