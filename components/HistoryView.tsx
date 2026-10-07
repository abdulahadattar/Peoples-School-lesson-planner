import React from 'react';
import { LessonPlan, GeneratedPaper } from '../types';
import Spinner from './ui/Spinner';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { SearchInput } from './ui/SearchInput';
import { EmptyState } from './ui/EmptyState';
import { SavedPaperCard } from './history/SavedPaperCard';
import { SavedPlanCard } from './history/SavedPlanCard';
import { useHistoryData } from './history/useHistoryData';

interface HistoryViewProps {
  onOpenLessonPlan: (plan: LessonPlan) => void;
  onOpenPaper: (paper: GeneratedPaper) => void;
  onBack?: () => void;
  filterType?: 'all' | 'papers' | 'plans';
  hideHeader?: boolean;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onOpenLessonPlan,
  onOpenPaper,
  onBack,
  filterType = 'all',
  hideHeader = false,
}) => {
  const { showToast, ToastComponent } = useToast(4500);

  const {
    plans,
    papers,
    loading,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    exportingId,
    confirmDialog,
    setConfirmDialog,
    handleDeletePlan,
    handleDeletePaper,
    handleExportPaperDocx,
    handleExportPaperPdf,
    handleExportPlanDocx,
    filteredPlans,
    filteredPapers,
    totalCount,
  } = useHistoryData(filterType as 'all' | 'papers' | 'plans', showToast);

  return (
    <div className={`max-w-5xl mx-auto space-y-6 ${hideHeader ? 'py-2' : 'px-4 py-6 md:py-8'}`}>
      {/* Header */}
      {!hideHeader ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center text-xs text-brand-text-secondary hover:text-brand-primary mb-2 gap-1 cursor-pointer"
              >
                ← Back to Generator
              </button>
            )}
            <h1 className="text-2xl font-bold text-brand-text-primary">
              Saved History & Archive
            </h1>
            <p className="text-sm text-brand-text-secondary mt-0.5">
              Auto-saved locally in browser storage (IndexedDB). Retrieve, edit, or re-download anytime.
            </p>
          </div>

          {/* Tab switcher */}
          {filterType === 'all' && (
            <div className="flex items-center bg-brand-bg p-1 rounded-lg border border-brand-border">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-brand-surface text-brand-text-primary shadow-sm'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                All ({plans.length + papers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('papers')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === 'papers'
                    ? 'bg-brand-surface text-brand-text-primary shadow-sm'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                Exam Papers ({papers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('plans')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === 'plans'
                    ? 'bg-brand-surface text-brand-text-primary shadow-sm'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                Lesson Plans ({plans.length})
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-brand-border/60">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-text-secondary">
              {filterType === 'plans'
                ? `Saved Lesson Plans (${filteredPlans.length})`
                : filterType === 'papers'
                ? `Saved Exam Papers (${filteredPapers.length})`
                : `Saved Items (${totalCount})`}
            </h2>
            <p className="text-xs text-brand-text-secondary/80 mt-0.5">
              Auto-saved in browser storage. Click any card to open in results or download.
            </p>
          </div>
        </div>
      )}

      {/* Search Input */}
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by subject, title, grade, or topic..."
        resultCount={searchQuery ? totalCount : undefined}
      />

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-text-secondary">
          <Spinner size="md" />
          <span className="text-sm">Loading saved history from IndexedDB...</span>
        </div>
      ) : totalCount === 0 ? (
        <EmptyState
          title="No saved records found"
          description={
            searchQuery
              ? 'No lesson plans or papers match your search query.'
              : 'Generated plans and papers appear here automatically.'
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Exam Papers Section */}
          {filteredPapers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-text-secondary">
                Exam Papers ({filteredPapers.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPapers.map((item) => (
                  <SavedPaperCard
                    key={item.id}
                    item={item}
                    exportingId={exportingId}
                    onOpenPaper={onOpenPaper}
                    onDeletePaper={handleDeletePaper}
                    onExportDocx={handleExportPaperDocx}
                    onExportPdf={handleExportPaperPdf}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Lesson Plans Section */}
          {filteredPlans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-text-secondary">
                Lesson Plans ({filteredPlans.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPlans.map((item) => (
                  <SavedPlanCard
                    key={item.id}
                    item={item}
                    exportingId={exportingId}
                    onOpenLessonPlan={onOpenLessonPlan}
                    onDeletePlan={handleDeletePlan}
                    onExportDocx={handleExportPlanDocx}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant || 'danger'}
          confirmLabel={confirmDialog.confirmLabel || 'Delete'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {ToastComponent}
    </div>
  );
};

export default HistoryView;
