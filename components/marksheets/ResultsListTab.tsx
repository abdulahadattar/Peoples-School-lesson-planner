import React, { useEffect, useMemo, useState } from 'react';
import { LogIn, Users } from 'lucide-react';
import { normalizeGrKey } from '../../services/identityNormalization';
import {
  getSubjectsForGrade,
  isHsscGrade,
  resolveActiveSubjects,
} from '../../services/marksheet/calculations';
import { EXAM_TYPE_LABELS, SUBJECT_LABELS } from '../../services/marksheet/config';
import type { MarksheetPendingEdit } from '../../services/marksheet/pendingEditsRepository';
import type {
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  MarksheetRosterStudent,
  OptionalElective,
  OptionalLanguage,
  StudentMarkEntry,
  SubjectKey,
} from '../../services/marksheet/types';
import { EmptyState } from '../ui/EmptyState';
import { SearchInput } from '../ui/SearchInput';
import { SegmentedControl } from '../ui/SegmentedControl';
import SelectField from '../ui/SelectField';
import { buildOptionalControl, ResultsListRow } from './ResultsListRow';

export interface ResultsListTabProps {
  config: MarksheetConfig;
  examType: MarksheetExamType;
  resultsGrade: MarksheetGradeLevel;
  onResultsGradeChange: (g: MarksheetGradeLevel) => void;
  resultsSubject: SubjectKey;
  onResultsSubjectChange: (s: SubjectKey) => void;
  classRoster: MarksheetRosterStudent[];
  examEntriesByGr: Record<string, StudentMarkEntry>;
  pendingEdits: MarksheetPendingEdit[];
  isSignedIn: boolean;
  isAdmin: boolean;
  onScoreChange: (student: MarksheetRosterStudent, subject: SubjectKey, value: string) => void;
  onOptionalChange: (
    student: MarksheetRosterStudent,
    patch: { optionalLanguage?: OptionalLanguage; optionalElective?: OptionalElective }
  ) => void;
  onOpenMarksheet: (grNo: string, gradeLevel: MarksheetGradeLevel) => void;
  onSignIn: () => void;
}

const GRADE_OPTIONS = [
  { value: 'IX', label: 'IX' },
  { value: 'X', label: 'X' },
  { value: 'XI', label: 'XI' },
  { value: 'XII', label: 'XII' },
] as const;

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'missing', label: 'Blank' },
] as const;

export const ResultsListTab: React.FC<ResultsListTabProps> = ({
  config,
  examType,
  resultsGrade,
  onResultsGradeChange,
  resultsSubject,
  onResultsSubjectChange,
  classRoster,
  examEntriesByGr,
  pendingEdits,
  isSignedIn,
  isAdmin,
  onScoreChange,
  onOptionalChange,
  onOpenMarksheet,
  onSignIn,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'missing'>('all');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts({});
  }, [resultsGrade, resultsSubject, examType]);

  const gradeSubjects = useMemo(() => getSubjectsForGrade(resultsGrade), [resultsGrade]);
  const maxMarks = config.subjectMaxMarks[examType]?.[resultsGrade]?.[resultsSubject] ?? 50;
  const hssc = isHsscGrade(resultsGrade);

  const pendingByGr = useMemo(() => {
    const map = new Map<string, MarksheetPendingEdit>();
    for (const edit of pendingEdits) {
      if (edit.examType === examType) {
        map.set(normalizeGrKey(edit.grNo), edit);
      }
    }
    return map;
  }, [pendingEdits, examType]);

  const enrichedRows = useMemo(() => {
    return classRoster.map((student) => {
      const entry =
        examEntriesByGr[student.grNo] || examEntriesByGr[normalizeGrKey(student.grNo)];
      const pendingEdit = pendingByGr.get(normalizeGrKey(student.grNo));
      const hasPendingForSubject = Boolean(
        pendingEdit && Object.prototype.hasOwnProperty.call(pendingEdit.scores || {}, resultsSubject)
      );
      const resolved = resolveActiveSubjects(resultsGrade, examType, config, entry);
      const rawVal = entry?.scores?.[resultsSubject];
      const hasScore = rawVal === 'A' || (typeof rawVal === 'number' && Number.isFinite(rawVal));
      return {
        student,
        rawVal: rawVal === undefined ? null : rawVal,
        hasScore,
        hasPendingForSubject,
        optionalLanguage: resolved.optionalLanguage,
        optionalElective: resolved.optionalElective,
      };
    });
  }, [classRoster, examEntriesByGr, pendingByGr, resultsSubject, resultsGrade, examType, config]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedRows.filter((row) => {
      if (q) {
        const hit =
          row.student.grNo.toLowerCase().includes(q) ||
          row.student.studentName.toLowerCase().includes(q) ||
          row.student.fatherName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter === 'pending') return row.hasPendingForSubject;
      if (statusFilter === 'missing') return !row.hasScore;
      return true;
    });
  }, [enrichedRows, search, statusFilter]);

  const enteredCount = useMemo(
    () => enrichedRows.filter((r) => r.hasScore).length,
    [enrichedRows]
  );
  const pendingSubjectCount = useMemo(
    () => enrichedRows.filter((r) => r.hasPendingForSubject).length,
    [enrichedRows]
  );

  const isOptionalLanguageSubject = resultsSubject === 'sindhi' || resultsSubject === 'urdu';
  const isOptionalElectiveSubject =
    resultsSubject === 'biology' ||
    resultsSubject === 'ict' ||
    (hssc && resultsSubject === 'mathematics');
  const hasOptionalColumn = isOptionalLanguageSubject || isOptionalElectiveSubject;

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== 'all';

  return (
    <section
      aria-label="Results List Marks Entry"
      className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-4 sm:p-5 space-y-4 shadow-soft print:hidden"
    >
      {/* Controls Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(200px,260px)_1fr_220px] gap-2.5 sm:gap-3 items-center">
        <SegmentedControl
          size="sm"
          value={resultsGrade}
          options={GRADE_OPTIONS}
          onChange={(val) => onResultsGradeChange(val as MarksheetGradeLevel)}
        />

        <SelectField
          aria-label="Select Subject"
          value={resultsSubject}
          onChange={(e) => onResultsSubjectChange(e.target.value as SubjectKey)}
          size="sm"
          searchable
          dropdownWidth="match"
          options={gradeSubjects.map((subj) => ({
            value: subj,
            label: SUBJECT_LABELS[subj],
          }))}
        />

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search student name or GR no..."
          aria-label="Filter students in results list"
          resultCount={search.trim() ? rows.length : undefined}
          inputClassName="min-h-[40px]"
        />

        <SegmentedControl
          size="sm"
          value={statusFilter}
          options={FILTER_OPTIONS}
          onChange={(val) => setStatusFilter(val as 'all' | 'pending' | 'missing')}
        />
      </div>

      {/* Summary Meta Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-text-secondary px-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-brand-text-primary">
            Class {resultsGrade} · {SUBJECT_LABELS[resultsSubject]}
          </span>
          <span aria-hidden="true">·</span>
          <span>{EXAM_TYPE_LABELS[examType]}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">Max {maxMarks}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            Entered <strong className="text-brand-text-primary">{enteredCount}</strong>/{classRoster.length}
          </span>
          {pendingSubjectCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                {pendingSubjectCount} pending {isAdmin ? 'approval' : 'review'}
              </span>
            </>
          )}
        </div>

        {!isSignedIn ? (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign in to submit changes</span>
          </button>
        ) : (
          <span className="text-[11px] text-brand-text-tertiary">
            Type marks or tap A for Absent
          </span>
        )}
      </div>

      {/* Structured Register List / Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-brand-border bg-brand-bg/30">
          <EmptyState
            compact
            icon={Users}
            title="No students match"
            description={
              hasActiveFilters
                ? 'Try clearing the search query or switching the status filter.'
                : `No enrolled students found for Class ${resultsGrade}.`
            }
            action={
              hasActiveFilters
                ? {
                    label: 'Reset Filters',
                    onClick: () => {
                      setSearch('');
                      setStatusFilter('all');
                    },
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-brand-border overflow-hidden bg-white dark:bg-brand-surface">
          <div
            className={`hidden md:grid ${
              hasOptionalColumn
                ? 'md:grid-cols-[84px_minmax(180px,1fr)_172px_196px_44px]'
                : 'md:grid-cols-[84px_minmax(220px,1fr)_196px_44px]'
            } items-center gap-3 px-4 py-2.5 bg-slate-50/90 dark:bg-slate-900/70 border-b border-brand-border text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary`}
          >
            <span>GR #</span>
            <span>Student</span>
            {hasOptionalColumn && (
              <span>{isOptionalLanguageSubject ? 'Language Group' : 'Elective Group'}</span>
            )}
            <span className="text-right pr-2">Marks / Absent</span>
            <span className="text-right">Card</span>
          </div>

          <div className="divide-y divide-brand-border/60">
            {rows.map(({ student, rawVal, hasPendingForSubject, optionalLanguage, optionalElective }) => {
              const draftKey = `${resultsGrade}::${resultsSubject}::${student.grNo}`;
              const displayVal =
                drafts[draftKey] !== undefined
                  ? drafts[draftKey]
                  : rawVal === null
                    ? ''
                    : String(rawVal);

              const optionalControl = buildOptionalControl({
                resultsSubject,
                hssc,
                optionalLanguage,
                optionalElective,
              });

              return (
                <ResultsListRow
                  key={student.grNo}
                  student={student}
                  resultsSubject={resultsSubject}
                  maxMarks={maxMarks}
                  displayVal={displayVal}
                  isAbsent={rawVal === 'A'}
                  hasPendingForSubject={hasPendingForSubject}
                  optionalControl={optionalControl}
                  hasOptionalColumn={hasOptionalColumn}
                  onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [draftKey]: v }))}
                  onDraftClear={() =>
                    setDrafts((prev) => {
                      if (!(draftKey in prev)) return prev;
                      const next = { ...prev };
                      delete next[draftKey];
                      return next;
                    })
                  }
                  onScoreChange={onScoreChange}
                  onOptionalChange={onOptionalChange}
                  onOpenMarksheet={onOpenMarksheet}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
