import React, { useState, useMemo } from 'react';
import { PaperConfig } from '../types';
import { SelectionApi } from '../hooks/useSelection';
import Spinner from './ui/Spinner';
import SegmentedControl, { EXPORT_FORMATS } from './ui/SegmentedControl';
import { NumberField } from './ui/NumberField';
import { PaperPresetSelector, PaperPreset } from './paper/PaperPresetSelector';
import { PaperMarkSummary } from './paper/PaperMarkSummary';
import { PaperSelectToolbar } from './paper/PaperSelectToolbar';
import { PaperSectionsList } from './paper/PaperSectionsList';
import {
  DocumentTextIcon,
  SparklesIcon,
} from './icons/MiscIcons';
import { motion } from 'motion/react';

interface PaperPanelProps {
  onGeneratePaper: (config: PaperConfig) => void;
  isGenerating: boolean;
  selection: SelectionApi;
  exportFormat: 'docx' | 'pdf' | 'both';
  onExportFormatChange: (format: 'docx' | 'pdf' | 'both') => void;
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy (Recall)' },
  { value: 'medium', label: 'Medium (Standard)' },
  { value: 'hard', label: 'Hard (Conceptual)' },
] as const;

export const PaperPanel: React.FC<PaperPanelProps> = ({
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
    const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
    const attemptLong = Math.min(longAttemptCount, longQuestionCount);
    const mcqMarks = mcqCount * 1;
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
  const isDisabled = isGenerating || !canGenerate;

  return (
    <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-white dark:bg-brand-surface border border-black/[0.06] dark:border-white/[0.08] shadow-soft">
        <div className="p-6 sm:p-8 space-y-6">
          <div className="border-b border-black/[0.06] dark:border-white/[0.08] pb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <DocumentTextIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Exam Paper Generator</h2>
                <p className="text-sm text-slate-500">Configure questions, marking scheme, and format</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="w-full sm:w-auto">
                <SegmentedControl
                  value={exportFormat}
                  onChange={onExportFormatChange}
                  options={EXPORT_FORMATS}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Difficulty:</span>
                <select
                  value={difficulty}
                  onChange={e => setDifficulty(e.target.value as any)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {DIFFICULTY_OPTIONS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <PaperSelectToolbar selection={selection} />

          <PaperPresetSelector activePresetId={activePresetId} onSelectPreset={applyPreset} />

          <PaperSectionsList
            markDistribution={markDistribution}
            mcqCount={mcqCount}
            setMcqCount={setMcqCount}
            shortQuestionCount={shortQuestionCount}
            setShortQuestionCount={setShortQuestionCount}
            shortAttemptCount={shortAttemptCount}
            setShortAttemptCount={setShortAttemptCount}
            shortMarksPerQuestion={shortMarksPerQuestion}
            setShortMarksPerQuestion={setShortMarksPerQuestion}
            longQuestionCount={longQuestionCount}
            setLongQuestionCount={setLongQuestionCount}
            longAttemptCount={longAttemptCount}
            setLongAttemptCount={setLongAttemptCount}
            longMarksPerQuestion={longMarksPerQuestion}
            setLongMarksPerQuestion={setLongMarksPerQuestion}
          />

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

          <PaperMarkSummary
            markDistribution={markDistribution}
            totalMarks={totalMarks}
            mcqCount={mcqCount}
            shortQuestionCount={shortQuestionCount}
            longQuestionCount={longQuestionCount}
            shortMarksPerQuestion={shortMarksPerQuestion}
            longMarksPerQuestion={longMarksPerQuestion}
            balanceFeedback={balanceFeedback}
            onSyncTargetMarks={() => setTotalMarks(markDistribution.totalQuestionMarks)}
          />

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
