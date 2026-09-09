import React, { useState, useMemo } from 'react';
import { PaperConfig } from '../types';
import { SelectionApi } from '../hooks/useSelection';
import { sectionsByClass, subjectNames } from '../services/teacherRoster';
import SelectField from './ui/SelectField';
import Spinner from './ui/Spinner';
import SegmentedControl, { EXPORT_FORMATS } from './ui/SegmentedControl';
import { DocumentTextIcon, GraduationCapIcon, BookOpenIcon, ClipboardListIcon, SparklesIcon, UserIcon } from './icons/MiscIcons';

interface PaperPanelProps {
  onGeneratePaper: (config: PaperConfig) => void;
  isGenerating: boolean;
  selection: SelectionApi;
  exportFormat: 'docx' | 'pdf' | 'both';
  onExportFormatChange: (format: 'docx' | 'pdf' | 'both') => void;
}

const clampNumber = (value: string, min: number, max: number): number => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
};

const formatMark = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
};

/** Styled number input with +/- stepper buttons for mobile and desktop. */
const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, hint, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <label className="block text-[11px] text-brand-text-secondary font-medium">{label}</label>
      <span className="text-[10px] font-mono text-brand-text-secondary/70">
        [{min}–{max}]
      </span>
    </div>
    <div className="flex items-center rounded-xl border border-brand-border bg-brand-bg overflow-hidden focus-within:ring-2 focus-within:ring-brand-primary/20 focus-within:border-brand-primary transition-all">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="w-9 sm:w-10 h-10 flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold flex-shrink-0 active:scale-90 select-none cursor-pointer"
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(clampNumber(e.target.value, min, max))}
        className="w-full h-10 px-1 bg-transparent text-center text-sm font-bold text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="w-9 sm:w-10 h-10 flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold flex-shrink-0 active:scale-90 select-none cursor-pointer"
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
    {hint && <p className="text-[10px] text-brand-text-tertiary leading-tight">{hint}</p>}
  </div>
);

interface PaperPreset {
  name: string;
  total: number;
  duration: number;
  mcq: number;
  shortListed: number;
  shortAttempt: number;
  shortMarks: number;
  longListed: number;
  longAttempt: number;
  longMarks: number;
  formulaLabel: string;
  badge?: string;
}

const PRESETS: PaperPreset[] = [
  {
    name: '30 MCQs Quiz',
    total: 30,
    duration: 35,
    mcq: 30,
    shortListed: 0,
    shortAttempt: 0,
    shortMarks: 2,
    longListed: 0,
    longAttempt: 0,
    longMarks: 4,
    formulaLabel: '30 MCQs (No Theory) = 30M',
    badge: 'Whole Chapter',
  },
  {
    name: 'Class Test',
    total: 25,
    duration: 45,
    mcq: 5,
    shortListed: 8,
    shortAttempt: 6,
    shortMarks: 2,
    longListed: 3,
    longAttempt: 2,
    longMarks: 4,
    formulaLabel: '5(1M) + 6(2M) + 2(4M) = 25M',
  },
  {
    name: 'Unit Quiz',
    total: 20,
    duration: 30,
    mcq: 4,
    shortListed: 6,
    shortAttempt: 4,
    shortMarks: 2,
    longListed: 3,
    longAttempt: 2,
    longMarks: 4,
    formulaLabel: '4(1M) + 4(2M) + 2(4M) = 20M',
  },
  {
    name: 'Midterm Exam',
    total: 50,
    duration: 90,
    mcq: 10,
    shortListed: 12,
    shortAttempt: 8,
    shortMarks: 3,
    longListed: 5,
    longAttempt: 4,
    longMarks: 4,
    formulaLabel: '10(1M) + 8(3M) + 4(4M) = 50M',
  },
  {
    name: 'Board Model',
    total: 75,
    duration: 120,
    mcq: 15,
    shortListed: 12,
    shortAttempt: 9,
    shortMarks: 4,
    longListed: 4,
    longAttempt: 3,
    longMarks: 8,
    formulaLabel: '15(1M) + 9(4M) + 3(8M) = 75M',
  },
  {
    name: 'Annual Exam',
    total: 100,
    duration: 180,
    mcq: 20,
    shortListed: 14,
    shortAttempt: 10,
    shortMarks: 4,
    longListed: 6,
    longAttempt: 5,
    longMarks: 8,
    formulaLabel: '20(1M) + 10(4M) + 5(8M) = 100M',
  },
];

/**
 * Calculates a balanced question distribution that mathematically totals `targetMarks` exactly.
 */
const autoBalanceQuestions = (targetMarks: number, shortWeight: number = 2, longWeight: number = 4) => {
  const t = Math.max(5, Math.round(targetMarks));
  // Allocate ~20% of marks to MCQs (minimum 1)
  let mcqs = Math.max(1, Math.floor(t * 0.2));
  let rem = t - mcqs;
  // Ensure remainder is divisible by shortWeight
  if (rem % shortWeight !== 0) {
    const adjustment = rem % shortWeight;
    mcqs += adjustment;
    rem -= adjustment;
  }
  // Allocate ~40% of remaining to long questions
  let longs = Math.max(0, Math.floor((rem * 0.4) / longWeight));
  let remAfterLong = rem - longs * longWeight;
  let shorts = Math.floor(remAfterLong / shortWeight);

  // If shorts is 0 and we have longs, convert 1 long into shorts if possible
  if (shorts === 0 && longs > 0 && rem >= shortWeight * 2) {
    longs -= 1;
    shorts += Math.floor(longWeight / shortWeight);
  }

  // Final check
  const currentTotal = mcqs * 1 + shorts * shortWeight + longs * longWeight;
  if (currentTotal !== t) {
    const diff = t - currentTotal;
    mcqs += diff;
  }

  const shortListed = shorts > 0 ? shorts + Math.max(1, Math.ceil(shorts * 0.25)) : 0;
  const longListed = longs > 0 ? longs + (longs > 1 ? 1 : 0) : 0;

  return {
    mcq: mcqs,
    shortAttempt: shorts,
    shortListed,
    longAttempt: longs,
    longListed,
  };
};

const PaperPanel: React.FC<PaperPanelProps> = ({
  onGeneratePaper,
  isGenerating,
  selection,
  exportFormat,
  onExportFormatChange,
}) => {
  const {
    classId: selectedClassId,
    subjectId: selectedSubjectId,
    chapterId: selectedChapterId,
    teacherId: selectedTeacherId,
    teacher: selectedTeacher,
    classes,
    teacherChoices,
    availableClasses,
    availableSubjects,
    chapters,
    selectedClass,
    selectedSubject,
    selectedChapter,
    handleClassChange,
    handleSubjectChange,
    handleChapterChange,
    handleTeacherChange,
  } = selection;

  // Initialized to match the 25M Class Test preset: 5 + (6*2) + (2*4) = 25
  const [totalMarks, setTotalMarks] = useState<number>(25);
  const [mcqCount, setMcqCount] = useState<number>(5);
  const [shortQuestionCount, setShortQuestionCount] = useState<number>(8);
  const [shortAttemptCount, setShortAttemptCount] = useState<number>(6);
  const [shortMarksPerQuestion, setShortMarksPerQuestion] = useState<number>(2);
  const [longQuestionCount, setLongQuestionCount] = useState<number>(3);
  const [longAttemptCount, setLongAttemptCount] = useState<number>(2);
  const [longMarksPerQuestion, setLongMarksPerQuestion] = useState<number>(4);
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [autoSyncTotal, setAutoSyncTotal] = useState<boolean>(true);
  const [balanceFeedback, setBalanceFeedback] = useState<string | null>(null);

  const markDistribution = useMemo(() => {
    const MCQ_WEIGHT = 1;
    const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
    const attemptLong = Math.min(longAttemptCount, longQuestionCount);
    const mcqMarks = mcqCount * MCQ_WEIGHT;
    const shortMarks = attemptShort * shortMarksPerQuestion;
    const longMarks = attemptLong * longMarksPerQuestion;
    const totalQuestionMarks = mcqMarks + shortMarks + longMarks;

    return {
      mcqMarks,
      shortMarks,
      longMarks,
      shortAttempt: attemptShort,
      longAttempt: attemptLong,
      mcqPerQuestion: mcqCount > 0 ? MCQ_WEIGHT : 0,
      shortPerQuestion: shortMarksPerQuestion,
      longPerQuestion: longMarksPerQuestion,
      totalQuestionMarks,
    };
  }, [
    mcqCount,
    shortQuestionCount,
    shortAttemptCount,
    shortMarksPerQuestion,
    longQuestionCount,
    longAttemptCount,
    longMarksPerQuestion,
  ]);

  const handleAutoBalance = (target = totalMarks) => {
    const balanced = autoBalanceQuestions(target, shortMarksPerQuestion, longMarksPerQuestion);
    setMcqCount(balanced.mcq);
    setShortQuestionCount(balanced.shortListed);
    setShortAttemptCount(balanced.shortAttempt);
    setLongQuestionCount(balanced.longListed);
    setLongAttemptCount(balanced.longAttempt);
    const computedTotal =
      balanced.mcq * 1 +
      balanced.shortAttempt * shortMarksPerQuestion +
      balanced.longAttempt * longMarksPerQuestion;
    setTotalMarks(computedTotal);
    setBalanceFeedback(`Balanced to ${computedTotal} Marks (${balanced.mcq} MCQs, ${balanced.shortAttempt} Short, ${balanced.longAttempt} Long)!`);
    setTimeout(() => setBalanceFeedback(null), 3500);
  };

  const handleGenerate = () => {
    const finalTotalMarks =
      markDistribution.totalQuestionMarks > 0 ? markDistribution.totalQuestionMarks : totalMarks;

    if (totalMarks !== finalTotalMarks) {
      setTotalMarks(finalTotalMarks);
    }

    const config: PaperConfig = {
      gradeId: selectedClassId,
      subjectId: selectedSubjectId,
      chapterId: selectedChapterId,
      totalMarks: finalTotalMarks,
      mcqCount,
      shortQuestionCount,
      shortAttemptCount: Math.min(shortAttemptCount, shortQuestionCount),
      shortMarksPerQuestion,
      longQuestionCount,
      longAttemptCount: Math.min(longAttemptCount, longQuestionCount),
      longMarksPerQuestion,
      durationMinutes,
      difficulty,
    };
    onGeneratePaper(config);
  };

  let disabledReason = '';
  if (!selectedClassId) {
    disabledReason = 'Select a Class to Generate Paper';
  } else if (!selectedSubjectId) {
    disabledReason = 'Select a Subject to Generate Paper';
  } else if (!selectedChapterId) {
    disabledReason = 'Select a Chapter to Generate Paper';
  } else if (markDistribution.totalQuestionMarks <= 0) {
    disabledReason = 'Add Questions to Generate Paper';
  }

  const canGenerate = !disabledReason;
  const marksMatch = markDistribution.totalQuestionMarks === totalMarks;
  const isDisabled = isGenerating || !canGenerate;

  const shortOptionalCount = Math.max(0, shortQuestionCount - shortAttemptCount);
  const longOptionalCount = Math.max(0, longQuestionCount - longAttemptCount);

  return (
    <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 animate-fadeInUp">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center flex-shrink-0 text-white shadow-card-hover">
          <DocumentTextIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-brand-text-primary tracking-tight">
            Exam Paper Generator
          </h1>
          <p className="text-xs text-brand-text-secondary">
            Configure marks, optional questions, and question types
          </p>
        </div>
      </div>

      <div className="glass-card rounded-2xl shadow-soft border border-brand-border/80">
        <div className="p-5 sm:p-6 md:p-8 space-y-6">
          {/* Selectors Section */}
          <div className="space-y-3.5 bg-brand-bg/40 p-4 sm:p-5 rounded-xl border border-brand-border/60">
            <h2 className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <span>1. Curriculum Selection</span>
            </h2>

            <SelectField
              id="paper-teacher-select"
              label="Select Teacher"
              icon={<UserIcon className="w-3.5 h-3.5" />}
              value={selectedTeacherId}
              onChange={e => handleTeacherChange(e.target.value)}
              className="h-11"
            >
              <option value="">-- Choose a teacher --</option>
              {teacherChoices.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {subjectNames(t).join(', ')}
                </option>
              ))}
            </SelectField>

            {selectedTeacher && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(sectionsByClass(selectedTeacher)).map(([cid, labels]) =>
                  labels.map(label => (
                    <span key={`${cid}-${label}`} className="text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md border border-brand-primary/15">
                      {label}
                    </span>
                  )),
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <SelectField
                id="paper-class-select"
                label="Select Class"
                icon={<GraduationCapIcon className="w-3.5 h-3.5" />}
                value={selectedClassId}
                onChange={e => handleClassChange(e.target.value)}
              >
                <option value="">-- Choose a class --</option>
                {(selectedTeacher ? availableClasses : classes).map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </SelectField>

              <SelectField
                id="paper-subject-select"
                label="Select Subject"
                icon={<BookOpenIcon className="w-3.5 h-3.5" />}
                value={selectedSubjectId}
                onChange={e => handleSubjectChange(e.target.value)}
                disabled={!selectedClassId}
              >
                <option value="">-- Choose a subject --</option>
                {availableSubjects.map(subject => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </SelectField>

              <div className="sm:col-span-2 lg:col-span-1">
                <SelectField
                  id="paper-chapter-select"
                  label="Select Chapter"
                  icon={<ClipboardListIcon className="w-3.5 h-3.5" />}
                  value={selectedChapterId}
                  onChange={e => handleChapterChange(e.target.value)}
                  disabled={!selectedSubjectId}
                  dropdownWidth="xl"
                >
                  <option value="">-- Choose a chapter --</option>
                  {chapters.map(chapter => (
                    <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                  ))}
                </SelectField>
              </div>
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider">
                2. Quick Exam Presets
              </h2>
              <span className="text-[11px] text-brand-primary font-medium">Click any preset to auto-configure</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {PRESETS.map(p => {
                const isActive =
                  totalMarks === p.total &&
                  mcqCount === p.mcq &&
                  shortAttemptCount === p.shortAttempt &&
                  longAttemptCount === p.longAttempt;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setTotalMarks(p.total);
                      setDurationMinutes(p.duration);
                      setMcqCount(p.mcq);
                      setShortQuestionCount(p.shortListed);
                      setShortAttemptCount(p.shortAttempt);
                      setShortMarksPerQuestion(p.shortMarks);
                      setLongQuestionCount(p.longListed);
                      setLongAttemptCount(p.longAttempt);
                      setLongMarksPerQuestion(p.longMarks);
                      setBalanceFeedback(`Applied "${p.name}" preset (${p.total} Marks)!`);
                      setTimeout(() => setBalanceFeedback(null), 3000);
                    }}
                    className={`p-2.5 rounded-xl text-left border transition-all duration-200 active:scale-95 cursor-pointer flex flex-col justify-between min-h-[72px] ${
                      isActive
                        ? 'border-brand-primary bg-brand-primary/10 shadow-xs ring-1.5 ring-brand-primary/40'
                        : 'border-brand-border bg-brand-bg hover:border-brand-text-secondary/40 hover:bg-brand-surface'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-brand-text-primary leading-tight">{p.name}</span>
                        {isActive && <span className="w-2 h-2 rounded-full bg-brand-primary flex-shrink-0" />}
                      </div>
                      <div className="text-[10px] text-brand-text-secondary font-mono mt-0.5">
                        {p.total} Marks
                      </div>
                    </div>
                    {p.badge && (
                      <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                        {p.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rigor & Format Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-[11px] text-brand-text-secondary font-semibold uppercase tracking-wide mb-1.5">
                Rigor / Difficulty
              </label>
              <div className="inline-flex w-full rounded-xl border border-brand-border bg-brand-bg p-1 gap-1">
                {[
                  { id: 'easy', label: 'Easy (Basic Recall)', activeClass: 'bg-emerald-600 text-white' },
                  { id: 'medium', label: 'Medium (Standard)', activeClass: 'bg-blue-600 text-white' },
                  { id: 'hard', label: 'Hard (Conceptual)', activeClass: 'bg-indigo-600 text-white' },
                ].map(lvl => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setDifficulty(lvl.id as any)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 text-center ${
                      difficulty === lvl.id
                        ? `${lvl.activeClass} shadow-xs`
                        : 'text-brand-text-secondary hover:text-brand-text-primary'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide mb-1.5">
                Export File Format
              </label>
              <SegmentedControl value={exportFormat} options={EXPORT_FORMATS} onChange={onExportFormatChange} />
            </div>
          </div>

          {/* Section Question Architecture Cards */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-brand-border/60 pb-2">
              <h2 className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider">
                3. Section Architecture & Optional Choice Rules
              </h2>
              <span className="text-[11px] font-mono font-semibold text-brand-primary">
                Calculated: {markDistribution.totalQuestionMarks} Marks Total
              </span>
            </div>

            {/* SECTION A CARD */}
            <div className="bg-brand-bg/80 border border-brand-border rounded-xl p-4 transition-all">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-brand-border/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center">
                    A
                  </span>
                  <h3 className="text-sm font-bold text-brand-text-primary">
                    Section A: Multiple Choice Questions (MCQs)
                  </h3>
                </div>
                <span className="text-xs font-bold font-mono text-brand-primary">
                  {markDistribution.mcqMarks} Marks
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <NumberField
                  label="Number of MCQs (1 Mark Each)"
                  value={mcqCount}
                  min={0}
                  max={50}
                  onChange={v => {
                    setMcqCount(v);
                    if (autoSyncTotal) {
                      const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                      const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                      setTotalMarks(v * 1 + attemptShort * shortMarksPerQuestion + attemptLong * longMarksPerQuestion);
                    }
                  }}
                />
                <div className="text-xs text-brand-text-secondary bg-brand-surface/60 rounded-xl p-3 border border-brand-border/60">
                  <p className="font-semibold text-brand-text-primary mb-0.5">MCQ Rules:</p>
                  <p className="text-[11px] leading-relaxed">
                    {mcqCount > 0
                      ? `All ${mcqCount} MCQs are compulsory. Includes 4 options (A, B, C, D) per question.`
                      : 'No MCQs included in this paper.'}
                  </p>
                </div>
              </div>
            </div>

            {/* SECTION B CARD */}
            <div className="bg-brand-bg/80 border border-brand-border rounded-xl p-4 transition-all">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-brand-border/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center">
                    B
                  </span>
                  <h3 className="text-sm font-bold text-brand-text-primary">
                    Section B: Short Answer Questions
                  </h3>
                </div>
                <span className="text-xs font-bold font-mono text-brand-primary">
                  {markDistribution.shortMarks} Marks ({markDistribution.shortAttempt} × {shortMarksPerQuestion}M)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <NumberField
                  label="Total Questions on Paper"
                  value={shortQuestionCount}
                  min={0}
                  max={30}
                  hint="How many are printed"
                  onChange={v => {
                    setShortQuestionCount(v);
                    const newAttempt = Math.min(shortAttemptCount, v);
                    setShortAttemptCount(newAttempt);
                    if (autoSyncTotal) {
                      const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                      setTotalMarks(mcqCount * 1 + newAttempt * shortMarksPerQuestion + attemptLong * longMarksPerQuestion);
                    }
                  }}
                />

                <NumberField
                  label="Questions to Attempt"
                  value={shortAttemptCount}
                  min={0}
                  max={Math.max(0, shortQuestionCount)}
                  hint="How many student answers"
                  onChange={v => {
                    setShortAttemptCount(v);
                    if (autoSyncTotal) {
                      const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                      setTotalMarks(mcqCount * 1 + v * shortMarksPerQuestion + attemptLong * longMarksPerQuestion);
                    }
                  }}
                />

                <NumberField
                  label="Marks Per Question"
                  value={shortMarksPerQuestion}
                  min={1}
                  max={10}
                  hint="2M test, 3M-4M exam"
                  onChange={v => {
                    setShortMarksPerQuestion(v);
                    if (autoSyncTotal) {
                      const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                      const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                      setTotalMarks(mcqCount * 1 + attemptShort * v + attemptLong * longMarksPerQuestion);
                    }
                  }}
                />
              </div>

              {/* Clear Optional Explanation Badge */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-brand-surface/80 border border-brand-border/60 text-xs">
                <span className="text-brand-text-secondary">
                  {shortQuestionCount === 0 ? (
                    'No short questions included.'
                  ) : shortOptionalCount > 0 ? (
                    <span>
                      📋 Students attempt <strong className="text-brand-text-primary">{shortAttemptCount} of {shortQuestionCount}</strong> questions (<strong>{shortOptionalCount} optional choices</strong>).
                    </span>
                  ) : (
                    <span>
                      📋 All <strong className="text-brand-text-primary">{shortQuestionCount}</strong> questions are compulsory (0 optional choices).
                    </span>
                  )}
                </span>
                {shortAttemptCount > 0 && (
                  <span className="font-mono text-[11px] text-brand-primary font-bold flex-shrink-0">
                    {shortAttemptCount} × {shortMarksPerQuestion}M = {shortAttemptCount * shortMarksPerQuestion}M
                  </span>
                )}
              </div>
            </div>

            {/* SECTION C CARD */}
            <div className="bg-brand-bg/80 border border-brand-border rounded-xl p-4 transition-all">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-brand-border/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-xs flex items-center justify-center">
                    C
                  </span>
                  <h3 className="text-sm font-bold text-brand-text-primary">
                    Section C: Long / Detailed Questions
                  </h3>
                </div>
                <span className="text-xs font-bold font-mono text-brand-primary">
                  {markDistribution.longMarks} Marks ({markDistribution.longAttempt} × {longMarksPerQuestion}M)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <NumberField
                  label="Total Questions on Paper"
                  value={longQuestionCount}
                  min={0}
                  max={20}
                  hint="How many are printed"
                  onChange={v => {
                    setLongQuestionCount(v);
                    const newAttempt = Math.min(longAttemptCount, v);
                    setLongAttemptCount(newAttempt);
                    if (autoSyncTotal) {
                      const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                      setTotalMarks(mcqCount * 1 + attemptShort * shortMarksPerQuestion + newAttempt * longMarksPerQuestion);
                    }
                  }}
                />

                <NumberField
                  label="Questions to Attempt"
                  value={longAttemptCount}
                  min={0}
                  max={Math.max(0, longQuestionCount)}
                  hint="How many student answers"
                  onChange={v => {
                    setLongAttemptCount(v);
                    if (autoSyncTotal) {
                      const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                      setTotalMarks(mcqCount * 1 + attemptShort * shortMarksPerQuestion + v * longMarksPerQuestion);
                    }
                  }}
                />

                <NumberField
                  label="Marks Per Question"
                  value={longMarksPerQuestion}
                  min={2}
                  max={20}
                  hint="4M test, 6M-8M exam"
                  onChange={v => {
                    setLongMarksPerQuestion(v);
                    if (autoSyncTotal) {
                      const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                      const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                      setTotalMarks(mcqCount * 1 + attemptShort * shortMarksPerQuestion + attemptLong * v);
                    }
                  }}
                />
              </div>

              {/* Clear Optional Explanation Badge */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-brand-surface/80 border border-brand-border/60 text-xs">
                <span className="text-brand-text-secondary">
                  {longQuestionCount === 0 ? (
                    'No long questions included.'
                  ) : longOptionalCount > 0 ? (
                    <span>
                      📋 Students attempt <strong className="text-brand-text-primary">{longAttemptCount} of {longQuestionCount}</strong> questions (<strong>{longOptionalCount} optional choices</strong>).
                    </span>
                  ) : (
                    <span>
                      📋 All <strong className="text-brand-text-primary">{longQuestionCount}</strong> questions are compulsory (0 optional choices).
                    </span>
                  )}
                </span>
                {longAttemptCount > 0 && (
                  <span className="font-mono text-[11px] text-brand-primary font-bold flex-shrink-0">
                    {longAttemptCount} × {longMarksPerQuestion}M = {longAttemptCount * longMarksPerQuestion}M
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Target Total Marks & Duration Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <NumberField
              label="Target Total Marks (Paper Total)"
              value={totalMarks}
              min={5}
              max={100}
              step={5}
              onChange={val => {
                setTotalMarks(val);
              }}
            />

            <NumberField
              label="Exam Duration (Minutes)"
              value={durationMinutes}
              min={15}
              max={240}
              step={15}
              onChange={setDurationMinutes}
            />
          </div>

          {/* Auto-Balance Button */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-primary/15 text-brand-primary flex items-center justify-center flex-shrink-0">
                <SparklesIcon className="w-4 h-4 text-brand-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-brand-text-primary flex items-center gap-2">
                  <span>Auto-Balance Question Marks</span>
                </div>
                <p className="text-[11px] text-brand-text-secondary leading-snug mt-0.5">
                  Recalculates questions to match {totalMarks} marks automatically
                </p>
              </div>
            </div>
            <button
              type="button"
              id="auto-balance-questions-btn"
              onClick={() => handleAutoBalance(totalMarks)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl brand-gradient text-white text-xs sm:text-sm font-bold transition-all shadow-xs hover:shadow-card-hover active:scale-95 flex items-center justify-center gap-2 min-h-[40px] cursor-pointer flex-shrink-0"
            >
              <SparklesIcon className="w-3.5 h-3.5 text-amber-200" />
              <span>Auto-Balance ({totalMarks}M)</span>
            </button>
          </div>

          {balanceFeedback && (
            <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{balanceFeedback}</span>
            </div>
          )}

          {/* Marks Formula Summary */}
          <div className="bg-brand-bg rounded-xl border border-brand-border/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                Live Marks Formula
              </h3>
              <span className="text-xs font-mono font-bold text-brand-primary">
                Total: {markDistribution.totalQuestionMarks} Marks
              </span>
            </div>
            <p className="text-xs font-mono text-brand-text-primary mb-2">
              {markDistribution.mcqMarks}M (MCQ) + {markDistribution.shortMarks}M ({markDistribution.shortAttempt} Short @ {shortMarksPerQuestion}M) + {markDistribution.longMarks}M ({markDistribution.longAttempt} Long @ {longMarksPerQuestion}M) = <strong>{markDistribution.totalQuestionMarks} Marks</strong>
            </p>
            {!marksMatch && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-brand-border/50 text-xs">
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Target total is set to {totalMarks}M.
                </span>
                <button
                  type="button"
                  onClick={() => setTotalMarks(markDistribution.totalQuestionMarks)}
                  className="font-bold text-brand-primary hover:underline"
                >
                  ⚡ Sync Target to {markDistribution.totalQuestionMarks}M
                </button>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            type="button"
            id="generate-exam-paper-btn"
            onClick={handleGenerate}
            disabled={isDisabled}
            className="w-full flex items-center justify-center gap-2.5 brand-gradient text-white font-bold py-3.5 px-5 rounded-xl hover:shadow-glass hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none min-h-[50px] cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Spinner className="w-4 h-4" />
                <span className="text-sm">Generating Exam Paper...</span>
              </>
            ) : disabledReason ? (
              <span className="text-sm">{disabledReason}</span>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4 text-amber-200" />
                <span className="text-sm">
                  Generate Exam Paper ({markDistribution.totalQuestionMarks} Marks)
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaperPanel;
