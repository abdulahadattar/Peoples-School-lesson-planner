import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../services/firebase';
import {
  ClassEnrollment,
  ClassAttendanceRow,
  DEFAULT_GRADE_ENROLLMENTS,
  computeEnrollmentsFromRecords,
  buildAttendanceRows,
  calculateSchoolSummary,
  loadAttendanceRecord,
  loadClassEnrollments,
  peekCachedClassEnrollments,
  readLocalAttendanceRecord,
  isOfflineError,
  isPermissionError,
  probeFirestoreConnectivity,
} from '../../services/attendanceService';
import { fetchSheetData } from '../../services/googleSheetsService';
import { getCurrentUser } from '../../services/googleAuth';
import { isUserAdmin } from '../../services/adminService';
import { AttendanceHistoryItem } from './AttendanceHistoryDrawer';
import { SchoolConfig } from '../../types';
import { getTodayDateString } from '../../utils/dateHelpers';
import { enrollmentsFromSchoolConfig } from '../../services/schoolConfig/propagation';
import {
  saveAttendanceToDb,
  fetchAttendanceHistoryList,
} from './attendanceSyncActions';

export type AttendanceSyncStatus =
  | 'checking'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'auth_required'
  | 'error';

const AUTO_SYNC_DEBOUNCE_MS = 550;

export function useDailyAttendance(
  schoolConfig: SchoolConfig,
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void
) {
  const [selectedDate, setSelectedDateState] = useState<string>(getTodayDateString());
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(() => {
    const cached = peekCachedClassEnrollments();
    const base = cached && cached.length > 0 ? cached : DEFAULT_GRADE_ENROLLMENTS;
    return schoolConfig?.enrollmentMode !== 'google_sheet'
      ? enrollmentsFromSchoolConfig(schoolConfig?.classes || [], base)
      : base;
  });
  const [currentUser, setCurrentUser] = useState<User | null>(getCurrentUser());
  const [showEnrollmentModal, setShowEnrollmentModal] = useState<boolean>(false);
  const [inputs, setInputs] = useState<
    Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }>
  >({});
  const [recordedBy, setRecordedByState] = useState<string>(
    schoolConfig?.classes?.[0]?.classTeacher || ''
  );
  const [notes, setNotesState] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncingEnrollment, setIsSyncingEnrollment] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [syncStatus, setSyncStatus] = useState<AttendanceSyncStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'checking'
  );

  const [historyList, setHistoryList] = useState<AttendanceHistoryItem[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const isBrowserOffline = () =>
    typeof navigator !== 'undefined' && navigator.onLine === false;

  const isAdmin = useMemo(() => isUserAdmin(currentUser?.email), [currentUser]);
  // Only lock inputs when the browser itself has no internet connection.
  // Slow/unavailable Firestore responses fall back to local caching + Sync Delayed without locking typing.
  const isOffline = !isOnline;

  const classTeachersMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (schoolConfig?.classes) {
      schoolConfig.classes.forEach((c) => {
        if (c.classTeacher) map[c.classKey] = c.classTeacher;
      });
    }
    return map;
  }, [schoolConfig?.classes]);

  const classTeachersMapRef = useRef(classTeachersMap);
  classTeachersMapRef.current = classTeachersMap;
  const defaultClassTeacherRef = useRef(schoolConfig?.classes?.[0]?.classTeacher || '');
  defaultClassTeacherRef.current = schoolConfig?.classes?.[0]?.classTeacher || '';
  const loadSeqRef = useRef(0);
  const manualEnrollmentsLoadedRef = useRef(false);
  const hasPendingEditRef = useRef(false);
  const autoSyncTimerRef = useRef<number | null>(null);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const savedEnrollmentsRef = useRef<ClassEnrollment[]>(DEFAULT_GRADE_ENROLLMENTS);

  const attendanceRows = useMemo<ClassAttendanceRow[]>(() => {
    return buildAttendanceRows(enrollments, inputs, classTeachersMap);
  }, [enrollments, inputs, classTeachersMap]);

  const schoolSummary = useMemo(() => {
    return calculateSchoolSummary(selectedDate, attendanceRows);
  }, [selectedDate, attendanceRows]);

  const latestPayloadRef = useRef({
    selectedDate,
    recordedBy,
    notes,
    attendanceRows,
  });
  latestPayloadRef.current = {
    selectedDate,
    recordedBy,
    notes,
    attendanceRows,
  };

  useEffect(() => {
    let mounted = true;
    loadClassEnrollments()
      .then((loaded) => {
        if (!mounted) return;
        const base = Array.isArray(loaded) && loaded.length > 0 ? loaded : DEFAULT_GRADE_ENROLLMENTS;
        savedEnrollmentsRef.current = base;
        if (!manualEnrollmentsLoadedRef.current && schoolConfig?.enrollmentMode !== 'google_sheet') {
          setEnrollments(enrollmentsFromSchoolConfig(schoolConfig?.classes || [], base));
        }
      })
      .catch((err) => {
        console.warn('Could not load saved enrollments:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const items = await fetchAttendanceHistoryList();
      setHistoryList(items);
    } catch (e) {
      console.warn('Could not refresh attendance history:', e);
    }
  }, []);

  const flushAutoSync = useCallback(async () => {
    if (autoSyncTimerRef.current !== null) {
      window.clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    if (!hasPendingEditRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline(false);
      setSyncStatus('offline');
      return;
    }

    const snap = latestPayloadRef.current;
    hasPendingEditRef.current = false;
    setIsSaving(true);
    setSyncStatus('syncing');

    try {
      const { outcome } = await saveAttendanceToDb(
        snap.selectedDate,
        snap.recordedBy,
        snap.notes,
        snap.attendanceRows
      );
      if (outcome.status === 'synced') {
        const savedTime = new Date(outcome.updatedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        setIsOnline(true);
        setHasUnsavedChanges(false);
        setLastSavedTime(savedTime);
        setSyncStatus('synced');
        void refreshHistory();
      } else if (outcome.status === 'offline') {
        hasPendingEditRef.current = true;
        if (isBrowserOffline()) {
          setIsOnline(false);
          setSyncStatus('offline');
        } else {
          setIsOnline(true);
          setSyncStatus('error');
        }
      } else if (outcome.status === 'auth_required') {
        setIsOnline(true);
        setSyncStatus('auth_required');
      } else {
        setSyncStatus('error');
      }
    } finally {
      setIsSaving(false);
    }
  }, [refreshHistory]);

  const scheduleAutoSync = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline(false);
      setSyncStatus('offline');
      return;
    }
    hasPendingEditRef.current = true;
    setHasUnsavedChanges(true);
    setSyncStatus('syncing');
    if (autoSyncTimerRef.current !== null) {
      window.clearTimeout(autoSyncTimerRef.current);
    }
    autoSyncTimerRef.current = window.setTimeout(() => {
      void flushAutoSync();
    }, AUTO_SYNC_DEBOUNCE_MS);
  }, [flushAutoSync]);

  const refreshEnrollments = useCallback(
    async (silent = false) => {
      setIsSyncingEnrollment(true);
      try {
        const data = await fetchSheetData();
        const base = enrollmentsFromSchoolConfig(
          schoolConfig?.classes || [],
          savedEnrollmentsRef.current
        );
        if (data && data.records && data.records.length > 0) {
          const computed = computeEnrollmentsFromRecords(data.records, base);
          manualEnrollmentsLoadedRef.current = true;
          setEnrollments(computed);
          if (!silent) {
            showToast(`Enrollment updated (${data.records.length} records).`, 'success');
          }
        } else if (!silent) {
          showToast('Using local enrollment baseline (868 students).', 'info');
        }
      } catch {
        if (!silent) {
          showToast('Could not fetch enrollment counts. Using local baseline.', 'info');
        }
      } finally {
        setIsSyncingEnrollment(false);
      }
    },
    [schoolConfig?.classes, showToast]
  );

  useEffect(() => {
    if (schoolConfig?.enrollmentMode === 'google_sheet') {
      void refreshEnrollments(true);
    } else if (schoolConfig?.classes && schoolConfig.classes.length > 0) {
      setEnrollments(
        enrollmentsFromSchoolConfig(schoolConfig.classes, savedEnrollmentsRef.current)
      );
    }
  }, [schoolConfig?.enrollmentMode, schoolConfig?.classes, refreshEnrollments]);

  const applyAttendanceRecord = useCallback((rec: {
    classes?: Record<string, { presentBoys: number; presentGirls: number; classTeacher?: string }>;
    recordedBy?: string;
    notes?: string;
    updatedAt?: number;
  }) => {
    const teachersMap = classTeachersMapRef.current;
    const loadedInputs: Record<
      string,
      { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }
    > = {};
    Object.entries(rec.classes || {}).forEach(([classKey, val]) => {
      loadedInputs[classKey] = {
        presentBoys: val.presentBoys ?? '',
        presentGirls: val.presentGirls ?? '',
        classTeacher: val.classTeacher || teachersMap[classKey] || '',
      };
    });
    setInputs(loadedInputs);
    setRecordedByState(rec.recordedBy || defaultClassTeacherRef.current);
    setNotesState(rec.notes || '');
    if (rec.updatedAt) {
      setLastSavedTime(
        new Date(rec.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } else {
      setLastSavedTime(null);
    }
  }, []);

  const loadDateAttendance = useCallback(
    async (dateStr: string) => {
      const seq = ++loadSeqRef.current;
      setIsLoading(true);
      setHasUnsavedChanges(false);

      const localSnapshot = readLocalAttendanceRecord(dateStr);
      if (localSnapshot.record) {
        applyAttendanceRecord(localSnapshot.record);
      }

      const net = await probeFirestoreConnectivity();
      if (seq !== loadSeqRef.current) return;
      const browserOffline = isBrowserOffline();
      setIsOnline(!browserOffline);

      try {
        const res = await loadAttendanceRecord(dateStr);
        if (seq !== loadSeqRef.current) return;
        if (hasPendingEditRef.current) return;

        if (res.status === 'ok' && res.record) {
          applyAttendanceRecord(res.record);
          if (browserOffline) {
            setIsOnline(false);
            setSyncStatus('offline');
          } else if (res.firestoreError && isPermissionError(res.firestoreError)) {
            setSyncStatus('auth_required');
          } else if (res.firestoreError || net === 'offline') {
            setSyncStatus('error');
          } else if (res.serverSynced === false) {
            hasPendingEditRef.current = true;
            setSyncStatus('syncing');
            void flushAutoSync();
          } else {
            setSyncStatus('synced');
          }
        } else if (res.status === 'ok') {
          setInputs({});
          setRecordedByState(defaultClassTeacherRef.current);
          setNotesState('');
          setLastSavedTime(null);
          setSyncStatus(browserOffline ? 'offline' : net === 'offline' ? 'error' : 'synced');
        } else {
          setInputs({});
          setRecordedByState(defaultClassTeacherRef.current);
          setNotesState('');
          setLastSavedTime(null);
          if (browserOffline) {
            setIsOnline(false);
            setSyncStatus('offline');
          } else if (isPermissionError(res.error)) {
            setSyncStatus('auth_required');
          } else {
            setSyncStatus('error');
          }
        }
      } catch (err: any) {
        if (seq !== loadSeqRef.current) return;
        if (isBrowserOffline()) {
          setIsOnline(false);
          setSyncStatus('offline');
        } else if (isPermissionError(err)) {
          setSyncStatus('auth_required');
        } else {
          setSyncStatus('error');
        }
      } finally {
        if (seq === loadSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [applyAttendanceRecord, flushAutoSync]
  );

  useEffect(() => {
    void loadDateAttendance(selectedDate);
    void refreshHistory();
  }, [selectedDate, loadDateAttendance, refreshHistory]);

  // Real-time browser online/offline listeners + connectivity recovery flush
  useEffect(() => {
    const handleOffline = () => {
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
      setIsOnline(false);
      setSyncStatus('offline');
    };

    const handleOnline = async () => {
      setIsOnline(true);
      const net = await probeFirestoreConnectivity();
      if (hasPendingEditRef.current) {
        await flushAutoSync();
      } else if (net === 'online') {
        await loadDateAttendance(selectedDateRef.current);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, [flushAutoSync, loadDateAttendance]);

  // Flush any pending auto-sync if signed in changes from Guest -> authenticated
  useEffect(() => {
    if (currentUser && isOnline && hasPendingEditRef.current) {
      void flushAutoSync();
    }
  }, [currentUser, isOnline, flushAutoSync]);

  const setSelectedDate = useCallback(
    (nextDate: string) => {
      if (hasPendingEditRef.current) {
        void flushAutoSync();
      }
      setSelectedDateState(nextDate);
    },
    [flushAutoSync]
  );

  const setRecordedBy = useCallback(
    (val: string) => {
      if (isOffline) return;
      setRecordedByState(val);
      scheduleAutoSync();
    },
    [isOffline, scheduleAutoSync]
  );

  const setNotes = useCallback(
    (val: string) => {
      if (isOffline) return;
      setNotesState(val);
      scheduleAutoSync();
    },
    [isOffline, scheduleAutoSync]
  );

  const clearInputs = useCallback(() => {
    if (isOffline) return;
    setInputs({});
    scheduleAutoSync();
  }, [isOffline, scheduleAutoSync]);

  const handleInputChange = useCallback(
    (
      classKey: string,
      field: 'presentBoys' | 'presentGirls',
      rawVal: string,
      maxVal: number
    ) => {
      if (isOffline) return;

      if (rawVal === '') {
        setInputs((prev) => ({
          ...prev,
          [classKey]: {
            ...(prev[classKey] || { presentBoys: '', presentGirls: '' }),
            [field]: '',
          },
        }));
        scheduleAutoSync();
        return;
      }

      const num = parseInt(rawVal, 10);
      if (isNaN(num) || num < 0) return;
      const safeVal = Math.min(num, maxVal);

      setInputs((prev) => ({
        ...prev,
        [classKey]: {
          ...(prev[classKey] || { presentBoys: '', presentGirls: '' }),
          [field]: safeVal,
        },
      }));
      scheduleAutoSync();
    },
    [isOffline, scheduleAutoSync]
  );

  return {
    selectedDate,
    setSelectedDate,
    enrollments,
    setEnrollments,
    currentUser,
    isAdmin,
    showEnrollmentModal,
    setShowEnrollmentModal,
    recordedBy,
    setRecordedBy,
    notes,
    setNotes,
    isLoading,
    isSaving,
    isSyncingEnrollment,
    hasUnsavedChanges,
    lastSavedTime,
    isOnline,
    isOffline,
    syncStatus,
    historyList,
    showHistoryDrawer,
    setShowHistoryDrawer,
    attendanceRows,
    schoolSummary,
    refreshEnrollments,
    handleInputChange,
    clearInputs,
  };
}
