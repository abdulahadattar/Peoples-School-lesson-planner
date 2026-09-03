import React, { useState, useMemo } from 'react';
import { curriculumData } from '../curriculum';
import { CurriculumClass, Teacher } from '../types';
import { DocumentTextIcon } from './icons/MiscIcons';
import { PaperConfig } from '../types';

interface PaperPanelProps {
  onGeneratePaper: (config: PaperConfig) => void;
  isGenerating: boolean;
  teachers: Teacher[];
  selectedTeacherId: string;
  onSelectedTeacherIdChange: (id: string) => void;
  onTeacherNameChange: (name: string) => void;
  onSchoolNameChange: (name: string) => void;
}

const ChevronDownIcon = () => (
  <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const clampNumber = (value: string, min: number, max: number): number => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
};

const formatMark = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
};

const PaperPanel: React.FC<PaperPanelProps> = ({ onGeneratePaper, isGenerating, teachers, selectedTeacherId, onSelectedTeacherIdChange, onTeacherNameChange, onSchoolNameChange }) => {
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [totalMarks, setTotalMarks] = useState<number>(23);
  const [mcqCount, setMcqCount] = useState<number>(5);
  const [shortQuestionCount, setShortQuestionCount] = useState<number>(5);
  const [longQuestionCount, setLongQuestionCount] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);

  // Sort classes numerically
  const classes: CurriculumClass[] = useMemo(() =>
    [...curriculumData.classes].sort((a, b) => {
      const numA = parseInt(a.id.replace('class', ''), 10);
      const numB = parseInt(b.id.replace('class', ''), 10);
      return numA - numB;
    }),
    []
  );

  const selectedTeacher = useMemo(
    () => teachers.find(t => t.id === selectedTeacherId) || null,
    [teachers, selectedTeacherId]
  );

  // Filtered teachers by class + subject
  const filteredTeachers = useMemo(() => {
    let list = teachers;
    if (selectedClassId) list = list.filter(t => t.classIds?.includes(selectedClassId));
    if (selectedSubjectId) list = list.filter(t => t.subjects.some(s => s.toLowerCase() === selectedSubjectId.toLowerCase()));
    return list;
  }, [teachers, selectedClassId, selectedSubjectId]);

  // Available classes filtered by teacher
  const availableClasses = useMemo(() => {
    if (selectedTeacher?.classIds && selectedTeacher.classIds.length > 0) {
      return classes.filter(c => selectedTeacher.classIds!.includes(c.id));
    }
    return classes;
  }, [classes, selectedTeacher]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  // Available subjects filtered by teacher + class
  const availableSubjects = useMemo(() => {
    const classSubjects = selectedClass?.subjects || [];
    if (selectedTeacher) {
      return classSubjects.filter(s =>
        selectedTeacher.subjects.some(ts => ts.toLowerCase() === s.id.toLowerCase() || ts.toLowerCase() === s.name.toLowerCase())
      );
    }
    return classSubjects;
  }, [selectedClass, selectedTeacher]);

  const subjects = useMemo(() => selectedClass?.subjects || [], [selectedClass]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  );

  const chapters = useMemo(() => selectedSubject?.chapters || [], [selectedSubject]);

  const selectedChapter = useMemo(
    () => chapters.find((c) => c.id === selectedChapterId) || null,
    [chapters, selectedChapterId]
  );

  const markDistribution = useMemo(() => {
    const MCQ_WEIGHT = 1;
    const SHORT_WEIGHT = 2;
    const LONG_WEIGHT = 4;

    const mcqMarks = mcqCount * MCQ_WEIGHT;
    const shortMarks = shortQuestionCount * SHORT_WEIGHT;
    const longMarks = longQuestionCount * LONG_WEIGHT;
    const totalQuestionMarks = mcqMarks + shortMarks + longMarks;

    return {
      mcqMarks,
      shortMarks,
      longMarks,
      mcqPerQuestion: mcqCount > 0 ? mcqMarks / mcqCount : 0,
      shortPerQuestion: shortQuestionCount > 0 ? shortMarks / shortQuestionCount : 0,
      longPerQuestion: longQuestionCount > 0 ? longMarks / longQuestionCount : 0,
      totalQuestionMarks,
      weightSum: totalQuestionMarks,
    };
  }, [totalMarks, mcqCount, shortQuestionCount, longQuestionCount]);

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;
    setSelectedClassId(newClassId);
    setSelectedSubjectId('');
    setSelectedChapterId('');
    // If teacher doesn't teach this class, deselect
    if (selectedTeacher && newClassId && !selectedTeacher.classIds?.includes(newClassId)) {
      onSelectedTeacherIdChange('');
      onTeacherNameChange('');
    }
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSubjectId = e.target.value;
    setSelectedSubjectId(newSubjectId);
    setSelectedChapterId('');
    // If teacher doesn't teach this subject, deselect
    if (selectedTeacher && newSubjectId && !selectedTeacher.subjects.some(s => s.toLowerCase() === newSubjectId.toLowerCase())) {
      onSelectedTeacherIdChange('');
      onTeacherNameChange('');
    }
  };

  const handleTeacherChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teacherId = e.target.value;
    onSelectedTeacherIdChange(teacherId);
    const teacher = teachers.find(t => t.id === teacherId);
    if (teacher) {
      onTeacherNameChange(teacher.name);
      onSchoolNameChange(teacher.schoolName);

      // Auto-select class if teacher teaches only one class
      const teacherClasses = teacher.classIds || [];
      if (teacherClasses.length === 1) {
        setSelectedClassId(teacherClasses[0]);
        setSelectedSubjectId('');
        setSelectedChapterId('');
      }

      // Auto-select subject if teacher teaches only one subject
      if (teacher.subjects.length === 1) {
        const classObj = teacherClasses.length === 1 ? classes.find(c => c.id === teacherClasses[0]) : classes.find(c => c.id === selectedClassId);
        if (classObj) {
          const matchSubject = classObj.subjects.find(s =>
            s.name.toLowerCase() === teacher.subjects[0].toLowerCase() ||
            s.id.toLowerCase() === teacher.subjects[0].toLowerCase()
          );
          if (matchSubject) {
            setSelectedSubjectId(matchSubject.id);
          }
        }
      }
    } else {
      onTeacherNameChange('');
    }
  };

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedChapterId(e.target.value);
  };

  const handleGenerate = () => {
    const config: PaperConfig = {
      gradeId: selectedClassId,
      subjectId: selectedSubjectId,
      chapterId: selectedChapterId,
      totalMarks,
      mcqCount,
      shortQuestionCount,
      longQuestionCount,
      durationMinutes,
    };
    onGeneratePaper(config);
  };

  const canGenerate = Boolean(selectedClassId && selectedSubjectId && selectedChapterId);
  const marksValid = markDistribution.totalQuestionMarks > 0 && markDistribution.totalQuestionMarks === totalMarks;

  const isDisabled = isGenerating || !canGenerate || !marksValid;

  return (
      <div className="w-full max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center flex-shrink-0">
            <DocumentTextIcon className="w-5 h-5 text-white" />
          </div>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-brand-text-primary tracking-tight">
            Exam Paper Generator
          </h1>
          <p className="text-xs text-brand-text-secondary">
            Configure and generate an exam paper from the curriculum
          </p>
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden">
        <div className="p-4 sm:p-5 space-y-5">
          {/* Selectors */}
          <div className="space-y-3">
            {/* Teacher Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold text-brand-text-secondary mb-1.5 uppercase tracking-wider">
                Select Teacher
              </label>
              <div className="relative">
                <select
                  value={selectedTeacherId}
                  onChange={handleTeacherChange}
                  className="w-full h-11 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40"
                >
                  <option value="">-- Choose a teacher --</option>
                  {filteredTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.subjects.join(', ')}
                    </option>
                  ))}
                  {filteredTeachers.length === 0 && teachers.length > 0 && (
                    <option value="" disabled>No teachers match current filters</option>
                  )}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
              {selectedTeacher && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {selectedTeacher.classIds?.map(cid => {
                    const cls = classes.find(c => c.id === cid);
                    const labels = selectedTeacher.sectionLabels?.[cid];
                    return labels?.map(label => (
                      <span key={`${cid}-${label}`} className="text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded border border-brand-primary/15">
                        {label}
                      </span>
                    ));
                  })}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="class-select"
                className="block text-[11px] font-semibold text-brand-text-secondary mb-1.5 uppercase tracking-wider"
              >
                Select Class
              </label>
              <div className="relative">
                <select
                  id="class-select"
                  value={selectedClassId}
                  onChange={handleClassChange}
                  className="w-full h-11 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40"
                >
                  <option value="">-- Choose a class --</option>
                  {(selectedTeacher ? availableClasses : classes).map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="subject-select"
                className="block text-[11px] font-semibold text-brand-text-secondary mb-1.5 uppercase tracking-wider"
              >
                Select Subject
              </label>
              <div className="relative">
                <select
                  id="subject-select"
                  value={selectedSubjectId}
                  onChange={handleSubjectChange}
                  disabled={!selectedClassId}
                  className="w-full h-11 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose a subject --</option>
                  {availableSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="chapter-select"
                className="block text-[11px] font-semibold text-brand-text-secondary mb-1.5 uppercase tracking-wider"
              >
                Select Chapter
              </label>
              <div className="relative">
                <select
                  id="chapter-select"
                  value={selectedChapterId}
                  onChange={handleChapterChange}
                  disabled={!selectedSubjectId}
                  className="w-full h-11 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all hover:border-brand-text-secondary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose a chapter --</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>
          </div>

          {/* Paper configuration */}
          <div>
            <h3 className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider mb-3">
              Paper Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] text-brand-text-secondary font-medium">
                  Total Marks
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(clampNumber(e.target.value, 5, 100))}
                   className="w-full h-11 px-3.5 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-brand-text-secondary font-medium">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min={15}
                  max={180}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(clampNumber(e.target.value, 15, 180))}
                   className="w-full h-11 px-3.5 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-brand-text-secondary font-medium">
                  MCQ Count
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={mcqCount}
                  onChange={(e) => setMcqCount(clampNumber(e.target.value, 0, 50))}
                   className="w-full h-11 px-3.5 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-brand-text-secondary font-medium">
                  Short Questions Count
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={shortQuestionCount}
                  onChange={(e) => setShortQuestionCount(clampNumber(e.target.value, 0, 30))}
                   className="w-full h-11 px-3.5 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-brand-text-secondary font-medium">
                  Long Questions Count
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={longQuestionCount}
                  onChange={(e) => setLongQuestionCount(clampNumber(e.target.value, 0, 20))}
                   className="w-full h-11 px-3.5 bg-brand-bg border border-brand-border rounded-lg text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          {/* Live mark distribution summary */}
          <div className="bg-brand-bg rounded-xl border border-brand-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                Mark Distribution
              </h3>
              <span className="text-[11px] font-mono text-brand-text-secondary">
                Total: {totalMarks} marks
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-primary">MCQ Section</span>
                <span className="text-xs font-mono text-brand-text-secondary">
                  {formatMark(markDistribution.mcqMarks)} marks
                  {mcqCount > 0 && (
                    <span className="hidden sm:inline">
                      {' '}({formatMark(markDistribution.mcqPerQuestion)} x {mcqCount})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-primary">Short Answer Section</span>
                <span className="text-xs font-mono text-brand-text-secondary">
                  {formatMark(markDistribution.shortMarks)} marks
                  {shortQuestionCount > 0 && (
                    <span className="hidden sm:inline">
                      {' '}({formatMark(markDistribution.shortPerQuestion)} x {shortQuestionCount})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-primary">Long Answer Section</span>
                <span className="text-xs font-mono text-brand-text-secondary">
                  {formatMark(markDistribution.longMarks)} marks
                  {longQuestionCount > 0 && (
                    <span className="hidden sm:inline">
                      {' '}({formatMark(markDistribution.longPerQuestion)} x {longQuestionCount})
                    </span>
                  )}
                </span>
              </div>
              <div className="border-t border-brand-border/50 pt-2.5 mt-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                  Duration
                </span>
                <span className="text-xs font-mono text-brand-text-primary">
                  {durationMinutes} minutes
                </span>
              </div>
            </div>
          </div>

          {/* Selection summary */}
          {(selectedClass || selectedSubject || selectedChapter) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-brand-text-secondary">
              {selectedClass ? (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Class: {selectedClass.shortName}
                </span>
              ) : null}
              {selectedSubject ? (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Subject: {selectedSubject.name}
                </span>
              ) : null}
              {selectedChapter ? (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Chapter: {selectedChapter.name}
                </span>
              ) : null}
            </div>
          )}

          {/* Generate button */}
          {!marksValid && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
              Mark distribution mismatch: questions total {markDistribution.totalQuestionMarks} marks, but you selected {totalMarks} marks. Adjust counts to match.
            </div>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isDisabled}
            className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-white font-bold py-2.5 px-5 rounded-xl hover:bg-brand-primary-hover transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 min-h-[44px]"
          >
            {isGenerating ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-label="loading"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-sm">Generating Paper...</span>
              </>
            ) : (
              <>
                <DocumentTextIcon className="w-4 h-4" />
                <span className="text-sm">Generate Exam Paper</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaperPanel;
