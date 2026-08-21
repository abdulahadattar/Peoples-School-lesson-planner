import React, { useState, useMemo } from 'react';
import { curriculumData } from '../curriculum';
import { CurriculumClass } from '../types';

interface SubjectSelectorProps {
  selectedClassId: string;
  selectedSubjectId: string;
  selectedChapterId: string;
  onClassChange: (classId: string) => void;
  onSubjectChange: (subjectId: string) => void;
  onChapterChange: (chapterId: string) => void;
  teacherName: string;
  schoolName: string;
  onTeacherNameChange: (name: string) => void;
  onSchoolNameChange: (name: string) => void;
  generationMode: 'chapter' | 'topic';
  onGenerationModeChange: (mode: 'chapter' | 'topic') => void;
  topicInput: string;
  onTopicInputChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

const ChevronDownIcon = () => (
  <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
  </svg>
);

const BookOpenIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.832 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const ClipboardListIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const GraduationCapIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const TagIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const SubjectSelector: React.FC<SubjectSelectorProps> = ({
  selectedClassId,
  selectedSubjectId,
  selectedChapterId,
  onClassChange,
  onSubjectChange,
  onChapterChange,
  teacherName,
  schoolName,
  onTeacherNameChange,
  onSchoolNameChange,
  generationMode,
  onGenerationModeChange,
  topicInput,
  onTopicInputChange,
  onGenerate,
  isGenerating,
}) => {
  const [isTeacherInfoOpen, setIsTeacherInfoOpen] = useState(false);

  const classes: CurriculumClass[] = useMemo(() => curriculumData.classes, []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  const subjects = useMemo(
    () => selectedClass?.subjects || [],
    [selectedClass]
  );

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  );

  const chapters = useMemo(
    () => selectedSubject?.chapters || [],
    [selectedSubject]
  );

  const selectedChapter = useMemo(
    () => chapters.find((c) => c.id === selectedChapterId) || null,
    [chapters, selectedChapterId]
  );

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onClassChange(e.target.value);
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSubjectChange(e.target.value);
  };

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChapterChange(e.target.value);
  };

  const isGenerateDisabled = isGenerating || !selectedClassId || !selectedSubjectId || (generationMode === 'chapter' && !selectedChapterId) || (generationMode === 'topic' && !topicInput.trim());

  const hasSelection = selectedClassId || selectedSubjectId || selectedChapterId;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden">
        <div className="p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center">
                <div className="text-white">
                  <ClipboardListIcon />
                </div>
              </div>
              <div>
                <h2 className="text-base font-semibold text-brand-text-primary tracking-tight leading-tight">
                  Lesson Planner
                </h2>
                <p className="text-[11px] font-medium text-brand-text-secondary mt-0.5">
                  Create structured lesson plans
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex text-[10px] font-medium text-brand-text-secondary bg-brand-bg px-2.5 py-1.5 rounded-lg border border-brand-border">
              PHSS
            </span>
          </div>

          {/* Teacher Info Accordion */}
          <div className="bg-brand-bg rounded-xl border border-brand-border overflow-hidden">
            <button
              type="button"
              onClick={() => setIsTeacherInfoOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-brand-surface/50 active:bg-brand-surface transition-all duration-200 min-h-[48px]"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-brand-text-primary">Teacher Information</span>
              </div>
              <span className={`text-brand-text-secondary transition-transform duration-300 ${isTeacherInfoOpen ? 'rotate-180' : ''}`}>
                <ChevronDownIcon />
              </span>
            </button>

            <div
              className={`transition-all duration-300 ease-in-out ${
                isTeacherInfoOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Teacher Name
                  </label>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => onTeacherNameChange(e.target.value)}
                    placeholder="Enter teacher name"
                    className="w-full h-11 px-4 bg-brand-surface border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    School Name
                  </label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={(e) => onSchoolNameChange(e.target.value)}
                    placeholder="Enter school name"
                    className="w-full h-11 px-4 bg-brand-surface border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-200"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="class-select" className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                <GraduationCapIcon />
                Select Class
              </label>
              <div className="relative">
                <select
                  id="class-select"
                  value={selectedClassId}
                  onChange={handleClassChange}
                  className="w-full h-12 px-4 pr-11 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40"
                >
                  <option value="">Choose a class</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="subject-select" className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                <BookOpenIcon />
                Select Subject
              </label>
              <div className="relative">
                <select
                  id="subject-select"
                  value={selectedSubjectId}
                  onChange={handleSubjectChange}
                  disabled={!selectedClassId}
                  className="w-full h-12 px-4 pr-11 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">Choose a subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="chapter-select" className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                <ClipboardListIcon />
                Select Chapter
              </label>
              <div className="relative">
                <select
                  id="chapter-select"
                  value={selectedChapterId}
                  onChange={handleChapterChange}
                  disabled={!selectedSubjectId}
                  className="w-full h-12 px-4 pr-11 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">Choose a chapter</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            {/* Generation Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                Generation Mode
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border">
                <button
                  type="button"
                  onClick={() => onGenerationModeChange('chapter')}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-h-[44px] ${
                    generationMode === 'chapter'
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'bg-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.832 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="truncate">Whole Chapter</span>
                </button>
                <button
                  type="button"
                  onClick={() => onGenerationModeChange('topic')}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-h-[44px] ${
                    generationMode === 'topic'
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'bg-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="truncate">Specific Topic</span>
                </button>
              </div>
            </div>

            {/* Topic Input */}
            {generationMode === 'topic' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label htmlFor="topic-input" className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                  Topic or SLO
                </label>
                <input
                  id="topic-input"
                  type="text"
                  value={topicInput}
                  onChange={(e) => onTopicInputChange(e.target.value)}
                  placeholder="Enter the specific topic or SLO you want to teach..."
                  className="w-full h-11 px-4 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-200"
                />
              </div>
            )}
          </div>

          {/* Current Selection Display */}
          {hasSelection && (
            <div className="pt-1">
              <div className="bg-brand-bg rounded-xl p-4 border border-brand-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                  <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                    Current Selection
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {selectedClass ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg font-semibold border border-brand-primary/15">
                      <GraduationCapIcon />
                      {selectedClass.name}
                    </span>
                  ) : (
                    <span className="text-brand-text-secondary/50 text-[11px]">
                      No class selected
                    </span>
                  )}
                  {selectedSubject && (
                    <span className="text-brand-text-secondary">/</span>
                  )}
                  {selectedSubject ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg font-semibold border border-brand-primary/15">
                      <BookOpenIcon />
                      {selectedSubject.name}
                    </span>
                  ) : selectedClass && (
                    <span className="text-brand-text-secondary/50 text-[11px]">
                      No subject selected
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="pt-1">
            <button
              onClick={onGenerate}
              disabled={isGenerateDisabled}
              className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-white font-semibold py-3 px-5 rounded-xl hover:bg-brand-primary-hover transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 min-h-[44px]"
            >
              {isGenerating ? (
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
                  <span>
                    {generationMode === 'chapter'
                      ? `Generate Lesson Plan for ${selectedChapter ? selectedChapter.name : 'Chapter'}`
                      : `Generate Lesson Plan for: ${topicInput || 'Topic'}`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubjectSelector;
