import React, { useState, Suspense } from 'react';
import { Archive } from 'lucide-react';
import { View, PaperConfig, Teacher, LessonPlan, GeneratedPaper } from '../../types';
import HomeView from '../HomeView';
import type { MarksheetInitialTarget } from '../marksheets/useMarksheetsState';
import { SegmentedControl } from '../ui/SegmentedControl';
import Spinner from '../ui/Spinner';
import { GenerationMode } from '../../hooks/useGeneralGeneration';

const SubjectSelector = React.lazy(() => import('../SubjectSelector'));
const PaperPanel = React.lazy(() => import('../PaperPanel'));
const ResultsView = React.lazy(() => import('../ResultsView'));
const LiveMonitor = React.lazy(() => import('../LiveMonitor'));
const HistoryView = React.lazy(() =>
  import('../HistoryView').then((m) => ({ default: m.HistoryView }))
);
const StudentRecordsView = React.lazy(() =>
  import('../records/StudentRecordsView').then((m) => ({ default: m.StudentRecordsView }))
);
const DailyAttendanceView = React.lazy(() =>
  import('../attendance/DailyAttendanceView').then((m) => ({ default: m.DailyAttendanceView }))
);
const DocumentArchiveCenterView = React.lazy(() =>
  import('../DocumentArchiveCenterView').then((m) => ({ default: m.DocumentArchiveCenterView }))
);
const SchoolSettingsView = React.lazy(() =>
  import('../settings/SchoolSettingsView').then((m) => ({ default: m.SchoolSettingsView }))
);
const MarksheetsView = React.lazy(() =>
  import('../marksheets/MarksheetsView').then((m) => ({ default: m.MarksheetsView }))
);
const OmrScannerView = React.lazy(() =>
  import('../omr/OmrScannerView').then((m) => ({ default: m.OmrScannerView }))
);

const ViewLoadingFallback: React.FC = () => (
  <div className="flex-1 min-h-[260px] flex items-center justify-center p-6">
    <div className="flex flex-col items-center gap-3 text-brand-text-secondary">
      <Spinner className="w-6 h-6 text-brand-primary" label="Loading view" />
      <span className="text-xs font-medium">Loading...</span>
    </div>
  </div>
);

export interface AppViewRouterProps {
  view: View;
  onNavigate: (view: View) => void;
  onNavigateLesson: () => void;
  onNavigatePaper: () => void;
  onBackToHome: () => void;
  // Lesson Plan state
  lessonSubView: 'create' | 'saved';
  setLessonSubView: (sub: 'create' | 'saved') => void;
  selection: any;
  generationMode: GenerationMode;
  setGenerationMode: (mode: GenerationMode) => void;
  topicInput: string;
  setTopicInput: (t: string) => void;
  selectedSloIds: string[];
  setSelectedSloIds: (ids: string[]) => void;
  exportFormat: 'docx' | 'pdf' | 'both';
  setExportFormat: (f: 'docx' | 'pdf' | 'both') => void;
  chapterSlos: any[];
  isLoadingSlos: boolean;
  onGenerateLesson: () => void;
  isGenerating: boolean;
  // Exams & Papers state
  paperSubView: 'create' | 'scan';
  setPaperSubView: (sub: 'create' | 'scan') => void;
  onGeneratePaper: (cfg: PaperConfig) => void;
  // Generated Results state
  generatedPlans: LessonPlan[];
  generatedPapers: GeneratedPaper[];
  setGeneratedPlans: (plans: LessonPlan[]) => void;
  setGeneratedPapers: (papers: GeneratedPaper[]) => void;
  onExportPlan: (plan: any) => void;
  revisePaper: (revised: any) => Promise<any>;
  // Environment state
  teachers: Teacher[];
  onOpenLoginGate: () => void;
  omrInitialFilter?: {
    testCode?: string;
  } | null;
  onScanSheetsForPaper?: (testCode: string) => void;
  marksheetInitialTarget?: MarksheetInitialTarget | null;
}

export const AppViewRouter: React.FC<AppViewRouterProps> = ({
  view,
  onNavigate,
  onNavigateLesson,
  onNavigatePaper,
  onBackToHome,
  lessonSubView,
  setLessonSubView,
  selection,
  generationMode,
  setGenerationMode,
  topicInput,
  setTopicInput,
  selectedSloIds,
  setSelectedSloIds,
  exportFormat,
  setExportFormat,
  chapterSlos,
  isLoadingSlos,
  onGenerateLesson,
  isGenerating,
  paperSubView,
  setPaperSubView,
  onGeneratePaper,
  generatedPlans,
  generatedPapers,
  setGeneratedPlans,
  setGeneratedPapers,
  onExportPlan,
  revisePaper,
  teachers,
  onOpenLoginGate,
  omrInitialFilter,
  onScanSheetsForPaper,
  marksheetInitialTarget,
}) => {
  const [showSavedPapers, setShowSavedPapers] = useState(false);

  if (view === 'home') {
    return (
      <HomeView
        onNavigate={(target) => {
          if (target === 'lesson') onNavigateLesson();
          else if (target === 'paper') onNavigatePaper();
          else onNavigate(target);
        }}
      />
    );
  }

  const renderSecondaryView = () => {
    if (view === 'lesson') {
      return (
        <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-brand-border/60">
            <h1 className="text-xl sm:text-2xl font-bold text-brand-text-primary">
              Lesson Plans
            </h1>
            <div className="w-56 self-start sm:self-auto">
              <SegmentedControl
                size="sm"
                value={lessonSubView}
                options={[
                  { value: 'create', label: 'New Plan' },
                  { value: 'saved', label: 'Saved Plans' },
                ]}
                onChange={setLessonSubView}
              />
            </div>
          </div>

          {lessonSubView === 'create' ? (
            <SubjectSelector
              selection={selection}
              generationMode={generationMode}
              onGenerationModeChange={setGenerationMode}
              topicInput={topicInput}
              onTopicInputChange={setTopicInput}
              selectedSloIds={selectedSloIds}
              onSelectedSloIdsChange={setSelectedSloIds}
              exportFormat={exportFormat}
              onExportFormatChange={setExportFormat}
              chapterSlos={chapterSlos}
              isLoadingSlos={isLoadingSlos}
              onGenerate={onGenerateLesson}
              isGenerating={isGenerating}
            />
          ) : (
            <HistoryView
              filterType="plans"
              hideHeader
              onOpenLessonPlan={(plan) => {
                setGeneratedPlans([plan]);
                setGeneratedPapers([]);
                onNavigate('results');
              }}
              onOpenPaper={(paper) => {
                setGeneratedPapers([paper]);
                setGeneratedPlans([]);
                onNavigate('results');
              }}
            />
          )}
        </div>
      );
    }

    if (view === 'paper' || view === 'omr-scanner') {
      const isScanTab = view === 'omr-scanner' || paperSubView === 'scan';
      return (
        <div
          className={`w-full ${
            isScanTab ? 'max-w-[1380px]' : 'max-w-4xl xl:max-w-5xl 2xl:max-w-6xl'
          } mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 space-y-6`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-brand-border/60 print:hidden">
            <h1 className="text-xl sm:text-2xl font-bold text-brand-text-primary">
              Exams &amp; Papers
            </h1>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div className="w-full sm:w-[320px]">
                <SegmentedControl
                  size="sm"
                  value={isScanTab ? 'scan' : 'create'}
                  options={[
                    { value: 'create', label: 'Paper Maker' },
                    { value: 'scan', label: 'OMR Scanner' },
                  ]}
                  onChange={(sub) => {
                    setShowSavedPapers(false);
                    if (sub === 'scan') {
                      onNavigate('omr-scanner');
                      setPaperSubView('scan');
                    } else {
                      onNavigate('paper');
                      setPaperSubView('create');
                    }
                  }}
                />
              </div>
              {!isScanTab && (
                <button
                  type="button"
                  onClick={() => setShowSavedPapers((prev) => !prev)}
                  className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                    showSavedPapers
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>{showSavedPapers ? 'Back to Builder' : 'Saved Tests'}</span>
                </button>
              )}
            </div>
          </div>

          {isScanTab ? (
            <OmrScannerView
              initialFilter={omrInitialFilter}
              schoolName={selection.schoolName}
              onBackToPaper={
                generatedPapers.length > 0 ? () => onNavigate('results') : undefined
              }
            />
          ) : showSavedPapers ? (
            <HistoryView
              filterType="papers"
              hideHeader
              onOpenPaper={(paper) => {
                setGeneratedPapers([paper]);
                setGeneratedPlans([]);
                onNavigate('results');
              }}
              onOpenLessonPlan={(plan) => {
                setGeneratedPlans([plan]);
                setGeneratedPapers([]);
                onNavigate('results');
              }}
            />
          ) : (
            <PaperPanel
              onGeneratePaper={onGeneratePaper}
              isGenerating={isGenerating}
              selection={selection}
              exportFormat={exportFormat}
              onExportFormatChange={setExportFormat}
            />
          )}
        </div>
      );
    }

    if (view === 'records') return <StudentRecordsView />;
    if (view === 'marksheets') {
      return <MarksheetsView initialTarget={marksheetInitialTarget} />;
    }
    if (view === 'archive') return <DocumentArchiveCenterView />;
    if (view === 'attendance') return <DailyAttendanceView />;
    if (view === 'live') return <LiveMonitor teachers={teachers} />;

    if (view === 'history') {
      return (
        <HistoryView
          onOpenLessonPlan={(plan) => {
            setGeneratedPlans([plan]);
            setGeneratedPapers([]);
            onNavigate('results');
          }}
          onOpenPaper={(paper) => {
            setGeneratedPapers([paper]);
            setGeneratedPlans([]);
            onNavigate('results');
          }}
          onBack={onBackToHome}
          backLabel="← Back to Home"
        />
      );
    }

    if (view === 'results') {
      return (
        <ResultsView
          lessonPlans={generatedPlans}
          papers={generatedPapers}
          onBack={onBackToHome}
          teacherName={selection.teacherName}
          schoolName={selection.schoolName}
          onExportPlan={onExportPlan}
          exportFormat={exportFormat}
          onRevisePaper={revisePaper}
          isRevising={isGenerating}
          onUpdatePaper={(updated) => setGeneratedPapers([updated])}
          onScanSheetsForPaper={onScanSheetsForPaper}
        />
      );
    }

    if (view === 'settings') {
      return <SchoolSettingsView onOpenLoginGate={onOpenLoginGate} />;
    }

    return null;
  };

  return <Suspense fallback={<ViewLoadingFallback />}>{renderSecondaryView()}</Suspense>;
};
