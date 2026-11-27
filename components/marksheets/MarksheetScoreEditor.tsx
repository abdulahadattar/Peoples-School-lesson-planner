import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, LogIn, Plus } from 'lucide-react';
import { SearchInput } from '../ui/SearchInput';
import SegmentedControl from '../ui/SegmentedControl';
import SelectField from '../ui/SelectField';
import { isHsscGrade } from '../../services/marksheet/calculations';
import {
  ComputedStudentMarksheet,
  MarksheetGradeLevel,
  MarksheetRosterStudent,
  OptionalElective,
  OptionalLanguage,
  SubjectKey,
} from '../../services/marksheet/types';

export interface MarksheetScoreEditorProps {
  isAdmin: boolean;
  isSignedIn: boolean;
  hasPendingEdit?: boolean;
  roster: MarksheetRosterStudent[];
  selectedIndex: number;
  grInput: string;
  unmatchedGrQuery: string;
  defaultGradeLevel: MarksheetGradeLevel;
  onGrInputChange: (val: string) => void;
  onCreateCustomStudent: (gr: string, grade: MarksheetGradeLevel, name?: string) => void;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  onPrevStudent: () => void;
  onNextStudent: () => void;
  activeMarksheet: ComputedStudentMarksheet | null;
  onScoreChange: (subject: SubjectKey, value: string) => void;
  onOptionalLanguageChange: (lang: OptionalLanguage) => void;
  onOptionalElectiveChange: (elective: OptionalElective) => void;
  onSignIn: () => void;
}

export const MarksheetScoreEditor: React.FC<MarksheetScoreEditorProps> = ({
  isAdmin,
  isSignedIn,
  hasPendingEdit = false,
  roster,
  selectedIndex,
  grInput,
  unmatchedGrQuery,
  defaultGradeLevel,
  onGrInputChange,
  onCreateCustomStudent,
  searchQuery,
  onSearchQueryChange,
  onPrevStudent,
  onNextStudent,
  activeMarksheet,
  onScoreChange,
  onOptionalLanguageChange,
  onOptionalElectiveChange,
  onSignIn,
}) => {
  const [customGrade, setCustomGrade] = useState<MarksheetGradeLevel>(defaultGradeLevel);
  const [customName, setCustomName] = useState('');
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const isHssc = activeMarksheet ? isHsscGrade(activeMarksheet.student.gradeLevel) : false;

  useEffect(() => {
    setCustomGrade(defaultGradeLevel);
  }, [defaultGradeLevel]);

  useEffect(() => {
    setScoreDrafts({});
  }, [activeMarksheet?.student.grNo, activeMarksheet?.examType]);

  return (
    <aside className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-3.5 sm:p-4 space-y-4 sm:space-y-5 print:hidden">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-brand-text-primary">
            Student Lookup by GR No
          </h2>
          {roster.length > 0 && (
            <span className="text-xs text-brand-text-secondary tabular-nums">
              {selectedIndex + 1} / {roster.length}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevStudent}
              disabled={roster.length === 0}
              aria-label="Previous student"
              className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={grInput}
              onChange={(e) => onGrInputChange(e.target.value)}
              placeholder="GR No (e.g. 4)"
              aria-label="Enter GR No"
              className="flex-1 min-w-0 min-h-[40px] px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-sm font-semibold text-brand-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />

            <button
              type="button"
              onClick={onNextStudent}
              disabled={roster.length === 0}
              aria-label="Next student"
              className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <SearchInput
            value={searchQuery}
            onChange={onSearchQueryChange}
            placeholder="Search name, father, or GR..."
            inputClassName="min-h-[40px] py-1.5 text-xs"
          />

          {roster.length > 0 && (
            <SelectField
              aria-label="Select student from list"
              value={activeMarksheet?.student.grNo || ''}
              onChange={(e) => onGrInputChange(e.target.value)}
              size="sm"
              searchable
              dropdownWidth="match"
              options={roster.map((st) => ({
                value: st.grNo,
                label: st.studentName,
                badge: `GR ${st.grNo}`,
                sublabel: `Grade ${st.gradeLevel}${st.section ? ` ${st.section}` : ''}`,
              }))}
            />
          )}
        </div>

        {unmatchedGrQuery && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-2">
            <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
              GR #{unmatchedGrQuery} is not in the IX–XII register.
            </p>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Student name (optional)"
                  aria-label="Custom student name"
                  className="flex-1 min-w-[120px] min-h-[34px] px-2 py-1 rounded-lg border border-brand-border bg-white dark:bg-brand-surface text-xs text-brand-text-primary"
                />
                <SelectField
                  aria-label="Custom student grade"
                  value={customGrade}
                  onChange={(e) => setCustomGrade(e.target.value as MarksheetGradeLevel)}
                  size="sm"
                  inline
                  dropdownWidth="compact"
                  searchable={false}
                  options={[
                    { value: 'IX', label: 'IX' },
                    { value: 'X', label: 'X' },
                    { value: 'XI', label: 'XI' },
                    { value: 'XII', label: 'XII' },
                  ]}
                />
                <button
                  type="button"
                  onClick={() => {
                    onCreateCustomStudent(unmatchedGrQuery, customGrade, customName);
                    setCustomName('');
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-brand-primary text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {activeMarksheet ? (
        <div className="space-y-4 pt-4 border-t border-brand-border/70">
          {hasPendingEdit && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-medium text-blue-800 dark:text-blue-200">
              <span>
                {isAdmin
                  ? 'Pending update ready to push to Google Sheet.'
                  : isSignedIn
                    ? 'Saved to school storage — awaiting admin approval.'
                    : 'Saved locally — sign in to send to Admin.'}
              </span>
              {!isSignedIn && (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <LogIn className="w-3 h-3" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary">
              Optional Subjects ({activeMarksheet.sectionTier})
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-brand-text-secondary mb-1">
                Language Group
              </label>
              <SegmentedControl
                size="sm"
                value={activeMarksheet.optionalLanguage}
                onChange={(val) => onOptionalLanguageChange(val as OptionalLanguage)}
                options={[
                  { value: 'Sindhi', label: 'Sindhi' },
                  { value: 'Urdu', label: 'Urdu' },
                ]}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-brand-text-secondary mb-1">
                {isHssc ? 'HSSC Elective' : 'SSC Elective'}
              </label>
              <SegmentedControl
                size="sm"
                value={activeMarksheet.optionalElective}
                onChange={(val) => onOptionalElectiveChange(val as OptionalElective)}
                options={
                  isHssc
                    ? [
                        { value: 'Biology', label: 'Biology' },
                        { value: 'Mathematics', label: 'Maths' },
                      ]
                    : [
                        { value: 'Biology', label: 'Biology' },
                        { value: 'ICT', label: 'ICT' },
                      ]
                }
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-brand-border/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary">
                Subject Marks
              </h3>
              <span className="text-[11px] text-brand-text-secondary">Enter score or A</span>
            </div>

            <div className="space-y-1.5">
              {activeMarksheet.subjects.map((subj) => (
                <div
                  key={subj.key}
                  className="flex items-center justify-between gap-2 py-1 border-b border-brand-border/40 last:border-b-0"
                >
                  <label
                    htmlFor={`score-${subj.key}`}
                    className="text-xs font-medium text-brand-text-primary truncate"
                  >
                    {subj.label}
                  </label>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      id={`score-${subj.key}`}
                      type="text"
                      inputMode="decimal"
                      value={
                        scoreDrafts[subj.key] !== undefined
                          ? scoreDrafts[subj.key]
                          : subj.obtained === null
                            ? ''
                            : String(subj.obtained)
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        setScoreDrafts((prev) => ({ ...prev, [subj.key]: val }));
                        onScoreChange(subj.key, val);
                      }}
                      onBlur={() => {
                        setScoreDrafts((prev) => {
                          if (!(subj.key in prev)) return prev;
                          const next = { ...prev };
                          delete next[subj.key];
                          return next;
                        });
                      }}
                      placeholder="—"
                      className="w-16 min-h-[36px] px-2 py-1 text-right rounded-lg border border-brand-border bg-brand-bg text-xs font-semibold text-brand-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                    />
                    <span className="text-[11px] text-brand-text-secondary tabular-nums w-8">
                      / {subj.maxMarks}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-brand-text-secondary">
          No matching student found for GR input or active filter.
        </div>
      )}
    </aside>
  );
};
