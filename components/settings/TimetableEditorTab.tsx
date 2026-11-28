import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, X } from 'lucide-react';
import { Teacher } from '../../types';
import { SchoolConfig } from '../../services/schoolConfigService';
import {
  TimetableClassEntry,
} from '../../services/timetable';
import {
  exportClassWiseTimetableToExcel,
  exportTeacherWiseTimetableToExcel,
  exportSingleClassToExcel,
  exportSingleTeacherToExcel,
} from '../../services/timetableExcelExport';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TimetableToolbar } from './timetable/TimetableToolbar';
import { TimetableClassGridView } from './timetable/TimetableClassGridView';
import { TimetableFacultyView } from './timetable/TimetableFacultyView';
import { TimetableAuditorView } from './timetable/TimetableAuditorView';
import { TimetableCellEditorModal } from './timetable/TimetableCellEditorModal';
import { useTimetableEditor } from './timetable/useTimetableEditor';
import {
  useTimetableBatchActions,
  ConfirmDialogState,
} from './timetable/useTimetableBatchActions';
import type { TimetableJumpTarget } from './useSchoolSettingsState';

export interface TimetableEditorTabProps {
  config: SchoolConfig;
  teachers: Teacher[];
  onUpdateCustomTimetable: (updatedCustomTimetable: TimetableClassEntry[]) => void;
  isSaving?: boolean;
  jumpTarget?: TimetableJumpTarget | null;
  onClearJumpTarget?: () => void;
}

export const TimetableEditorTab: React.FC<TimetableEditorTabProps> = ({
  config,
  teachers,
  onUpdateCustomTimetable,
  isSaving,
  jumpTarget,
  onClearJumpTarget,
}) => {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const {
    viewMode,
    setViewMode,
    classFilter,
    setClassFilter,
    exportNotice,
    setExportNotice,
    exportMenuOpen,
    setExportMenuOpen,
    exportMenuRef,
    classList,
    filteredClasses,
    selectedClassLabel,
    setSelectedClassLabel,
    selectedTeacherId,
    setSelectedTeacherId,
    timetableMap,
    setTimetableMap,
    setHasUnsavedChanges,
    sheetSync,
    pushPreview,
    setPushPreview,
    syncing,
    reconnecting,
    sheetChangedUnderEdits,
    lastSyncedLabel,
    editingCell,
    setEditingCell,
    cellSubject,
    setCellSubject,
    cellTeacher,
    setCellTeacher,
    isParallel,
    setIsParallel,
    parallelSubject,
    setParallelSubject,
    parallelTeacher,
    setParallelTeacher,
    currentEntry,
    selectedClassInfo,
    auditReport,
    teacherSchedule,
    qualifiedFaculty,
    selectedTeacherAvailability,
    parallelTeacherAvailability,
    showNotice,
    handleOpenCellEditor,
    handleSelectSubject,
    handleSuggestConflictFree,
    handleSaveCell,
    handleSaveToCloud,
    executeRefreshFromSheet,
    handleSyncToSheet,
    handleConfirmPushToSheet,
    handleReconnectSheets,
  } = useTimetableEditor(config, teachers, onUpdateCustomTimetable);

  useEffect(() => {
    if (!jumpTarget) return;
    setSelectedClassLabel(jumpTarget.classLabel);
    setViewMode('class');
    handleOpenCellEditor(jumpTarget.dayKey, jumpTarget.periodIndex, jumpTarget.classLabel);
    onClearJumpTarget?.();
  }, [jumpTarget?.token]);

  const {
    handleCopyDayToWeekdays,
    handleAutoFillEmptySlots,
    handleResetClass,
  } = useTimetableBatchActions(
    selectedClassLabel,
    selectedClassInfo,
    teachers,
    setTimetableMap,
    setHasUnsavedChanges,
    showNotice,
    setConfirmDialog,
    config.periods
  );

  const schoolTitle = config.schoolName || 'School Portal';

  return (
    <div className="space-y-6">
      {exportNotice &&
        createPortal(
          <div className="fixed top-5 right-5 z-[130] px-4 py-3 rounded-2xl bg-brand-surface border border-brand-primary text-brand-text-primary shadow-2xl flex items-center gap-3 animate-scaleIn">
            <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="text-xs font-semibold">{exportNotice}</div>
            <button
              type="button"
              onClick={() => setExportNotice(null)}
              aria-label="Dismiss notification"
              className="text-brand-text-secondary hover:text-brand-text-primary ml-2 cursor-pointer p-1 rounded-lg"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>,
          document.body
        )}

      <TimetableToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        auditReport={auditReport}
        exportMenuOpen={exportMenuOpen}
        setExportMenuOpen={setExportMenuOpen}
        exportMenuRef={exportMenuRef}
        selectedClassLabel={selectedClassLabel}
        isSaving={isSaving}
        onSaveToCloud={handleSaveToCloud}
        onExportAllClassesExcel={() => {
          const file = exportClassWiseTimetableToExcel(timetableMap, teachers, schoolTitle);
          showNotice(`Downloaded Class-Wise Excel Workbook: ${file}`);
        }}
        onExportAllTeachersExcel={() => {
          const file = exportTeacherWiseTimetableToExcel(timetableMap, teachers, schoolTitle);
          showNotice(`Downloaded Teacher-Wise Master Excel Workbook: ${file}`);
        }}
        onExportSingleClassExcel={() => {
          const file = exportSingleClassToExcel(currentEntry, teachers, schoolTitle);
          showNotice(`Downloaded Excel Timetable for Class ${selectedClassLabel}: ${file}`);
        }}
        onExportSingleTeacherExcel={() => {
          const file = exportSingleTeacherToExcel(selectedTeacherId, timetableMap, teachers, schoolTitle);
          const teacherName = teachers.find((t) => t.id === selectedTeacherId)?.name || 'Teacher';
          showNotice(`Downloaded Excel Schedule for ${teacherName}: ${file}`);
        }}
        sheetSync={sheetSync}
        lastSyncedLabel={lastSyncedLabel}
        syncing={syncing}
        reconnecting={reconnecting}
        sheetChangedUnderEdits={sheetChangedUnderEdits}
        pushPreview={pushPreview}
        setPushPreview={setPushPreview}
        onRefreshFromSheet={executeRefreshFromSheet}
        onSyncToSheet={handleSyncToSheet}
        onReconnectSheets={handleReconnectSheets}
        onConfirmPushToSheet={handleConfirmPushToSheet}
      />

      {viewMode === 'class' && (
        <TimetableClassGridView
          filteredClasses={filteredClasses}
          classList={classList as any}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          selectedClassLabel={selectedClassLabel}
          setSelectedClassLabel={setSelectedClassLabel}
          selectedClassInfo={selectedClassInfo as any}
          currentEntry={currentEntry}
          auditReport={auditReport}
          timetableMap={timetableMap}
          teachers={teachers}
          onOpenCellEditor={handleOpenCellEditor}
          onExportSingleClassExcel={() => {
            const file = exportSingleClassToExcel(currentEntry, teachers, 'Peoples Secondary School');
            showNotice(`Downloaded Excel Timetable for Class ${selectedClassLabel}: ${file}`);
          }}
          onAutoFillEmptySlots={handleAutoFillEmptySlots}
          onCopyDayToWeekdays={handleCopyDayToWeekdays}
          onResetClass={handleResetClass}
        />
      )}

      {viewMode === 'faculty' && (
        <TimetableFacultyView
          teachers={teachers}
          selectedTeacherId={selectedTeacherId}
          onSelectTeacherId={setSelectedTeacherId}
          teacherSchedule={teacherSchedule}
          onOpenCellEditor={(dayKey, pIdx, clsLabel) => handleOpenCellEditor(dayKey, pIdx, clsLabel)}
          onExportSingleTeacherExcel={() => {
            const file = exportSingleTeacherToExcel(selectedTeacherId, timetableMap, teachers, 'Peoples Secondary School');
            const teacherName = teachers.find((t) => t.id === selectedTeacherId)?.name || 'Teacher';
            showNotice(`Downloaded Excel Schedule for ${teacherName}: ${file}`);
          }}
        />
      )}

      {viewMode === 'auditor' && (
        <TimetableAuditorView
          auditReport={auditReport}
          onResolveClash={(dayKey, periodIndex, classLabel) => {
            setSelectedClassLabel(classLabel);
            setViewMode('class');
            handleOpenCellEditor(dayKey, periodIndex, classLabel);
          }}
        />
      )}

      <TimetableCellEditorModal
        editingCell={editingCell}
        cellSubject={cellSubject}
        setCellSubject={setCellSubject}
        cellTeacher={cellTeacher}
        setCellTeacher={setCellTeacher}
        isParallel={isParallel}
        setIsParallel={setIsParallel}
        parallelSubject={parallelSubject}
        setParallelSubject={setParallelSubject}
        parallelTeacher={parallelTeacher}
        setParallelTeacher={setParallelTeacher}
        selectedClassInfo={selectedClassInfo}
        teachers={teachers}
        qualifiedFaculty={qualifiedFaculty}
        selectedTeacherAvailability={selectedTeacherAvailability || undefined}
        parallelTeacherAvailability={parallelTeacherAvailability || undefined}
        onSelectSubject={handleSelectSubject}
        onSuggestConflictFree={handleSuggestConflictFree}
        onSave={handleSaveCell}
        onClose={() => setEditingCell(null)}
      />

      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant || 'warning'}
          confirmLabel={confirmDialog.confirmLabel || 'Confirm'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
};
