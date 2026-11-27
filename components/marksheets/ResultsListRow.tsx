import React from 'react';
import { FileText } from 'lucide-react';
import { SUBJECT_LABELS } from '../../services/marksheet/config';
import type {
  MarksheetGradeLevel,
  MarksheetRosterStudent,
  OptionalElective,
  OptionalLanguage,
  SubjectKey,
} from '../../services/marksheet/types';

export interface OptionalGroupControl {
  kind: 'language' | 'elective';
  label: string;
  current: string;
  mismatch: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function buildOptionalControl(params: {
  resultsSubject: SubjectKey;
  hssc: boolean;
  optionalLanguage: OptionalLanguage;
  optionalElective: OptionalElective;
}): OptionalGroupControl | null {
  const { resultsSubject, hssc, optionalLanguage, optionalElective } = params;
  if (resultsSubject === 'sindhi' || resultsSubject === 'urdu') {
    return {
      kind: 'language',
      label: 'Language Group',
      current: optionalLanguage,
      mismatch:
        (resultsSubject === 'sindhi' && optionalLanguage !== 'Sindhi') ||
        (resultsSubject === 'urdu' && optionalLanguage !== 'Urdu'),
      options: [
        { value: 'Sindhi', label: 'Sindhi' },
        { value: 'Urdu', label: 'Urdu' },
      ],
    };
  }
  if (
    resultsSubject === 'biology' ||
    resultsSubject === 'ict' ||
    (hssc && resultsSubject === 'mathematics')
  ) {
    return {
      kind: 'elective',
      label: hssc ? 'HSSC Elective' : 'SSC Elective',
      current: optionalElective,
      mismatch:
        (resultsSubject === 'biology' && optionalElective !== 'Biology') ||
        (resultsSubject === 'ict' && optionalElective !== 'ICT') ||
        (hssc && resultsSubject === 'mathematics' && optionalElective !== 'Mathematics'),
      options: [
        { value: 'Biology', label: 'Biology' },
        hssc ? { value: 'Mathematics', label: 'Math' } : { value: 'ICT', label: 'ICT' },
      ],
    };
  }
  return null;
}

export interface ResultsListRowProps {
  student: MarksheetRosterStudent;
  resultsSubject: SubjectKey;
  maxMarks: number;
  displayVal: string;
  isAbsent: boolean;
  hasPendingForSubject: boolean;
  optionalControl: OptionalGroupControl | null;
  hasOptionalColumn: boolean;
  onDraftChange: (value: string) => void;
  onDraftClear: () => void;
  onScoreChange: (student: MarksheetRosterStudent, subject: SubjectKey, value: string) => void;
  onOptionalChange: (
    student: MarksheetRosterStudent,
    patch: { optionalLanguage?: OptionalLanguage; optionalElective?: OptionalElective }
  ) => void;
  onOpenMarksheet: (grNo: string, gradeLevel: MarksheetGradeLevel) => void;
}

export const ResultsListRow: React.FC<ResultsListRowProps> = ({
  student,
  resultsSubject,
  maxMarks,
  displayVal,
  isAbsent,
  hasPendingForSubject,
  optionalControl,
  hasOptionalColumn,
  onDraftChange,
  onDraftClear,
  onScoreChange,
  onOptionalChange,
  onOpenMarksheet,
}) => {
  const desktopGridClass = hasOptionalColumn
    ? 'md:grid md:grid-cols-[84px_minmax(180px,1fr)_172px_196px_44px] md:items-center md:gap-3'
    : 'md:grid md:grid-cols-[84px_minmax(220px,1fr)_196px_44px] md:items-center md:gap-3';

  return (
    <div
      className={`px-3.5 py-3 sm:px-4 flex flex-col gap-2.5 ${desktopGridClass} hover:bg-slate-50/75 dark:hover:bg-slate-800/35 transition-colors`}
    >
      {/* GR No (desktop Col 1) + Name (mobile inline) */}
      <div className="flex items-center justify-between gap-2 md:block">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-xs font-bold text-brand-text-secondary tabular-nums shrink-0">
            GR {student.grNo}
          </span>
          <span className="text-sm font-semibold text-brand-text-primary truncate md:hidden">
            {student.studentName}
          </span>
        </div>
        {hasPendingForSubject && (
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0 md:hidden">
            Pending
          </span>
        )}
      </div>

      {/* Student & Father Name (desktop Col 2, mobile subtitle) */}
      <div className="min-w-0 -mt-1.5 md:mt-0">
        <div className="hidden md:flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-brand-text-primary truncate">
            {student.studentName}
          </span>
          {hasPendingForSubject && (
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
              · Pending
            </span>
          )}
        </div>
        {student.fatherName && (
          <p className="text-xs text-brand-text-secondary truncate">
            {student.fatherName}
          </p>
        )}
      </div>

      {/* Persistent Reversible Optional Language / Elective Toggle */}
      {hasOptionalColumn && optionalControl && (
        <div className="flex items-center justify-between md:justify-start gap-2">
          <span className="text-[11px] font-medium text-brand-text-secondary md:hidden">
            {optionalControl.label}
          </span>
          <div className="flex flex-col items-end md:items-start gap-0.5">
            <div
              role="group"
              aria-label={`${optionalControl.label} for GR ${student.grNo} ${student.studentName}`}
              className={`inline-flex items-center p-0.5 rounded-lg border ${
                optionalControl.mismatch
                  ? 'border-amber-500/45 bg-amber-500/10'
                  : 'border-brand-border/80 bg-slate-100/90 dark:bg-slate-800/80'
              }`}
            >
              {optionalControl.options.map((opt) => {
                const isActive = optionalControl.current === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      if (optionalControl.kind === 'language') {
                        onOptionalChange(student, {
                          optionalLanguage: opt.value as OptionalLanguage,
                        });
                      } else {
                        onOptionalChange(student, {
                          optionalElective: opt.value as OptionalElective,
                        });
                      }
                    }}
                    className={`min-h-[30px] px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-white dark:bg-brand-surface text-brand-primary font-semibold shadow-2xs'
                        : 'text-brand-text-secondary hover:text-brand-text-primary font-medium'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {optionalControl.mismatch && (
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                Set to {optionalControl.current}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Marks Input + Max + Absent Button */}
      <div className="flex items-center justify-between md:justify-end gap-2 pt-0.5 md:pt-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={displayVal}
            aria-label={`${SUBJECT_LABELS[resultsSubject]} marks for GR ${student.grNo} ${student.studentName}`}
            onChange={(e) => {
              const v = e.target.value;
              onDraftChange(v);
              onScoreChange(student, resultsSubject, v);
            }}
            onBlur={onDraftClear}
            placeholder="—"
            className={`w-[78px] min-h-[42px] px-2.5 py-1.5 text-right rounded-xl border bg-brand-bg text-sm font-semibold text-brand-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ${
              hasPendingForSubject
                ? 'border-blue-500 ring-1 ring-blue-500/25'
                : 'border-brand-border'
            }`}
          />

          <span className="text-xs text-brand-text-secondary tabular-nums w-9 shrink-0">
            / {maxMarks}
          </span>

          <button
            type="button"
            onClick={() => {
              onDraftClear();
              onScoreChange(student, resultsSubject, isAbsent ? '' : 'A');
            }}
            aria-label={`Mark GR ${student.grNo} Absent`}
            aria-pressed={isAbsent}
            className={`min-h-[42px] min-w-[42px] px-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
              isAbsent
                ? 'border-red-500 bg-red-500/15 text-red-700 dark:text-red-300'
                : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            A
          </button>
        </div>

        {/* Mobile inline Marksheet shortcut */}
        <button
          type="button"
          onClick={() => onOpenMarksheet(student.grNo, student.gradeLevel)}
          title={`Open Marksheet for GR ${student.grNo}`}
          aria-label={`Open Marksheet for GR ${student.grNo}`}
          className="md:hidden min-h-[42px] min-w-[42px] px-2.5 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-secondary hover:text-brand-text-primary flex items-center justify-center cursor-pointer transition-colors"
        >
          <FileText className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop Marksheet Shortcut (Col 5) */}
      <div className="hidden md:flex justify-end">
        <button
          type="button"
          onClick={() => onOpenMarksheet(student.grNo, student.gradeLevel)}
          title={`Open Marksheet for GR ${student.grNo}`}
          aria-label={`Open Marksheet for GR ${student.grNo}`}
          className="min-h-[40px] min-w-[40px] rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-secondary hover:text-brand-primary flex items-center justify-center cursor-pointer transition-colors"
        >
          <FileText className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
