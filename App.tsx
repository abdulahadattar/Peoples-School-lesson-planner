import React, { useState, useEffect } from 'react';
import { Theme, PaperConfig, Teacher, View } from './types';
import Header from './components/Header';
import HomeView from './components/HomeView';
import SubjectSelector from './components/SubjectSelector';
import PaperPanel from './components/PaperPanel';
import ResultsView from './components/ResultsView';
import GenerationStatusPanel from './components/GenerationStatusPanel';
import LiveMonitor from './components/LiveMonitor';
import { PhssjLogo, ZiauddinLogo } from './components/Logo';
import { BookOpenIcon, CloseIcon, DocumentTextIcon, HomeIcon, PulseIcon } from './components/icons/MiscIcons';
import { useGeneralGeneration, GenerationMode } from './hooks/useGeneralGeneration';

interface NavItem {
  view: View;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  activeViews: View[];
}

const NAV_ITEMS: NavItem[] = [
  { view: 'home', label: 'Home', icon: HomeIcon, activeViews: ['home'] },
  { view: 'lesson', label: 'Lesson Plans', icon: BookOpenIcon, activeViews: ['lesson', 'results'] },
  { view: 'paper', label: 'Exam Papers', icon: DocumentTextIcon, activeViews: ['paper'] },
  { view: 'live', label: 'Live Monitor', icon: PulseIcon, activeViews: ['live'] },
];

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [theme, setTheme] = useState<Theme>('light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [teacherName, setTeacherName] = useState('Abdul Ahad');
  const [schoolName, setSchoolName] = useState('Peoples Higher Secondary School Jamshoro');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('topic');
  const [topicInput, setTopicInput] = useState('');

  // SLO and batch generation state
  const [selectedSloIds, setSelectedSloIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'docx' | 'pdf' | 'both'>('both');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [chapterSlos, setChapterSlos] = useState<any[]>([]);
  const [isLoadingSlos, setIsLoadingSlos] = useState(false);

  const {
    isLoading,
    generationProgress,
    statusMessage,
    logMessages,
    generatedPlans,
    generatedPapers,
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

  // Load teachers from JSON
  useEffect(() => {
    fetch('/teachers.json')
      .then(res => res.ok ? res.json() : { teachers: [] })
      .then(data => {
        setTeachers(data.teachers || []);
        if (data.teachers?.length > 0) {
          setSelectedTeacherId(data.teachers[0].id);
          setTeacherName(data.teachers[0].name);
          setSchoolName(data.teachers[0].schoolName);
        }
      })
      .catch(err => {
        console.error('Failed to load teachers:', err);
        setTeachers([]);
      });
  }, []);

  // Load chapter SLOs when chapter changes
  useEffect(() => {
    if (selectedClassId && selectedSubjectId && selectedChapterId) {
      setIsLoadingSlos(true);
      const gradeNum = parseInt(selectedClassId.replace('class', ''), 10);
      const gradeName = `Grade ${gradeNum}`;

      fetch(`/curriculum/slos/${gradeName}/${selectedSubjectId}.json`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) {
            setChapterSlos([]);
            return;
          }
          const chapterNum = parseInt(selectedChapterId.split('ch')[1] || '1', 10);
          const chapter = data.chapters?.find((ch: any) => ch.chapter_number === chapterNum);
          if (chapter) {
            const slos = (chapter.slos || []).map((slo: any, idx: number) => ({
              uniqueId: slo.uniqueId || slo.id || `slo-${idx}`,
              SLO_ID: slo.id || `SLO_${idx}`,
              SLO_Text: slo.text || '',
              Cognitive_Level_Code: slo.cognitiveLevel || 'U',
            }));
            setChapterSlos(slos);
          } else {
            setChapterSlos([]);
          }
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
  }, [selectedClassId, selectedSubjectId, selectedChapterId]);

  // Update teacher info when teacher selection changes
  useEffect(() => {
    if (selectedTeacherId && teachers.length > 0) {
      const teacher = teachers.find(t => t.id === selectedTeacherId);
      if (teacher) {
        setTeacherName(teacher.name);
        setSchoolName(teacher.schoolName);
      }
    }
  }, [selectedTeacherId, teachers]);

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
      setSelectedClassId('');
      setSelectedSubjectId('');
      setSelectedChapterId('');
      setSelectedSloIds([]);
      setChapterSlos([]);
    }
  };

  const handleBackToHome = () => {
    setView('home');
    clearResults();
  };

  const handleGenerateLesson = async () => {
    if (!selectedClassId || !selectedSubjectId) return;
    if (generationMode === 'whole-chapter' && !selectedChapterId) return;
    if (generationMode === 'single-slo' && (!selectedChapterId || selectedSloIds.length === 0)) return;
    if (generationMode === 'topic' && !topicInput.trim()) return;

    const topicOverride = generationMode === 'topic' ? topicInput.trim() : undefined;

    const plans = await generateLessonPlan(
      selectedClassId,
      selectedSubjectId,
      selectedChapterId,
      { name: teacherName, schoolName },
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
    }
  };

  const handleGeneratePaper = async (config: PaperConfig) => {
    const paper = await generatePaper(config);
    if (paper) {
      setView('results');
    }
  };

  const hasResults = generatedPlans.length > 0 || generatedPapers.length > 0;

  const handleExportPlan = async (plan: any) => {
    try {
      await exportPlan(plan, { name: teacherName, schoolName }, exportFormat);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to export. Please try again.');
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text-primary font-sans selection:bg-brand-primary selection:text-white antialiased">
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
            <div className="w-12 h-12 rounded-2xl bg-white shadow-card border border-brand-border flex items-center justify-center overflow-hidden">
              <PhssjLogo className="w-full h-full" />
            </div>
            <div className="leading-tight">
              <h3 className="text-sm font-bold text-brand-text-primary tracking-tight">PHSSJ</h3>
              <p className="text-[11px] text-brand-text-secondary">Peoples Higher Secondary School Jamshoro</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {NAV_ITEMS.map(item => {
              const isActive = item.activeViews.includes(view);
              return (
                <button
                  key={item.view}
                  onClick={() => {
                    if (item.view === 'home') handleBackToHome();
                    else if (item.view === 'live') navigate('live');
                    else handleNavigate(item.view === 'lesson' ? 'lesson' : 'paper');
                  }}
                  className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? 'text-white'
                      : 'text-brand-text-secondary hover:bg-brand-bg hover:text-brand-text-primary'
                  }`}
                >
                  {isActive && (
                    <span className="absolute inset-0 brand-gradient rounded-xl shadow-card-hover animate-scaleIn" />
                  )}
                  <item.icon className="relative z-10 w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-white shadow-soft border border-brand-border">
              <ZiauddinLogo className="h-7 w-auto" />
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
          onToggleTheme={toggleTheme}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />

        <div key={view} className="flex-1 overflow-y-auto custom-scrollbar relative animate-fadeIn">
          {view === 'home' && <HomeView onNavigate={handleNavigate} />}

          {view === 'lesson' && (
            <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
              <SubjectSelector
                selectedClassId={selectedClassId}
                selectedSubjectId={selectedSubjectId}
                selectedChapterId={selectedChapterId}
                onClassChange={setSelectedClassId}
                onSubjectChange={setSelectedSubjectId}
                onChapterChange={setSelectedChapterId}
                teacherName={teacherName}
                schoolName={schoolName}
                onTeacherNameChange={setTeacherName}
                onSchoolNameChange={setSchoolName}
                generationMode={generationMode}
                onGenerationModeChange={setGenerationMode}
                topicInput={topicInput}
                onTopicInputChange={setTopicInput}
                selectedSloIds={selectedSloIds}
                onSelectedSloIdsChange={setSelectedSloIds}
                exportFormat={exportFormat}
                onExportFormatChange={setExportFormat}
                selectedTeacherId={selectedTeacherId}
                onSelectedTeacherIdChange={setSelectedTeacherId}
                teachers={teachers}
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
              teachers={teachers}
              selectedTeacherId={selectedTeacherId}
              onSelectedTeacherIdChange={setSelectedTeacherId}
              onTeacherNameChange={setTeacherName}
              onSchoolNameChange={setSchoolName}
            />
          )}

          {view === 'live' && <LiveMonitor teachers={teachers} />}

          {view === 'results' && (
            <ResultsView
              lessonPlans={generatedPlans}
              papers={generatedPapers}
              onBack={handleBackToHome}
              teacherName={teacherName}
              schoolName={schoolName}
              onExportPlan={handleExportPlan}
              exportFormat={exportFormat}
              onRevisePaper={revisePaper}
              isRevising={isLoading}
            />
          )}
        </div>

        {showStatusPanel && (
          <GenerationStatusPanel
            isLoading={isLoading}
            isComplete={!!(generatedPlans.length || generatedPapers.length)}
            logMessages={logMessages}
            statusMessage={statusMessage}
            generationProgress={generationProgress || undefined}
            onClose={() => { clearResults(); }}
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