import React, { useState, useEffect } from 'react';
import { Theme, PaperConfig } from './types';
import Header from './components/Header';
import HomeView from './components/HomeView';
import SubjectSelector from './components/SubjectSelector';
import PaperPanel from './components/PaperPanel';
import ResultsView from './components/ResultsView';
import GenerationStatusPanel from './components/GenerationStatusPanel';
import { useGeneralGeneration } from './hooks/useGeneralGeneration';

type View = 'home' | 'lesson' | 'paper' | 'results';

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [theme, setTheme] = useState<Theme>('light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [teacherName, setTeacherName] = useState('Abdul Ahad');
  const [schoolName, setSchoolName] = useState('Peoples Higher Secondary School Jamshoro');
  const [generationMode, setGenerationMode] = useState<'chapter' | 'topic'>('chapter');
  const [topicInput, setTopicInput] = useState('');

  const {
    isLoading,
    generationProgress,
    statusMessage,
    generatedPlans,
    generatedPapers,
    error,
    showStatusPanel,
    generateLessonPlan,
    generatePaper,
    exportPlan,
    exportPaper,
    clearResults,
  } = useGeneralGeneration();

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

  const handleNavigate = (target: 'lesson' | 'paper') => {
    setView(target);
    setSelectedClassId('');
    setSelectedSubjectId('');
    setSelectedChapterId('');
    clearResults();
  };

  const handleBackToHome = () => {
    setView('home');
    clearResults();
  };

  const handleGenerateLesson = async () => {
    if (!selectedClassId || !selectedSubjectId) return;
    if (generationMode === 'chapter' && !selectedChapterId) return;
    if (generationMode === 'topic' && !topicInput.trim()) return;
    const topicOverride = generationMode === 'topic' ? topicInput.trim() : undefined;
    const plan = await generateLessonPlan(selectedClassId, selectedSubjectId, selectedChapterId, {
      name: teacherName,
      schoolName,
    }, topicOverride);
    if (plan) {
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

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text-light font-sans selection:bg-brand-primary selection:text-white">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[90] md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      <aside className={`fixed md:relative z-[100] top-0 left-0 h-screen md:h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl flex flex-col transition-transform duration-300 shadow-2xl md:shadow-none w-[260px] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-brand-border/60`}>
        <div className="p-5 flex-grow flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-6 md:hidden">
            <span className="font-bold text-base text-brand-text-light">Menu</span>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-brand-text-medium hover:text-brand-text-light hover:bg-brand-bg/60 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-primary to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-primary/20">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.832 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-brand-text-light tracking-tight">Lesson Planner</h3>
                <p className="text-[10px] text-brand-text-medium font-medium">AI-Powered</p>
              </div>
            </div>
          </div>

          <h3 className="text-[10px] font-bold text-brand-text-medium uppercase tracking-widest mb-3 pl-1">Navigation</h3>
          <div className="space-y-1.5">
            <button onClick={() => { setView('home'); clearResults(); }} className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${view === 'home' ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20' : 'text-brand-text-medium hover:bg-brand-bg hover:text-brand-text-light'}`}>
              Home
            </button>
            <button onClick={() => handleNavigate('lesson')} className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${view === 'lesson' || view === 'results' ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20' : 'text-brand-text-medium hover:bg-brand-bg hover:text-brand-text-light'}`}>
              Lesson Plans
            </button>
            <button onClick={() => handleNavigate('paper')} className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${view === 'paper' ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20' : 'text-brand-text-medium hover:bg-brand-bg hover:text-brand-text-light'}`}>
              Exam Papers
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header
          directoryName={null}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />

        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {view === 'home' && (
            <HomeView onNavigate={handleNavigate} />
          )}

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
                onGenerate={handleGenerateLesson}
                isGenerating={isLoading}
              />
            </div>
          )}

          {view === 'paper' && (
            <PaperPanel
              onGeneratePaper={handleGeneratePaper}
              isGenerating={isLoading}
            />
          )}

          {view === 'results' && (
            <ResultsView
              lessonPlans={generatedPlans}
              papers={generatedPapers}
              onBack={handleBackToHome}
              teacherName={teacherName}
              schoolName={schoolName}
            />
          )}
        </div>

        {showStatusPanel && (
          <GenerationStatusPanel
            isLoading={isLoading}
            isComplete={!!(generatedPlans.length || generatedPapers.length)}
            logMessages={error ? [error] : (statusMessage ? [statusMessage] : [])}
            generationProgress={generationProgress || undefined}
            onClose={() => { clearResults(); }}
            onStop={() => { clearResults(); }}
            onViewResults={() => { setShowStatusPanel(false); setView('results'); }}
            error={error}
          />
        )}
      </main>
    </div>
  );
};

export default App;
