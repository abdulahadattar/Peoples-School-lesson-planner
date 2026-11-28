import React, { useState } from 'react';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Coffee } from 'lucide-react';
import { Teacher } from '../../../types';
import { DayKey, DAY_KEYS, DAY_LABELS } from '../../../services/timetable';
import { TeacherMasterSchedule } from '../../../services/timetableConflictEngine';
import SelectField from '../../ui/SelectField';

const SHORT_DAY_LABELS: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

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
  const [selectedMobileDay, setSelectedMobileDay] = useState<DayKey>('mon');

  return (
    <div className="space-y-4">
      {/* Faculty Selector & Workload Metric Bar */}
      <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-brand-text-secondary flex items-center gap-2">
            <span>Select Faculty Member</span>
            <span className="text-brand-text-tertiary font-mono tabular-nums">
              · {teachers.length} active
            </span>
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="w-full sm:w-80">
              <SelectField
                aria-label="Select Faculty Member"
                value={selectedTeacherId}
                onChange={(e) => onSelectTeacherId(e.target.value)}
                size="sm"
                searchable
                dropdownWidth="wide"
                options={teachers
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => ({
                    value: t.id,
                    label: t.name,
                    sublabel: t.subjects.map((s) => s.name).join(', '),
                    badge: t.designation || 'Teacher',
                  }))}
              />
            </div>

            <button
              type="button"
              onClick={onExportSingleTeacherExcel}
              className="w-full sm:w-auto justify-center text-xs px-3 py-2 min-h-[40px] rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="Download selected teacher weekly timetable as Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Export Faculty Schedule</span>
            </button>
          </div>
        </div>

        {teacherSchedule && (
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-stretch gap-2 sm:gap-3">
            <div className="px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
              <div className="text-[11px] font-medium text-brand-text-secondary">Weekly Load</div>
              <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-brand-text-primary mt-0.5">
                {teacherSchedule.totalTeachingPeriods} <span className="text-[11px] font-sans font-normal">periods</span>
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-center min-w-0">
              <div className="text-[11px] font-medium text-brand-text-secondary">Classes</div>
              <div className="text-xs font-bold text-brand-text-primary mt-1 truncate">
                {teacherSchedule.classesTaught.join(', ') || 'None'}
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
              <div className="text-[11px] font-medium text-brand-text-secondary">Clash Status</div>
              <div
                className={`text-xs font-bold mt-1 inline-flex items-center gap-1 ${
                  teacherSchedule.clashCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {teacherSchedule.clashCount > 0 ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{teacherSchedule.clashCount} Clash{teacherSchedule.clashCount > 1 ? 'es' : ''}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Clear</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Day-by-Day Faculty Schedule */}
      {teacherSchedule && (
        <div className="md:hidden space-y-3">
          <div
            role="tablist"
            aria-label="Select faculty schedule day"
            className="grid grid-cols-6 gap-1 p-1 rounded-xl bg-brand-panel border border-brand-border"
          >
            {DAY_KEYS.map((dKey) => {
              const active = selectedMobileDay === dKey;
              return (
                <button
                  key={dKey}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedMobileDay(dKey)}
                  className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'text-brand-text-secondary hover:text-brand-text-primary'
                  }`}
                >
                  {SHORT_DAY_LABELS[dKey]}
                </button>
              );
            })}
          </div>

          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5, 6, 7].map((periodNo) => {
              const pIdx = periodNo - 1;
              const isBreakAfter = periodNo === 4;
              const slots = teacherSchedule.weeklySchedule[selectedMobileDay].filter(
                (s) => s.periodNo === periodNo
              );

              return (
                <React.Fragment key={periodNo}>
                  <div className="p-3.5 rounded-2xl bg-brand-surface border border-brand-border space-y-2">
                    <div className="text-[11px] font-bold text-brand-primary">
                      Period {periodNo} · {DAY_LABELS[selectedMobileDay]}
                    </div>

                    {slots.length === 0 ? (
                      <div className="text-xs text-brand-text-secondary italic">
                        Free (Staff Room)
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {slots.map((slot, sIdx) => {
                          const isClash = slots.length > 1;
                          return (
                            <button
                              key={sIdx}
                              type="button"
                              onClick={() => onOpenCellEditor(selectedMobileDay, pIdx, slot.classLabel)}
                              className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                                isClash
                                  ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                                  : 'border-brand-primary/30 bg-brand-primary/5 text-brand-text-primary'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs font-bold">
                                <span>Class {slot.classLabel}</span>
                                {isClash && (
                                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                    Clash
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-brand-text-secondary mt-0.5">
                                {slot.subject}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {isBreakAfter && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/75 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center justify-center gap-2">
                      <Coffee className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Recess Break (Staff Room)</span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Desktop Teacher Weekly Grid */}
      {teacherSchedule && (
        <div className="hidden md:block bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
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
                                  className={`w-full text-left p-2 rounded-xl border transition-[color,background-color,border-color] mb-1 last:mb-0 ${
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
