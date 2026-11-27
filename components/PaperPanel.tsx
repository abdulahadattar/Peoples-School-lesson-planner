import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, FileText, Hash, QrCode, Sparkles } from 'lucide-react';
import { PaperConfig, PaperFormat } from '../types';
import { SelectionApi } from '../hooks/useSelection';
import { suggestNextTestNumber, todayIsoDate } from '../services/omr/testRegistry';
import type { ClassroomTestFrequency } from '../services/omr/types';
import {
  balanceSectionsForTotalMarks,
  getDefaultPresetForFormat,
} from '../services/paper/paperFormatPresets';
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

const PAPER_FORMAT_OPTIONS = [
  { value: 'full', label: 'Full Paper (A+B+C)' },
  { value: 'section_ab', label: 'Section A + B' },
  { value: 'mcq_only', label: 'MCQ Unit Test' },
];

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

  const [paperFormat, setPaperFormat] = useState<PaperFormat>('full');
  const [mcqCount, setMcqCount] = useState<number>(15);
  const [mcqMarksPerQuestion, setMcqMarksPerQuestion] = useState<number>(1);
  const [shortQuestionCount, setShortQuestionCount] = useState<number>(13);
  const [shortAttemptCount, setShortAttemptCount] = useState<number>(9);
  const [shortMarksPerQuestion, setShortMarksPerQuestion] = useState<number>(4);
  const [longQuestionCount, setLongQuestionCount] = useState<number>(5);
  const [longAttemptCount, setLongAttemptCount] = useState<number>(3);
  const [longMarksPerQuestion, setLongMarksPerQuestion] = useState<number>(8);
  const [durationMinutes, setDurationMinutes] = useState<number>(150);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [includeOmrForPaper, setIncludeOmrForPaper] = useState<boolean>(true);
  const [testFrequency, setTestFrequency] = useState<ClassroomTestFrequency>('monthly');
  const [testNumber, setTestNumber] = useState<string>(() => suggestNextTestNumber('', 'IX'));
  const [testDate, setTestDate] = useState<string>(() => todayIsoDate());
  const [activePresetId, setActivePresetId] = useState<string>('full-75');
  const [balanceFeedback, setBalanceFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSubjectId && selectedClassId) {
      setTestNumber(suggestNextTestNumber(selectedSubjectId, selectedClassId));
    }
  }, [selectedSubjectId, selectedClassId]);

  const markDistribution = useMemo(() => {
    const safeMcq = Math.max(0, mcqCount);
    const activeShortQ = paperFormat === 'mcq_only' ? 0 : Math.max(0, shortQuestionCount);
    const activeShortAttempt = paperFormat === 'mcq_only' ? 0 : Math.min(Math.max(0, shortAttemptCount), activeShortQ);
    const activeLongQ = paperFormat === 'full' ? Math.max(0, longQuestionCount) : 0;
    const activeLongAttempt = paperFormat === 'full' ? Math.min(Math.max(0, longAttemptCount), activeLongQ) : 0;

    const mcqMarks = safeMcq * mcqMarksPerQuestion;
    const shortMarks = activeShortAttempt * (shortMarksPerQuestion || 0);
    const longMarks = activeLongAttempt * (longMarksPerQuestion || 0);
    return {
      mcqMarks,
      shortMarks,
      longMarks,
      shortAttempt: activeShortAttempt,
      longAttempt: activeLongAttempt,
      totalQuestionMarks: mcqMarks + shortMarks + longMarks,
    };
  }, [
    paperFormat,
    mcqCount,
    mcqMarksPerQuestion,
    shortQuestionCount,
    shortAttemptCount,
    shortMarksPerQuestion,
    longQuestionCount,
    longAttemptCount,
    longMarksPerQuestion,
  ]);

  const applyPreset = (preset: PaperPreset) => {
    setPaperFormat(preset.format);
    setActivePresetId(preset.id);
    setMcqCount(preset.mcq);
    setMcqMarksPerQuestion(preset.mcqMarks || 1);
    setShortQuestionCount(preset.shortCount);
    setShortAttemptCount(preset.shortAttempt);
    setShortMarksPerQuestion(preset.shortMarks || 4);
    setLongQuestionCount(preset.longCount);
    setLongAttemptCount(preset.longAttempt);
    setLongMarksPerQuestion(preset.longMarks || 8);
    setDurationMinutes(preset.duration);
    setTestFrequency(preset.testFrequency);
    setBalanceFeedback(`Applied ${preset.name}`);
    setTimeout(() => setBalanceFeedback(null), 2500);
  };

  const handleFormatChange = (nextFormat: PaperFormat) => {
    if (nextFormat === paperFormat) return;
    applyPreset(getDefaultPresetForFormat(nextFormat));
  };

  const handleTotalMarksChange = (targetTotal: number) => {
    const balanced = balanceSectionsForTotalMarks(paperFormat, targetTotal);
    setActivePresetId('');
    setMcqCount(balanced.mcqCount);
    setMcqMarksPerQuestion(balanced.mcqMarksPerQuestion);
    setShortQuestionCount(balanced.shortQuestionCount);
    setShortAttemptCount(balanced.shortAttemptCount);
    setShortMarksPerQuestion(balanced.shortMarksPerQuestion);
    setLongQuestionCount(balanced.longQuestionCount);
    setLongAttemptCount(balanced.longAttemptCount);
    setLongMarksPerQuestion(balanced.longMarksPerQuestion);
    setBalanceFeedback(`Adjusted sections to ${balanced.totalMarks} Marks`);
    setTimeout(() => setBalanceFeedback(null), 2500);
  };

  const handleGenerate = () => {
    const activeShortQ = paperFormat === 'mcq_only' ? 0 : Math.max(0, shortQuestionCount);
    const activeShortAttempt = paperFormat === 'mcq_only' ? 0 : Math.min(Math.max(0, shortAttemptCount), activeShortQ);
    const activeLongQ = paperFormat === 'full' ? Math.max(0, longQuestionCount) : 0;
    const activeLongAttempt = paperFormat === 'full' ? Math.min(Math.max(0, longAttemptCount), activeLongQ) : 0;
    const omrEnabled = paperFormat === 'mcq_only' || (includeOmrForPaper && mcqCount > 0);

    const config: PaperConfig = {
      gradeId: selectedClassId,
      subjectId: selectedSubjectId,
      chapterId: selectedChapterId,
      paperFormat,
      totalMarks: markDistribution.totalQuestionMarks,
      mcqCount,
      mcqMarksPerQuestion,
      shortQuestionCount: activeShortQ,
      shortAttemptCount: activeShortAttempt,
      shortMarksPerQuestion: activeShortQ > 0 ? shortMarksPerQuestion : 0,
      longQuestionCount: activeLongQ,
      longAttemptCount: activeLongAttempt,
      longMarksPerQuestion: activeLongQ > 0 ? longMarksPerQuestion : 0,
      durationMinutes,
      difficulty,
      ...(omrEnabled
        ? {
            omrMeta: {
              enabled: true,
              testFrequency,
              testNumber: testNumber.trim() || 'Test #01',
              testDate: testDate || todayIsoDate(),
              ...(paperFormat === 'full' ? { examType: 'midterm' as const } : {}),
            },
          }
        : {}),
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
    disabledReason = 'Add at least 1 question across sections';
  }

  const canGenerate = !disabledReason;
  const isDisabled = isGenerating || !canGenerate;

  const formatButtonTitle =
    paperFormat === 'full'
      ? `Generate Full Question Paper (${markDistribution.totalQuestionMarks} Marks)`
      : paperFormat === 'section_ab'
        ? `Generate Section A + B Paper (${markDistribution.totalQuestionMarks} Marks)`
        : `Generate MCQ Unit Test (${mcqCount} MCQs)`;

  return (
    <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-white dark:bg-brand-surface border border-black/[0.06] dark:border-white/[0.08] shadow-soft">
        <div className="p-6 sm:p-8 space-y-6">
          <div className="border-b border-black/[0.06] dark:border-white/[0.08] pb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <FileText className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  New Question Paper
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <SegmentedControl
                  value={exportFormat}
                  onChange={onExportFormatChange}
                  options={EXPORT_FORMATS}
                />
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

            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1.5">
                Paper Format
              </label>
              <SegmentedControl
                value={paperFormat}
                onChange={(val) => handleFormatChange(val as PaperFormat)}
                options={PAPER_FORMAT_OPTIONS}
              />
            </div>
          </div>

          <PaperSelectToolbar selection={selection} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            <NumberField
              label="Total Marks"
              value={markDistribution.totalQuestionMarks}
              min={5}
              max={200}
              step={5}
              hint="Balances section counts automatically"
              onChange={handleTotalMarksChange}
            />
            <NumberField
              label="Time Allowed (Minutes)"
              value={durationMinutes}
              min={15}
              max={240}
              step={15}
              hint={`${Math.floor(durationMinutes / 60) > 0 ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m` : `${durationMinutes} mins`}`}
              onChange={setDurationMinutes}
            />
            <div className="p-3.5 rounded-xl border border-brand-border bg-slate-50/80 dark:bg-slate-900/40 text-xs space-y-1">
              <div className="font-bold text-brand-text-primary flex items-center justify-between">
                <span>Paper Summary</span>
                <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {markDistribution.totalQuestionMarks} Marks · {durationMinutes}m
                </span>
              </div>
              <p className="text-[11px] text-brand-text-secondary tabular-nums">
                Sec A: {markDistribution.mcqMarks}M
                {paperFormat !== 'mcq_only' ? ` · Sec B: ${markDistribution.shortMarks}M` : ''}
                {paperFormat === 'full' ? ` · Sec C: ${markDistribution.longMarks}M` : ''}
              </p>
              {balanceFeedback && (
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {balanceFeedback}
                </p>
              )}
            </div>
          </div>

          <PaperPresetSelector
            paperFormat={paperFormat}
            activePresetId={activePresetId}
            onSelectPreset={applyPreset}
          />

          <PaperSectionsList
            paperFormat={paperFormat}
            markDistribution={markDistribution}
            mcqCount={mcqCount}
            mcqMarksPerQuestion={mcqMarksPerQuestion}
            setMcqCount={(n) => {
              setMcqCount(n);
              setActivePresetId('');
            }}
            shortQuestionCount={shortQuestionCount}
            shortAttemptCount={shortAttemptCount}
            shortMarksPerQuestion={shortMarksPerQuestion}
            setShortQuestionCount={(n) => {
              setShortQuestionCount(n);
              if (shortAttemptCount > n) setShortAttemptCount(n);
              setActivePresetId('');
            }}
            setShortAttemptCount={(n) => {
              setShortAttemptCount(Math.min(n, shortQuestionCount));
              setActivePresetId('');
            }}
            setShortMarksPerQuestion={(n) => {
              setShortMarksPerQuestion(n);
              setActivePresetId('');
            }}
            longQuestionCount={longQuestionCount}
            longAttemptCount={longAttemptCount}
            longMarksPerQuestion={longMarksPerQuestion}
            setLongQuestionCount={(n) => {
              setLongQuestionCount(n);
              if (longAttemptCount > n) setLongAttemptCount(n);
              setActivePresetId('');
            }}
            setLongAttemptCount={(n) => {
              setLongAttemptCount(Math.min(n, longQuestionCount));
              setActivePresetId('');
            }}
            setLongMarksPerQuestion={(n) => {
              setLongMarksPerQuestion(n);
              setActivePresetId('');
            }}
          />

          {mcqCount > 0 && (
            <div className="p-4 rounded-xl border border-brand-border bg-slate-50/70 dark:bg-slate-900/35 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-text-primary">
                  <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Answer Key &amp; OMR Bubble Sheet</span>
                </div>
                {paperFormat !== 'mcq_only' && (
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-brand-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeOmrForPaper}
                      onChange={(e) => setIncludeOmrForPaper(e.target.checked)}
                      className="rounded border-brand-border accent-blue-600"
                    />
                    <span>Link OMR sheet for Section A MCQs</span>
                  </label>
                )}
              </div>

              {(paperFormat === 'mcq_only' || includeOmrForPaper) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              )}
            </div>
          )}

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
                <span>Generating Question Paper...</span>
              </>
            ) : disabledReason ? (
              <span>{disabledReason}</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{formatButtonTitle}</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default PaperPanel;
