import React, { useState, useEffect } from 'react';
import {
  getSavedPlans,
  getSavedPapers,
  peekSavedPlans,
  peekSavedPapers,
  deleteSavedPlan,
  deleteSavedPaper,
  SavedLessonPlanItem,
  SavedExamPaperItem,
} from '../../services/storageService';
import { getCachedSchoolConfig } from '../../services/schoolConfigService';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
}

export function useHistoryData(
  filterType: 'all' | 'papers' | 'plans' = 'all',
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
) {
  const initialPlans = peekSavedPlans();
  const initialPapers = peekSavedPapers();

  const [plans, setPlans] = useState<SavedLessonPlanItem[]>(() => initialPlans || []);
  const [papers, setPapers] = useState<SavedExamPaperItem[]>(() => initialPapers || []);
  const [loading, setLoading] = useState(() => initialPlans === null || initialPapers === null);
  const [activeTab, setActiveTab] = useState<'all' | 'papers' | 'plans'>(filterType);
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const loadData = async () => {
    if (peekSavedPlans() === null || peekSavedPapers() === null) {
      setLoading(true);
    }
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
    void loadData();
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
        try {
          await deleteSavedPlan(id);
          setPlans((prev) => prev.filter((p) => p.id !== id));
          showToast('Lesson plan deleted.', 'success');
        } catch {
          showToast('Could not delete lesson plan. Please try again.', 'error');
        } finally {
          setConfirmDialog(null);
        }
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
        try {
          await deleteSavedPaper(id);
          setPapers((prev) => prev.filter((p) => p.id !== id));
          showToast('Exam paper deleted.', 'success');
        } catch {
          showToast('Could not delete exam paper. Please try again.', 'error');
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  const runExport = async (id: string, task: () => Promise<void>) => {
    setExportingId(id);
    try {
      await task();
    } catch {
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setExportingId(null);
    }
  };

  const handleExportPaperDocx = (item: SavedExamPaperItem, e: React.MouseEvent) => {
    e.stopPropagation();
    return runExport(item.id, async () => {
      const { exportPaperAsDocx } = await import('../../services/exportService');
      const fallbackSchool = getCachedSchoolConfig().schoolName;
      await exportPaperAsDocx(item.paper, item.teacherInfo || { name: '', schoolName: fallbackSchool });
    });
  };

  const handleExportPaperPdf = (item: SavedExamPaperItem, e: React.MouseEvent) => {
    e.stopPropagation();
    return runExport(item.id, async () => {
      const { exportPaperAsPdf } = await import('../../services/exportService');
      const fallbackSchool = getCachedSchoolConfig().schoolName;
      await exportPaperAsPdf(item.paper, item.teacherInfo || { name: '', schoolName: fallbackSchool });
    });
  };

  const handleExportPlanDocx = (item: SavedLessonPlanItem, e: React.MouseEvent) => {
    e.stopPropagation();
    return runExport(item.id, async () => {
      const { exportAsDocx } = await import('../../services/exportService');
      const fallbackSchool = getCachedSchoolConfig().schoolName;
      await exportAsDocx(item.plan, item.sloId, item.teacherInfo || { name: '', schoolName: fallbackSchool });
    });
  };

  const filteredPlans = plans.filter((p) => {
    if (activeTab === 'papers') return false;
    const query = searchQuery.toLowerCase();
    return (
      p.plan.title.toLowerCase().includes(query) ||
      p.plan.subject.toLowerCase().includes(query) ||
      p.plan.gradeLevel.toLowerCase().includes(query) ||
      (p.sloId && p.sloId.toLowerCase().includes(query))
    );
  });

  const filteredPapers = papers.filter((p) => {
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

  return {
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
  };
}
