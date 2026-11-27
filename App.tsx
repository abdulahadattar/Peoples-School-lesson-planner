import React, { useState, useEffect } from 'react';
import { PaperConfig, Teacher, View } from './types';
import Header from './components/Header';
import { PendingSyncBanner } from './components/ui/PendingSyncBanner';
import GenerationStatusPanel from './components/GenerationStatusPanel';
import { AnimatedLoginPage } from './components/auth/AnimatedLoginPage';
import { useToast } from './hooks/useToast';
import { useGeneralGeneration, GenerationMode } from './hooks/useGeneralGeneration';
import { useSelection } from './hooks/useSelection';
import { loadSloChapter } from './services/sloData';
import teachersData from './data/teachers.json';
import { useSchoolConfig } from './hooks/useSchoolConfig';
import { motion, AnimatePresence } from 'motion/react';
import { AppSidebar } from './components/navigation/AppSidebar';
import { AppViewRouter } from './components/navigation/AppViewRouter';
import { useAppThemeAndAuth } from './hooks/useAppThemeAndAuth';
import { buildFallbackCurriculumSlos } from './services/paper/curriculumFallback';
import { isUserAdmin } from './services/adminService';
import { toUserErrorMessage } from './utils/userMessage';
import { PrivacyPolicyPage } from './components/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/legal/TermsOfServicePage';

const App: React.FC = () => {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  if (pathname === '/privacy') {
    return <PrivacyPolicyPage />;
  }
  if (pathname === '/terms') {
    return <TermsOfServicePage />;
  }

  const [view, setView] = useState<View>('home');
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
  const [paperSubView, setPaperSubView] = useState<'create' | 'scan'>('create');
  const [omrInitialFilter, setOmrInitialFilter] = useState<{ testCode?: string } | null>(null);
  const { showToast, ToastComponent } = useToast(4500);

  const [selectedSloIds, setSelectedSloIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'docx' | 'pdf' | 'both'>('both');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [chapterSlos, setChapterSlos] = useState<any[]>([]);
  const [isLoadingSlos, setIsLoadingSlos] = useState(false);

  const { config: schoolConfig } = useSchoolConfig();

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
    if (schoolConfig?.teachers && schoolConfig.teachers.length > 0) {
      setTeachers(schoolConfig.teachers);
    } else {
      setTeachers((teachersData as { teachers: Teacher[] }).teachers || []);
    }
  }, [schoolConfig?.teachers]);

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

  const navigate = (target: View) => {
    setView(target);
    setIsSidebarOpen(false);
  };

  const handleNavigate = (target: 'lesson' | 'paper') => {
    const isSwitching = view !== 'home' && view !== target;
    setView(target);
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
    setView('home');
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
      setView('results');
      setShowStatusPanel(false);
    }
  };

  const handleGeneratePaper = async (config: PaperConfig) => {
    const paper = await generatePaper(config, {
      name: selection.teacherName,
      schoolName: selection.schoolName,
    });
    if (paper) {
      setView('results');
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

  return (
    <div className="flex h-[100dvh] bg-brand-bg text-brand-text-primary font-sans selection:bg-brand-primary selection:text-white antialiased overflow-hidden print:h-auto print:overflow-visible print:bg-white">
      <AnimatePresence>
        {authResolved && showLoginGate && !currentUser && (
          <motion.div
            key="login-gate-overlay"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[200] overflow-y-auto bg-[#070b14]"
          >
            <AnimatedLoginPage
              onLoginSuccess={(user) => {
                setCurrentUser(user);
                setShowLoginGate(false);
              }}
              onContinueAsGuest={() => {
                sessionStorage.setItem('phssj_guest_mode', 'true');
                setShowLoginGate(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AppSidebar
        currentView={view}
        isSidebarOpen={isSidebarOpen}
        schoolConfig={schoolConfig}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onNavigate={navigate}
        onNavigateLesson={() => handleNavigate('lesson')}
        onNavigatePaper={() => handleNavigate('paper')}
        onBackToHome={handleBackToHome}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative print:h-auto print:overflow-visible">
        <Header
          theme={theme}
          activeView={view}
          currentUser={currentUser}
          schoolName={schoolConfig.schoolName}
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

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`flex-1 min-h-0 relative pb-6 print:pb-0 print:overflow-visible ${
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
                setView('paper');
              }}
              generatedPlans={generatedPlans}
              generatedPapers={generatedPapers}
              setGeneratedPlans={setGeneratedPlans}
              setGeneratedPapers={setGeneratedPapers}
              onExportPlan={handleExportPlan}
              revisePaper={revisePaper}
              teachers={teachers}
              onOpenLoginGate={() => setShowLoginGate(true)}
            />
          </motion.div>
        </AnimatePresence>

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
                setView('results');
              }
            }}
            onStop={stopGeneration}
            onViewResults={() => { setShowStatusPanel(false); setView('results'); }}
            error={error}
          />
        )}
      </main>

      {ToastComponent}
    </div>
  );
};

export default App;
