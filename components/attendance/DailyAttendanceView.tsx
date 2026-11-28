import React, { useState } from 'react';
import { printAttendanceSlip } from '../../services/attendancePrint';
import { exportAttendanceCSV, exportAttendanceExcel } from '../../services/attendanceService';
import { EnrollmentEditorModal } from './EnrollmentEditorModal';
import { AttendanceSummaryCards } from './AttendanceSummaryCards';
import { AttendanceHistoryDrawer } from './AttendanceHistoryDrawer';
import { AttendanceHeader } from './AttendanceHeader';
import { AttendanceActionToolbar } from './AttendanceActionToolbar';
import { AttendanceTable } from './AttendanceTable';
import { AttendanceNotesBar } from './AttendanceNotesBar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { useToast } from '../../hooks/useToast';
import { syncSchoolConfigEnrollments } from '../../services/schoolConfig/propagation';
import { useDailyAttendance } from './useDailyAttendance';

export const DailyAttendanceView: React.FC = () => {
  const { config: schoolConfig, saveConfig } = useSchoolConfig();
  const { showToast, ToastComponent } = useToast(4500);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  const {
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
    isSyncingEnrollment,
    lastSavedTime,
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
  } = useDailyAttendance(schoolConfig, showToast);

  const handleClearForm = () => {
    if (isOffline) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Clear Attendance Inputs',
      message: 'Are you sure you want to clear all attendance inputs for this day?',
      variant: 'danger',
      confirmLabel: 'Clear Form',
      onConfirm: () => {
        clearInputs();
        setConfirmDialog(null);
        showToast('Form cleared and syncing.', 'info');
      },
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6">
      {ToastComponent}

      <AttendanceHeader
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        isSyncingEnrollment={isSyncingEnrollment}
        onRefreshEnrollments={() => {
          void refreshEnrollments(false);
        }}
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
        syncStatus={syncStatus}
        lastSavedTime={lastSavedTime}
        isOffline={isOffline}
        onOpenEnrollments={() => setShowEnrollmentModal(true)}
        onClearForm={handleClearForm}
        onPrint={() => printAttendanceSlip(selectedDate, attendanceRows, schoolSummary, recordedBy)}
        onExportExcel={() => exportAttendanceExcel(selectedDate, attendanceRows, schoolSummary, recordedBy, notes)}
        onExportCSV={() => exportAttendanceCSV(selectedDate, attendanceRows, schoolSummary)}
      />

      <AttendanceTable
        rows={attendanceRows}
        schoolSummary={schoolSummary}
        recordedBy={recordedBy}
        disabled={isOffline}
        onRecordedByChange={setRecordedBy}
        onInputChange={handleInputChange}
      />

      <AttendanceNotesBar
        notes={notes}
        disabled={isOffline}
        onNotesChange={setNotes}
      />

      <AttendanceHistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        historyList={historyList}
        selectedDate={selectedDate}
        totalEnrolled={schoolSummary.totalEnrolled}
        onSelectDate={setSelectedDate}
      />

      <EnrollmentEditorModal
        isOpen={showEnrollmentModal}
        onClose={() => setShowEnrollmentModal(false)}
        currentEnrollments={enrollments}
        onSave={async (updated) => {
          setEnrollments(updated);
          if (isAdmin) {
            try {
              await saveConfig({
                ...schoolConfig,
                classes: syncSchoolConfigEnrollments(schoolConfig.classes, updated),
              });
            } catch {
              // Class enrollments already saved to settings/classEnrollments
            }
          }
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
