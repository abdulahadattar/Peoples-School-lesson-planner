import React, { useState, useEffect, Suspense } from 'react';
import { Archive } from 'lucide-react';
import { View, PaperConfig, Teacher, LessonPlan, GeneratedPaper } from '../../types';
import type { SchoolConfig } from '../../services/schoolConfigService';
import HomeView from '../HomeView';
import type { MarksheetInitialTarget } from '../marksheets/useMarksheetsState';
import { SegmentedControl } from '../ui/SegmentedControl';
import Spinner from '../ui/Spinner';
import { GenerationMode } from '../../hooks/useGeneralGeneration';
import {
  type KeepAliveSlot,
  getKeepAliveSlot,
  trackVisitedViewSlots,
  scheduleBackgroundPortalWarmup,
  warmDataForView,
} from '../../services/portalWarmup';

const viewLoaders = {
  lesson: () => import('../SubjectSelector'),
  paper: () => import('../PaperPanel'),
  results: () => import('../ResultsView'),
  live: () => import('../LiveMonitor'),
  history: () => import('../HistoryView'),
  records: () => import('../records/StudentRecordsView'),
  attendance: () => import('../attendance/DailyAttendanceView'),
  archive: () => import('../DocumentArchiveCenterView'),
  settings: () => import('../settings/SchoolSettingsView'),
  marksheets: () => import('../marksheets/MarksheetsView'),
  'omr-scanner': () => import('../omr/OmrScannerView'),
};

const prefetchedViews = new Set<string>();

export function prefetchViewChunk(targetView: View): void {
  warmDataForView(targetView);
  if (targetView === 'home' || prefetchedViews.has(targetView)) return;
  const loader = viewLoaders[targetView as keyof typeof viewLoaders];
  if (!loader) return;
  prefetchedViews.add(targetView);
  void loader().catch(() => {
    prefetchedViews.delete(targetView);
  });
}

export function schedulePortalViewPrefetch(currentView: View = 'home'): () => void {
  return scheduleBackgroundPortalWarmup({
    currentView,
    prefetchChunk: prefetchViewChunk,
  });
}

const SubjectSelector = React.lazy(viewLoaders.lesson);
const PaperPanel = React.lazy(viewLoaders.paper);
const ResultsView = React.lazy(viewLoaders.results);
const LiveMonitor = React.lazy(viewLoaders.live);
const HistoryView = React.lazy(() =>
  viewLoaders.history().then((m) => ({ default: m.HistoryView }))
);
const StudentRecordsView = React.lazy(() =>
  viewLoaders.records().then((m) => ({ default: m.StudentRecordsView }))
);
const DailyAttendanceView = React.lazy(() =>
  viewLoaders.attendance().then((m) => ({ default: m.DailyAttendanceView }))
);
const DocumentArchiveCenterView = React.lazy(() =>
  viewLoaders.archive().then((m) => ({ default: m.DocumentArchiveCenterView }))
);
const SchoolSettingsView = React.lazy(() =>
  viewLoaders.settings().then((m) => ({ default: m.SchoolSettingsView }))
);
const MarksheetsView = React.lazy(() =>
  viewLoaders.marksheets().then((m) => ({ default: m.MarksheetsView }))
);
const OmrScannerView = React.lazy(() =>
  viewLoaders['omr-scanner']().then((m) => ({ default: m.OmrScannerView }))
);

const ViewLoadingFallback: React.FC = () => (
  <div className="flex-1 min-h-[320px] flex items-center justify-center p-6 animate-fadeIn">
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
  schoolConfig?: SchoolConfig | null;
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
  schoolConfig,
  onOpenLoginGate,
  omrInitialFilter,
  onScanSheetsForPaper,
  marksheetInitialTarget,
}) => {
  const [showSavedPapers, setShowSavedPapers] = useState(false);
  const [visitedSlots, setVisitedSlots] = useState<KeepAliveSlot[]>(() =>
    trackVisitedViewSlots([], view)
  );
  const [visitedLessonTabs, setVisitedLessonTabs] = useState<Array<'create' | 'saved'>>(() => [
    lessonSubView,
  ]);

  const isScanTabActive = view === 'omr-scanner' || paperSubView === 'scan';
  const activeExamsTab: 'create' | 'scan' | 'saved' = isScanTabActive
    ? 'scan'
    : showSavedPapers
      ? 'saved'
      : 'create';
  const [visitedExamsTabs, setVisitedExamsTabs] = useState<Array<'create' | 'scan' | 'saved'>>(() => [
    activeExamsTab,
  ]);

  useEffect(() => {
    setVisitedSlots((prev) => trackVisitedViewSlots(prev, view));
  }, [view]);

  useEffect(() => {
    if (view !== 'lesson') return;
    setVisitedLessonTabs((prev) =>
      prev.includes(lessonSubView) ? prev : [...prev, lessonSubView]
    );
  }, [view, lessonSubView]);

  useEffect(() => {
    if (view !== 'paper' && view !== 'omr-scanner') return;
    setVisitedExamsTabs((prev) =>
      prev.includes(activeExamsTab) ? prev : [...prev, activeExamsTab]
    );
  }, [view, activeExamsTab]);

  const effectiveSlots = trackVisitedViewSlots(visitedSlots, view);
  const activeSlot = getKeepAliveSlot(view);
  const effectiveLessonTabs = visitedLessonTabs.includes(lessonSubView)
    ? visitedLessonTabs
    : [...visitedLessonTabs, lessonSubView];
  const effectiveExamsTabs = visitedExamsTabs.includes(activeExamsTab)
    ? visitedExamsTabs
    : [...visitedExamsTabs, activeExamsTab];

  const renderSlotContent = (slot: KeepAliveSlot, isActive: boolean) => {
    switch (slot) {
      case 'home':
        return (
          <HomeView
            schoolConfig={schoolConfig}
            onPrefetchView={prefetchViewChunk}
            onNavigate={(target) => {
              if (target === 'lesson') onNavigateLesson();
              else if (target === 'paper') onNavigatePaper();
              else onNavigate(target);
            }}
          />
        );

      case 'lesson':
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

            {effectiveLessonTabs.map((tabKey) => {
              const isTabActive = lessonSubView === tabKey;
              return (
                <div
                  key={tabKey}
                  hidden={!isTabActive}
                  aria-hidden={!isTabActive}
                  className={isTabActive ? 'animate-pageEnter' : 'hidden'}
                >
                  {tabKey === 'create' ? (
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
            })}
          </div>
        );

      case 'exams':
        return (
          <div
            className={`w-full ${
              isScanTabActive ? 'max-w-[1380px]' : 'max-w-4xl xl:max-w-5xl 2xl:max-w-6xl'
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
                    value={isScanTabActive ? 'scan' : 'create'}
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
                {!isScanTabActive && (
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

            {effectiveExamsTabs.map((tabKey) => {
              const isTabActive = activeExamsTab === tabKey;
              return (
                <div
                  key={tabKey}
                  hidden={!isTabActive}
                  aria-hidden={!isTabActive}
                  className={isTabActive ? 'animate-pageEnter' : 'hidden'}
                >
                  {tabKey === 'scan' ? (
                    <OmrScannerView
                      initialFilter={omrInitialFilter}
                      schoolName={schoolConfig?.schoolName || selection.schoolName}
                      onBackToPaper={
                        generatedPapers.length > 0 ? () => onNavigate('results') : undefined
                      }
                    />
                  ) : tabKey === 'saved' ? (
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
            })}
          </div>
        );

      case 'records':
        return <StudentRecordsView isPanelActive={isActive} />;

      case 'marksheets':
        return <MarksheetsView initialTarget={marksheetInitialTarget} />;

      case 'archive':
        return <DocumentArchiveCenterView />;

      case 'attendance':
        return <DailyAttendanceView />;

      case 'live':
        return <LiveMonitor teachers={teachers} />;

      case 'history':
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

      case 'settings':
        return <SchoolSettingsView onOpenLoginGate={onOpenLoginGate} />;
    }
  };

  return (
    <>
      {effectiveSlots.map((slot) => {
        const isActive = view !== 'results' && activeSlot === slot;
        const enterAnimClass = slot === 'home' ? 'animate-softSettle' : 'animate-pageEnter';
        return (
          <div
            key={slot}
            data-panel-slot={slot}
            hidden={!isActive}
            aria-hidden={!isActive}
            className={isActive ? `${enterAnimClass} min-h-full` : 'hidden'}
          >
            <Suspense fallback={<ViewLoadingFallback />}>
              {renderSlotContent(slot, isActive)}
            </Suspense>
          </div>
        );
      })}

      {view === 'results' && (
        <div key="results" className="animate-pageEnter min-h-full">
          <Suspense fallback={<ViewLoadingFallback />}>
            <ResultsView
              lessonPlans={generatedPlans}
              papers={generatedPapers}
              onBack={onBackToHome}
              teacherName={selection.teacherName}
              schoolName={schoolConfig?.schoolName || selection.schoolName}
              onExportPlan={onExportPlan}
              exportFormat={exportFormat}
              onRevisePaper={revisePaper}
              isRevising={isGenerating}
              onUpdatePaper={(updated) => setGeneratedPapers([updated])}
              onScanSheetsForPaper={onScanSheetsForPaper}
            />
          </Suspense>
        </div>
      )}
    </>
  );
};
