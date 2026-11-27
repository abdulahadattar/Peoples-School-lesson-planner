import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, FileText, Hash, Sparkles } from 'lucide-react';
import { PaperConfig } from '../types';
import { SelectionApi } from '../hooks/useSelection';
import {
  CLASSROOM_MCQ_MAX,
  CLASSROOM_MCQ_MIN,
  clampClassroomMcqCount,
} from '../services/omr/classroomRanking';
import { suggestNextTestNumber, todayIsoDate } from '../services/omr/testRegistry';
import type { ClassroomTestFrequency } from '../services/omr/types';
import Spinner from './ui/Spinner';
import SegmentedControl, { EXPORT_FORMATS } from './ui/SegmentedControl';
import SelectField from './ui/SelectField';
import { NumberField } from './ui/NumberField';
import { PaperPresetSelector, PaperPreset } from './paper/PaperPresetSelector';
import { PaperSelectToolbar } from './paper/PaperSelectToolbar';
import { PaperSectionsList } from './paper/PaperSectionsList';
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
  } = selection;

  const [mcqCount, setMcqCount] = useState<number>(30);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [testFrequency, setTestFrequency] = useState<ClassroomTestFrequency>('weekly');
  const [testNumber, setTestNumber] = useState<string>(() => suggestNextTestNumber('', 'IX'));
  const [testDate, setTestDate] = useState<string>(() => todayIsoDate());
  const [activePresetId, setActivePresetId] = useState<string>('weekly-30');
  const [balanceFeedback, setBalanceFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSubjectId && selectedClassId) {
      setTestNumber(suggestNextTestNumber(selectedSubjectId, selectedClassId));
    }
  }, [selectedSubjectId, selectedClassId]);

  const safeMcqCount = useMemo(() => clampClassroomMcqCount(mcqCount), [mcqCount]);

  const markDistribution = useMemo(() => {
    return {
      mcqMarks: safeMcqCount,
      shortMarks: 0,
      longMarks: 0,
      shortAttempt: 0,
      longAttempt: 0,
      totalQuestionMarks: safeMcqCount,
    };
  }, [safeMcqCount]);

  const applyPreset = (preset: PaperPreset) => {
    setActivePresetId(preset.id);
    setMcqCount(preset.mcq);
    setDurationMinutes(preset.duration);
    setTestFrequency(preset.testFrequency);
    setBalanceFeedback(`Applied ${preset.name}`);
    setTimeout(() => setBalanceFeedback(null), 2500);
  };

  const handleGenerate = () => {
    const finalCount = clampClassroomMcqCount(mcqCount);
    const config: PaperConfig = {
      gradeId: selectedClassId,
      subjectId: selectedSubjectId,
      chapterId: selectedChapterId,
      totalMarks: finalCount,
      mcqCount: finalCount,
      shortQuestionCount: 0,
      shortAttemptCount: 0,
      shortMarksPerQuestion: 0,
      longQuestionCount: 0,
      longAttemptCount: 0,
      longMarksPerQuestion: 0,
      durationMinutes,
      difficulty,
      omrMeta: {
        enabled: true,
        testFrequency,
        testNumber: testNumber.trim() || 'Test #01',
        testDate: testDate || todayIsoDate(),
      },
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
  } else if (safeMcqCount < CLASSROOM_MCQ_MIN || safeMcqCount > CLASSROOM_MCQ_MAX) {
    disabledReason = 'Classroom tests require 30–50 MCQs';
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
                <FileText className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                New Exam Paper
              </h2>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="w-full sm:w-auto">
                <SegmentedControl
                  value={exportFormat}
                  onChange={onExportFormatChange}
                  options={EXPORT_FORMATS}
                />
              </div>
              <SelectField
                aria-label="Question difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                options={DIFFICULTY_OPTIONS.map((d) => ({ value: d.value, label: d.label }))}
                size="sm"
                inline
                prefixLabel="Difficulty"
                dropdownWidth="compact"
                searchable={false}
              />
            </div>
          </div>

          <PaperSelectToolbar selection={selection} />

          {/* Test Cadence, Test Number & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-brand-border bg-slate-50/70 dark:bg-slate-900/35">
            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1.5">
                Test Cadence
              </label>
              <SegmentedControl
                size="sm"
                value={testFrequency}
                onChange={(val) => setTestFrequency(val as ClassroomTestFrequency)}
                options={[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1.5">
                Test Number
              </label>
              <div className="relative">
                <Hash className="w-3.5 h-3.5 text-brand-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Test Number"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="Test #01"
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-border bg-white dark:bg-slate-900 text-brand-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1.5">
                Test Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-brand-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  aria-label="Test Date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-border bg-white dark:bg-slate-900 text-brand-text-primary"
                />
              </div>
            </div>
          </div>

          <PaperPresetSelector activePresetId={activePresetId} onSelectPreset={applyPreset} />

          <PaperSectionsList
            markDistribution={markDistribution}
            mcqCount={safeMcqCount}
            setMcqCount={(n) => {
              setMcqCount(clampClassroomMcqCount(n));
              setActivePresetId('');
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <NumberField
              label="Test Duration (Minutes)"
              value={durationMinutes}
              min={15}
              max={90}
              step={5}
              hint="Recommended 1 min per MCQ"
              onChange={setDurationMinutes}
            />
            <div className="p-3.5 rounded-xl border border-brand-border bg-slate-50/80 dark:bg-slate-900/40 text-xs space-y-1">
              <div className="font-bold text-brand-text-primary flex items-center justify-between">
                <span>Test Summary</span>
                <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {safeMcqCount} MCQs · {safeMcqCount} Marks
                </span>
              </div>
              <p className="text-[11px] text-brand-text-secondary">
                {testFrequency === 'monthly' ? 'Monthly' : 'Weekly'} Test · Linked to OMR Scanner.
              </p>
              {balanceFeedback && (
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {balanceFeedback}
                </p>
              )}
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.985 }}
            type="button"
            id="generate-exam-paper-btn"
            onClick={handleGenerate}
            disabled={isDisabled}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-[color,background-color,border-color,box-shadow] min-h-[48px] cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Spinner className="w-4 h-4" />
                <span>Generating {safeMcqCount}-MCQ Classroom Test...</span>
              </>
            ) : disabledReason ? (
              <span>{disabledReason}</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  Generate {testFrequency === 'monthly' ? 'Monthly' : 'Weekly'} MCQ Paper ({safeMcqCount} MCQs)
                </span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default PaperPanel;
