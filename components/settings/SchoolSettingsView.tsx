import React from 'react';
import { AlertCircle } from 'lucide-react';
import { SchoolConfig } from '../../services/schoolConfigService';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { TimetableEditorTab } from './TimetableEditorTab';
import { ClassesSettingsTab } from './ClassesSettingsTab';
import { TeachersSettingsTab } from './TeachersSettingsTab';
import { SafeguardsSettingsTab } from './SafeguardsSettingsTab';
import { PeriodsSettingsTab } from './PeriodsSettingsTab';
import { IdentitySettingsTab } from './IdentitySettingsTab';
import { useToast } from '../../hooks/useToast';
import { googleSignIn } from '../../services/googleAuth';
import { SettingsHeaderBanner } from './SettingsHeaderBanner';
import { SettingsTabsNav, SettingsTab } from './SettingsTabsNav';
import { SchoolSettingsModals } from './SchoolSettingsModals';
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
    classTotals,
    availableClassKeys,
    filteredClasses,
    filteredTeachers,
    handleSaveClass,
    handleDeleteClass,
    handleSaveTeacher,
    handleDeleteTeacher,
    handlePeriodChange,
    handleAddPeriod,
    handleRemovePeriod,
    handleSaveAll,
    handleExecuteReset,
  } = useSchoolSettingsState(config, saveConfig, resetToDefaults, showToast);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
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
      />

      <SettingsHeaderBanner
        isAdmin={isAdmin}
        currentUser={currentUser}
        isSaving={isSaving}
        saveSuccess={saveSuccess}
        onOpenLoginGate={onOpenLoginGate}
        onGoogleSignIn={googleSignIn}
        onResetBaseline={() => setShowResetConfirm(true)}
        onSaveAll={handleSaveAll}
      />

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SettingsTabsNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        classesBadge={classTotals.classesCount}
        teachersBadge={workingConfig.teachers.length}
        timetableBadge={workingConfig.customTimetable?.length || classTotals.classesCount}
        periodsBadge={workingConfig.periods.length}
      />

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

      {activeTab === 'safeguards' && (
        <SafeguardsSettingsTab
          workingConfig={workingConfig}
          setWorkingConfig={setWorkingConfig}
        />
      )}

      {activeTab === 'periods' && (
        <PeriodsSettingsTab
          workingConfig={workingConfig}
          onAddPeriod={handleAddPeriod}
          onPeriodChange={handlePeriodChange}
          onRemovePeriod={handleRemovePeriod}
        />
      )}

      {activeTab === 'identity' && (
        <IdentitySettingsTab
          workingConfig={workingConfig}
          setWorkingConfig={setWorkingConfig}
        />
      )}

      {activeTab === 'timetable' && (
        <div className="animate-fadeIn">
          <TimetableEditorTab
            config={workingConfig}
            teachers={workingConfig.teachers}
            isSaving={isSaving}
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

      {ToastComponent}
    </div>
  );
};

export default SchoolSettingsView;
