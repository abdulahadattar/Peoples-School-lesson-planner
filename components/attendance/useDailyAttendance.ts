import { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  ClassEnrollment,
  ClassAttendanceRow,
  DEFAULT_GRADE_ENROLLMENTS,
  computeEnrollmentsFromRecords,
  buildAttendanceRows,
  calculateSchoolSummary,
  loadAttendanceRecord,
} from '../../services/attendanceService';
import { fetchSheetData } from '../../services/googleSheetsService';
import { getCurrentUser } from '../../services/googleAuth';
import { isUserAdmin } from '../../services/adminService';
import { AttendanceHistoryItem } from './AttendanceHistoryDrawer';
import { SchoolConfig } from '../../types';
import { getTodayDateString } from '../../utils/dateHelpers';
import {
  saveAttendanceToDb,
  syncAttendanceWithSheet,
  fetchAttendanceHistoryList,
} from './attendanceSyncActions';

export function useDailyAttendance(
  schoolConfig: SchoolConfig,
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void
) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(DEFAULT_GRADE_ENROLLMENTS);
  const [currentUser, setCurrentUser] = useState<User | null>(getCurrentUser());
  const [showEnrollmentModal, setShowEnrollmentModal] = useState<boolean>(false);
  const [inputs, setInputs] = useState<Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }>>({});
  const [recordedBy, setRecordedBy] = useState<string>(schoolConfig?.classes?.[0]?.classTeacher || '');
  const [notes, setNotes] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncingToSheet, setIsSyncingToSheet] = useState<boolean>(false);
  const [syncingHistoryDate, setSyncingHistoryDate] = useState<string | null>(null);
  const [isSyncingEnrollment, setIsSyncingEnrollment] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [lastSheetSyncTime, setLastSheetSyncTime] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveConfirmedOverBlank, setSaveConfirmedOverBlank] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<AttendanceHistoryItem[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);

  const isAdmin = useMemo(() => isUserAdmin(currentUser?.email), [currentUser]);

  const classTeachersMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (schoolConfig?.classes) {
      schoolConfig.classes.forEach((c) => {
        if (c.classTeacher) map[c.classKey] = c.classTeacher;
      });
    }
    return map;
  }, [schoolConfig?.classes]);

  const refreshHistory = useCallback(async () => {
    try {
      const items = await fetchAttendanceHistoryList();
      setHistoryList(items);
    } catch (e) {
      console.warn('Could not refresh attendance history:', e);
    }
  }, []);

  const refreshEnrollments = useCallback(async () => {
    setIsSyncingEnrollment(true);
    try {
      const data = await fetchSheetData();
      if (data && data.records && data.records.length > 0) {
        const computed = computeEnrollmentsFromRecords(data.records);
        setEnrollments(computed);
        showToast(`Enrollment synced from Google Sheet (${data.records.length} records).`, 'success');
      } else {
        showToast('Using local enrollment baseline (868 students).', 'info');
      }
    } catch {
      showToast('Could not fetch enrollment from sheet. Using local baseline.', 'info');
    } finally {
      setIsSyncingEnrollment(false);
    }
  }, [showToast]);

  const loadDateAttendance = useCallback(
    async (dateStr: string) => {
      setIsLoading(true);
      setLoadError(null);
      setHasUnsavedChanges(false);
      try {
        const res = await loadAttendanceRecord(dateStr);
        if (res.status === 'ok' && res.record) {
          const rec = res.record;
          const loadedInputs: Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }> = {};
          Object.entries(rec.classes || {}).forEach(([classKey, val]) => {
            loadedInputs[classKey] = {
              presentBoys: val.presentBoys ?? '',
              presentGirls: val.presentGirls ?? '',
              classTeacher: val.classTeacher || classTeachersMap[classKey] || '',
            };
          });
          setInputs(loadedInputs);
          setRecordedBy(rec.recordedBy || schoolConfig?.classes?.[0]?.classTeacher || '');
          setNotes(rec.notes || '');
          if (rec.updatedAt) {
            setLastSavedTime(new Date(rec.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          }
          if (rec.syncedToSheetAt) {
            setLastSheetSyncTime(new Date(rec.syncedToSheetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          } else {
            setLastSheetSyncTime(null);
          }
        } else {
          setInputs({});
          setRecordedBy(schoolConfig?.classes?.[0]?.classTeacher || '');
          setNotes('');
          setLastSavedTime(null);
          setLastSheetSyncTime(null);
        }
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load attendance');
      } finally {
        setIsLoading(false);
      }
    },
    [classTeachersMap, schoolConfig?.classes]
  );

  useEffect(() => {
    loadDateAttendance(selectedDate);
    refreshHistory();
  }, [selectedDate, loadDateAttendance, refreshHistory]);

  const attendanceRows = useMemo<ClassAttendanceRow[]>(() => {
    return buildAttendanceRows(enrollments, inputs, classTeachersMap);
  }, [enrollments, inputs, classTeachersMap]);

  const schoolSummary = useMemo(() => {
    return calculateSchoolSummary(selectedDate, attendanceRows);
  }, [selectedDate, attendanceRows]);

  const handleInputChange = (
    classKey: string,
    field: 'presentBoys' | 'presentGirls',
    rawVal: string,
    maxVal: number
  ) => {
    setHasUnsavedChanges(true);

    if (rawVal === '') {
      setInputs((prev) => ({
        ...prev,
        [classKey]: {
          ...(prev[classKey] || { presentBoys: '', presentGirls: '' }),
          [field]: '',
        },
      }));
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
  };

  const executeSaveToDatabase = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      await saveAttendanceToDb(selectedDate, recordedBy, notes, attendanceRows);
      const savedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setHasUnsavedChanges(false);
      setLastSavedTime(savedTime);
      showToast(`Daily attendance for ${selectedDate} saved to app database & storage.`, 'success');
      await refreshHistory();
      return true;
    } catch (err: any) {
      console.error('Save to database failed:', err);
      showToast('Error saving attendance to database. Saved locally.', 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncToGoogleSheet = async (targetDate: string = selectedDate) => {
    const isCurrentDate = targetDate === selectedDate;
    if (isCurrentDate) {
      setIsSyncingToSheet(true);
      if (hasUnsavedChanges) {
        await executeSaveToDatabase();
      }
    } else {
      setSyncingHistoryDate(targetDate);
    }

    try {
      const res = await syncAttendanceWithSheet(
        targetDate,
        isCurrentDate,
        attendanceRows,
        schoolSummary,
        recordedBy,
        notes,
        enrollments,
        classTeachersMap
      );

      if (isCurrentDate) {
        setLastSheetSyncTime(res.syncTimeStr);
      }
      await refreshHistory();
      showToast(
        res.message.startsWith('Attendance synced')
          ? `Attendance for ${targetDate} successfully synced to Google Sheet!`
          : res.message,
        'success'
      );
    } catch (syncErr: any) {
      console.error('Google Sheet sync error:', syncErr);
      showToast(`Google Sheet sync failed: ${syncErr?.message || syncErr}`, 'error');
    } finally {
      if (isCurrentDate) {
        setIsSyncingToSheet(false);
      } else {
        setSyncingHistoryDate(null);
      }
    }
  };

  return {
    selectedDate,
    setSelectedDate,
    enrollments,
    setEnrollments,
    currentUser,
    isAdmin,
    showEnrollmentModal,
    setShowEnrollmentModal,
    inputs,
    setInputs,
    recordedBy,
    setRecordedBy,
    notes,
    setNotes,
    isLoading,
    isSaving,
    isSyncingToSheet,
    syncingHistoryDate,
    isSyncingEnrollment,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    lastSavedTime,
    lastSheetSyncTime,
    loadError,
    saveConfirmedOverBlank,
    setSaveConfirmedOverBlank,
    historyList,
    showHistoryDrawer,
    setShowHistoryDrawer,
    attendanceRows,
    schoolSummary,
    refreshEnrollments,
    loadDateAttendance,
    handleInputChange,
    executeSaveToDatabase,
    handleSyncToGoogleSheet,
  };
}
