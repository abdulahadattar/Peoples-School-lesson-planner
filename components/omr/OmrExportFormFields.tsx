import React from 'react';
import { FileSpreadsheet, Users } from 'lucide-react';
import { normalizeGradeLevel } from '../../services/marksheet/calculations';
import type { MarksheetGradeLevel } from '../../services/marksheet/types';
import {
  CLASSROOM_MCQ_MAX,
  CLASSROOM_MCQ_MIN,
  clampClassroomMcqCount,
  formatTestFrequencyLabel,
} from '../../services/omr/classroomRanking';
import type { OmrTestRecord } from '../../services/omr/testRegistry';
import { type ClassroomTestFrequency } from '../../services/omr/types';
import SelectField from '../ui/SelectField';
import SegmentedControl from '../ui/SegmentedControl';

const GRADE_OPTIONS: MarksheetGradeLevel[] = ['IX', 'X', 'XI', 'XII'];

export interface OmrExportFormFieldsProps {
  mode: 'batch' | 'blank';
  onModeChange: (m: 'batch' | 'blank') => void;
  savedTests: OmrTestRecord[];
  selectedSavedCode: string;
  onSelectSavedTest: (code: string) => void;
  hasLockedPaper: boolean;
  classLevel: string;
  onClassLevelChange: (v: string) => void;
  testFrequency: ClassroomTestFrequency;
  onTestFrequencyChange: (f: ClassroomTestFrequency) => void;
  questionCount: number;
  onQuestionCountChange: (n: number) => void;
  testNumber: string;
  onTestNumberChange: (v: string) => void;
  testDate: string;
  onTestDateChange: (v: string) => void;
  testCode: string;
  onTestCodeChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  answerKey: string;
  onAnswerKeyChange: (v: string) => void;
  normalizedKey: string;
}

export const OmrExportFormFields: React.FC<OmrExportFormFieldsProps> = ({
  mode,
  onModeChange,
  savedTests,
  selectedSavedCode,
  onSelectSavedTest,
  hasLockedPaper,
  classLevel,
  onClassLevelChange,
  testFrequency,
  onTestFrequencyChange,
  questionCount,
  onQuestionCountChange,
  testNumber,
  onTestNumberChange,
  testDate,
  onTestDateChange,
  testCode,
  onTestCodeChange,
  subject,
  onSubjectChange,
  title,
  onTitleChange,
  answerKey,
  onAnswerKeyChange,
  normalizedKey,
}) => {
  return (
    <>
      {!hasLockedPaper && savedTests.length > 0 && (
        <SelectField
          id="omr-saved-paper-select"
          label="Load Saved Classroom Test"
          value={selectedSavedCode}
          onChange={(e) => onSelectSavedTest(e.target.value)}
          size="sm"
          dropdownWidth="match"
          searchable={savedTests.length >= 6}
          options={[
            { value: '', label: 'Custom / Manual Classroom Test' },
            ...savedTests.map((t) => ({
              value: t.testCode,
              label: `${t.subject} (${t.classLevel})`,
              badge: t.testCode,
              sublabel: `${t.questionCount} MCQs · ${formatTestFrequencyLabel(t.testFrequency)} · ${t.testNumber}`,
            })),
          ]}
        />
      )}

      {/* Mode Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onModeChange('batch')}
          className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
            mode === 'batch'
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 ring-1 ring-blue-600/30'
              : 'border-brand-border hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Class Batch (Pre-filled GR)
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            1 page per student with Name, Father&apos;s Name &amp; QR-locked GR No.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onModeChange('blank')}
          className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
            mode === 'blank'
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 ring-1 ring-blue-600/30'
              : 'border-brand-border hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Blank Sheet (4-Digit GR Grid)
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reusable master A4 sheet for photocopy; students bubble their GR.
          </p>
        </button>
      </div>

      {/* Metadata Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SelectField
          id="omr-class-select"
          label="Class / Grade"
          size="sm"
          dropdownWidth="match"
          searchable={false}
          value={normalizeGradeLevel(classLevel) || classLevel}
          onChange={(e) => onClassLevelChange(e.target.value)}
          options={GRADE_OPTIONS.map((g) => ({ value: g, label: `Class ${g}` }))}
        />

        <div>
          <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
            Test Cadence
          </label>
          <SegmentedControl
            size="sm"
            value={testFrequency}
            onChange={(val) => onTestFrequencyChange(val === 'monthly' ? 'monthly' : 'weekly')}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </div>

        <div>
          <label
            htmlFor="omr-qcount-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1"
          >
            MCQ Count ({CLASSROOM_MCQ_MIN}–{CLASSROOM_MCQ_MAX})
          </label>
          <input
            id="omr-qcount-input"
            type="number"
            min={CLASSROOM_MCQ_MIN}
            max={CLASSROOM_MCQ_MAX}
            value={questionCount}
            onChange={(e) =>
              onQuestionCountChange(clampClassroomMcqCount(Number(e.target.value)))
            }
            className="w-full px-3 py-2 text-xs font-semibold tabular-nums rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="omr-test-num-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1"
          >
            Test Number
          </label>
          <input
            id="omr-test-num-input"
            type="text"
            value={testNumber}
            onChange={(e) => onTestNumberChange(e.target.value)}
            placeholder="e.g. Test #01"
            className="w-full px-3 py-2 text-xs rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary"
          />
        </div>
        <div>
          <label
            htmlFor="omr-test-date-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1"
          >
            Test Date
          </label>
          <input
            id="omr-test-date-input"
            type="date"
            value={testDate}
            onChange={(e) => onTestDateChange(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary"
          />
        </div>
        <div>
          <label
            htmlFor="omr-test-code-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1"
          >
            Unique Test Code
          </label>
          <input
            id="omr-test-code-input"
            type="text"
            value={testCode}
            onChange={(e) => onTestCodeChange(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="omr-subject-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1"
          >
            Subject
          </label>
          <input
            id="omr-subject-input"
            type="text"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary"
          />
        </div>
        <div>
          <label
            htmlFor="omr-title-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1"
          >
            Classroom Test Title
          </label>
          <input
            id="omr-title-input"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary"
          />
        </div>
      </div>

      {/* Answer Key String */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="omr-answer-key" className="text-xs font-semibold text-brand-text-secondary">
            Answer Key (Letters A–D saved with Test Code)
          </label>
          <span className="text-[11px] font-mono tabular-nums text-brand-text-tertiary">
            {answerKey.replace(/[^A-Da-d]/g, '').length}/{questionCount} set
          </span>
        </div>
        <input
          id="omr-answer-key"
          type="text"
          value={answerKey}
          onChange={(e) => onAnswerKeyChange(e.target.value.toUpperCase().replace(/[^A-D]/g, ''))}
          placeholder="e.g. ABCDABCD..."
          className="w-full px-3 py-2 text-xs font-mono tracking-widest rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary"
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
          Normalized key: <span className="font-mono font-semibold">{normalizedKey}</span>
        </p>
      </div>
    </>
  );
};
