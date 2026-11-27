import React from 'react';
import { Award, CheckCircle2, KeyRound, Save, ScanLine, UserCheck } from 'lucide-react';
import type { MarksheetExamType } from '../../services/marksheet/types';
import { formatTestFrequencyLabel } from '../../services/omr/classroomRanking';
import {
  ClassroomTestFrequency,
  OMR_ANSWER_LETTERS,
  OmrDetectedMark,
  OmrScanResult,
} from '../../services/omr/types';
import { SegmentedControl } from '../ui/SegmentedControl';

export interface OmrOverridePanelProps {
  scanResult: OmrScanResult | null;
  effectiveAnswers: OmrDetectedMark[];
  computedStats: {
    score: number;
    total: number;
    correctCount: number;
    wrongCount: number;
    blankCount: number;
    multiCount: number;
  };
  grNumber: string;
  onGrNumberChange: (val: string) => void;
  matchedStudentName: string | null;
  matchedFatherName: string | null;
  onOverrideQuestion: (qIdx: number, nextMark: OmrDetectedMark) => void;
  onSaveUpdatedRow: () => void;
  targetExamType: MarksheetExamType;
  onTargetExamTypeChange: (exam: MarksheetExamType) => void;
  onPushToMarksheet: () => void;
  lastSavedSummary: string | null;
  identifiedFrequency?: ClassroomTestFrequency;
  identifiedTestNumber?: string | null;
  identifiedTestDate?: string | null;
  onDownloadKeyPdf?: () => void;
}

const MARK_CYCLE: OmrDetectedMark[] = ['A', 'B', 'C', 'D', 'BLANK'];

export const OmrOverridePanel: React.FC<OmrOverridePanelProps> = ({
  scanResult,
  effectiveAnswers,
  computedStats,
  grNumber,
  onGrNumberChange,
  matchedStudentName,
  matchedFatherName,
  onOverrideQuestion,
  onSaveUpdatedRow,
  targetExamType,
  onTargetExamTypeChange,
  onPushToMarksheet,
  lastSavedSummary,
  identifiedFrequency,
  identifiedTestNumber,
  identifiedTestDate,
  onDownloadKeyPdf,
}) => {
  if (!scanResult) {
    return (
      <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-6 flex flex-col items-center justify-center text-center min-h-[260px] gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
          <ScanLine className="w-5 h-5" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h2 className="text-base font-bold text-brand-text-primary">
            Ready to Grade OMR Sheet
          </h2>
          <p className="text-xs text-brand-text-secondary">
            Scan, upload, or load a sample sheet to grade answers and save marks.
          </p>
        </div>
      </div>
    );
  }

  const key = scanResult.qrPayload.key;

  return (
    <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Auto-Detected Test Metadata Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-brand-border/70">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-base font-bold text-brand-text-primary">
              {scanResult.qrPayload.ttl || `${scanResult.qrPayload.sub} Classroom Test`}
            </h2>
            {identifiedTestNumber && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {identifiedTestNumber}
              </span>
            )}
          </div>
          <p className="text-xs text-brand-text-secondary">
            {formatTestFrequencyLabel(identifiedFrequency)} · Class {scanResult.qrPayload.cls} ·{' '}
            <strong>{scanResult.qrPayload.sub}</strong>
            {identifiedTestDate ? ` · ${identifiedTestDate}` : ''} ·{' '}
            <span className="font-mono">{scanResult.qrPayload.pid}</span>
          </p>
          {onDownloadKeyPdf && (
            <button
              type="button"
              onClick={onDownloadKeyPdf}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
            >
              <KeyRound className="w-3 h-3" />
              <span>Download Matched Answer Key (PDF)</span>
            </button>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-brand-text-primary">
            {computedStats.score}
            <span className="text-sm font-medium text-brand-text-tertiary">/{computedStats.total}</span>
          </div>
          <p className="text-[11px] text-brand-text-secondary tabular-nums">
            {computedStats.correctCount} right · {computedStats.wrongCount} wrong ·{' '}
            {computedStats.blankCount + computedStats.multiCount} flagged
          </p>
        </div>
      </div>

      {/* Student GR Lookup & Verified Profile */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
        <div className="sm:col-span-4 min-w-0">
          <label
            htmlFor="scanner-gr-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1"
          >
            Student GR Number
          </label>
          <input
            id="scanner-gr-input"
            type="text"
            value={grNumber}
            onChange={(e) => onGrNumberChange(e.target.value)}
            placeholder="e.g. 1042"
            className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-brand-border bg-brand-bg text-brand-text-primary tabular-nums"
          />
        </div>

        <div className="sm:col-span-8 rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-brand-text-secondary text-[11px]">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Student Roster Lookup</span>
          </div>
          {matchedStudentName ? (
            <p className="mt-0.5 font-semibold text-brand-text-primary">
              {matchedStudentName}
              {matchedFatherName ? (
                <span className="font-normal text-brand-text-secondary">
                  {' '}
                  · S/D/O {matchedFatherName}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-0.5 text-brand-text-secondary">
              GR #{grNumber || '—'} not in cached register (will appear under GR #{grNumber || '—'})
            </p>
          )}
        </div>
      </div>

      {/* Interactive Q1..Qn Teacher Override Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-brand-text-primary">
            Answer Review (Click any question to edit)
          </span>
          <span className="text-[11px] text-brand-text-tertiary">Key shown on mismatch</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
          {effectiveAnswers.map((ans, qIdx) => {
            const expected = key[qIdx];
            const isCorrect = ans === expected;
            const isFlagged =
              ans === 'BLANK' ||
              ans === 'MULTI' ||
              scanResult.flaggedQuestions.includes(qIdx + 1);
            const cycleNext = () => {
              const curIdx = MARK_CYCLE.indexOf(ans);
              const next = MARK_CYCLE[(curIdx + 1) % MARK_CYCLE.length];
              onOverrideQuestion(qIdx, next);
            };

            return (
              <div
                key={qIdx}
                className={`rounded-xl border px-2.5 py-2 text-xs flex flex-col gap-1.5 ${
                  ans === 'MULTI' || ans === 'BLANK'
                    ? 'border-amber-400/70 bg-amber-50/70 dark:bg-amber-950/30'
                    : isCorrect
                      ? 'border-emerald-300/70 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-rose-300/70 bg-rose-50/50 dark:bg-rose-950/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={cycleNext}
                    title={`Click to cycle Q${qIdx + 1} (Key: ${expected})`}
                    className="font-mono font-bold text-brand-text-primary hover:underline cursor-pointer tabular-nums"
                  >
                    Q{qIdx + 1}: {ans === 'BLANK' ? '—' : ans}
                  </button>
                  <span className="text-[10px] font-mono text-brand-text-secondary">
                    {isFlagged && ans !== expected
                      ? `Key:${expected}`
                      : isCorrect
                        ? '✓'
                        : `Key:${expected}`}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {OMR_ANSWER_LETTERS.map((ltr) => (
                    <button
                      key={ltr}
                      type="button"
                      onClick={() => onOverrideQuestion(qIdx, ltr)}
                      aria-label={`Set Q${qIdx + 1} to ${ltr}`}
                      className={`flex-1 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                        ans === ltr
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'bg-white/80 dark:bg-slate-800/80 text-brand-text-secondary hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {ltr}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onOverrideQuestion(qIdx, 'BLANK')}
                    aria-label={`Set Q${qIdx + 1} to Blank`}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                      ans === 'BLANK'
                        ? 'bg-amber-600 text-white'
                        : 'bg-white/80 dark:bg-slate-800/80 text-brand-text-secondary hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    –
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {lastSavedSummary && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 flex items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{lastSavedSummary}</span>
        </div>
      )}

      <div className="pt-1 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-brand-text-secondary">
            Marksheet Target Term
          </span>
          <div className="w-60">
            <SegmentedControl
              size="sm"
              value={targetExamType}
              options={[
                { value: 'midterm', label: 'Mid-Term' },
                { value: 'mock', label: 'Mock' },
                { value: 'preboard', label: 'Pre-Board' },
              ]}
              onChange={(val) => onTargetExamTypeChange(val as MarksheetExamType)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            id="omr-save-student-result-btn"
            onClick={onSaveUpdatedRow}
            disabled={!grNumber.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm disabled:opacity-45 cursor-pointer transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>
              Save Result ({computedStats.score}/{computedStats.total})
            </span>
          </button>

          <button
            type="button"
            id="omr-push-marksheet-btn"
            onClick={onPushToMarksheet}
            disabled={!grNumber.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-sm disabled:opacity-45 cursor-pointer transition-colors"
          >
            <Award className="w-4 h-4" />
            <span>Save to Marksheet</span>
          </button>
        </div>
      </div>
    </div>
  );
};
