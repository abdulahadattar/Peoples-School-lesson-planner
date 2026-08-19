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
        <div className="fixed inset-0 bg-black/50 z-[90] md:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}
      
      <aside className={`fixed md:relative z-[100] top-0 left-0 h-screen md:h-full bg-white dark:bg-slate-900 flex flex-col transition-transform duration-300 shadow-2xl md:shadow-none w-[280px] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-brand-border`}>
        <div className="p-6 flex-grow flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-8 md:hidden">
            <span className="font-bold text-lg">Menu</span>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 text-brand-text-medium hover:text-brand-text-light">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <h3 className="text-xs font-bold text-brand-text-medium uppercase tracking-wider mb-4 pl-1">Navigation</h3>
          <div className="space-y-2">
            <button onClick={() => { setView('home'); clearResults(); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${view === 'home' ? 'bg-brand-primary text-white' : 'hover:bg-brand-bg text-brand-text-medium'}`}>
              Home
            </button>
            <button onClick={() => handleNavigate('lesson')} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${view === 'lesson' || view === 'results' ? 'bg-brand-primary text-white' : 'hover:bg-brand-bg text-brand-text-medium'}`}>
              Lesson Plans
            </button>
            <button onClick={() => handleNavigate('paper')} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${view === 'paper' ? 'bg-brand-primary text-white' : 'hover:bg-brand-bg text-brand-text-medium'}`}>
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

        <div className="flex-1 overflow-y-auto custom-scrollbar">
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

          {view === 'results' && hasResults && (
            <ResultsView
              lessonPlans={generatedPlans}
              papers={generatedPapers}
              onBack={handleBackToHome}
              teacherName={teacherName}
              schoolName={schoolName}
            />
          )}

          {(isLoading || error) && (
            <GenerationStatusPanel
              isLoading={isLoading}
              isComplete={!!generatedPlans.length || !!generatedPapers.length}
              logMessages={statusMessage ? [statusMessage] : []}
              generationProgress={generationProgress || undefined}
              onClose={clearResults}
              onStop={clearResults}
              onViewResults={() => setView('results')}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
