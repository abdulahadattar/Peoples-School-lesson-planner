import React, { useState, useMemo } from 'react';
import { curriculumData } from '../curriculum';
import { CurriculumClass, Teacher } from '../types';

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
  generationMode: 'single-slo' | 'whole-chapter' | 'topic';
  onGenerationModeChange: (mode: 'single-slo' | 'whole-chapter' | 'topic') => void;
  topicInput: string;
  onTopicInputChange: (value: string) => void;
  selectedSloIds: string[];
  onSelectedSloIdsChange: (ids: string[]) => void;
  exportFormat: 'docx' | 'pdf' | 'both';
  onExportFormatChange: (format: 'docx' | 'pdf' | 'both') => void;
  selectedTeacherId: string;
  onSelectedTeacherIdChange: (id: string) => void;
  teachers: Teacher[];
  chapterSlos: any[];
  isLoadingSlos: boolean;
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
  selectedSloIds,
  onSelectedSloIdsChange,
  exportFormat,
  onExportFormatChange,
  selectedTeacherId,
  onSelectedTeacherIdChange,
  teachers,
  chapterSlos,
  isLoadingSlos,
  onGenerate,
  isGenerating,
}) => {
  const [isTeacherInfoOpen, setIsTeacherInfoOpen] = useState(true);

  // Sort classes numerically (class1, class2, ..., class12)
  const classes = useMemo(() =>
    [...curriculumData.classes].sort((a, b) => {
      const numA = parseInt(a.id.replace('class', ''), 10);
      const numB = parseInt(b.id.replace('class', ''), 10);
      return numA - numB;
    }),
    []
  );

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  const selectedTeacher = useMemo(
    () => teachers.find(t => t.id === selectedTeacherId) || null,
    [teachers, selectedTeacherId]
  );

  // --- Smart bidirectional filtering ---

  const subjectMatchesTeacher = (teacherSubject: string, curriculumSubject: { id: string; name: string }): boolean => {
    const ts = teacherSubject.toLowerCase();
    const csName = curriculumSubject.name.toLowerCase();
    const csId = curriculumSubject.id.toLowerCase();
    return ts === csName || ts === csId ||
      csName.includes(ts) || ts.includes(csName) ||
      ts.includes(csId.replace('_', ' '));
  };

  // Teachers filtered by selected class (if any)
  const teachersForClass = useMemo(() => {
    if (!selectedClassId) return teachers;
    return teachers.filter(t => t.classIds?.includes(selectedClassId));
  }, [teachers, selectedClassId]);

  // Teachers filtered by selected subject (if any)
  const teachersForSubject = useMemo(() => {
    if (!selectedSubjectId) return teachers;
    return teachers.filter(t => t.subjects.some(s => s.toLowerCase() === selectedSubjectId.toLowerCase()));
  }, [teachers, selectedSubjectId]);

  // Combined filtered teachers (intersection of class + subject filters)
  const filteredTeachers = useMemo(() => {
    let list = teachers;
    if (selectedClassId) list = list.filter(t => t.classIds?.includes(selectedClassId));
    if (selectedSubjectId) {
      const selectedClass = classes.find(c => c.id === selectedClassId);
      const selectedSubject = selectedClass?.subjects.find(s => s.id === selectedSubjectId);
      list = list.filter(t => t.subjects.some(ts => {
        if (!selectedSubject) return ts.toLowerCase() === selectedSubjectId.toLowerCase();
        return subjectMatchesTeacher(ts, selectedSubject);
      }));
    }
    return list;
  }, [teachers, selectedClassId, selectedSubjectId, classes]);

  // Auto-select teacher if only one matches current filters
  // (We don't auto-select to avoid surprises, but we filter the dropdown)

  // Available subjects: if teacher selected, show only their subjects; otherwise show class subjects
  const availableSubjects = useMemo(() => {
    if (selectedTeacher) {
      const classSubjects = selectedClass?.subjects || [];
      if (classSubjects.length > 0) {
        return classSubjects.filter(s =>
          selectedTeacher.subjects.some(ts => subjectMatchesTeacher(ts, s))
        );
      }
      return classSubjects;
    }
    if (!selectedClassId) return [];
    return selectedClass?.subjects || [];
  }, [selectedClassId, selectedClass, selectedTeacher]);

  // Available classes: if teacher selected, show only their classes
  const availableClasses = useMemo(() => {
    if (selectedTeacher?.classIds && selectedTeacher.classIds.length > 0) {
      return classes.filter(c => selectedTeacher.classIds!.includes(c.id));
    }
    return classes;
  }, [classes, selectedTeacher]);

  // Load chapters from selected subject's curriculum data
  const availableChapters = useMemo(() => {
    if (!selectedSubjectId) return [];
    const subject = selectedClass?.subjects.find(s => s.id === selectedSubjectId);
    return subject?.chapters || [];
  }, [selectedClassId, selectedSubjectId, selectedClass]);

  const selectedSubject = useMemo(
    () => availableSubjects.find((s) => s.id === selectedSubjectId) || null,
    [availableSubjects, selectedSubjectId]
  );

  const selectedChapter = useMemo(
    () => availableChapters.find((c) => c.id === selectedChapterId) || null,
    [availableChapters, selectedChapterId]
  );

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;
    onClassChange(newClassId);
    // If selected teacher doesn't teach this class, deselect them
    if (selectedTeacher && newClassId && !selectedTeacher.classIds?.includes(newClassId)) {
      onSelectedTeacherIdChange('');
      onTeacherNameChange('');
      onSchoolNameChange('');
    }
    // Reset dependent selections
    onSubjectChange('');
    onChapterChange('');
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSubjectId = e.target.value;
    onSubjectChange(newSubjectId);
    // If selected teacher doesn't teach this subject, deselect them
    if (selectedTeacher && newSubjectId && !selectedTeacher.subjects.some(s => s.toLowerCase() === newSubjectId.toLowerCase())) {
      onSelectedTeacherIdChange('');
      onTeacherNameChange('');
      onSchoolNameChange('');
    }
    onChapterChange('');
  };

  const handleTeacherChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teacherId = e.target.value;
    onSelectedTeacherIdChange(teacherId);
    const teacher = teachers.find(t => t.id === teacherId);
    if (teacher) {
      onTeacherNameChange(teacher.name);
      onSchoolNameChange(teacher.schoolName);

      // Reset dependent selections first
      onSubjectChange('');
      onChapterChange('');

      // Auto-select class if teacher teaches only one class
      const teacherClasses = teacher.classIds || [];
      const newClassId = teacherClasses.length === 1 ? teacherClasses[0] : '';
      if (newClassId) {
        onClassChange(newClassId);
      }

      // Auto-select subject if teacher teaches only one subject
      if (teacher.subjects.length === 1) {
        const classId = newClassId || selectedClassId;
        const classObj = classes.find(c => c.id === classId);
        if (classObj) {
          const matchSubject = classObj.subjects.find(s => subjectMatchesTeacher(teacher.subjects[0], s));
          if (matchSubject) {
            onSubjectChange(matchSubject.id);
          }
        }
      }
    } else {
      onTeacherNameChange('');
      onSchoolNameChange('');
    }
  };

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChapterChange(e.target.value);
    onSelectedSloIdsChange([]); // Reset SLO selection when chapter changes
  };

  const handleSloToggle = (sloId: string) => {
    if (selectedSloIds.includes(sloId)) {
      onSelectedSloIdsChange(selectedSloIds.filter(id => id !== sloId));
    } else {
      onSelectedSloIdsChange([...selectedSloIds, sloId]);
    }
  };

  const handleSelectAllSlos = () => {
    if (selectedSloIds.length === chapterSlos.length) {
      onSelectedSloIdsChange([]);
    } else {
      onSelectedSloIdsChange(chapterSlos.map(s => s.uniqueId || s.SLO_ID));
    }
  };

  const isGenerateDisabled = isGenerating || !selectedClassId || !selectedSubjectId || 
    (generationMode === 'whole-chapter' && !selectedChapterId) ||
    (generationMode === 'single-slo' && (!selectedChapterId || selectedSloIds.length === 0)) ||
    (generationMode === 'topic' && !topicInput.trim());

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

          {/* Teacher Selection */}
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
                <span className="text-sm font-semibold text-brand-text-primary">
                  {selectedTeacher ? selectedTeacher.name : 'Select Teacher'}
                </span>
                {selectedTeacher && (
                  <span className="text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full">
                    {selectedTeacher.subjects.join(', ')}
                  </span>
                )}
              </div>
              <span className={`text-brand-text-secondary transition-transform duration-300 ${isTeacherInfoOpen ? 'rotate-180' : ''}`}>
                <ChevronDownIcon />
              </span>
            </button>

            <div
              className={`transition-all duration-300 ease-in-out ${
                isTeacherInfoOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-4 pb-4 space-y-3">
                {/* Teacher Dropdown */}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Teacher Name
                  </label>
                  <div className="relative">
                    <select
                      value={selectedTeacherId}
                      onChange={handleTeacherChange}
                      className="w-full h-11 px-4 pr-11 bg-brand-surface border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-200"
                    >
                      <option value="">Choose a teacher...</option>
                      {filteredTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.subjects.join(', ')}
                        </option>
                      ))}
                      {filteredTeachers.length === 0 && teachers.length > 0 && (
                        <option value="" disabled>No teachers match current filters</option>
                      )}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                      <ChevronDownIcon />
                    </div>
                  </div>
                  {selectedTeacher && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedTeacher.classIds?.map(cid => {
                        const cls = classes.find(c => c.id === cid);
                        const labels = selectedTeacher.sectionLabels?.[cid];
                        return labels?.map(label => (
                          <span key={`${cid}-${label}`} className="text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md border border-brand-primary/15">
                            {label}
                          </span>
                        ));
                      })}
                    </div>
                  )}
                </div>

                {/* School Name (auto-filled) */}
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
                  {(selectedTeacher ? availableClasses : classes).map((cls) => (
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
                  disabled={!selectedClassId || availableSubjects.length === 0}
                  className="w-full h-12 px-4 pr-11 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">Choose a subject</option>
                  {availableSubjects.map((subject) => (
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
                  disabled={!selectedSubjectId || availableChapters.length === 0}
                  className="w-full h-12 px-4 pr-11 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">Choose a chapter</option>
                  {availableChapters.map((chapter) => (
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
              <div className="grid grid-cols-3 gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border">
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span className="truncate">Topic</span>
                </button>
                <button
                  type="button"
                  onClick={() => onGenerationModeChange('single-slo')}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-h-[44px] ${
                    generationMode === 'single-slo'
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'bg-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <span className="truncate">Single SLO</span>
                </button>
                <button
                  type="button"
                  onClick={() => onGenerationModeChange('whole-chapter')}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-h-[44px] ${
                    generationMode === 'whole-chapter'
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'bg-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.832 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="truncate">Whole Chapter</span>
                </button>
              </div>
            </div>

            {/* Topic Input */}
            {generationMode === 'topic' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label htmlFor="topic-input" className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                  Topic Name
                </label>
                <input
                  id="topic-input"
                  type="text"
                  value={topicInput}
                  onChange={(e) => onTopicInputChange(e.target.value)}
                  placeholder="Enter topic name (e.g., Newton's Laws, Photosynthesis...)"
                  className="w-full h-11 px-4 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-200"
                />
              </div>
            )}

            {/* SLO Selection */}
            {generationMode === 'single-slo' && selectedChapter && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide">
                    Select SLO(s) from {selectedChapter?.name || 'this chapter'}
                  </label>
                  {chapterSlos.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllSlos}
                      className="text-[10px] font-semibold text-brand-primary hover:text-brand-primary-hover transition-colors"
                    >
                      {selectedSloIds.length === chapterSlos.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                
                <div className="bg-brand-bg border border-brand-border rounded-xl p-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {isLoadingSlos ? (
                    <div className="text-sm text-brand-text-secondary text-center py-4">
                      Loading SLOs...
                    </div>
                  ) : chapterSlos.length === 0 ? (
                    <div className="text-sm text-brand-text-secondary text-center py-4">
                      No SLOs available for this chapter
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {chapterSlos.map((slo, idx) => {
                        const sloId = slo.uniqueId || slo.SLO_ID || slo.id || `slo-${idx}`;
                        const isSelected = selectedSloIds.includes(sloId);
                        return (
                          <label
                            key={sloId}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-brand-primary/10 border border-brand-primary/30'
                                : 'bg-brand-surface border border-brand-border hover:border-brand-text-secondary/40'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSloToggle(sloId)}
                              className="mt-1 w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary focus:ring-offset-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-brand-text-primary mb-1">
                                {slo.SLO_Text || slo.text || 'SLO content'}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-brand-text-secondary">
                                <span className="px-2 py-0.5 bg-brand-bg rounded-md border border-brand-border font-mono">
                                  {slo.SLO_ID || slo.id || `SLO-${idx + 1}`}
                                </span>
                                {slo.Cognitive_Level_Code && (
                                  <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-md border border-brand-primary/15 font-semibold">
                                    {slo.Cognitive_Level_Code}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedSloIds.length > 0 && (
                  <div className="mt-2 text-xs text-brand-text-secondary">
                    {selectedSloIds.length} SLO(s) selected
                  </div>
                )}
              </div>
            )}

            {/* Export Format */}
            {generationMode !== 'topic' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                  Export Format
                </label>
                <div className="grid grid-cols-3 gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border">
                  {(['docx', 'pdf', 'both'] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => onExportFormatChange(format)}
                      className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-h-[44px] ${
                        exportFormat === format
                          ? 'bg-brand-primary text-white shadow-sm'
                          : 'bg-transparent text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface'
                      }`}
                    >
                      {format === 'docx' && 'Word (.docx)'}
                      {format === 'pdf' && 'PDF (.pdf)'}
                      {format === 'both' && 'Both'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate Button */}
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerateDisabled}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : null}
              Generate Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// GraduationCapIcon
const GraduationCapIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
  </svg>
);

export default SubjectSelector;