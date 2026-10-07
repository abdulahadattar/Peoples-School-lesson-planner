import React from 'react';
import { View, PaperConfig, Teacher, LessonPlan, GeneratedPaper } from '../../types';
import HomeView from '../HomeView';
import SubjectSelector from '../SubjectSelector';
import PaperPanel from '../PaperPanel';
import ResultsView from '../ResultsView';
import LiveMonitor from '../LiveMonitor';
import { HistoryView } from '../HistoryView';
import { StudentRecordsView } from '../records/StudentRecordsView';
import { DailyAttendanceView } from '../attendance/DailyAttendanceView';
import { DocumentArchiveCenterView } from '../DocumentArchiveCenterView';
import { SchoolSettingsView } from '../settings/SchoolSettingsView';
import { SegmentedControl } from '../ui/SegmentedControl';
import { GenerationMode } from '../../hooks/useGeneralGeneration';

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
  // Exam Paper state
  paperSubView: 'create' | 'saved';
  setPaperSubView: (sub: 'create' | 'saved') => void;
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
}) => {
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

  if (view === 'lesson') {
    return (
      <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-brand-border/60">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-brand-text-primary">
              Lesson Plans
            </h1>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Curriculum-aligned lesson planner and saved lesson archive.
            </p>
          </div>
          <div className="w-56 self-start sm:self-auto">
            <SegmentedControl
              size="sm"
              value={lessonSubView}
              options={[
                { value: 'create', label: 'New Plan' },
                { value: 'saved', label: 'Saved Archive' },
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

  if (view === 'paper') {
    return (
      <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-brand-border/60">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-brand-text-primary">
              Exam Papers
            </h1>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Board-standard paper generator and past exam archive.
            </p>
          </div>
          <div className="w-56 self-start sm:self-auto">
            <SegmentedControl
              size="sm"
              value={paperSubView}
              options={[
                { value: 'create', label: 'New Paper' },
                { value: 'saved', label: 'Saved Archive' },
              ]}
              onChange={setPaperSubView}
            />
          </div>
        </div>

        {paperSubView === 'create' ? (
          <PaperPanel
            onGeneratePaper={onGeneratePaper}
            isGenerating={isGenerating}
            selection={selection}
            exportFormat={exportFormat}
            onExportFormatChange={setExportFormat}
          />
        ) : (
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
        )}
      </div>
    );
  }

  if (view === 'records') return <StudentRecordsView />;
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
      />
    );
  }

  if (view === 'settings') {
    return <SchoolSettingsView onOpenLoginGate={onOpenLoginGate} />;
  }

  return null;
};
