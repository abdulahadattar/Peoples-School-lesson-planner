import React, { useState, useEffect } from 'react';
import { Theme, PaperConfig, Teacher, View } from './types';
import Header from './components/Header';
import { PendingSyncBanner } from './components/ui/PendingSyncBanner';
import HomeView from './components/HomeView';
import SubjectSelector from './components/SubjectSelector';
import PaperPanel from './components/PaperPanel';
import ResultsView from './components/ResultsView';
import GenerationStatusPanel from './components/GenerationStatusPanel';
import LiveMonitor from './components/LiveMonitor';
import { HistoryView } from './components/HistoryView';
import { StudentRecordsView } from './components/records/StudentRecordsView';
import { DailyAttendanceView } from './components/attendance/DailyAttendanceView';
import { AnimatedLoginPage } from './components/auth/AnimatedLoginPage';
import { SchoolSettingsView } from './components/settings/SchoolSettingsView';
import { PhssjLogo, ZiauddinLogo } from './components/Logo';
import { BookOpenIcon, CloseIcon, DocumentTextIcon, HomeIcon, PulseIcon, ArchiveIcon, SpreadsheetIcon, UserGroupIcon, FolderArchiveIcon } from './components/icons/MiscIcons';
import { Settings as SettingsIcon } from 'lucide-react';
import { DocumentArchiveCenterView } from './components/DocumentArchiveCenterView';
import { SegmentedControl } from './components/ui/SegmentedControl';
import { useToast } from './hooks/useToast';
import { useGeneralGeneration, GenerationMode } from './hooks/useGeneralGeneration';
import { useSelection } from './hooks/useSelection';
import versionConfig from './version.json';
import { loadSloChapter } from './services/sloData';
import { auth } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import teachersData from './data/teachers.json';
import { useSchoolConfig } from './hooks/useSchoolConfig';
import { motion, AnimatePresence } from 'motion/react';

interface NavItem {
  view: View;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  activeViews: View[];
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { view: 'home', label: 'Home', icon: HomeIcon, activeViews: ['home'] },
    ],
  },
  {
    title: 'Academics',
    items: [
      { view: 'lesson', label: 'Lesson Plans', icon: BookOpenIcon, activeViews: ['lesson', 'results'] },
      { view: 'paper', label: 'Exam Papers', icon: DocumentTextIcon, activeViews: ['paper'] },
      { view: 'history', label: 'History Archive', icon: ArchiveIcon, activeViews: ['history'] },
    ],
  },
  {
    title: 'Students & Records',
    items: [
      { view: 'attendance', label: 'Daily Attendance', icon: UserGroupIcon, activeViews: ['attendance'] },
      { view: 'records', label: 'Student Records', icon: SpreadsheetIcon, activeViews: ['records'] },
      { view: 'archive', label: 'Document Archive', icon: FolderArchiveIcon, activeViews: ['archive'] },
    ],
  },
  {
    title: 'Operations & Admin',
    items: [
      { view: 'live', label: 'Live Monitor', icon: PulseIcon, activeViews: ['live'] },
      { view: 'settings', label: 'School Admin', icon: SettingsIcon, activeViews: ['settings'] },
    ],
  },
];

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [theme, setTheme] = useState<Theme>('light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // The gate must not be decided until Firebase has finished restoring the
  // session. Reading `auth.currentUser` during the first render is always null
  // because auth hydrates asynchronously from IndexedDB, so a signed-in user was
  // shown the login screen on every load until the listener below happened to
  // fire. `authResolved` gates the decision instead.
  const [authResolved, setAuthResolved] = useState<boolean>(false);
  const [showLoginGate, setShowLoginGate] = useState<boolean>(false);

  const [generationMode, setGenerationMode] = useState<GenerationMode>('topic');
  const [topicInput, setTopicInput] = useState('');
  const [lessonSubView, setLessonSubView] = useState<'create' | 'saved'>('create');
  const [paperSubView, setPaperSubView] = useState<'create' | 'saved'>('create');
  const { showToast, ToastComponent } = useToast(4500);

  // SLO and batch generation state
  const [selectedSloIds, setSelectedSloIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'docx' | 'pdf' | 'both'>('both');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [chapterSlos, setChapterSlos] = useState<any[]>([]);
  const [isLoadingSlos, setIsLoadingSlos] = useState(false);

  const selection = useSelection({
    teachers,
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

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthResolved(true);
      if (user) {
        // A real sign-in always takes the gate down, even if something reopened it.
        setShowLoginGate(false);
      } else {
        const isGuest = sessionStorage.getItem('phssj_guest_mode') === 'true';
        setShowLoginGate(!isGuest);
      }
    });
    return () => unsubscribe();
  }, []);

  const { config: schoolConfig } = useSchoolConfig();

  // Centralized teachers: synchronize with School Admin config (live updates) or fallback to teachersData
  useEffect(() => {
    if (schoolConfig?.teachers && schoolConfig.teachers.length > 0) {
      setTeachers(schoolConfig.teachers);
    } else {
      setTeachers((teachersData as { teachers: Teacher[] }).teachers || []);
    }
  }, [schoolConfig?.teachers]);

  // Load chapter SLOs when chapter changes
  useEffect(() => {
    if (selection.classId && selection.subjectId && selection.chapterId) {
      setIsLoadingSlos(true);
      loadSloChapter(selection.classId, selection.subjectId, selection.chapterId)
        .then(chapter => {
          if (!chapter) {
            setChapterSlos([]);
            return;
          }
          const slos = (chapter.slos || []).map((slo: any, idx: number) => ({
            uniqueId: slo.uniqueId || slo.id || `slo-${idx}`,
            SLO_ID: slo.id || `SLO_${idx}`,
            SLO_Text: slo.text || '',
            Cognitive_Level_Code: slo.cognitiveLevel || 'U',
          }));
          setChapterSlos(slos);
        })
        .catch(err => {
          console.error('Failed to load chapter SLOs:', err);
          setChapterSlos([]);
        })
        .finally(() => setIsLoadingSlos(false));
    } else {
      setChapterSlos([]);
      setSelectedSloIds([]);
    }
  }, [selection.classId, selection.subjectId, selection.chapterId]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const navigate = (target: View) => {
    setView(target);
    setIsSidebarOpen(false);
  };

  const handleNavigate = (target: 'lesson' | 'paper') => {
    // Don't clear results or cancel generation — let it keep running
    const isSwitching = view !== 'home' && view !== target;
    setView(target);
    setIsSidebarOpen(false);
    // Re-clicking the nav item you are already on preserves the form selections
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
    const paper = await generatePaper(config);
    if (paper) {
      setView('results');
      setShowStatusPanel(false);
    }
  };

  const hasResults = generatedPlans.length > 0 || generatedPapers.length > 0;

  const handleExportPlan = async (plan: any) => {
    try {
      await exportPlan(plan, { name: selection.teacherName, schoolName: selection.schoolName }, exportFormat);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to export. Please try again.', 'error');
    }
  };

  return (
    <div className="flex h-[100dvh] bg-brand-bg text-brand-text-primary font-sans selection:bg-brand-primary selection:text-white antialiased overflow-hidden">
      {/* Animated Google Auth Gate Screen */}
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

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 z-40 md:hidden backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed md:relative z-50 md:z-10 top-0 left-0 h-[100dvh] md:h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl flex flex-col transition-transform duration-300 md:transition-none w-[270px] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-black/[0.06] dark:border-white/[0.08]`}>
        <div className="p-5 flex-grow flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-6 md:hidden">
            <span className="font-semibold text-sm text-slate-900 dark:text-white">Navigation</span>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors active:scale-95 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6 px-1">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0 p-1">
              <PhssjLogo className="w-full h-full object-contain" />
            </div>
            <div className="leading-tight truncate">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">PHSSJ Portal</h3>
              <p className="text-[11px] text-slate-500 truncate">{schoolConfig?.schoolName || 'Peoples Higher Secondary School'}</p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto space-y-4 pr-1 -mr-1 custom-scrollbar">
            {NAV_SECTIONS.map((section, sIdx) => (
              <div key={section.title || `section-${sIdx}`} className="space-y-1">
                {section.title && (
                  <div className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {section.title}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const isActive = item.activeViews.includes(view);
                    return (
                      <button
                        key={item.view}
                        id={`nav-${item.view}`}
                        type="button"
                        onClick={() => {
                          if (item.view === 'home') handleBackToHome();
                          else if (item.view === 'records') navigate('records');
                          else if (item.view === 'attendance') navigate('attendance');
                          else if (item.view === 'live') navigate('live');
                          else if (item.view === 'history') navigate('history');
                          else if (item.view === 'lesson') handleNavigate('lesson');
                          else if (item.view === 'paper') handleNavigate('paper');
                          else navigate(item.view);
                          setIsSidebarOpen(false);
                        }}
                        className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors group select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                          isActive
                            ? 'text-blue-600 dark:text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="activeNavPill"
                            className="absolute inset-0 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl border border-blue-500/20 dark:border-blue-500/30"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                        <item.icon className="relative z-10 w-4 h-4 transition-transform group-hover:scale-105 shrink-0" />
                        <span className="relative z-10 truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t border-black/[0.04] dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-black/[0.04] dark:border-white/[0.06]">
              <div className="shrink-0 bg-white rounded-md p-1 border border-slate-200/80 flex items-center justify-center">
                <ZiauddinLogo className="h-5 w-auto" />
              </div>
              <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                Affiliated with
                <br />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Ziauddin University</span>
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header
          theme={theme}
          activeView={view}
          onToggleTheme={toggleTheme}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenLoginGate={() => {
            setShowLoginGate(true);
            sessionStorage.removeItem('phssj_guest_mode');
          }}
        />

        {/*
          App-wide, not per-view: the offline Sheets queue is a single global
          store, and a token expiry or a queue overflow can happen while the
          teacher is on any view. It used to be mounted inside the attendance and
          records views only, so the "changes did not reach the sheet" and
          "edits were dropped" warnings were invisible everywhere else - which is
          exactly when they matter. It sits above the scrolling region, so it
          stays on screen while the view body scrolls underneath.
        */}
        <PendingSyncBanner className="shrink-0 mx-3.5 mt-2 sm:mx-6" />

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`flex-1 min-h-0 relative pb-6 ${
              view === 'results' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto overflow-x-hidden custom-scrollbar'
            }`}
          >
            {view === 'home' && (
              <HomeView
                onNavigate={(target) => {
                  if (target === 'records') {
                    navigate('records');
                  } else if (target === 'attendance') {
                    navigate('attendance');
                  } else if (target === 'live' || target === 'history') {
                    navigate(target);
                  } else if (target === 'lesson' || target === 'paper') {
                    handleNavigate(target);
                  } else {
                    navigate(target);
                  }
                }}
              />
            )}

            {view === 'lesson' && (
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
                    onGenerate={handleGenerateLesson}
                    isGenerating={isLoading}
                  />
                ) : (
                  <HistoryView
                    filterType="plans"
                    hideHeader
                    onOpenLessonPlan={(plan) => {
                      setGeneratedPlans([plan]);
                      setGeneratedPapers([]);
                      setView('results');
                    }}
                    onOpenPaper={(paper) => {
                      setGeneratedPapers([paper]);
                      setGeneratedPlans([]);
                      setView('results');
                    }}
                  />
                )}
              </div>
            )}

            {view === 'paper' && (
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
                    onGeneratePaper={handleGeneratePaper}
                    isGenerating={isLoading}
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
                      setView('results');
                    }}
                    onOpenLessonPlan={(plan) => {
                      setGeneratedPlans([plan]);
                      setGeneratedPapers([]);
                      setView('results');
                    }}
                  />
                )}
              </div>
            )}

            {view === 'records' && <StudentRecordsView />}

            {view === 'archive' && <DocumentArchiveCenterView />}

            {view === 'attendance' && <DailyAttendanceView />}

            {view === 'live' && <LiveMonitor teachers={teachers} />}

            {view === 'history' && (
              <HistoryView
                onOpenLessonPlan={(plan) => {
                  setGeneratedPlans([plan]);
                  setGeneratedPapers([]);
                  setView('results');
                }}
                onOpenPaper={(paper) => {
                  setGeneratedPapers([paper]);
                  setGeneratedPlans([]);
                  setView('results');
                }}
                onBack={handleBackToHome}
              />
            )}

            {view === 'results' && (
              <ResultsView
                lessonPlans={generatedPlans}
                papers={generatedPapers}
                onBack={handleBackToHome}
                teacherName={selection.teacherName}
                schoolName={selection.schoolName}
                onExportPlan={handleExportPlan}
                exportFormat={exportFormat}
                onRevisePaper={revisePaper}
                isRevising={isLoading}
                onUpdatePaper={(updated) => setGeneratedPapers([updated])}
              />
            )}

            {view === 'settings' && (
              <SchoolSettingsView onOpenLoginGate={() => setShowLoginGate(true)} />
            )}
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

      {/* Version Footer. Sits above the Android gesture bar, and the main scroll
          column carries matching pb-6 so it never covers the last row of data. */}
      <div className="fixed bottom-0 left-0 right-0 min-h-6 py-0.5 pb-[max(0.125rem,env(safe-area-inset-bottom,0px))] bg-brand-surface/90 backdrop-blur-sm border-t border-brand-border/50 flex items-center justify-center text-[10px] sm:text-xs text-brand-text-secondary z-50">
        <span className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              versionConfig.environment === 'testing'
                ? 'bg-yellow-400 animate-pulse'
                : versionConfig.environment === 'partial-public'
                ? 'bg-blue-400'
                : 'bg-green-400'
            }`}
          />
          <span>{versionConfig.version}</span>
          <span className={`px-1.5 py-0.25 rounded text-xs font-medium ${
            versionConfig.environment === 'testing'
              ? 'bg-yellow-400/20 text-yellow-300'
              : versionConfig.environment === 'partial-public'
              ? 'bg-blue-400/20 text-blue-300'
              : 'bg-green-400/20 text-green-300'
          }`}>
            {versionConfig.branch}
          </span>
          <span>{versionConfig.deployUrl.replace('https://', '')}</span>
        </span>
      </div>

      {ToastComponent}
    </div>
  );
};

export default App;