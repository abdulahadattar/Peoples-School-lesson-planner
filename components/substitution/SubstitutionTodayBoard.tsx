import React from 'react';
import { Teacher } from '../../types';
import { SubstitutionAssignment } from '../../services/substitutionService';
import SelectField from '../ui/SelectField';
import { UserIcon } from '../icons/MiscIcons';

export interface AffectedSlot {
  periodNo: number;
  periodIndex: number;
  classLabel: string;
  subjectName: string;
  absentTeacher: Teacher;
  freeTeachers: (Teacher & {
    thisWeekCount: number;
    teachesSameSubject: boolean;
    loadLevel: 'low' | 'moderate' | 'heavy';
  })[];
}

export interface SubstitutionTodayBoardProps {
  teachers: Teacher[];
  absentTeacherIds: string[];
  selectedTeacherToAdd: string;
  setSelectedTeacherToAdd: (id: string) => void;
  onMarkAbsent: () => void;
  onRemoveAbsent: (teacherId: string) => void;
  affectedSlots: AffectedSlot[];
  assignments: SubstitutionAssignment[];
  onAssignProxy: (slot: AffectedSlot, proxyTeacherId: string) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  coveredCount: number;
}

export const SubstitutionTodayBoard: React.FC<SubstitutionTodayBoardProps> = ({
  teachers,
  absentTeacherIds,
  selectedTeacherToAdd,
  setSelectedTeacherToAdd,
  onMarkAbsent,
  onRemoveAbsent,
  affectedSlots,
  assignments,
  onAssignProxy,
  onRemoveAssignment,
  coveredCount,
}) => {
  const absentTeachersList = absentTeacherIds
    .map(id => teachers.find(t => t.id === id))
    .filter((t): t is Teacher => !!t);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Mark Teacher Absent Input */}
      <div className="glass-card rounded-2xl p-4 border border-brand-border flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <SelectField
            id="absent-teacher-select"
            label="Mark Teacher Absent Today:"
            value={selectedTeacherToAdd}
            onChange={e => setSelectedTeacherToAdd(e.target.value)}
            placeholder="Select teacher..."
          >
            <option value="">Select teacher...</option>
            {teachers
              .filter(t => !absentTeacherIds.includes(t.id))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.designation || 'Teacher'})
                </option>
              ))}
          </SelectField>
        </div>
        <button
          type="button"
          onClick={onMarkAbsent}
          disabled={!selectedTeacherToAdd}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white transition-colors shadow-sm cursor-pointer"
        >
          + Mark Absent
        </button>
      </div>

      {/* Absent Teachers Chips */}
      {absentTeachersList.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
            Marked Absent Today ({absentTeachersList.length}):
          </label>
          <div className="flex flex-wrap gap-2">
            {absentTeachersList.map(teacher => (
              <span
                key={teacher.id}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 shadow-xs"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>{teacher.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAbsent(teacher.id)}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-rose-200 dark:hover:bg-rose-800 text-rose-600 dark:text-rose-400 transition-colors ml-0.5 cursor-pointer"
                  title="Remove absence"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border">
          <span className="text-[10px] uppercase font-bold text-brand-text-secondary block">
            Absent Faculty
          </span>
          <span className="text-lg font-extrabold text-rose-600 font-mono">
            {absentTeacherIds.length}
          </span>
        </div>
        <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border">
          <span className="text-[10px] uppercase font-bold text-brand-text-secondary block">
            Affected Slots
          </span>
          <span className="text-lg font-extrabold text-amber-600 font-mono">
            {affectedSlots.length}
          </span>
        </div>
        <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border">
          <span className="text-[10px] uppercase font-bold text-brand-text-secondary block">
            Proxies Assigned
          </span>
          <span className="text-lg font-extrabold text-emerald-600 font-mono">
            {coveredCount} / {affectedSlots.length}
          </span>
        </div>
      </div>

      {/* Vacant Slots Table */}
      {affectedSlots.length === 0 ? (
        <div className="text-center py-10 bg-brand-surface/40 rounded-2xl border border-dashed border-brand-border p-6">
          <h4 className="text-sm font-semibold text-brand-text-primary">
            {absentTeacherIds.length === 0
              ? 'No Teachers Marked Absent Today'
              : 'All Periods Covered or No Scheduled Classes'}
          </h4>
          <p className="text-xs text-brand-text-secondary mt-1">
            {absentTeacherIds.length === 0
              ? 'Select an absent teacher above to detect vacant periods and assign balanced proxy coverage.'
              : 'The marked teachers have no classes scheduled on this timetable day.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary">
              Vacant Periods Requiring Proxy Coverage ({affectedSlots.length})
            </h4>
            <span className="text-[11px] text-brand-text-secondary">
              💡 Recommendation engine prioritizes subject specialists and least-loaded teachers this week
            </span>
          </div>

          <div className="space-y-2.5">
            {affectedSlots.map(slot => {
              const currentAssignment = assignments.find(
                a =>
                  a.periodNo === slot.periodNo &&
                  a.classLabel === slot.classLabel &&
                  a.absentTeacherName === slot.absentTeacher.name
              );

              return (
                <div
                  key={`${slot.periodNo}_${slot.classLabel}_${slot.absentTeacher.id}`}
                  className="bg-brand-surface p-4 rounded-xl border border-brand-border hover:border-brand-primary/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                >
                  {/* Class & Slot Details */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-brand-primary/10 text-brand-primary">
                        Period {slot.periodNo}
                      </span>
                      <span className="text-sm font-bold text-brand-text-primary">
                        Class {slot.classLabel}
                      </span>
                      <span className="text-xs text-brand-text-secondary font-medium">
                        • {slot.subjectName}
                      </span>
                    </div>

                    <p className="text-xs text-brand-text-secondary">
                      Absent Teacher: <strong className="text-rose-600 font-medium">{slot.absentTeacher.name}</strong>
                    </p>
                  </div>

                  {/* Substitution Selection with Equity Hint */}
                  <div className="flex flex-wrap items-center gap-2">
                    {currentAssignment ? (
                      <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-xl">
                        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                          Proxy: {currentAssignment.proxyTeacherName}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveAssignment(currentAssignment.id)}
                          className="text-xs text-emerald-700 hover:text-red-600 font-bold ml-1 cursor-pointer"
                          title="Change or remove proxy"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-[320px]">
                        <div className="flex-1">
                          <SelectField
                            id={`proxy-select-${slot.periodNo}-${slot.classLabel}`}
                            value=""
                            onChange={e => {
                              if (e.target.value) {
                                onAssignProxy(slot, e.target.value);
                              }
                            }}
                            className="min-h-9 h-9 text-xs py-1"
                            placeholder={`Assign Free Teacher (${slot.freeTeachers.length} available)...`}
                          >
                            <option value="">
                              Assign Free Teacher ({slot.freeTeachers.length} available)...
                            </option>
                            {slot.freeTeachers.map(ft => {
                              let burdenTag = `${ft.thisWeekCount} this wk`;
                              if (ft.thisWeekCount === 0) burdenTag = '0 proxies this wk ⭐';
                              else if (ft.thisWeekCount >= 3) burdenTag = `⚠️ ${ft.thisWeekCount} proxies this wk`;

                              const subjectTag = ft.teachesSameSubject ? '• Subject Match' : '';

                              return (
                                <option key={ft.id} value={ft.id}>
                                  {ft.name} ({burdenTag} {subjectTag})
                                </option>
                              );
                            })}
                          </SelectField>
                        </div>
                        <span className="shrink-0 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-900/30 rounded-lg uppercase tracking-wide">
                          Unassigned
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
