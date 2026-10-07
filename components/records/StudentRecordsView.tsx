import React, { useState } from 'react';
import {
  Users,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { StudentRecord } from '../../services/googleSheetsService';
import { loginWithGoogle, logoutUser } from '../../services/googleAuth';
import { RecordsModals } from './RecordsModals';
import { useRecordModals } from './useRecordModals';
import { RecordsNotificationBanner } from './RecordsNotificationBanner';
import { ClassAnalyticsCharts } from './ClassAnalyticsCharts';
import { RecordsStatsStrip } from './RecordsStatsStrip';
import { RecordsFilterToolbar } from './RecordsFilterToolbar';
import { StudentCardGrid } from './StudentCardGrid';
import { Pagination } from '../ui/Pagination';
import { getStudentStatusBadgeClass } from '../attendance/attendanceUtils';
import { useStudentRecords } from './useStudentRecords';
import { RecordsHeaderCard } from './RecordsHeaderCard';
import { StudentRecordsTable } from './StudentRecordsTable';
import { SortField, SortDirection } from './types';

export { type SortField, type SortDirection };

export const StudentRecordsView: React.FC = () => {
  const { config: schoolConfig, isAdmin, saveConfig } = useSchoolConfig();

  // Notification state
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const {
    records,
    isLoading,
    isRefreshing,
    error,
    lastSynced,
    authUser,
    searchQuery,
    setSearchQuery,
    selectedClass,
    setSelectedClass,
    classOptions,
    selectedSection,
    setSelectedSection,
    sectionOptions,
    selectedStatus,
    setSelectedStatus,
    statusOptions,
    selectedGender,
    setSelectedGender,
    sortField,
    sortDirection,
    handleSort,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    dossiersByGr,
    viewMode,
    setViewMode,
    stats,
    filteredRecords,
    paginatedRecords,
    loadRecords,
  } = useStudentRecords(showNotification);

  // Modals state & handlers
  const {
    detailStudent,
    setDetailStudent,
    detailModalTab,
    setDetailModalTab,
    editStudent,
    setEditStudent,
    isAddMode,
    setIsAddMode,
    avatarPreviewUrl,
    setAvatarPreviewUrl,
    confirmationState,
    setConfirmationState,
    isSheetEditingLocked,
    handleOpenEdit,
    handleOpenAdd,
    handleRequestConfirm,
    handleExecuteConfirm,
  } = useRecordModals(schoolConfig, isAdmin, authUser, showNotification);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedClass('all');
    setSelectedSection('all');
    setSelectedStatus('all');
    setSelectedGender('all');
  };

  const getStatusBadge = (status?: string) => (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStudentStatusBadgeClass(
        status
      )}`}
    >
      {status || 'Active'}
    </span>
  );

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
      <RecordsNotificationBanner
        notification={notification}
        onDismiss={() => setNotification(null)}
      />

      <RecordsHeaderCard
        lastSynced={lastSynced}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onRefresh={() => loadRecords(true)}
        onAddStudent={handleOpenAdd}
        isSheetEditingLocked={isSheetEditingLocked}
        schoolConfig={schoolConfig}
        isAdmin={isAdmin}
        onSaveConfig={saveConfig}
        showNotification={showNotification}
        filteredRecords={filteredRecords}
        authUser={authUser}
        onSignIn={loginWithGoogle}
        onSignOut={logoutUser}
      />

      <RecordsStatsStrip stats={stats} />

      <ClassAnalyticsCharts
        records={records}
        selectedClass={selectedClass}
        onSelectClass={setSelectedClass}
      />

      <RecordsFilterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedClass={selectedClass}
        onClassChange={setSelectedClass}
        classOptions={classOptions}
        selectedSection={selectedSection}
        onSectionChange={setSelectedSection}
        sectionOptions={sectionOptions}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        statusOptions={statusOptions}
        selectedGender={selectedGender}
        onGenderChange={setSelectedGender}
        filteredCount={filteredRecords.length}
        totalCount={records.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onClearFilters={resetFilters}
      />

      <div className="rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-brand-primary animate-spin" />
            <p className="text-sm font-semibold text-brand-text-primary">Loading records from Google Sheet...</p>
            <p className="text-xs text-brand-text-secondary">Connecting to Jamshoro South Final SPD (2)...</p>
          </div>
        ) : error ? (
          <div className="py-16 px-6 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-brand-text-primary">Failed to load Google Sheet records</h3>
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            <button
              type="button"
              onClick={() => loadRecords(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 shadow-soft"
            >
              Try Again
            </button>
          </div>
        ) : paginatedRecords.length === 0 ? (
          <div className="py-16 px-6 text-center max-w-md mx-auto space-y-2">
            <Users className="w-10 h-10 mx-auto text-brand-text-secondary/50" />
            <h3 className="text-sm font-bold text-brand-text-primary">No matching student records found</h3>
            <p className="text-xs text-brand-text-secondary">
              Try adjusting your search query or reset the class/status filters.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-brand-bg border border-brand-border text-brand-text-primary hover:bg-brand-border transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className={viewMode === 'cards' ? 'hidden' : ''}>
            <StudentRecordsTable
              paginatedRecords={paginatedRecords}
              dossiersByGr={dossiersByGr}
              isSheetEditingLocked={isSheetEditingLocked}
              isAdmin={isAdmin}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              onViewStudent={(s) => {
                setDetailStudent(s);
                setDetailModalTab('details');
              }}
              onViewDocuments={(s) => {
                setDetailStudent(s);
                setDetailModalTab('documents');
              }}
              onEditStudent={handleOpenEdit}
              onPreviewAvatar={setAvatarPreviewUrl}
              getStatusBadge={getStatusBadge}
            />
          </div>
        )}

        {!isLoading && !error && paginatedRecords.length > 0 && (
          <StudentCardGrid
            paginatedRecords={paginatedRecords}
            dossiersByGr={dossiersByGr}
            isSheetEditingLocked={isSheetEditingLocked}
            viewMode={viewMode}
            onViewDetails={(student) => {
              setDetailStudent(student);
              setDetailModalTab('details');
            }}
            onViewDocuments={(student) => {
              setDetailStudent(student);
              setDetailModalTab('documents');
            }}
            onEditStudent={handleOpenEdit}
            onPreviewAvatar={setAvatarPreviewUrl}
            getStatusBadge={getStatusBadge}
          />
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRecords.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      <RecordsModals
        detailStudent={detailStudent}
        detailModalTab={detailModalTab}
        onCloseDetail={() => setDetailStudent(null)}
        onEditFromDetail={handleOpenEdit}
        editStudent={editStudent}
        isAddMode={isAddMode}
        onCloseEdit={() => {
          setEditStudent(null);
          setIsAddMode(false);
        }}
        onRequestConfirm={handleRequestConfirm}
        confirmationState={confirmationState}
        onExecuteConfirm={handleExecuteConfirm}
        onCancelConfirm={() =>
          setConfirmationState({
            isOpen: false,
            title: '',
            student: null,
            diffs: [],
            isAdd: false,
            isSubmitting: false,
          })
        }
        avatarPreviewUrl={avatarPreviewUrl}
        onCloseAvatarPreview={() => setAvatarPreviewUrl(null)}
      />
    </div>
  );
};
