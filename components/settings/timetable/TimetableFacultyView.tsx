import React from 'react';
import { Teacher } from '../../../types';
import { DayKey, DAY_KEYS, DAY_LABELS } from '../../../services/timetable';
import { TeacherMasterSchedule } from '../../../services/timetableConflictEngine';

export interface TimetableFacultyViewProps {
  teachers: Teacher[];
  selectedTeacherId: string;
  onSelectTeacherId: (id: string) => void;
  onExportSingleTeacherExcel: () => void;
  teacherSchedule: TeacherMasterSchedule | null;
  onOpenCellEditor: (dayKey: DayKey, periodIndex: number, classLabel: string) => void;
}

export const TimetableFacultyView: React.FC<TimetableFacultyViewProps> = ({
  teachers,
  selectedTeacherId,
  onSelectTeacherId,
  onExportSingleTeacherExcel,
  teacherSchedule,
  onOpenCellEditor,
}) => {
  return (
    <div className="space-y-4">
      {/* Faculty Selector & Workload Metric Bar */}
      <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider flex items-center gap-2">
            <span>Select Faculty Member:</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-bg text-brand-text-secondary font-medium">
              {teachers.length} faculty registered
            </span>
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedTeacherId}
              onChange={e => onSelectTeacherId(e.target.value)}
              className="w-full sm:w-80 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-bg border border-brand-border focus:border-brand-primary text-brand-text-primary outline-hidden"
            >
              {teachers
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.subjects.map(s => s.name).join(', ')} ({t.designation || 'Teacher'})
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={onExportSingleTeacherExcel}
              className="text-xs px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors font-semibold flex items-center gap-1.5 whitespace-nowrap"
              title="Download selected teacher weekly timetable as Excel"
            >
              <span>📊 Export Faculty Schedule</span>
            </button>
          </div>
        </div>

        {teacherSchedule && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
              <div className="text-[10px] uppercase font-bold text-brand-text-secondary">Weekly Load</div>
              <div className="text-base font-bold text-brand-text-primary">
                {teacherSchedule.totalTeachingPeriods} <span className="text-xs font-normal">periods</span>
              </div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
              <div className="text-[10px] uppercase font-bold text-brand-text-secondary">Classes Taught</div>
              <div className="text-xs font-bold text-brand-text-primary">
                {teacherSchedule.classesTaught.join(', ') || 'None'}
              </div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
              <div className="text-[10px] uppercase font-bold text-brand-text-secondary">Clash Status</div>
              <div className={`text-xs font-bold ${teacherSchedule.clashCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {teacherSchedule.clashCount > 0 ? `⚠️ ${teacherSchedule.clashCount} Clashes` : '✓ Conflict Free'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Teacher Weekly Grid */}
      {teacherSchedule && (
        <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-semibold">
                  <th className="py-3 px-3.5 w-24">Period</th>
                  {DAY_KEYS.map(dKey => (
                    <th key={dKey} className="py-3 px-3 font-bold text-brand-text-primary">
                      {DAY_LABELS[dKey]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {[1, 2, 3, 4, 5, 6, 7].map(periodNo => {
                  const pIdx = periodNo - 1;
                  const isBreakAfter = periodNo === 4;

                  return (
                    <React.Fragment key={periodNo}>
                      <tr className="hover:bg-brand-bg/30 transition-colors">
                        <td className="py-3 px-3.5 font-bold text-brand-text-primary">
                          Period {periodNo}
                        </td>
                        {DAY_KEYS.map(dKey => {
                          const slots = teacherSchedule.weeklySchedule[dKey].filter(
                            s => s.periodNo === periodNo
                          );

                          if (slots.length === 0) {
                            return (
                              <td key={dKey} className="py-2.5 px-3">
                                <div className="p-2 rounded-xl border border-dashed border-brand-border/60 bg-brand-bg/10 text-brand-text-secondary/50 text-[11px] font-medium text-center">
                                  Free (Staff Room)
                                </div>
                              </td>
                            );
                          }

                          const isClash = slots.length > 1;

                          return (
                            <td key={dKey} className="py-2.5 px-3">
                              {slots.map((slot, sIdx) => (
                                <button
                                  type="button"
                                  key={sIdx}
                                  onClick={() => onOpenCellEditor(dKey, pIdx, slot.classLabel)}
                                  className={`w-full text-left p-2 rounded-xl border transition-all mb-1 last:mb-0 ${
                                    isClash
                                      ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 active:bg-rose-100 dark:active:bg-rose-950/70'
                                      : 'border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 active:bg-brand-primary/20 text-brand-text-primary'
                                  }`}
                                >
                                  <div className="font-bold text-xs flex items-center justify-between">
                                    <span>Class {slot.classLabel}</span>
                                    {isClash && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-rose-600 text-white font-bold">
                                        CLASH
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-brand-text-secondary truncate mt-0.5">
                                    {slot.subject}
                                  </div>
                                  {slot.clashingWithClass && (
                                    <div className="text-[9px] text-rose-600 dark:text-rose-400 font-medium">
                                      Double-booked with Class {slot.clashingWithClass}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </td>
                          );
                        })}
                      </tr>

                      {isBreakAfter && (
                        <tr className="bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 font-semibold border-y border-amber-200/60 dark:border-amber-800/40">
                          <td colSpan={7} className="py-2 px-4 text-center text-xs tracking-wider uppercase">
                            ☕ Recess Break (Staff Room)
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
