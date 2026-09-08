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

interface HistoryViewProps {
  onOpenLessonPlan: (plan: LessonPlan) => void;
  onOpenPaper: (paper: GeneratedPaper) => void;
  onBack: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onOpenLessonPlan,
  onOpenPaper,
  onBack,
}) => {
  const [plans, setPlans] = useState<SavedLessonPlanItem[]>([]);
  const [papers, setPapers] = useState<SavedExamPaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'papers' | 'plans'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);

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

  const handleDeletePlan = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this saved lesson plan?')) return;
    await deleteSavedPlan(id);
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  const handleDeletePaper = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this saved exam paper?')) return;
    await deleteSavedPaper(id);
    setPapers(prev => prev.filter(p => p.id !== id));
  };

  const handleExportPaperDocx = async (item: SavedExamPaperItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(item.id);
    try {
      const { exportPaperAsDocx } = await import('../services/exportService');
      await exportPaperAsDocx(item.paper, item.teacherInfo || { name: '', schoolName: 'PHSSJ' });
    } catch (err) {
      alert('Export failed. Please try again.');
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
      alert('Export failed. Please try again.');
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
      alert('Export failed. Please try again.');
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
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center text-xs text-brand-text-secondary hover:text-brand-primary mb-2 gap-1"
          >
            ← Back to Generator
          </button>
          <h1 className="text-2xl font-bold text-brand-text-primary">
            Saved History & Archive
          </h1>
          <p className="text-sm text-brand-text-secondary mt-0.5">
            Auto-saved locally in browser storage (IndexedDB). Retrieve, edit, or re-download anytime.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-brand-bg p-1 rounded-lg border border-brand-border">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'all'
                ? 'bg-brand-surface text-brand-text-primary shadow-sm'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            All ({plans.length + papers.length})
          </button>
          <button
            onClick={() => setActiveTab('papers')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'papers'
                ? 'bg-brand-surface text-brand-text-primary shadow-sm'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            Exam Papers ({papers.length})
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'plans'
                ? 'bg-brand-surface text-brand-text-primary shadow-sm'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            Lesson Plans ({plans.length})
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search by subject, title, grade, or topic..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-surface text-brand-text-primary shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-2.5 text-sm text-brand-text-secondary hover:text-brand-text-primary"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-text-secondary">
          <Spinner size="md" />
          <span className="text-sm">Loading saved history from IndexedDB...</span>
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-16 px-4 bg-brand-surface rounded-2xl border border-dashed border-brand-border">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-bg flex items-center justify-center text-brand-text-secondary">
            📁
          </div>
          <h3 className="text-base font-semibold text-brand-text-primary">No saved records found</h3>
          <p className="text-xs text-brand-text-secondary max-w-sm mx-auto mt-1">
            Generated lesson plans and exam papers will automatically appear here as you create them.
          </p>
        </div>
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
                  <div
                    key={item.id}
                    onClick={() => onOpenPaper(item.paper)}
                    className="group bg-brand-surface p-4 rounded-xl border border-brand-border hover:border-brand-primary/40 hover:shadow-card-hover transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-brand-primary/10 text-brand-primary">
                          {item.paper.subject} • {item.paper.gradeLevel}
                        </span>
                        <span className="text-[11px] text-brand-text-secondary">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-brand-text-primary mt-2 group-hover:text-brand-primary transition-colors line-clamp-1">
                        {item.paper.title}
                      </h3>

                      <p className="text-xs text-brand-text-secondary mt-1">
                        Chapter: {item.paper.chapterName || 'General Syllabus'}
                      </p>

                      <div className="flex items-center gap-3 mt-3 text-xs text-brand-text-secondary">
                        <span>{item.paper.totalMarks} Marks</span>
                        <span>•</span>
                        <span>{item.paper.durationMinutes} Mins</span>
                        <span>•</span>
                        <span>{item.paper.sections.length} Sections</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-brand-border flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => handleDeletePaper(item.id, e)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline"
                      >
                        Delete
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={exportingId === item.id}
                          onClick={(e) => handleExportPaperDocx(item, e)}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border"
                        >
                          DOCX
                        </button>
                        <button
                          type="button"
                          disabled={exportingId === item.id}
                          onClick={(e) => handleExportPaperPdf(item, e)}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border"
                        >
                          PDF
                        </button>
                        <span className="text-xs font-medium text-brand-primary group-hover:underline pl-1">
                          Open →
                        </span>
                      </div>
                    </div>
                  </div>
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
                  <div
                    key={item.id}
                    onClick={() => onOpenLessonPlan(item.plan)}
                    className="group bg-brand-surface p-4 rounded-xl border border-brand-border hover:border-emerald-500/40 hover:shadow-card-hover transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {item.plan.subject} • {item.plan.gradeLevel}
                        </span>
                        <span className="text-[11px] text-brand-text-secondary">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-brand-text-primary mt-2 group-hover:text-emerald-600 transition-colors line-clamp-1">
                        {item.plan.title}
                      </h3>

                      {item.sloId && (
                        <p className="text-xs font-mono text-brand-text-secondary mt-1">
                          SLO ID: {item.sloId}
                        </p>
                      )}

                      <p className="text-xs text-brand-text-secondary mt-2 line-clamp-2">
                        {item.plan.learningObjectives?.join(', ') || 'No objectives listed'}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-brand-border flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => handleDeletePlan(item.id, e)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline"
                      >
                        Delete
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={exportingId === item.id}
                          onClick={(e) => handleExportPlanDocx(item, e)}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border"
                        >
                          DOCX
                        </button>
                        <span className="text-xs font-medium text-emerald-600 group-hover:underline pl-1">
                          Open →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
