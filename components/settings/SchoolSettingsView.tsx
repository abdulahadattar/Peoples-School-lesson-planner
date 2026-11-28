import React from 'react';
import { AlertCircle } from 'lucide-react';
import { SchoolConfig } from '../../services/schoolConfigService';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { TimetableEditorTab } from './TimetableEditorTab';
import { TimetableAuditorView } from './timetable/TimetableAuditorView';
import { ClassesSettingsTab } from './ClassesSettingsTab';
import { TeachersSettingsTab } from './TeachersSettingsTab';
import { SafeguardsSettingsTab } from './SafeguardsSettingsTab';
import { PeriodsSettingsTab } from './PeriodsSettingsTab';
import { IdentitySettingsTab } from './IdentitySettingsTab';
import { useToast } from '../../hooks/useToast';
import { googleSignIn } from '../../services/googleAuth';
import { SettingsHeaderBanner } from './SettingsHeaderBanner';
import { SettingsTabsNav } from './SettingsTabsNav';
import type { SettingsTab } from './adminNavigation';
import { SchoolSettingsModals } from './SchoolSettingsModals';
import { UnsavedChangesBar } from './UnsavedChangesBar';
import { useSchoolSettingsState } from './useSchoolSettingsState';

export { type SettingsTab };

interface SchoolSettingsViewProps {
  onOpenLoginGate?: () => void;
}

export const SchoolSettingsView: React.FC<SchoolSettingsViewProps> = ({ onOpenLoginGate }) => {
  const {
    config,
    isAdmin,
    currentUser,
    isSaving,
    saveSuccess,
    error,
    saveConfig,
    resetToDefaults,
  } = useSchoolConfig();

  const { showToast, ToastComponent } = useToast(4500);

  const {
    workingConfig,
    setWorkingConfig,
    activeTab,
    setActiveTab,
    activePillar,
    activeTabMeta,
    hasUnsavedChanges,
    searchQuery,
    setSearchQuery,
    editingClass,
    setEditingClass,
    isClassModalOpen,
    setIsClassModalOpen,
    editingTeacher,
    setEditingTeacher,
    isTeacherModalOpen,
    setIsTeacherModalOpen,
    showResetConfirm,
    setShowResetConfirm,
    confirmDialog,
    setConfirmDialog,
    timetableJumpTarget,
    clearTimetableJumpTarget,
    classTotals,
    availableClassKeys,
    filteredClasses,
    filteredTeachers,
    auditReport,
    handleSaveClass,
    handleDeleteClass,
    handleSaveTeacher,
    handleDeleteTeacher,
    handlePeriodChange,
    handleAddPeriod,
    handleRemovePeriod,
    handleDiscardEdits,
    handleResolveAuditorClash,
    handleSaveAll,
    handleExecuteReset,
  } = useSchoolSettingsState(config, saveConfig, resetToDefaults, showToast);

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <SchoolSettingsModals
        showResetConfirm={showResetConfirm}
        onCancelResetConfirm={() => setShowResetConfirm(false)}
        onConfirmReset={handleExecuteReset}
        confirmDialog={confirmDialog}
        onCancelConfirmDialog={() => setConfirmDialog(null)}
        isClassModalOpen={isClassModalOpen}
        onCloseClassModal={() => {
          setIsClassModalOpen(false);
          setEditingClass(null);
        }}
        onSaveClass={handleSaveClass}
        editingClass={editingClass}
        teachers={workingConfig.teachers}
        isTeacherModalOpen={isTeacherModalOpen}
        onCloseTeacherModal={() => {
          setIsTeacherModalOpen(false);
          setEditingTeacher(null);
        }}
        onSaveTeacher={handleSaveTeacher}
        editingTeacher={editingTeacher}
        availableClassKeys={availableClassKeys}
        schoolName={workingConfig.schoolName}
      />

      <SettingsHeaderBanner
        pillarLabel={activePillar.label}
        sectionLabel={activeTabMeta.label}
        sectionDescription={activeTabMeta.description}
        isAdmin={isAdmin}
        currentUser={currentUser}
        isSaving={isSaving}
        saveSuccess={saveSuccess}
        hasUnsavedChanges={hasUnsavedChanges}
        onOpenLoginGate={onOpenLoginGate}
        onGoogleSignIn={async () => {
          try {
            await googleSignIn();
          } catch (err: any) {
            if (
              err?.code !== 'auth/popup-closed-by-user' &&
              err?.code !== 'auth/cancelled-popup-request' &&
              err?.code !== 'auth/user-cancelled'
            ) {
              console.warn('Settings admin sign-in error:', err);
            }
          }
        }}
        onResetBaseline={() => setShowResetConfirm(true)}
        onSaveAll={handleSaveAll}
      />

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <UnsavedChangesBar
        visible={hasUnsavedChanges}
        isAdmin={isAdmin}
        isSaving={isSaving}
        onDiscard={handleDiscardEdits}
        onSave={handleSaveAll}
      />

      {/* 3-Pillar Admin Workspace Layout: Left Rail (Desktop) / Responsive Bar (Mobile) + Active Canvas */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        <SettingsTabsNav
          activeTab={activeTab}
          onTabChange={(nextTab) => {
            setSearchQuery('');
            setActiveTab(nextTab);
          }}
          classesBadge={classTotals.classesCount}
          teachersBadge={workingConfig.teachers.length}
          timetableBadge={workingConfig.customTimetable?.length || classTotals.classesCount}
          periodsBadge={workingConfig.periods.length}
          clashesCount={auditReport.totalClashes}
        />

        <div className="flex-1 min-w-0 w-full space-y-6">
          {activeTab === 'identity' && (
            <IdentitySettingsTab
              workingConfig={workingConfig}
              setWorkingConfig={setWorkingConfig}
            />
          )}

          {activeTab === 'classes' && (
            <ClassesSettingsTab
              workingConfig={workingConfig}
              setWorkingConfig={setWorkingConfig}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredClasses={filteredClasses}
              classTotals={classTotals}
              onAddClass={() => {
                setEditingClass(null);
                setIsClassModalOpen(true);
              }}
              onEditClass={(cls) => {
                setEditingClass(cls);
                setIsClassModalOpen(true);
              }}
              onDeleteClass={handleDeleteClass}
            />
          )}

          {activeTab === 'teachers' && (
            <TeachersSettingsTab
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredTeachers={filteredTeachers}
              schoolName={workingConfig.schoolName}
              onAddTeacher={() => {
                setEditingTeacher(null);
                setIsTeacherModalOpen(true);
              }}
              onEditTeacher={(teacher) => {
                setEditingTeacher(teacher);
                setIsTeacherModalOpen(true);
              }}
              onDeleteTeacher={handleDeleteTeacher}
            />
          )}

          {activeTab === 'periods' && (
            <PeriodsSettingsTab
              workingConfig={workingConfig}
              setWorkingConfig={setWorkingConfig}
              onAddPeriod={handleAddPeriod}
              onPeriodChange={handlePeriodChange}
              onRemovePeriod={handleRemovePeriod}
            />
          )}

          {activeTab === 'timetable' && (
            <div className="animate-fadeIn">
              <TimetableEditorTab
                config={workingConfig}
                teachers={workingConfig.teachers}
                isSaving={isSaving}
                jumpTarget={timetableJumpTarget}
                onClearJumpTarget={clearTimetableJumpTarget}
                onUpdateCustomTimetable={(updated) => {
                  const newConfig: SchoolConfig = {
                    ...workingConfig,
                    customTimetable: updated,
                  };
                  setWorkingConfig(newConfig);
                  saveConfig(newConfig);
                }}
              />
            </div>
          )}

          {activeTab === 'auditor' && (
            <TimetableAuditorView
              auditReport={auditReport}
              onResolveClash={handleResolveAuditorClash}
            />
          )}

          {activeTab === 'safeguards' && (
            <SafeguardsSettingsTab
              workingConfig={workingConfig}
              setWorkingConfig={setWorkingConfig}
              isAdmin={isAdmin}
              onRequestResetBaseline={() => setShowResetConfirm(true)}
            />
          )}
        </div>
      </div>

      {ToastComponent}
    </div>
  );
};

export default SchoolSettingsView;
