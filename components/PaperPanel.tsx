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

/** Shared styled number input with +/- stepper buttons for mobile and desktop. */
const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <div className="space-y-1.5">
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
        className="w-10 h-11 flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold flex-shrink-0 active:scale-90 select-none"
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
        className="w-full h-11 px-1 bg-transparent text-center text-sm font-semibold text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="w-10 h-11 flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold flex-shrink-0 active:scale-90 select-none"
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  </div>
);

interface PaperPreset {
  name: string;
  total: number;
  duration: number;
  mcq: number;
  shortListed: number;
  shortAttempt: number;
  longListed: number;
  longAttempt: number;
  formulaLabel: string;
}

const PRESETS: PaperPreset[] = [
  {
    name: 'Unit Quiz',
    total: 20,
    duration: 30,
    mcq: 4,
    shortListed: 6,
    shortAttempt: 4,
    longListed: 3,
    longAttempt: 2,
    formulaLabel: '4 + 8 + 8 = 20M',
  },
  {
    name: 'Class Test',
    total: 25,
    duration: 45,
    mcq: 5,
    shortListed: 8,
    shortAttempt: 6,
    longListed: 3,
    longAttempt: 2,
    formulaLabel: '5 + 12 + 8 = 25M',
  },
  {
    name: 'Midterm',
    total: 50,
    duration: 90,
    mcq: 10,
    shortListed: 15,
    shortAttempt: 12,
    longListed: 6,
    longAttempt: 4,
    formulaLabel: '10 + 24 + 16 = 50M',
  },
  {
    name: 'Board Model',
    total: 75,
    duration: 120,
    mcq: 15,
    shortListed: 22,
    shortAttempt: 18,
    longListed: 8,
    longAttempt: 6,
    formulaLabel: '15 + 36 + 24 = 75M',
  },
  {
    name: 'Annual Exam',
    total: 100,
    duration: 180,
    mcq: 20,
    shortListed: 30,
    shortAttempt: 24,
    longListed: 10,
    longAttempt: 8,
    formulaLabel: '20 + 48 + 32 = 100M',
  },
];

/**
 * Calculates a balanced question distribution that mathematically totals `targetMarks` exactly.
 * MCQs = 1 mark each, Short questions = 2 marks each, Long questions = 4 marks each.
 */
const autoBalanceQuestions = (targetMarks: number) => {
  const t = Math.max(5, Math.round(targetMarks));
  // Allocate ~20% of marks to MCQs (minimum 1)
  let mcqs = Math.max(1, Math.floor(t * 0.2));
  let rem = t - mcqs;
  // Ensure remainder is even so short questions (2 marks) divide evenly
  if (rem % 2 !== 0) {
    mcqs += 1;
    rem -= 1;
  }
  // Allocate ~40% of remaining to long questions (4 marks each)
  let longs = Math.max(0, Math.floor((rem * 0.4) / 4));
  let remAfterLong = rem - longs * 4;
  let shorts = Math.floor(remAfterLong / 2);

  // If shorts is 0 and we have longs, trade 1 long (4 marks) for 2 shorts (4 marks) so students have variety
  if (shorts === 0 && longs > 0 && rem >= 4) {
    longs -= 1;
    shorts += 2;
  }

  // Safety check: ensure total matches targetMarks exactly
  const currentTotal = mcqs * 1 + shorts * 2 + longs * 4;
  if (currentTotal !== t) {
    const diff = t - currentTotal;
    if (diff % 2 === 0) {
      shorts += diff / 2;
    } else {
      mcqs += diff;
    }
  }

  const shortListed = shorts + Math.max(1, Math.ceil(shorts * 0.25));
  const longListed = longs + (longs > 0 ? 1 : 0);

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

  // Initialized to match the 25M Class Test preset perfectly: 5 + (6*2) + (2*4) = 25
  const [totalMarks, setTotalMarks] = useState<number>(25);
  const [mcqCount, setMcqCount] = useState<number>(5);
  const [shortQuestionCount, setShortQuestionCount] = useState<number>(8);
  const [shortAttemptCount, setShortAttemptCount] = useState<number>(6);
  const [longQuestionCount, setLongQuestionCount] = useState<number>(3);
  const [longAttemptCount, setLongAttemptCount] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [autoSyncTotal, setAutoSyncTotal] = useState<boolean>(true);
  const [balanceFeedback, setBalanceFeedback] = useState<string | null>(null);

  const markDistribution = useMemo(() => {
    const MCQ_WEIGHT = 1;
    const SHORT_WEIGHT = 2;
    const LONG_WEIGHT = 4;

    const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
    const attemptLong = Math.min(longAttemptCount, longQuestionCount);
    const mcqMarks = mcqCount * MCQ_WEIGHT;
    const shortMarks = attemptShort * SHORT_WEIGHT;
    const longMarks = attemptLong * LONG_WEIGHT;
    const totalQuestionMarks = mcqMarks + shortMarks + longMarks;

    return {
      mcqMarks,
      shortMarks,
      longMarks,
      shortAttempt: attemptShort,
      longAttempt: attemptLong,
      mcqPerQuestion: mcqCount > 0 ? MCQ_WEIGHT : 0,
      shortPerQuestion: SHORT_WEIGHT,
      longPerQuestion: LONG_WEIGHT,
      totalQuestionMarks,
    };
  }, [mcqCount, shortQuestionCount, shortAttemptCount, longQuestionCount, longAttemptCount]);

  const handleAutoBalance = (target = totalMarks) => {
    const balanced = autoBalanceQuestions(target);
    setMcqCount(balanced.mcq);
    setShortQuestionCount(balanced.shortListed);
    setShortAttemptCount(balanced.shortAttempt);
    setLongQuestionCount(balanced.longListed);
    setLongAttemptCount(balanced.longAttempt);
    const computedTotal = balanced.mcq * 1 + balanced.shortAttempt * 2 + balanced.longAttempt * 4;
    setTotalMarks(computedTotal);
    setBalanceFeedback(`Questions auto-balanced to ${computedTotal} Marks!`);
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
      longQuestionCount,
      longAttemptCount: Math.min(longAttemptCount, longQuestionCount),
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

  const shortHasOptional = shortAttemptCount < shortQuestionCount;
  const longHasOptional = longAttemptCount < longQuestionCount;

  const distributionRows = [
    { label: 'MCQ Section', marks: markDistribution.mcqMarks, count: mcqCount, per: markDistribution.mcqPerQuestion, attempt: mcqCount },
    { label: 'Short Answer Section', marks: markDistribution.shortMarks, count: shortQuestionCount, per: markDistribution.shortPerQuestion, attempt: markDistribution.shortAttempt },
    { label: 'Long Answer Section', marks: markDistribution.longMarks, count: longQuestionCount, per: markDistribution.longPerQuestion, attempt: markDistribution.longAttempt },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 md:py-8 animate-fadeInUp">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center flex-shrink-0 text-white shadow-card-hover">
          <DocumentTextIcon className="w-5 h-5" />
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

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 space-y-5">
          {/* Selectors */}
          <div className="space-y-3">
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

            <SelectField
              id="paper-chapter-select"
              label="Select Chapter"
              icon={<ClipboardListIcon className="w-3.5 h-3.5" />}
              value={selectedChapterId}
              onChange={e => handleChapterChange(e.target.value)}
              disabled={!selectedSubjectId}
            >
              <option value="">-- Choose a chapter --</option>
              {chapters.map(chapter => (
                <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
              ))}
            </SelectField>
          </div>

          {/* Paper configuration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                Paper Configuration
              </h3>
              <span className="text-[10px] text-brand-primary font-medium">Auto-calculates marks</span>
            </div>

            {/* Quick Presets */}
            <div className="mb-4">
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className="text-[11px] text-brand-text-secondary font-medium">Quick Exam Presets:</span>
                <span className="text-[10px] text-brand-primary font-mono font-medium">1M MCQ • 2M Short • 4M Long</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
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
                        setLongQuestionCount(p.longListed);
                        setLongAttemptCount(p.longAttempt);
                        setBalanceFeedback(`Loaded ${p.name} (${p.total} Marks)!`);
                        setTimeout(() => setBalanceFeedback(null), 3000);
                      }}
                      className={`px-3 py-2.5 rounded-xl text-left border transition-all duration-200 active:scale-95 cursor-pointer ${
                        isActive
                          ? 'border-brand-primary bg-brand-primary/10 shadow-xs ring-1 ring-brand-primary/30'
                          : 'border-brand-border bg-brand-bg hover:border-brand-text-secondary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-text-primary">{p.name}</span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] text-brand-text-secondary font-mono mt-0.5">
                        {p.total} Marks • {p.duration}m
                      </div>
                      <div className="text-[9px] text-brand-primary font-mono mt-1 opacity-90">
                        {p.formulaLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
              <div>
                <label className="block text-[11px] text-brand-text-secondary font-medium mb-1.5">Rigor / Difficulty</label>
                <div className="inline-flex rounded-xl border border-brand-border bg-brand-bg p-1 gap-1">
                  {[
                    { id: 'easy', label: 'Easy', activeClass: 'bg-emerald-600 text-white' },
                    { id: 'medium', label: 'Medium', activeClass: 'bg-blue-600 text-white' },
                    { id: 'hard', label: 'Hard', activeClass: 'bg-indigo-600 text-white' },
                  ].map(lvl => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setDifficulty(lvl.id as any)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-200 active:scale-95 ${
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

              <div className="flex-1 sm:max-w-xs">
                <label className="block text-[11px] font-semibold text-brand-text-secondary mb-1.5 uppercase tracking-wide">
                  Export Format
                </label>
                <SegmentedControl value={exportFormat} options={EXPORT_FORMATS} onChange={onExportFormatChange} />
              </div>
            </div>

            {/* Prominent, Mobile-Friendly Auto-Balance Bar */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-primary/15 text-brand-primary flex items-center justify-center flex-shrink-0">
                  <SparklesIcon className="w-5 h-5 text-brand-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-brand-text-primary flex items-center gap-2">
                    <span>Auto-Balance Questions</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-primary/15 text-brand-primary">
                      {totalMarks} Marks
                    </span>
                  </div>
                  <p className="text-[11px] text-brand-text-secondary leading-snug mt-0.5">
                    Instantly distributes marks across MCQs (1M), Short (2M), and Long (4M) questions
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="auto-balance-questions-btn"
                onClick={() => handleAutoBalance(totalMarks)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl brand-gradient text-white text-xs sm:text-sm font-bold transition-all shadow-xs hover:shadow-card-hover active:scale-95 flex items-center justify-center gap-2 min-h-[44px] cursor-pointer flex-shrink-0"
              >
                <SparklesIcon className="w-4 h-4 text-amber-200" />
                <span>Auto-Balance ({totalMarks}M)</span>
              </button>
            </div>

            {balanceFeedback && (
              <div className="mb-4 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{balanceFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <NumberField
                  label="Total Marks Target"
                  value={totalMarks}
                  min={5}
                  max={100}
                  step={5}
                  onChange={val => {
                    setTotalMarks(val);
                  }}
                />
              </div>

              <NumberField
                label="Duration (Minutes)"
                value={durationMinutes}
                min={15}
                max={180}
                step={15}
                onChange={setDurationMinutes}
              />

              <NumberField
                label="MCQ Count (1M each)"
                value={mcqCount}
                min={0}
                max={50}
                onChange={v => {
                  setMcqCount(v);
                  if (autoSyncTotal) {
                    const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                    const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                    setTotalMarks(v * 1 + attemptShort * 2 + attemptLong * 4);
                  }
                }}
              />

              <NumberField
                label="Short Questions on Paper"
                value={shortQuestionCount}
                min={0}
                max={30}
                onChange={v => {
                  setShortQuestionCount(v);
                  const newAttempt = Math.min(shortAttemptCount, v);
                  setShortAttemptCount(newAttempt);
                  if (autoSyncTotal) {
                    const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                    setTotalMarks(mcqCount * 1 + newAttempt * 2 + attemptLong * 4);
                  }
                }}
              />

              <NumberField
                label="Short to Attempt (2M each)"
                value={shortAttemptCount}
                min={0}
                max={Math.max(1, shortQuestionCount)}
                onChange={v => {
                  setShortAttemptCount(v);
                  if (autoSyncTotal) {
                    const attemptLong = Math.min(longAttemptCount, longQuestionCount);
                    setTotalMarks(mcqCount * 1 + v * 2 + attemptLong * 4);
                  }
                }}
              />

              <NumberField
                label="Long Questions on Paper"
                value={longQuestionCount}
                min={0}
                max={20}
                onChange={v => {
                  setLongQuestionCount(v);
                  const newAttempt = Math.min(longAttemptCount, v);
                  setLongAttemptCount(newAttempt);
                  if (autoSyncTotal) {
                    const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                    setTotalMarks(mcqCount * 1 + attemptShort * 2 + newAttempt * 4);
                  }
                }}
              />

              <NumberField
                label="Long to Attempt (4M each)"
                value={longAttemptCount}
                min={0}
                max={Math.max(1, longQuestionCount)}
                onChange={v => {
                  setLongAttemptCount(v);
                  if (autoSyncTotal) {
                    const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
                    setTotalMarks(mcqCount * 1 + attemptShort * 2 + v * 4);
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-brand-border/40">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSyncTotal}
                  onChange={e => {
                    setAutoSyncTotal(e.target.checked);
                    if (e.target.checked) {
                      setTotalMarks(markDistribution.totalQuestionMarks);
                    }
                  }}
                  className="rounded border-brand-border text-brand-primary focus:ring-brand-primary/20"
                />
                <span className="text-[11px] text-brand-text-secondary">
                  Auto-sync Target Marks with question counts ({markDistribution.totalQuestionMarks} marks)
                </span>
              </label>

              {!marksMatch && (
                <button
                  type="button"
                  onClick={() => setTotalMarks(markDistribution.totalQuestionMarks)}
                  className="text-[11px] font-bold text-brand-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  ⚡ Sync Target to {markDistribution.totalQuestionMarks}M now
                </button>
              )}
            </div>

            <p className="mt-2 text-[11px] text-brand-text-secondary leading-relaxed">
              💡 Tip: Set &ldquo;on paper&rdquo; higher than &ldquo;to attempt&rdquo; to provide choice for students (e.g., &ldquo;Attempt any 6 of 8&rdquo;).
            </p>
          </div>

          {/* Live mark distribution summary */}
          <div className="bg-brand-bg rounded-xl border border-brand-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                Mark Distribution
              </h3>
              <span className="text-[11px] font-mono text-brand-text-secondary">
                Total: {markDistribution.totalQuestionMarks} marks
              </span>
            </div>
            <div className="space-y-2.5">
              {(shortHasOptional || longHasOptional) && (
                <p className="text-[11px] text-brand-primary/80 bg-brand-primary/5 border border-brand-primary/15 rounded-lg px-3 py-2">
                  Attempt-any: students answer {markDistribution.shortAttempt} of {shortQuestionCount} short and{' '}
                  {markDistribution.longAttempt} of {longQuestionCount} long questions — the rest appear as optional choices.
                </p>
              )}
              {distributionRows.map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-sm text-brand-text-primary">{row.label}</span>
                  <span className="text-xs font-mono text-brand-text-secondary">
                    {formatMark(row.marks)} marks
                    {row.count > 0 && (
                      <span className="hidden sm:inline">
                        {' '}({formatMark(row.per)} × {row.attempt}{row.attempt < row.count ? ` of ${row.count}` : ''})
                      </span>
                    )}
                  </span>
                </div>
              ))}
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
              {selectedClass && (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Class: {selectedClass.shortName}
                </span>
              )}
              {selectedSubject && (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Subject: {selectedSubject.name}
                </span>
              )}
              {selectedChapter && (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Chapter: {selectedChapter.name}
                </span>
              )}
            </div>
          )}

          {/* Mark distribution mismatch helper banner (non-blocking) */}
          {!marksMatch && markDistribution.totalQuestionMarks > 0 && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium animate-fadeIn space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 mt-1 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-950 dark:text-amber-100">
                    Questions calculate to {markDistribution.totalQuestionMarks} Marks (Target Total is {totalMarks}M)
                  </p>
                  <p className="text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
                    MCQs: {mcqCount}M + Short: {markDistribution.shortMarks}M + Long: {markDistribution.longMarks}M = <strong>{markDistribution.totalQuestionMarks} Marks</strong>. Generating will use {markDistribution.totalQuestionMarks} marks, or you can balance automatically.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/40">
                <button
                  type="button"
                  onClick={() => setTotalMarks(markDistribution.totalQuestionMarks)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer min-h-[38px]"
                >
                  ⚡ Set Target Total to {markDistribution.totalQuestionMarks} Marks
                </button>
                <button
                  type="button"
                  onClick={() => handleAutoBalance(totalMarks)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary/90 active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer min-h-[38px]"
                >
                  🎯 Auto-Balance Questions for {totalMarks} Marks
                </button>
              </div>
            </div>
          )}

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
                <span className="text-sm">Generating Paper...</span>
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
