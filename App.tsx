import React, { useState, useEffect } from 'react';
import { Theme, PaperConfig, Teacher } from './types';
import Header from './components/Header';
import HomeView from './components/HomeView';
import SubjectSelector from './components/SubjectSelector';
import PaperPanel from './components/PaperPanel';
import ResultsView from './components/ResultsView';
import GenerationStatusPanel from './components/GenerationStatusPanel';
import { useGeneralGeneration, GenerationMode } from './hooks/useGeneralGeneration';

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
    exportPaper,
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
      // Extract grade name from classId
      const gradeNum = parseInt(selectedClassId.replace('class', ''), 10);
      const gradeName = `Grade ${gradeNum}`;
      
      // Load SLOs from public SLO JSON files (public/ served at root -> no /public prefix)
            fetch(`/curriculum/slos/${gradeName}/${selectedSubjectId}.json`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) {
            setChapterSlos([]);
            return;
          }
          // Find chapter by number
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

  const handleNavigate = (target: 'lesson' | 'paper') => {
    setView(target);
    if (target !== view) {
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
        <div className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-[90] md:hidden transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>
      )}
      
      <aside className={`fixed md:relative z-[100] top-0 left-0 h-screen md:h-full bg-brand-surface dark:bg-slate-900 flex flex-col transition-transform duration-300 md:transition-none md:shadow-none w-[280px] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-brand-border/60`}>
        <div className="p-6 flex-grow flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-8 md:hidden">
            <span className="font-semibold text-base text-brand-text-primary">Menu</span>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-brand-primary rounded-xl flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.832 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-text-primary tracking-tight">Navigation</h3>
              <p className="text-[11px] text-brand-text-secondary">Lesson Plan AI</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <button onClick={() => { setView('home'); clearResults(); }} className={`w-full text-left px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${view === 'home' ? 'bg-brand-primary text-white' : 'text-brand-text-secondary hover:bg-brand-bg hover:text-brand-text-primary'}`}>
              Home
            </button>
            <button onClick={() => handleNavigate('lesson')} className={`w-full text-left px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${view === 'lesson' || view === 'results' ? 'bg-brand-primary text-white' : 'text-brand-text-secondary hover:bg-brand-bg hover:text-brand-text-primary'}`}>
              Lesson Plans
            </button>
            <button onClick={() => handleNavigate('paper')} className={`w-full text-left px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${view === 'paper' ? 'bg-brand-primary text-white' : 'text-brand-text-secondary hover:bg-brand-bg hover:text-brand-text-primary'}`}>
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