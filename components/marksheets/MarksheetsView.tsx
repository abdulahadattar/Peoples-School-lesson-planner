import React from 'react';
import { useToast } from '../../hooks/useToast';
import Spinner from '../ui/Spinner';
import { MarksheetA4Preview } from './MarksheetA4Preview';
import { MarksheetScoreEditor } from './MarksheetScoreEditor';
import { MarksheetToolbar } from './MarksheetToolbar';
import { ResultsListTab } from './ResultsListTab';
import { useMarksheetsState, type MarksheetInitialTarget } from './useMarksheetsState';

export interface MarksheetsViewProps {
  initialTarget?: MarksheetInitialTarget | null;
}

export const MarksheetsView: React.FC<MarksheetsViewProps> = ({
  initialTarget,
}) => {
  const { showToast, ToastComponent } = useToast(4500);
  const state = useMarksheetsState(showToast, initialTarget);

  return (
    <div className="w-full max-w-[1380px] mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 print:p-0 print:space-y-0">
      {ToastComponent}

      <MarksheetToolbar
        config={state.config}
        activeTab={state.activeTab}
        onActiveTabChange={state.setActiveTab}
        isAdmin={state.isAdmin}
        examType={state.examType}
        onExamTypeChange={state.setExamType}
        gradingSystem={state.gradingSystem}
        onGradingSystemChange={state.setGradingSystem}
        gradeFilter={state.gradeFilter}
        onGradeFilterChange={state.setGradeFilter}
        rosterCount={state.roster.length}
        activeStudentLabel={
          state.activeStudent
            ? `${state.activeStudent.grNo}_${state.activeStudent.studentName}`
            : null
        }
        activeSpreadsheetUrl={state.activeSpreadsheetUrl}
        isCustomSpreadsheet={state.isCustomSpreadsheet}
        isSavingSheetLink={state.isSavingSheetLink}
        isSyncingLive={state.isSyncingLive}
        isPushingPending={state.isPushingPending}
        pushingDocId={state.pushingDocId}
        pendingEdits={state.pendingEdits}
        syncError={state.syncError}
        syncNeedsAuth={state.syncNeedsAuth}
        onCheckSheetUpdates={() => {
          void state.checkAndSyncFromSheet({ force: true, silent: false });
        }}
        onConnectGoogleAndSync={() => {
          void state.connectGoogleAndSync();
        }}
        onReplaceSheetLink={state.replaceSyncedSheetLink}
        onResetSheetLink={state.resetSyncedSheetLink}
        onImportFile={state.handleImportFile}
        onPushPendingToSheet={(targetDocIds) => {
          void state.pushPendingToSheet(targetDocIds);
        }}
        onDiscardPendingEdit={(docId) => {
          void state.discardPendingEdit(docId);
        }}
        onPrintMarksheet={() => window.print()}
        onDownloadSinglePdf={state.handleDownloadSinglePdf}
        onDownloadAllPdf={state.handleDownloadAllPdf}
        isExportingSingle={state.isExportingSingle}
        batchProgress={state.batchProgress}
      />

      {state.isLoadingRoster ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-brand-text-secondary">
          <Spinner className="w-6 h-6 text-brand-primary" label="Loading student register" />
          <p className="text-sm font-medium">Loading student register...</p>
        </div>
      ) : state.activeTab === 'results-list' ? (
        <ResultsListTab
          config={state.config}
          examType={state.examType}
          resultsGrade={state.resultsGrade}
          onResultsGradeChange={state.setResultsGrade}
          resultsSubject={state.resultsSubject}
          onResultsSubjectChange={state.setResultsSubject}
          classRoster={state.resultsClassRoster}
          examEntriesByGr={state.examEntriesByGr}
          pendingEdits={state.pendingEdits}
          isSignedIn={state.isSignedIn}
          isAdmin={state.isAdmin}
          onScoreChange={state.updateStudentSubjectScore}
          onOptionalChange={state.updateStudentOptionals}
          onOpenMarksheet={state.openStudentMarksheet}
          onSignIn={() => {
            void state.connectGoogleAndSync();
          }}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5 sm:gap-6 items-start print:block">
          <MarksheetScoreEditor
            isAdmin={state.isAdmin}
            isSignedIn={state.isSignedIn}
            hasPendingEdit={state.hasActivePendingEdit}
            roster={state.roster}
            selectedIndex={state.selectedIndex}
            grInput={state.grInput}
            unmatchedGrQuery={state.unmatchedGrQuery}
            defaultGradeLevel={state.gradeFilter === 'ALL' ? 'IX' : state.gradeFilter}
            onGrInputChange={state.selectStudentByGr}
            onCreateCustomStudent={state.createCustomStudentByGr}
            searchQuery={state.searchQuery}
            onSearchQueryChange={state.setSearchQuery}
            onPrevStudent={state.goToPrevStudent}
            onNextStudent={state.goToNextStudent}
            activeMarksheet={state.activeMarksheet}
            onScoreChange={state.updateSubjectScore}
            onOptionalLanguageChange={state.updateOptionalLanguage}
            onOptionalElectiveChange={state.updateOptionalElective}
            onSignIn={() => {
              void state.connectGoogleAndSync();
            }}
          />

          <div className="min-w-0">
            {state.activeMarksheet ? (
              <MarksheetA4Preview
                marksheet={state.activeMarksheet}
                config={state.config}
              />
            ) : (
              <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-8 sm:p-12 text-center space-y-2">
                <h3 className="text-base font-bold text-brand-text-primary">
                  No Student Selected
                </h3>
                <p className="text-xs text-brand-text-secondary max-w-md mx-auto">
                  Select a student or enter a GR number to view and print marksheets.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
