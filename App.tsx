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

  const {
    isLoading,
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
    if (!selectedClassId || !selectedSubjectId || !selectedChapterId) return;
    const plan = await generateLessonPlan(selectedClassId, selectedSubjectId, selectedChapterId, {
      name: teacherName,
      schoolName,
    });
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
              />
              
              <div className="mt-6">
                <button
                  onClick={handleGenerateLesson}
                  disabled={!selectedClassId || !selectedSubjectId || !selectedChapterId || isLoading}
                  className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-white font-bold py-3.5 px-5 rounded-xl hover:bg-brand-primary-hover transition-all duration-200 shadow-lg shadow-brand-primary/20 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 min-h-[44px]"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Generating Lesson Plan...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span>Generate Lesson Plan</span>
                    </>
                  )}
                </button>
              </div>
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

          {isLoading && (
            <GenerationStatusPanel
              isLoading={isLoading}
              isComplete={false}
              logMessages={['Starting generation...']}
              generationProgress={{ current: 1, total: 1 }}
              onClose={() => {}}
              onStop={() => {}}
              onViewResults={() => setView('results')}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
