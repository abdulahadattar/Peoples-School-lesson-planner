import React, { useState, useEffect } from 'react';
import {
  getSavedPlans,
  getSavedPapers,
  deleteSavedPlan,
  deleteSavedPaper,
  SavedLessonPlanItem,
  SavedExamPaperItem,
} from '../services/storageService';
import { LessonPlan, GeneratedPaper } from '../types';
import Spinner from './ui/Spinner';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { SearchInput } from './ui/SearchInput';
import { EmptyState } from './ui/EmptyState';
import { SavedPaperCard } from './history/SavedPaperCard';
import { SavedPlanCard } from './history/SavedPlanCard';

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
  const [plans, setPlans] = useState<SavedLessonPlanItem[]>([]);
  const [papers, setPapers] = useState<SavedExamPaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'papers' | 'plans'>(filterType);
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);
  const { showToast, ToastComponent } = useToast(4500);

  const loadData = async () => {
    setLoading(true);
    try {
      const [loadedPlans, loadedPapers] = await Promise.all([
        getSavedPlans(),
        getSavedPapers(),
      ]);
      setPlans(loadedPlans);
      setPapers(loadedPapers);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeletePlan = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Saved Plan',
      message: 'Are you sure you want to permanently delete this saved lesson plan?',
      variant: 'danger',
      confirmLabel: 'Delete Plan',
      onConfirm: async () => {
        await deleteSavedPlan(id);
        setPlans((prev) => prev.filter((p) => p.id !== id));
        setConfirmDialog(null);
        showToast('Lesson plan deleted successfully.', 'success');
      },
    });
  };

  const handleDeletePaper = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Saved Paper',
      message: 'Are you sure you want to permanently delete this saved exam paper?',
      variant: 'danger',
      confirmLabel: 'Delete Paper',
      onConfirm: async () => {
        await deleteSavedPaper(id);
        setPapers((prev) => prev.filter((p) => p.id !== id));
        setConfirmDialog(null);
        showToast('Exam paper deleted successfully.', 'success');
      },
    });
  };

  const handleExportPaperDocx = async (item: SavedExamPaperItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(item.id);
    try {
      const { exportPaperAsDocx } = await import('../services/exportService');
      await exportPaperAsDocx(item.paper, item.teacherInfo || { name: '', schoolName: 'PHSSJ' });
    } catch (err) {
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setExportingId(null);
    }
  };

  const handleExportPaperPdf = async (item: SavedExamPaperItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(item.id);
    try {
      const { exportPaperAsPdf } = await import('../services/exportService');
      await exportPaperAsPdf(item.paper, item.teacherInfo || { name: '', schoolName: 'PHSSJ' });
    } catch (err) {
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setExportingId(null);
    }
  };

  const handleExportPlanDocx = async (item: SavedLessonPlanItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(item.id);
    try {
      const { exportAsDocx } = await import('../services/exportService');
      await exportAsDocx(item.plan, item.sloId, item.teacherInfo || { name: '', schoolName: 'PHSSJ' });
    } catch (err) {
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setExportingId(null);
    }
  };

  // Filter items
  const filteredPlans = plans.filter(p => {
    if (activeTab === 'papers') return false;
    const query = searchQuery.toLowerCase();
    return (
      p.plan.title.toLowerCase().includes(query) ||
      p.plan.subject.toLowerCase().includes(query) ||
      p.plan.gradeLevel.toLowerCase().includes(query) ||
      (p.sloId && p.sloId.toLowerCase().includes(query))
    );
  });

  const filteredPapers = papers.filter(p => {
    if (activeTab === 'plans') return false;
    const query = searchQuery.toLowerCase();
    return (
      p.paper.title.toLowerCase().includes(query) ||
      p.paper.subject.toLowerCase().includes(query) ||
      p.paper.gradeLevel.toLowerCase().includes(query) ||
      (p.paper.chapterName && p.paper.chapterName.toLowerCase().includes(query))
    );
  });

  const totalCount = filteredPlans.length + filteredPapers.length;

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
          description={searchQuery ? "No lesson plans or papers match your search query." : "Generated plans and papers appear here automatically."}
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
                {filteredPapers.map(item => (
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
                {filteredPlans.map(item => (
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
