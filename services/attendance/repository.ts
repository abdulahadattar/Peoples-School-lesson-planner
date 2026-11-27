import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  ClassEnrollment,
  DailyAttendanceRecord,
  AttendanceHistoryEntry,
  AttendanceLoadResult,
  DEFAULT_GRADE_ENROLLMENTS,
} from './types';
import {
  countTotalPresent,
  resolveAttendancePercentage,
  pickNewerAttendanceRecord,
  mergeAttendanceHistoryEntries,
} from './calculations';

export type AttendanceSaveOutcome =
  | { status: 'synced'; updatedAt: number }
  | { status: 'offline' | 'auth_required' | 'error'; error: string };

function safeWriteLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[attendance] Failed to cache "${key}" in localStorage:`, err);
  }
}

export function isOfflineError(err: unknown): boolean {
  if (!err) return false;
  const str = String((err as any)?.message || err).toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();
  return (
    code === 'unavailable' ||
    str.includes('client is offline') ||
    str.includes('failed to get document because the client is offline') ||
    str.includes('network') ||
    str.includes('offline') ||
    str.includes('timed out')
  );
}

export function isPermissionError(err: unknown): boolean {
  if (!err) return false;
  const str = String((err as any)?.message || err).toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();
  return (
    code === 'permission-denied' ||
    str.includes('missing or insufficient permissions') ||
    str.includes('permission-denied')
  );
}

const FIRESTORE_READ_TIMEOUT_MS = 2500;

function withReadTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${FIRESTORE_READ_TIMEOUT_MS}ms`));
    }, FIRESTORE_READ_TIMEOUT_MS);
    promise.then(
      (val) => {
        if (timer) clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function probeFirestoreConnectivity(): Promise<'online' | 'offline'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline';
  }
  try {
    await withReadTimeout(getDocFromServer(doc(db, 'test', 'connection')), 'Firestore server probe');
    return 'online';
  } catch (err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'offline';
    }
    // A permission error still proves the Firestore server responded over the network
    if (isPermissionError(err)) return 'online';
    // A client-side probe timeout while navigator.onLine is true means Firestore is slow or blocked,
    // not that the user's internet connection is offline.
    const msg = String((err as any)?.message || err).toLowerCase();
    if (msg.includes('timed out')) return 'online';
    if (isOfflineError(err)) return 'offline';
    return 'online';
  }
}

export function readLocalAttendanceRecord(date: string): {
  record: DailyAttendanceRecord | null;
  parseError: string | null;
} {
  try {
    const localStr = localStorage.getItem(`attendance_${date}`);
    if (!localStr) return { record: null, parseError: null };
    return { record: JSON.parse(localStr) as DailyAttendanceRecord, parseError: null };
  } catch (error: any) {
    return { record: null, parseError: error?.message || String(error) };
  }
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
  safeWriteLocalStorage('school_class_enrollments', enrollments);
  try {
    const docRef = doc(db, 'settings', 'classEnrollments');
    await setDoc(docRef, payload);
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Failed to save enrollments to Firestore, saved locally', error);
    }
  }
}

export async function loadClassEnrollments(): Promise<ClassEnrollment[]> {
  try {
    const docRef = doc(db, 'settings', 'classEnrollments');
    const snap = await withReadTimeout(getDoc(docRef), 'Load enrollments');
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.enrollments) && data.enrollments.length > 0) {
        return data.enrollments as ClassEnrollment[];
      }
    }
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Failed to load enrollments from Firestore, checking localStorage', error);
    }
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

const pendingKey = (date: string) => `attendance_pending_${date}`;

export async function saveAttendanceRecord(record: DailyAttendanceRecord): Promise<AttendanceSaveOutcome> {
  safeWriteLocalStorage(`attendance_${record.date}`, record);
  try {
    localStorage.setItem(pendingKey(record.date), String(record.updatedAt));
  } catch {}

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline', error: 'No internet connection.' };
  }

  try {
    const docRef = doc(db, 'daily_attendance', record.date);
    await setDoc(docRef, record, { merge: true });
    try {
      localStorage.removeItem(pendingKey(record.date));
    } catch {}
    return { status: 'synced', updatedAt: record.updatedAt };
  } catch (error: any) {
    const message = error?.message || String(error);
    if (isOfflineError(error)) {
      return { status: 'offline', error: message };
    }
    if (isPermissionError(error)) {
      return { status: 'auth_required', error: 'Sign in with Google to sync changes to Firestore.' };
    }
    console.warn('Failed to save attendance to Firestore, cached locally:', error);
    return { status: 'error', error: message };
  }
}

export async function markAttendanceSyncedToSheet(date: string, timestamp: number = Date.now()): Promise<void> {
  try {
    const localStr = localStorage.getItem(`attendance_${date}`);
    if (localStr) {
      const parsed = JSON.parse(localStr);
      parsed.syncedToSheetAt = timestamp;
      localStorage.setItem(`attendance_${date}`, JSON.stringify(parsed));
    }
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Failed to update syncedToSheetAt in localStorage', error);
    }
  }

  try {
    const docRef = doc(db, 'daily_attendance', date);
    await setDoc(docRef, { syncedToSheetAt: timestamp }, { merge: true });
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Failed to update syncedToSheetAt in Firestore', error);
    }
  }
}

export async function loadAttendanceRecord(date: string): Promise<AttendanceLoadResult> {
  const { record: localRecord, parseError: localParseError } = readLocalAttendanceRecord(date);
  let hasPendingLocal = false;
  try {
    hasPendingLocal = Boolean(localStorage.getItem(pendingKey(date)));
  } catch {}

  let firestoreFailed = false;
  let firestoreError = '';
  let cloudRecord: DailyAttendanceRecord | null = null;
  try {
    const docRef = doc(db, 'daily_attendance', date);
    const docSnap = await withReadTimeout(getDoc(docRef), `Load attendance ${date}`);
    if (docSnap.exists()) {
      cloudRecord = docSnap.data() as DailyAttendanceRecord;
    }
  } catch (error: any) {
    firestoreFailed = true;
    firestoreError = error?.message || String(error);
    if (!isOfflineError(error)) {
      console.warn('Failed to load from Firestore, trying local', error);
    }
  }

  if (cloudRecord || localRecord) {
    return {
      status: 'ok',
      record: pickNewerAttendanceRecord(cloudRecord, localRecord),
      serverSynced: !firestoreFailed && !hasPendingLocal,
      firestoreError: firestoreFailed ? firestoreError : undefined,
    };
  }

  if (localParseError) {
    return { status: 'error', error: `Local cache unreadable: ${localParseError}` };
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

  return { status: 'ok', record: null, serverSynced: true };
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
            updatedAt: data.updatedAt,
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
    const snapshot = await withReadTimeout(getDocs(q), 'Load attendance history');
    const fromFirestore: AttendanceHistoryEntry[] = snapshot.docs.map((d) => {
      const data = d.data() as DailyAttendanceRecord;
      const totalPresent = countTotalPresent(data);
      return {
        date: data.date,
        totalPresent,
        percentage: resolveAttendancePercentage(data, totalPresent),
        updatedAt: data.updatedAt,
        syncedToSheetAt: data.syncedToSheetAt,
      };
    });

    return mergeAttendanceHistoryEntries(fromFirestore, readLocalAttendanceDates());
  } catch (err) {
    if (!isOfflineError(err)) {
      console.warn('Error fetching attendance dates', err);
    }
  }

  return readLocalAttendanceDates().sort((a, b) => b.date.localeCompare(a.date));
}
