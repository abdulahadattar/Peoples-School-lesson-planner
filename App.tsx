import React, { useState, useEffect } from 'react';
import { Theme, PaperConfig, Teacher, View } from './types';
import Header from './components/Header';
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
import { useGeneralGeneration, GenerationMode } from './hooks/useGeneralGeneration';
import { useSelection } from './hooks/useSelection';
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

const NAV_ITEMS: NavItem[] = [
  { view: 'home', label: 'Home', icon: HomeIcon, activeViews: ['home'] },
  { view: 'records', label: 'Student Records', icon: SpreadsheetIcon, activeViews: ['records'] },
  { view: 'archive', label: 'Document Archive', icon: FolderArchiveIcon, activeViews: ['archive'] },
  { view: 'attendance', label: 'Daily Attendance', icon: UserGroupIcon, activeViews: ['attendance'] },
  { view: 'lesson', label: 'Lesson Plans', icon: BookOpenIcon, activeViews: ['lesson', 'results'] },
  { view: 'paper', label: 'Exam Papers', icon: DocumentTextIcon, activeViews: ['paper'] },
  { view: 'live', label: 'Live Monitor', icon: PulseIcon, activeViews: ['live'] },
  { view: 'history', label: 'History Archive', icon: ArchiveIcon, activeViews: ['history'] },
  { view: 'settings', label: 'School Admin', icon: SettingsIcon, activeViews: ['settings'] },
];

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [theme, setTheme] = useState<Theme>('light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [showLoginGate, setShowLoginGate] = useState<boolean>(() => {
    const isGuest = sessionStorage.getItem('phssj_guest_mode') === 'true';
    return !isGuest && !auth.currentUser;
  });

  const [generationMode, setGenerationMode] = useState<GenerationMode>('topic');
  const [topicInput, setTopicInput] = useState('');

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
      if (user) {
        setShowLoginGate(false);
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
      alert(error instanceof Error ? error.message : 'Failed to export. Please try again.');
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text-primary font-sans selection:bg-brand-primary selection:text-white antialiased overflow-hidden">
      {/* Animated Google Auth Gate Screen */}
      <AnimatePresence>
        {showLoginGate && !currentUser && (
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
          className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-[90] md:hidden backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed md:relative z-[100] top-0 left-0 h-screen md:h-full bg-brand-surface/95 dark:bg-brand-surface backdrop-blur-xl flex flex-col transition-transform duration-300 md:transition-none w-[280px] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-brand-border/60`}>
        <div className="p-6 flex-grow flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-8 md:hidden">
            <span className="font-semibold text-base text-brand-text-primary">Menu</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-colors active:scale-90"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 shadow-card border border-brand-border flex items-center justify-center flex-shrink-0 p-1 ring-1 ring-black/5 dark:ring-white/10">
              <PhssjLogo className="w-full h-full rounded-full" />
            </div>
            <div className="leading-tight">
              <h3 className="text-sm font-bold text-brand-text-primary tracking-tight">PHSSJ</h3>
              <p className="text-[11px] text-brand-text-secondary">{schoolConfig?.schoolName || 'Peoples Higher Secondary School Jamshoro'}</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {NAV_ITEMS.map(item => {
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
                  }}
                  className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 group select-none ${
                    isActive
                      ? 'text-white'
                      : 'text-brand-text-secondary hover:bg-brand-bg hover:text-brand-text-primary'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activeNavPill"
                      className="absolute inset-0 brand-gradient rounded-xl shadow-md"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <item.icon className="relative z-10 w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-white dark:bg-brand-surface shadow-soft border border-brand-border">
              <div className="flex-shrink-0 bg-white dark:bg-white rounded-lg p-1 border border-brand-border/60">
                <ZiauddinLogo className="h-6 w-auto" />
              </div>
              <p className="text-[10px] leading-snug text-brand-text-secondary">
                Affiliated with
                <br />
                <span className="font-semibold text-brand-text-primary">Ziauddin University</span>
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

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`flex-1 min-h-0 relative ${
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
              <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
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
              </div>
            )}

            {view === 'paper' && (
              <PaperPanel
                onGeneratePaper={handleGeneratePaper}
                isGenerating={isLoading}
                selection={selection}
                exportFormat={exportFormat}
                onExportFormatChange={setExportFormat}
              />
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
    </div>
  );
};

export default App;