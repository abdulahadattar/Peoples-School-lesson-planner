import React, { useState, useMemo } from 'react';
import { curriculumData } from '../curriculum';
import { CurriculumClass } from '../types';
import { DocumentTextIcon } from './icons/MiscIcons';
import { PaperConfig } from '../types';

interface PaperPanelProps {
  onGeneratePaper: (config: PaperConfig) => void;
  isGenerating: boolean;
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

const PaperPanel: React.FC<PaperPanelProps> = ({ onGeneratePaper, isGenerating }) => {
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [totalMarks, setTotalMarks] = useState<number>(23);
  const [mcqCount, setMcqCount] = useState<number>(5);
  const [shortQuestionCount, setShortQuestionCount] = useState<number>(5);
  const [longQuestionCount, setLongQuestionCount] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);

  const classes: CurriculumClass[] = useMemo(() => curriculumData.classes, []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

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
    setSelectedClassId(e.target.value);
    setSelectedSubjectId('');
    setSelectedChapterId('');
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSubjectId(e.target.value);
    setSelectedChapterId('');
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
        <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center flex-shrink-0 border border-brand-border">
          <DocumentTextIcon className="w-5 h-5 text-brand-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-text-light tracking-tight">
            Exam Paper Generator
          </h1>
          <p className="text-sm text-brand-text-medium">
            Configure and generate an exam paper from the curriculum
          </p>
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-6 space-y-6">
          {/* Selectors */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="class-select"
                className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider"
              >
                Select Class
              </label>
              <div className="relative">
                <select
                  id="class-select"
                  value={selectedClassId}
                  onChange={handleClassChange}
                  className="w-full h-12 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all hover:border-brand-text-medium/40 min-h-[44px]"
                >
                  <option value="">-- Choose a class --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-medium pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="subject-select"
                className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider"
              >
                Select Subject
              </label>
              <div className="relative">
                <select
                  id="subject-select"
                  value={selectedSubjectId}
                  onChange={handleSubjectChange}
                  disabled={!selectedClassId}
                  className="w-full h-12 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all hover:border-brand-text-medium/40 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  <option value="">-- Choose a subject --</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-medium pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="chapter-select"
                className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider"
              >
                Select Chapter
              </label>
              <div className="relative">
                <select
                  id="chapter-select"
                  value={selectedChapterId}
                  onChange={handleChapterChange}
                  disabled={!selectedSubjectId}
                  className="w-full h-12 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all hover:border-brand-text-medium/40 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  <option value="">-- Choose a chapter --</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-medium pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>
          </div>

          {/* Paper configuration */}
          <div>
            <h3 className="text-xs font-semibold text-brand-text-medium uppercase tracking-wider mb-3">
              Paper Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs text-brand-text-medium font-medium">
                  Total Marks
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(clampNumber(e.target.value, 5, 100))}
                  className="w-full h-12 px-3.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light placeholder:text-brand-text-medium/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-brand-text-medium font-medium">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min={15}
                  max={180}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(clampNumber(e.target.value, 15, 180))}
                  className="w-full h-12 px-3.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light placeholder:text-brand-text-medium/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-brand-text-medium font-medium">
                  MCQ Count
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={mcqCount}
                  onChange={(e) => setMcqCount(clampNumber(e.target.value, 0, 50))}
                  className="w-full h-12 px-3.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light placeholder:text-brand-text-medium/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-brand-text-medium font-medium">
                  Short Questions Count
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={shortQuestionCount}
                  onChange={(e) => setShortQuestionCount(clampNumber(e.target.value, 0, 30))}
                  className="w-full h-12 px-3.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light placeholder:text-brand-text-medium/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-brand-text-medium font-medium">
                  Long Questions Count
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={longQuestionCount}
                  onChange={(e) => setLongQuestionCount(clampNumber(e.target.value, 0, 20))}
                  className="w-full h-12 px-3.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light placeholder:text-brand-text-medium/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Live mark distribution summary */}
          <div className="bg-brand-bg rounded-xl border border-brand-border p-4 min-h-[44px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-brand-text-medium uppercase tracking-wider">
                Mark Distribution
              </h3>
              <span className="text-xs font-mono text-brand-text-medium">
                Total: {totalMarks} marks
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-light">MCQ Section</span>
                <span className="text-xs font-mono text-brand-text-medium">
                  {formatMark(markDistribution.mcqMarks)} marks
                  {mcqCount > 0 && (
                    <span className="hidden sm:inline">
                      {' '}
                      ({formatMark(markDistribution.mcqPerQuestion)} x {mcqCount})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-light">Short Answer Section</span>
                <span className="text-xs font-mono text-brand-text-medium">
                  {formatMark(markDistribution.shortMarks)} marks
                  {shortQuestionCount > 0 && (
                    <span className="hidden sm:inline">
                      {' '}
                      ({formatMark(markDistribution.shortPerQuestion)} x {shortQuestionCount})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-light">Long Answer Section</span>
                <span className="text-xs font-mono text-brand-text-medium">
                  {formatMark(markDistribution.longMarks)} marks
                  {longQuestionCount > 0 && (
                    <span className="hidden sm:inline">
                      {' '}
                      ({formatMark(markDistribution.longPerQuestion)} x {longQuestionCount})
                    </span>
                  )}
                </span>
              </div>
              <div className="border-t border-brand-border/50 pt-2 mt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-text-medium uppercase tracking-wider">
                  Duration
                </span>
                <span className="text-xs font-mono text-brand-text-light">
                  {durationMinutes} minutes
                </span>
              </div>
            </div>
          </div>

          {/* Selection summary */}
          {(selectedClass || selectedSubject || selectedChapter) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-brand-text-medium">
              {selectedClass ? (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">
                  Class: {selectedClass.shortName}
                </span>
              ) : null}
              {selectedSubject ? (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">
                  Subject: {selectedSubject.name}
                </span>
              ) : null}
              {selectedChapter ? (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">
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
            className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-white font-bold py-3 px-5 rounded-xl hover:bg-brand-primary-hover transition-all duration-200 shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 min-h-[44px]"
          >
            {isGenerating ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
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
                <span>Generating Paper...</span>
              </>
            ) : (
              <>
                <DocumentTextIcon className="w-5 h-5" />
                <span>Generate Exam Paper</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaperPanel;
