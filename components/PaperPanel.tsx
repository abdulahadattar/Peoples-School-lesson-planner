import React, { useState, useMemo } from 'react';
import { PaperConfig } from '../types';
import { SelectionApi } from '../hooks/useSelection';
import { sectionsByClass, subjectNames } from '../services/teacherRoster';
import SelectField from './ui/SelectField';
import Spinner from './ui/Spinner';
import SegmentedControl, { EXPORT_FORMATS } from './ui/SegmentedControl';
import {
  DocumentTextIcon,
  GraduationCapIcon,
  BookOpenIcon,
  ClipboardListIcon,
  SparklesIcon,
  UserIcon,
} from './icons/MiscIcons';
import { motion } from 'motion/react';

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
      <label className="block text-xs text-brand-text-secondary font-medium">{label}</label>
      <span className="text-[10px] font-mono tabular-nums text-brand-text-tertiary">
        [{min}–{max}]
      </span>
    </div>
    <div className="flex items-center rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-slate-50 dark:bg-slate-900/40 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold shrink-0 active:scale-90 select-none cursor-pointer"
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        autoComplete="off"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(clampNumber(e.target.value, min, max))}
        className="w-full h-10 px-1 bg-transparent text-center text-sm font-semibold text-brand-text-primary placeholder:text-slate-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono tabular-nums"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold shrink-0 active:scale-90 select-none cursor-pointer"
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
    {hint && <p className="text-[10px] text-brand-text-tertiary leading-tight">{hint}</p>}
  </div>
);

interface PaperPreset {
  id: string;
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
}

const PRESETS: PaperPreset[] = [
  {
    id: 'class-test',
    name: 'Class Test (25M)',
    total: 25,
    duration: 45,
    mcq: 5,
    shortListed: 8,
    shortAttempt: 6,
    shortMarks: 2,
    longListed: 3,
    longAttempt: 2,
    longMarks: 4,
    formulaLabel: '5(1M) + 6(2M) + 2(4M)',
  },
  {
    id: 'mcq-quiz',
    name: '30 MCQs Quiz (30M)',
    total: 30,
    duration: 35,
    mcq: 30,
    shortListed: 0,
    shortAttempt: 0,
    shortMarks: 2,
    longListed: 0,
    longAttempt: 0,
    longMarks: 4,
    formulaLabel: '30 MCQs only',
  },
  {
    id: 'unit-quiz',
    name: 'Unit Quiz (20M)',
    total: 20,
    duration: 30,
    mcq: 4,
    shortListed: 6,
    shortAttempt: 4,
    shortMarks: 2,
    longListed: 3,
    longAttempt: 2,
    longMarks: 4,
    formulaLabel: '4(1M) + 4(2M) + 2(4M)',
  },
  {
    id: 'midterm',
    name: 'Midterm Exam (50M)',
    total: 50,
    duration: 90,
    mcq: 10,
    shortListed: 12,
    shortAttempt: 8,
    shortMarks: 3,
    longListed: 5,
    longAttempt: 4,
    longMarks: 4,
    formulaLabel: '10(1M) + 8(3M) + 4(4M)',
  },
  {
    id: 'board-model',
    name: 'Board Model (75M)',
    total: 75,
    duration: 120,
    mcq: 15,
    shortListed: 12,
    shortAttempt: 9,
    shortMarks: 4,
    longListed: 4,
    longAttempt: 3,
    longMarks: 8,
    formulaLabel: '15(1M) + 9(4M) + 3(8M)',
  },
  {
    id: 'annual',
    name: 'Annual Exam (100M)',
    total: 100,
    duration: 180,
    mcq: 20,
    shortListed: 14,
    shortAttempt: 10,
    shortMarks: 4,
    longListed: 6,
    longAttempt: 5,
    longMarks: 8,
    formulaLabel: '20(1M) + 10(4M) + 5(8M)',
  },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy (Recall)' },
  { value: 'medium', label: 'Medium (Standard)' },
  { value: 'hard', label: 'Hard (Conceptual)' },
] as const;

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
    handleClassChange,
    handleSubjectChange,
    handleChapterChange,
    handleTeacherChange,
  } = selection;

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
  const [activePresetId, setActivePresetId] = useState<string>('class-test');
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

  const applyPreset = (preset: PaperPreset) => {
    setActivePresetId(preset.id);
    setTotalMarks(preset.total);
    setDurationMinutes(preset.duration);
    setMcqCount(preset.mcq);
    setShortQuestionCount(preset.shortListed);
    setShortAttemptCount(preset.shortAttempt);
    setShortMarksPerQuestion(preset.shortMarks);
    setLongQuestionCount(preset.longListed);
    setLongAttemptCount(preset.longAttempt);
    setLongMarksPerQuestion(preset.longMarks);
    setBalanceFeedback(`Applied preset: ${preset.name}`);
    setTimeout(() => setBalanceFeedback(null), 3000);
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
    <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-white dark:bg-brand-surface border border-black/[0.06] dark:border-white/[0.08] shadow-soft">
        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <DocumentTextIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-brand-text-primary tracking-tight">
                  Exam Paper Generator
                </h2>
                <p className="text-xs text-brand-text-secondary mt-0.5">
                  Configure question distribution, choice rules, and mark formulas
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono tabular-nums">{markDistribution.totalQuestionMarks} Marks</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{durationMinutes} mins</span>
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div>
            <label className="block text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide mb-2.5">
              Quick Exam Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {PRESETS.map(preset => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`flex flex-col p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-500/40 shadow-xs'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-black/[0.04] dark:border-white/[0.06] hover:border-black/[0.1] hover:bg-slate-100/70'
                    }`}
                  >
                    <span className={`text-xs font-semibold truncate ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-brand-text-primary'}`}>
                      {preset.name}
                    </span>
                    <span className="text-[10px] text-brand-text-secondary font-mono tabular-nums mt-0.5">
                      {preset.duration}m · {preset.formulaLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Curriculum Selectors Section */}
          <div className="bg-slate-50/80 dark:bg-slate-900/40 p-4 sm:p-5 rounded-xl border border-black/[0.06] dark:border-white/[0.08] space-y-3.5">
            <h3 className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider">
              1. Curriculum Alignment
            </h3>

            <SelectField
              id="paper-teacher-select"
              label="Select Teacher"
              icon={<UserIcon className="w-3.5 h-3.5" />}
              value={selectedTeacherId}
              onChange={e => handleTeacherChange(e.target.value)}
              className="h-11"
            >
              <option value="">Choose a teacher...</option>
              {teacherChoices.map(t => (
                <option key={t.id} value={t.id}>
                  {`${t.name} — ${subjectNames(t).join(', ')}`}
                </option>
              ))}
            </SelectField>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <SelectField
                id="paper-class-select"
                label="Select Class"
                icon={<GraduationCapIcon className="w-3.5 h-3.5" />}
                value={selectedClassId}
                onChange={e => handleClassChange(e.target.value)}
              >
                <option value="">Choose a class</option>
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
                <option value="">Choose a subject</option>
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
                  <option value="">Choose a chapter</option>
                  {chapters.map(chapter => (
                    <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                  ))}
                </SelectField>
              </div>
            </div>
          </div>

          {/* Rigor & Format Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-brand-text-secondary font-semibold uppercase tracking-wide mb-2">
                Rigor / Difficulty
              </label>
              <SegmentedControl
                value={difficulty}
                options={DIFFICULTY_OPTIONS}
                onChange={setDifficulty as any}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide mb-2">
                Export File Format
              </label>
              <SegmentedControl value={exportFormat} options={EXPORT_FORMATS} onChange={onExportFormatChange} />
            </div>
          </div>

          {/* Section Architecture Cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h3 className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider">
                2. Section Blueprint & Optional Rules
              </h3>
              <span className="text-xs font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                Formula Total: {markDistribution.totalQuestionMarks} Marks
              </span>
            </div>

            {/* SECTION A */}
            <div className="bg-slate-50/70 dark:bg-slate-900/40 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-black/[0.04] dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center font-mono">
                    A
                  </span>
                  <span className="text-sm font-semibold text-brand-text-primary">
                    Section A: Multiple Choice Questions (MCQs)
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                  {markDistribution.mcqMarks} Marks
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <NumberField
                  label="Number of MCQs (1 Mark Each)"
                  value={mcqCount}
                  min={0}
                  max={50}
                  onChange={setMcqCount}
                />
                <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800/60 rounded-xl p-3 border border-black/[0.04] dark:border-white/[0.06]">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">MCQ Blueprint:</p>
                  <p className="text-[11px] leading-relaxed">
                    {mcqCount > 0
                      ? `All ${mcqCount} MCQs are compulsory with 4 balanced distractors (A, B, C, D).`
                      : 'No MCQs included in this paper.'}
                  </p>
                </div>
              </div>
            </div>

            {/* SECTION B */}
            <div className="bg-slate-50/70 dark:bg-slate-900/40 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-black/[0.04] dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center font-mono">
                    B
                  </span>
                  <span className="text-sm font-semibold text-brand-text-primary">
                    Section B: Short Answer Questions
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                  {markDistribution.shortMarks} Marks ({markDistribution.shortAttempt} × {shortMarksPerQuestion}M)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <NumberField
                  label="Printed Questions"
                  value={shortQuestionCount}
                  min={0}
                  max={30}
                  hint="Questions printed on paper"
                  onChange={v => {
                    setShortQuestionCount(v);
                    setShortAttemptCount(Math.min(shortAttemptCount, v));
                  }}
                />

                <NumberField
                  label="Questions to Attempt"
                  value={shortAttemptCount}
                  min={0}
                  max={Math.max(0, shortQuestionCount)}
                  hint="Mandatory student answers"
                  onChange={setShortAttemptCount}
                />

                <NumberField
                  label="Marks Per Question"
                  value={shortMarksPerQuestion}
                  min={1}
                  max={10}
                  hint="Typically 2M–4M"
                  onChange={setShortMarksPerQuestion}
                />
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-800/60 border border-black/[0.04] dark:border-white/[0.06] text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  {shortQuestionCount === 0 ? (
                    'No short questions included.'
                  ) : shortOptionalCount > 0 ? (
                    <span>
                      Attempt <strong className="text-slate-900 dark:text-white">{shortAttemptCount} of {shortQuestionCount}</strong> questions ({shortOptionalCount} optional choice{shortOptionalCount > 1 ? 's' : ''}).
                    </span>
                  ) : (
                    <span>
                      All <strong className="text-slate-900 dark:text-white">{shortQuestionCount}</strong> questions are compulsory.
                    </span>
                  )}
                </span>
                {shortAttemptCount > 0 && (
                  <span className="font-mono tabular-nums text-[11px] text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                    {shortAttemptCount} × {shortMarksPerQuestion}M = {shortAttemptCount * shortMarksPerQuestion}M
                  </span>
                )}
              </div>
            </div>

            {/* SECTION C */}
            <div className="bg-slate-50/70 dark:bg-slate-900/40 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-black/[0.04] dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-xs flex items-center justify-center font-mono">
                    C
                  </span>
                  <span className="text-sm font-semibold text-brand-text-primary">
                    Section C: Detailed / Long Questions
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-purple-600 dark:text-purple-400">
                  {markDistribution.longMarks} Marks ({markDistribution.longAttempt} × {longMarksPerQuestion}M)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <NumberField
                  label="Printed Questions"
                  value={longQuestionCount}
                  min={0}
                  max={20}
                  hint="Questions printed on paper"
                  onChange={v => {
                    setLongQuestionCount(v);
                    setLongAttemptCount(Math.min(longAttemptCount, v));
                  }}
                />

                <NumberField
                  label="Questions to Attempt"
                  value={longAttemptCount}
                  min={0}
                  max={Math.max(0, longQuestionCount)}
                  hint="Mandatory student answers"
                  onChange={setLongAttemptCount}
                />

                <NumberField
                  label="Marks Per Question"
                  value={longMarksPerQuestion}
                  min={2}
                  max={20}
                  hint="Typically 4M–8M"
                  onChange={setLongMarksPerQuestion}
                />
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-800/60 border border-black/[0.04] dark:border-white/[0.06] text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  {longQuestionCount === 0 ? (
                    'No detailed questions included.'
                  ) : longOptionalCount > 0 ? (
                    <span>
                      Attempt <strong className="text-slate-900 dark:text-white">{longAttemptCount} of {longQuestionCount}</strong> questions ({longOptionalCount} optional choice{longOptionalCount > 1 ? 's' : ''}).
                    </span>
                  ) : (
                    <span>
                      All <strong className="text-slate-900 dark:text-white">{longQuestionCount}</strong> questions are compulsory.
                    </span>
                  )}
                </span>
                {longAttemptCount > 0 && (
                  <span className="font-mono tabular-nums text-[11px] text-purple-600 dark:text-purple-400 font-bold shrink-0">
                    {longAttemptCount} × {longMarksPerQuestion}M = {longAttemptCount * longMarksPerQuestion}M
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Duration & Target Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberField
              label="Target Marks"
              value={totalMarks}
              min={5}
              max={100}
              step={5}
              onChange={setTotalMarks}
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

          {balanceFeedback && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{balanceFeedback}</span>
            </motion.div>
          )}

          {/* Formula summary */}
          <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-4 text-xs">
            <div className="flex items-center justify-between mb-1 text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Live Formula Calculation</span>
              <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">{markDistribution.totalQuestionMarks} Marks</span>
            </div>
            <p className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              {markDistribution.mcqMarks}M (MCQ) + {markDistribution.shortMarks}M ({markDistribution.shortAttempt} Short @ {shortMarksPerQuestion}M) + {markDistribution.longMarks}M ({markDistribution.longAttempt} Long @ {longMarksPerQuestion}M) = <strong>{markDistribution.totalQuestionMarks} Marks</strong>
            </p>
            {!marksMatch && (
              <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
                <span className="text-amber-600 dark:text-amber-400">Target is set to {totalMarks}M.</span>
                <button
                  type="button"
                  onClick={() => setTotalMarks(markDistribution.totalQuestionMarks)}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Sync Target to {markDistribution.totalQuestionMarks}M
                </button>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <motion.button
            whileTap={{ scale: 0.985 }}
            type="button"
            id="generate-exam-paper-btn"
            onClick={handleGenerate}
            disabled={isDisabled}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[48px] cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Spinner className="w-4 h-4" />
                <span>Generating Exam Paper...</span>
              </>
            ) : disabledReason ? (
              <span>{disabledReason}</span>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                <span>Generate Exam Paper ({markDistribution.totalQuestionMarks} Marks)</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default PaperPanel;
