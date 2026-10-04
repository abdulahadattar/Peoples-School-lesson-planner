import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import {
  ClassEnrollment,
  ClassAttendanceRow,
  DailyAttendanceRecord,
  SchoolAttendanceSummary,
  DEFAULT_GRADE_ENROLLMENTS,
  computeEnrollmentsFromRecords,
  buildAttendanceRows,
  calculateSchoolSummary,
  saveAttendanceRecord,
  loadAttendanceRecord,
  loadAttendanceDates,
  exportAttendanceCSV,
  cleanAttendanceInCharge,
  markAttendanceSyncedToSheet,
} from '../../services/attendanceService';
import { printAttendanceSlip } from '../../services/attendancePrint';
import { fetchSheetData, syncAttendanceToSheet } from '../../services/googleSheetsService';
import { getAccessToken, getCurrentUser, initAuth } from '../../services/googleAuth';
import { isUserAdmin } from '../../services/adminService';
import { EnrollmentEditorModal } from './EnrollmentEditorModal';
import { AttendanceSummaryCards } from './AttendanceSummaryCards';
import { AttendanceHistoryDrawer, AttendanceHistoryItem } from './AttendanceHistoryDrawer';
import { AttendanceHeader } from './AttendanceHeader';
import { AttendanceActionToolbar } from './AttendanceActionToolbar';
import { AttendanceOfflineBanner } from './AttendanceOfflineBanner';
import { AttendanceTable } from './AttendanceTable';
import { AttendanceNotesBar } from './AttendanceNotesBar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { User } from 'firebase/auth';
import { getTodayDateString } from '../../utils/dateHelpers';

export const DailyAttendanceView: React.FC = () => {
  const { config: schoolConfig, saveConfig } = useSchoolConfig();
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
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  const isAdmin = useMemo(() => isUserAdmin(currentUser?.email), [currentUser]);

  // Derive class teachers map from school config
  const classTeachersMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (schoolConfig?.classes) {
      schoolConfig.classes.forEach((c) => {
        if (c.classTeacher) map[c.classKey] = c.classTeacher;
      });
    }
    return map;
  }, [schoolConfig?.classes]);

  // Derive manual enrollments from school config
  const manualEnrollments: ClassEnrollment[] = useMemo(() => {
    if (!schoolConfig?.classes?.length) return DEFAULT_GRADE_ENROLLMENTS;
    return schoolConfig.classes.map((c) => ({
      classKey: c.classKey,
      romanName: c.romanName,
      displayName: c.displayName,
      enrolledBoys: c.enrolledBoys,
      enrolledGirls: c.enrolledGirls,
      totalEnrollment: c.totalEnrollment || c.enrolledBoys + c.enrolledGirls,
    }));
  }, [schoolConfig?.classes]);

  // Auth listener for admin privileges
  useEffect(() => {
    const unsub = initAuth(
      (u) => setCurrentUser(u),
      () => setCurrentUser(null)
    );
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  const refreshEnrollments = useCallback(
    async (force = false) => {
      if (schoolConfig?.enrollmentMode === 'manual' && !force) {
        setEnrollments(manualEnrollments);
        return;
      }
      setIsSyncingEnrollment(true);
      try {
        const token = await getAccessToken();
        const res = await fetchSheetData(undefined, undefined, token, force);
        if (res.records && res.records.length > 0) {
          const liveEnrollments = computeEnrollmentsFromRecords(res.records, manualEnrollments);
          setEnrollments(liveEnrollments);
          if (force) showToast('Live enrollment sync complete!', 'success');
        } else {
          setEnrollments(manualEnrollments);
        }
      } catch (err) {
        console.warn('Falling back to manual configured school enrollment:', err);
        setEnrollments(manualEnrollments);
      } finally {
        setIsSyncingEnrollment(false);
      }
    },
    [schoolConfig?.enrollmentMode, manualEnrollments, showToast]
  );

  useEffect(() => {
    if (schoolConfig?.enrollmentMode === 'manual') {
      setEnrollments(manualEnrollments);
    } else {
      refreshEnrollments();
    }
  }, [schoolConfig?.enrollmentMode, manualEnrollments, refreshEnrollments]);

  // Load attendance for the selected date
  const loadDateAttendance = useCallback(async (date: string) => {
    setIsLoading(true);
    setSaveConfirmedOverBlank(false);
    try {
      const result = await loadAttendanceRecord(date);
      if (result.status === 'error') {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);

      const record = result.record;
      if (record && record.classes && Object.keys(record.classes).length > 0) {
        const loadedInputs: Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }> = {};
        Object.entries(record.classes).forEach(([key, val]) => {
          loadedInputs[key] = {
            presentBoys: typeof val.presentBoys === 'number' ? val.presentBoys : '',
            presentGirls: typeof val.presentGirls === 'number' ? val.presentGirls : '',
            classTeacher: val.classTeacher || '',
          };
        });
        setInputs(loadedInputs);
        setRecordedBy(cleanAttendanceInCharge(record.recordedBy));
        setNotes(record.notes || '');
        setLastSavedTime(record.updatedAt ? new Date(record.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null);
        setLastSheetSyncTime(record.syncedToSheetAt ? new Date(record.syncedToSheetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null);
        setHasUnsavedChanges(false);
      } else {
        setInputs({});
        setNotes('');
        setLastSavedTime(null);
        setLastSheetSyncTime(null);
        setHasUnsavedChanges(false);
      }
    } catch (err: any) {
      setLoadError(`Could not load attendance for ${date}: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDateAttendance(selectedDate);
  }, [selectedDate, loadDateAttendance]);

  const refreshHistory = useCallback(async () => {
    const list = await loadAttendanceDates();
    setHistoryList(list);
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory, lastSavedTime, lastSheetSyncTime]);

  // Derived Rows & Summary
  const attendanceRows: ClassAttendanceRow[] = useMemo(() => {
    return buildAttendanceRows(enrollments, inputs, classTeachersMap);
  }, [enrollments, inputs, classTeachersMap]);

  const schoolSummary: SchoolAttendanceSummary = useMemo(() => {
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
      setInputs(prev => ({
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

    setInputs(prev => ({
      ...prev,
      [classKey]: {
        ...(prev[classKey] || { presentBoys: '', presentGirls: '' }),
        [field]: safeVal,
      },
    }));
  };

  const handleClearForm = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Clear Attendance Inputs',
      message: 'Are you sure you want to clear all attendance inputs for this day?',
      variant: 'danger',
      confirmLabel: 'Clear Form',
      onConfirm: () => {
        setInputs({});
        setHasUnsavedChanges(true);
        setConfirmDialog(null);
        showToast('Form cleared.', 'info');
      },
    });
  };

  // 1. Save Attendance to Database / Storage (Firestore & Local)
  const executeSaveToDatabase = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const classesData: Record<string, { presentBoys: number; presentGirls: number; classTeacher?: string }> = {};
      attendanceRows.forEach(row => {
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

  const handleSaveToDatabase = async () => {
    if (loadError && !saveConfirmedOverBlank) {
      setConfirmDialog({
        isOpen: true,
        title: 'Save Over Incomplete Data Warning',
        message: `${loadError}\n\nThe register is blank because of this, not because nothing was recorded. Saving now will overwrite any existing record for ${selectedDate} with the figures entered here.`,
        variant: 'warning',
        confirmLabel: 'Save Anyway',
        onConfirm: () => {
          setSaveConfirmedOverBlank(true);
          setConfirmDialog(null);
          executeSaveToDatabase();
        },
      });
      return;
    }
    await executeSaveToDatabase();
  };

  // 2. Sync Attendance to Google Sheet (User on-demand action)
  const handleSyncToGoogleSheet = async (targetDate: string = selectedDate) => {
    const isCurrentDate = targetDate === selectedDate;
    if (isCurrentDate) {
      setIsSyncingToSheet(true);
      // Auto-persist latest inputs to database before syncing
      if (hasUnsavedChanges) {
        await executeSaveToDatabase();
      }
    } else {
      setSyncingHistoryDate(targetDate);
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        showToast('Please sign in with Google in the top bar to sync with Google Sheet.', 'info');
        return;
      }

      let rowsToSync = attendanceRows;
      let summaryToSync = schoolSummary;
      let inCharge = cleanAttendanceInCharge(recordedBy);
      let notesToSync = notes;

      // If syncing a historical date different from selectedDate, load that date's record
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

      const result = await syncAttendanceToSheet({
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
      }, token);

      const now = Date.now();
      await markAttendanceSyncedToSheet(targetDate, now);
      const syncTimeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isCurrentDate) {
        setLastSheetSyncTime(syncTimeStr);
      }

      await refreshHistory();
      showToast(
        result.message.startsWith('Attendance synced')
          ? `Attendance for ${targetDate} successfully synced to Google Sheet!`
          : result.message,
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

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 animate-fadeInUp">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-[130] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
            notification.type === 'success'
              ? 'bg-emerald-900/90 text-white border-emerald-700'
              : notification.type === 'error'
              ? 'bg-rose-900/90 text-white border-rose-700'
              : 'bg-brand-surface text-brand-text-primary border-brand-border'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          ) : (
            <Info className="w-4 h-4 text-brand-primary" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <AttendanceHeader
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        isSyncingEnrollment={isSyncingEnrollment}
        onRefreshEnrollments={refreshEnrollments}
        onOpenHistoryDrawer={() => setShowHistoryDrawer(true)}
      />

      {/* Whole School KPI & Overall Attendance Bar */}
      <AttendanceSummaryCards
        schoolSummary={schoolSummary}
        selectedDate={selectedDate}
        schoolConfig={schoolConfig}
        isAdmin={isAdmin}
        isSyncingEnrollment={isSyncingEnrollment}
        onOpenEnrollments={() => setShowEnrollmentModal(true)}
        onSaveConfig={saveConfig}
        showToast={showToast}
      />

      {/* Action Toolbar */}
      <AttendanceActionToolbar
        isAdmin={isAdmin}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSavedTime={lastSavedTime}
        lastSheetSyncTime={lastSheetSyncTime}
        isSaving={isSaving}
        isSyncingToSheet={isSyncingToSheet}
        loadError={loadError}
        onOpenEnrollments={() => setShowEnrollmentModal(true)}
        onClearForm={handleClearForm}
        onPrint={() => printAttendanceSlip(selectedDate, attendanceRows, schoolSummary, recordedBy)}
        onExportCSV={() => exportAttendanceCSV(selectedDate, attendanceRows, schoolSummary)}
        onSaveToDatabase={handleSaveToDatabase}
        onSyncToGoogleSheet={() => handleSyncToGoogleSheet(selectedDate)}
      />

      {/* Offline Alert Banner if date load failed */}
      {loadError && (
        <AttendanceOfflineBanner
          loadError={loadError}
          selectedDate={selectedDate}
          isLoading={isLoading}
          onRetry={() => loadDateAttendance(selectedDate)}
        />
      )}

      {/* Main Grade-by-Grade Attendance Table */}
      <AttendanceTable
        rows={attendanceRows}
        schoolSummary={schoolSummary}
        recordedBy={recordedBy}
        onRecordedByChange={(val) => {
          setRecordedBy(val);
          setHasUnsavedChanges(true);
        }}
        onInputChange={handleInputChange}
      />

      {/* Bottom Notes & Actions Bar */}
      <AttendanceNotesBar
        notes={notes}
        onNotesChange={(val) => {
          setNotes(val);
          setHasUnsavedChanges(true);
        }}
        isSaving={isSaving}
        isSyncingToSheet={isSyncingToSheet}
        loadError={loadError}
        onSaveToDatabase={handleSaveToDatabase}
        onSyncToGoogleSheet={() => handleSyncToGoogleSheet(selectedDate)}
      />

      {/* History / Archive Drawer Modal */}
      <AttendanceHistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        historyList={historyList}
        selectedDate={selectedDate}
        totalEnrolled={schoolSummary.totalEnrolled}
        onSelectDate={setSelectedDate}
        onSyncDate={handleSyncToGoogleSheet}
        syncingDate={syncingHistoryDate}
      />

      {/* Admin Enrollment Editor Modal */}
      <EnrollmentEditorModal
        isOpen={showEnrollmentModal}
        onClose={() => setShowEnrollmentModal(false)}
        currentEnrollments={enrollments}
        onSave={(updated) => {
          setEnrollments(updated);
          showToast('Official class enrollments successfully updated and saved!', 'success');
        }}
        currentUser={currentUser}
      />

      {/* Dynamic Action Confirm Modal */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant || 'danger'}
          confirmLabel={confirmDialog.confirmLabel || 'Confirm'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
};
