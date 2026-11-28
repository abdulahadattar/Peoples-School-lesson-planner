import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { PaperConfig, Teacher, View } from './types';
import Header from './components/Header';
import { PendingSyncBanner } from './components/ui/PendingSyncBanner';
import GenerationStatusPanel from './components/GenerationStatusPanel';
import { AnimatedLoginPage } from './components/auth/AnimatedLoginPage';
import { useToast } from './hooks/useToast';
import { useGeneralGeneration, GenerationMode } from './hooks/useGeneralGeneration';
import { useSelection } from './hooks/useSelection';
import { loadSloChapter } from './services/sloData';
import { useSchoolConfig } from './hooks/useSchoolConfig';
import { MotionConfig } from 'motion/react';
import { AppSidebar } from './components/navigation/AppSidebar';
import {
  AppViewRouter,
  prefetchViewChunk,
  schedulePortalViewPrefetch,
} from './components/navigation/AppViewRouter';
import { useAppThemeAndAuth } from './hooks/useAppThemeAndAuth';
import { buildFallbackCurriculumSlos } from './services/paper/curriculumFallback';
import { isUserAdmin } from './services/adminService';
import { toUserErrorMessage } from './utils/userMessage';
import Spinner from './components/ui/Spinner';
import { usePortalHistory } from './hooks/usePortalHistory';
import {
  extractRouteFromPopState,
  shouldRequireLoginGateOnRoute,
} from './services/portalNavigation';

const PrivacyPolicyPage = React.lazy(() =>
  import('./components/legal/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage }))
);
const TermsOfServicePage = React.lazy(() =>
  import('./components/legal/TermsOfServicePage').then((m) => ({ default: m.TermsOfServicePage }))
);

interface MainPortalAppProps {
  view: View;
  navigateToView: (
    targetView: View,
    options?: {
      paperSubView?: 'create' | 'scan';
      lessonSubView?: 'create' | 'saved';
      replace?: boolean;
    }
  ) => void;
  navigateToPath: (path: string) => void;
}

const MainPortalApp: React.FC<MainPortalAppProps> = ({
  view,
  navigateToView,
  navigateToPath,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const {
    theme,
    toggleTheme,
    currentUser,
    setCurrentUser,
    authResolved,
    showLoginGate,
    setShowLoginGate,
  } = useAppThemeAndAuth();

  const [generationMode, setGenerationMode] = useState<GenerationMode>('topic');
  const [topicInput, setTopicInput] = useState('');
  const [lessonSubView, setLessonSubView] = useState<'create' | 'saved'>('create');
  const [paperSubView, setPaperSubView] = useState<'create' | 'scan'>(() =>
    view === 'omr-scanner' ? 'scan' : 'create'
  );
  const [omrInitialFilter, setOmrInitialFilter] = useState<{ testCode?: string } | null>(null);
  const { showToast, ToastComponent } = useToast(4500);

  const { config: schoolConfig } = useSchoolConfig();
  const [selectedSloIds, setSelectedSloIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'docx' | 'pdf' | 'both'>('both');
  const teachers: Teacher[] = schoolConfig.teachers || [];
  const [chapterSlos, setChapterSlos] = useState<any[]>([]);
  const [isLoadingSlos, setIsLoadingSlos] = useState(false);

  const selection = useSelection({
    teachers,
    defaultSchoolName: schoolConfig.schoolName,
    onChapterChange: () => setSelectedSloIds([]),
  });

  const {
    isLoading,
    generationProgress,
    statusMessage,
    logMessages,
    generatedPlans,
    generatedPapers,
    setGeneratedPlans,
    setGeneratedPapers,
    error,
    showStatusPanel,
    setShowStatusPanel,
    generateLessonPlan,
    generatePaper,
    exportPlan,
    revisePaper,
    stopGeneration,
    clearResults,
  } = useGeneralGeneration();

  useEffect(() => {
    if (selection.classId && selection.subjectId && selection.chapterId) {
      setIsLoadingSlos(true);
      loadSloChapter(selection.classId, selection.subjectId, selection.chapterId)
        .then(chapter => {
          const jsonSlos = (chapter?.slos || []).map((slo: any, idx: number) => ({
            uniqueId: slo.uniqueId || slo.id || `slo-${idx}`,
            SLO_ID: slo.id || `SLO_${idx}`,
            SLO_Text: slo.text || '',
            Cognitive_Level_Code: slo.cognitiveLevel || 'U',
          }));
          if (jsonSlos.length > 0) {
            setChapterSlos(jsonSlos);
          } else {
            setChapterSlos(
              buildFallbackCurriculumSlos(
                selection.classId,
                selection.subjectId,
                selection.chapterId,
                selection.selectedSubject?.name,
                selection.selectedChapter?.name
              )
            );
          }
        })
        .catch(err => {
          console.error('Failed to load chapter SLOs:', err);
          setChapterSlos(
            buildFallbackCurriculumSlos(
              selection.classId,
              selection.subjectId,
              selection.chapterId,
              selection.selectedSubject?.name,
              selection.selectedChapter?.name
            )
          );
        })
        .finally(() => setIsLoadingSlos(false));
    } else {
      setChapterSlos([]);
      setSelectedSloIds([]);
    }
  }, [selection.classId, selection.subjectId, selection.chapterId]);

  useEffect(() => {
    const handlePortalPopState = (event: PopStateEvent) => {
      const extracted = extractRouteFromPopState(window.location.pathname, event.state);
      if (extracted.kind !== 'portal') return;

      setIsSidebarOpen(false);
      if (extracted.paperSubView) {
        setPaperSubView(extracted.paperSubView);
      } else if (extracted.view === 'paper') {
        setPaperSubView('create');
      }
      if (extracted.lessonSubView) {
        setLessonSubView(extracted.lessonSubView);
      }

      const isGuest = sessionStorage.getItem('phssj_guest_mode') === 'true';
      if (
        shouldRequireLoginGateOnRoute({
          authResolved,
          hasUser: Boolean(currentUser),
          isGuestMode: isGuest,
          view: extracted.view,
        })
      ) {
        setShowLoginGate(true);
      }
    };

    window.addEventListener('popstate', handlePortalPopState);
    return () => window.removeEventListener('popstate', handlePortalPopState);
  }, [authResolved, currentUser, setShowLoginGate]);

  const navigate = (target: View) => {
    navigateToView(target);
    setIsSidebarOpen(false);
  };

  const handleNavigate = (target: 'lesson' | 'paper') => {
    const isSwitching =
      view !== 'home' &&
      view !== target &&
      !(target === 'paper' && view === 'omr-scanner');
    navigateToView(
      target,
      target === 'paper' ? { paperSubView: 'create' } : { lessonSubView }
    );
    setIsSidebarOpen(false);
    if (target === 'paper' && view !== 'paper') {
      setPaperSubView('create');
    }
    if (isSwitching) {
      selection.reset();
      setSelectedSloIds([]);
      setChapterSlos([]);
    }
  };

  const handleBackToHome = () => {
    navigateToView('home');
    clearResults();
  };

  const handleGenerateLesson = async () => {
    if (!selection.classId || !selection.subjectId) return;
    if (generationMode === 'whole-chapter' && !selection.chapterId) return;
    if (generationMode === 'single-slo' && (!selection.chapterId || selectedSloIds.length === 0)) return;
    if (generationMode === 'topic' && !topicInput.trim()) return;

    const topicOverride = generationMode === 'topic' ? topicInput.trim() : undefined;

    const plans = await generateLessonPlan(
      selection.classId,
      selection.subjectId,
      selection.chapterId,
      { name: selection.teacherName, schoolName: selection.schoolName },
      topicOverride,
      {
        mode: generationMode,
        selectedSloIds,
        exportFormat,
        allChapterSlos: chapterSlos,
      }
    );

    if (plans && plans.length > 0) {
      navigateToView('results');
      setShowStatusPanel(false);
    }
  };

  const handleGeneratePaper = async (config: PaperConfig) => {
    const paper = await generatePaper(config, {
      name: selection.teacherName,
      schoolName: selection.schoolName,
    });
    if (paper) {
      navigateToView('results');
      setShowStatusPanel(false);
    }
  };

  const handleExportPlan = async (plan: any) => {
    try {
      await exportPlan(plan, { name: selection.teacherName, schoolName: selection.schoolName }, exportFormat);
    } catch (error) {
      showToast(toUserErrorMessage(error, 'Failed to export. Please try again.'), 'error');
    }
  };

  const isGuestMode =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('phssj_guest_mode') === 'true';
  const showLoginOverlay = showLoginGate && !currentUser;
  const canRenderPortalContent = authResolved || isGuestMode || Boolean(currentUser);

  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const panelScrollPositionsRef = useRef<Record<string, number>>({});
  const scrollViewKey = view === 'omr-scanner' ? 'exams' : view === 'paper' ? 'exams' : view;
  const activeScrollKeyRef = useRef<string>(scrollViewKey);

  useEffect(() => {
    if (showLoginOverlay || !canRenderPortalContent) return;
    return schedulePortalViewPrefetch(view);
  }, [showLoginOverlay, canRenderPortalContent]);

  useLayoutEffect(() => {
    activeScrollKeyRef.current = scrollViewKey;
    const container = mainScrollRef.current;
    if (!container) return;
    const savedTop = panelScrollPositionsRef.current[scrollViewKey] ?? 0;
    container.scrollTop = savedTop;
  }, [scrollViewKey]);

  if (showLoginOverlay) {
    return (
      <>
        <div className="min-h-[100dvh] bg-[#070b14]">
          <AnimatedLoginPage
            onLoginSuccess={(user) => {
              setCurrentUser(user);
              setShowLoginGate(false);
            }}
            onContinueAsGuest={() => {
              sessionStorage.setItem('phssj_guest_mode', 'true');
              setShowLoginGate(false);
            }}
            onNavigatePath={navigateToPath}
          />
        </div>
        {ToastComponent}
      </>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-[100dvh] bg-brand-bg text-brand-text-primary font-sans selection:bg-brand-primary selection:text-white antialiased overflow-hidden print:h-auto print:overflow-visible print:bg-white">
        <AppSidebar
          currentView={view}
          isSidebarOpen={isSidebarOpen}
          schoolConfig={schoolConfig}
          onCloseSidebar={() => setIsSidebarOpen(false)}
          onNavigate={navigate}
          onNavigateLesson={() => handleNavigate('lesson')}
          onNavigatePaper={() => handleNavigate('paper')}
          onBackToHome={handleBackToHome}
          onNavigatePath={navigateToPath}
          onPrefetchView={prefetchViewChunk}
        />

        <main className="flex-1 flex flex-col h-full overflow-hidden relative print:h-auto print:overflow-visible">
          <Header
            theme={theme}
            activeView={view}
            currentUser={currentUser}
            schoolName={schoolConfig.schoolName}
            schoolLogoUrl={schoolConfig.schoolLogoUrl}
            isAuthResolving={!authResolved && !isGuestMode && !currentUser}
            onToggleTheme={toggleTheme}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onOpenLoginGate={() => {
              setShowLoginGate(true);
              sessionStorage.removeItem('phssj_guest_mode');
            }}
          />

          {isUserAdmin(currentUser?.email) && (
            <PendingSyncBanner className="shrink-0 mx-3.5 mt-2 sm:mx-6 print:hidden" />
          )}

          {!canRenderPortalContent ? (
            <div className="flex-1 flex items-center justify-center p-6 animate-fadeIn">
              <div className="flex flex-col items-center gap-3 text-brand-text-secondary">
                <Spinner className="w-6 h-6 text-brand-primary" label="Loading portal" />
                <span className="text-xs font-medium">Loading...</span>
              </div>
            </div>
          ) : (
            <div
              ref={mainScrollRef}
              onScroll={(e) => {
                panelScrollPositionsRef.current[activeScrollKeyRef.current] =
                  e.currentTarget.scrollTop;
              }}
              className={`flex-1 min-h-0 relative pb-6 print:pb-0 print:overflow-visible [scrollbar-gutter:stable] ${
                view === 'results' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto overflow-x-hidden custom-scrollbar'
              }`}
            >
              <AppViewRouter
                view={view}
                onNavigate={navigate}
                onNavigateLesson={() => handleNavigate('lesson')}
                onNavigatePaper={() => handleNavigate('paper')}
                onBackToHome={handleBackToHome}
                lessonSubView={lessonSubView}
                setLessonSubView={setLessonSubView}
                selection={selection}
                generationMode={generationMode}
                setGenerationMode={setGenerationMode}
                topicInput={topicInput}
                setTopicInput={setTopicInput}
                selectedSloIds={selectedSloIds}
                setSelectedSloIds={setSelectedSloIds}
                exportFormat={exportFormat}
                setExportFormat={setExportFormat}
                chapterSlos={chapterSlos}
                isLoadingSlos={isLoadingSlos}
                onGenerateLesson={handleGenerateLesson}
                isGenerating={isLoading}
                paperSubView={paperSubView}
                setPaperSubView={setPaperSubView}
                onGeneratePaper={handleGeneratePaper}
                omrInitialFilter={omrInitialFilter}
                onScanSheetsForPaper={(testCode) => {
                  setOmrInitialFilter({ testCode });
                  setPaperSubView('scan');
                  navigateToView('omr-scanner', { paperSubView: 'scan' });
                }}
                generatedPlans={generatedPlans}
                generatedPapers={generatedPapers}
                setGeneratedPlans={setGeneratedPlans}
                setGeneratedPapers={setGeneratedPapers}
                onExportPlan={handleExportPlan}
                revisePaper={revisePaper}
                teachers={teachers}
                schoolConfig={schoolConfig}
                onOpenLoginGate={() => {
                  sessionStorage.removeItem('phssj_guest_mode');
                  setShowLoginGate(true);
                }}
              />
            </div>
          )}

        {showStatusPanel && (
          <GenerationStatusPanel
            isLoading={isLoading}
            isComplete={!!(generatedPlans.length || generatedPapers.length)}
            logMessages={logMessages}
            statusMessage={statusMessage}
            generationProgress={generationProgress || undefined}
            onClose={() => {
              setShowStatusPanel(false);
              if (generatedPlans.length > 0 || generatedPapers.length > 0) {
                navigateToView('results');
              }
            }}
            onStop={stopGeneration}
            onViewResults={() => { setShowStatusPanel(false); navigateToView('results'); }}
            error={error}
          />
        )}
      </main>

      {ToastComponent}
      </div>
    </MotionConfig>
  );
};

const App: React.FC = () => {
  const { topRoute, view, navigateToView, navigateToPath } = usePortalHistory();

  if (topRoute.kind === 'public' && topRoute.page === 'privacy') {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <PrivacyPolicyPage onNavigatePath={navigateToPath} />
      </React.Suspense>
    );
  }
  if (topRoute.kind === 'public' && topRoute.page === 'terms') {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <TermsOfServicePage onNavigatePath={navigateToPath} />
      </React.Suspense>
    );
  }

  return (
    <MainPortalApp
      view={view}
      navigateToView={navigateToView}
      navigateToPath={navigateToPath}
    />
  );
};

export default App;
