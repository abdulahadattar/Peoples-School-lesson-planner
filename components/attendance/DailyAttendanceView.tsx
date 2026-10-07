import React, { useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { printAttendanceSlip } from '../../services/attendancePrint';
import { exportAttendanceCSV } from '../../services/attendanceService';
import { EnrollmentEditorModal } from './EnrollmentEditorModal';
import { AttendanceSummaryCards } from './AttendanceSummaryCards';
import { AttendanceHistoryDrawer } from './AttendanceHistoryDrawer';
import { AttendanceHeader } from './AttendanceHeader';
import { AttendanceActionToolbar } from './AttendanceActionToolbar';
import { AttendanceOfflineBanner } from './AttendanceOfflineBanner';
import { AttendanceTable } from './AttendanceTable';
import { AttendanceNotesBar } from './AttendanceNotesBar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { useDailyAttendance } from './useDailyAttendance';

export const DailyAttendanceView: React.FC = () => {
  const { config: schoolConfig, saveConfig } = useSchoolConfig();
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  const {
    selectedDate,
    setSelectedDate,
    enrollments,
    setEnrollments,
    currentUser,
    isAdmin,
    showEnrollmentModal,
    setShowEnrollmentModal,
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
  } = useDailyAttendance(schoolConfig, showToast);

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

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 animate-fadeInUp">
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

      <AttendanceHeader
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        isSyncingEnrollment={isSyncingEnrollment}
        onRefreshEnrollments={refreshEnrollments}
        onOpenHistoryDrawer={() => setShowHistoryDrawer(true)}
      />

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

      {loadError && (
        <AttendanceOfflineBanner
          loadError={loadError}
          selectedDate={selectedDate}
          isLoading={isLoading}
          onRetry={() => loadDateAttendance(selectedDate)}
        />
      )}

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
