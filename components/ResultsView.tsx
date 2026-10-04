import React, { useState } from 'react';
import { LessonPlan, GeneratedPaper, ExportFormat, PaperQuestion } from '../types';
import { ArrowLeftIcon } from './icons/MiscIcons';
import { PhssjLogo } from './Logo';
import { saveExamPaperToDb, updateSavedPaperInDb } from '../services/storageService';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { LessonPlanDisplay } from './results/LessonPlanDisplay';
import { ExamPaperDisplay } from './results/ExamPaperDisplay';
import { PaperRevisionModal } from './results/PaperRevisionModal';

interface ResultsViewProps {
  lessonPlans: LessonPlan[];
  papers: GeneratedPaper[];
  onBack: () => void;
  teacherName: string;
  schoolName: string;
  exportFormat?: ExportFormat;
  onExportPlan?: (plan: LessonPlan) => void;
  onRevisePaper?: (prompt: string) => Promise<GeneratedPaper | null>;
  isRevising?: boolean;
  onUpdatePaper?: (updatedPaper: GeneratedPaper) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  lessonPlans,
  papers,
  onBack,
  teacherName,
  schoolName,
  exportFormat = 'both',
  onExportPlan,
  onRevisePaper,
  isRevising = false,
  onUpdatePaper,
}) => {
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [showRevision, setShowRevision] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);
  const { showToast, ToastComponent } = useToast(4500);
  const [mathScale, setMathScale] = useState<number>(() => {
    const saved = localStorage.getItem('phssj_math_scale');
    return saved ? Number(saved) || 85 : 85;
  });

  const handleMathScaleChange = (newScale: number) => {
    const clamped = Math.max(70, Math.min(200, newScale));
    setMathScale(clamped);
    localStorage.setItem('phssj_math_scale', String(clamped));
    window.dispatchEvent(new CustomEvent('phssj-math-scale-changed', { detail: { scale: clamped } }));
  };

  const persistPaperEdit = (paper: GeneratedPaper) => {
    if (paper.savedPaperId) {
      return updateSavedPaperInDb(paper.savedPaperId, paper);
    }
    return saveExamPaperToDb(paper, { name: teacherName, schoolName })
      .then(saved => {
        paper.savedPaperId = saved.id;
      });
  };

  const handleUpdateQuestion = (sIdx: number, qIdx: number, updatedQuestion: PaperQuestion) => {
    if (!papers || papers.length === 0) return;
    const paper = papers[0];
    const newPaper: GeneratedPaper = JSON.parse(JSON.stringify(paper));
    newPaper.sections[sIdx].questions[qIdx] = updatedQuestion;
    const calculatedMarks = newPaper.sections.reduce((acc, sec) =>
      acc + sec.questions.reduce((qAcc, q) => qAcc + (Number(q.marks) || 0), 0), 0
    );
    newPaper.totalMarks = calculatedMarks;
    onUpdatePaper?.(newPaper);
    persistPaperEdit(newPaper).catch(console.error);
  };

  const handleDeleteQuestion = (sIdx: number, qIdx: number) => {
    if (!papers || papers.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Question',
      message: 'Are you sure you want to remove this question from the examination paper?',
      variant: 'danger',
      confirmLabel: 'Remove Question',
      onConfirm: () => {
        const paper = papers[0];
        const newPaper: GeneratedPaper = JSON.parse(JSON.stringify(paper));
        newPaper.sections[sIdx].questions.splice(qIdx, 1);
        const calculatedMarks = newPaper.sections.reduce((acc, sec) =>
          acc + sec.questions.reduce((qAcc, q) => qAcc + (Number(q.marks) || 0), 0), 0
        );
        newPaper.totalMarks = calculatedMarks;
        onUpdatePaper?.(newPaper);
        persistPaperEdit(newPaper).catch(console.error);
        setConfirmDialog(null);
        showToast('Question removed and marks recalculated.', 'info');
      },
    });
  };

  const handleAddQuestion = (sIdx: number) => {
    if (!papers || papers.length === 0) return;
    const paper = papers[0];
    const newPaper: GeneratedPaper = JSON.parse(JSON.stringify(paper));
    const section = newPaper.sections[sIdx];
    const isMcq = section.title.toLowerCase().includes('multiple') || section.title.toLowerCase().includes('mcq');
    const defaultMarks = isMcq ? 1 : (section.title.toLowerCase().includes('short') ? 4 : 8);
    const newQ: PaperQuestion = {
      id: `q_${Date.now()}`,
      type: isMcq ? 'mcq' : (section.title.toLowerCase().includes('short') ? 'short' : 'long'),
      question: 'New question text goes here (click edit to modify or regenerate)',
      marks: defaultMarks,
      options: isMcq ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
    };
    section.questions.push(newQ);
    const calculatedMarks = newPaper.sections.reduce((acc, sec) =>
      acc + sec.questions.reduce((qAcc, q) => qAcc + (Number(q.marks) || 0), 0), 0
    );
    newPaper.totalMarks = calculatedMarks;
    onUpdatePaper?.(newPaper);
    persistPaperEdit(newPaper).catch(console.error);
  };

  const handleExportPaper = async (paper: GeneratedPaper) => {
    try {
      const teacherInfo = { name: teacherName, schoolName };
      const { exportPaperAsDocx, exportPaperAsPdf } = await import('../services/exportService');
      if (exportFormat === 'pdf') {
        await exportPaperAsPdf(paper, teacherInfo, mathScale);
      } else if (exportFormat === 'docx') {
        await exportPaperAsDocx(paper, teacherInfo, mathScale);
      } else {
        await exportPaperAsDocx(paper, teacherInfo, mathScale);
        await new Promise(resolve => setTimeout(resolve, 250));
        await exportPaperAsPdf(paper, teacherInfo, mathScale);
      }
      showToast('Exam paper exported successfully.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to export. Please try again.', 'error');
    }
  };

  if (lessonPlans.length > 0) {
    return (
      <LessonPlanDisplay
        lessonPlans={lessonPlans}
        selectedPlanIndex={selectedPlanIndex}
        setSelectedPlanIndex={setSelectedPlanIndex}
        onBack={onBack}
        exportFormat={exportFormat}
        onExportPlan={onExportPlan}
      />
    );
  }

  if (papers.length > 0) {
    const paper = papers[0];
    return (
      <div className="h-full flex flex-col bg-brand-bg">
        <ExamPaperDisplay
          paper={paper}
          schoolName={schoolName}
          mathScale={mathScale}
          onMathScaleChange={handleMathScaleChange}
          onBack={onBack}
          exportFormat={exportFormat}
          onExportPaper={handleExportPaper}
          onUpdateQuestion={handleUpdateQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          onAddQuestion={handleAddQuestion}
        />

        {onRevisePaper && (
          <PaperRevisionModal
            showRevision={showRevision}
            setShowRevision={setShowRevision}
            revisionPrompt={revisionPrompt}
            setRevisionPrompt={setRevisionPrompt}
            onRevisePaper={onRevisePaper}
            isRevising={isRevising}
          />
        )}

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

        {ToastComponent}
      </div>
    );
  }

  // Empty state
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fadeInUp">
      <div className="w-20 h-20 rounded-full bg-white dark:bg-slate-900 shadow-glass border border-brand-border flex items-center justify-center mb-5 p-1.5 ring-4 ring-brand-primary/10">
        <PhssjLogo className="w-full h-full rounded-full" />
      </div>
      <h2 className="text-xl font-bold text-brand-text-primary mb-2">No results yet</h2>
      <p className="text-brand-text-secondary mb-6 max-w-md leading-relaxed text-sm">
        Generate a lesson plan or exam paper and it will appear here, ready to review and export.
      </p>
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-5 py-2.5 brand-gradient text-white font-semibold rounded-xl hover:shadow-glass hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        Get Started
      </button>
    </div>
  );
};

export default ResultsView;
