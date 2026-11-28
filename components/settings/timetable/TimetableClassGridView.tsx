import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Sparkles,
  Copy,
  RotateCcw,
  AlertTriangle,
  Coffee,
} from 'lucide-react';
import { Teacher } from '../../../types';
import {
  TimetableClassEntry,
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
} from '../../../services/timetable';
import {
  parseTimetableCell,
  checkTeacherAvailability,
  TimetableAuditReport,
} from '../../../services/timetableConflictEngine';
import { ClassSelectorBar } from './ClassSelectorBar';
import { MobileTimetableDayList } from './MobileTimetableDayList';

export interface ClassTabItem {
  key: string;
  label: string;
}

export interface TimetableClassGridViewProps {
  filteredClasses: ClassTabItem[];
  classList: TimetableClassEntry[];
  classFilter: string;
  setClassFilter: (val: string) => void;
  selectedClassLabel: string;
  setSelectedClassLabel: (label: string) => void;
  selectedClassInfo?: TimetableClassEntry;
  currentEntry: TimetableClassEntry;
  auditReport: TimetableAuditReport;
  timetableMap: Record<string, TimetableClassEntry>;
  teachers: Teacher[];
  onOpenCellEditor: (dayKey: DayKey, periodIndex: number) => void;
  onExportSingleClassExcel: () => void;
  onAutoFillEmptySlots: () => void;
  onCopyDayToWeekdays: (day: DayKey) => void;
  onResetClass: () => void;
}

export const TimetableClassGridView: React.FC<TimetableClassGridViewProps> = ({
  filteredClasses,
  classList,
  classFilter,
  setClassFilter,
  selectedClassLabel,
  setSelectedClassLabel,
  selectedClassInfo,
  currentEntry,
  auditReport,
  timetableMap,
  teachers,
  onOpenCellEditor,
  onExportSingleClassExcel,
  onAutoFillEmptySlots,
  onCopyDayToWeekdays,
  onResetClass,
}) => {
  const [selectedMobileDay, setSelectedMobileDay] = useState<DayKey>('mon');

  return (
    <div className="space-y-4">
      <ClassSelectorBar
        filteredClasses={filteredClasses}
        totalClassCount={classList.length}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        selectedClassLabel={selectedClassLabel}
        setSelectedClassLabel={setSelectedClassLabel}
        auditReport={auditReport}
      />

      {/* Class Meta & Quick Action Bar */}
      <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="shrink-0 min-w-[48px] h-12 px-2 rounded-2xl bg-brand-primary/10 flex items-center justify-center font-bold text-brand-primary text-sm sm:text-base border border-brand-primary/20 whitespace-nowrap">
            {selectedClassLabel}
          </div>
          <div className="min-w-0">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-0.5 sm:gap-1.5">
              <h4 className="text-sm font-bold text-brand-text-primary">
                Class {selectedClassLabel} Weekly Timetable
              </h4>
              <span className="text-xs text-brand-text-secondary">
                <span className="hidden sm:inline mr-1.5" aria-hidden="true">·</span>
                Advisor: <strong className="text-brand-text-primary">{selectedClassInfo?.classTeacher || 'Unassigned'}</strong>
              </span>
            </div>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Select any period slot to assign subjects, swap teachers, or resolve clashes.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onExportSingleClassExcel}
            className="text-xs px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Download this specific class timetable as Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Export {selectedClassLabel}</span>
          </button>
          <button
            type="button"
            onClick={onAutoFillEmptySlots}
            className="text-xs px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Fill empty slots using conflict-free subjects from class curriculum"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Auto-Fill Slots</span>
          </button>
          <button
            type="button"
            onClick={() => onCopyDayToWeekdays('mon')}
            className="text-xs px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Copy Monday's subjects to Tue, Wed, Thu"
          >
            <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Copy Mon–Thu</span>
          </button>
          <button
            type="button"
            onClick={onResetClass}
            className="text-xs px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-xl bg-brand-bg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 border border-brand-border transition-colors font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Revert this class to base institutional timetable"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Reset Class</span>
          </button>
        </div>
      </div>

      {/* Mobile Day-by-Day Period Stack */}
      <MobileTimetableDayList
        selectedDay={selectedMobileDay}
        onSelectDay={setSelectedMobileDay}
        currentEntry={currentEntry}
        selectedClassLabel={selectedClassLabel}
        timetableMap={timetableMap}
        teachers={teachers}
        onOpenCellEditor={onOpenCellEditor}
      />

      {/* Desktop Weekly Schedule Grid */}
      <div className="hidden md:block bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-semibold">
                <th className="py-3 px-3.5 w-28">Period</th>
                <th className="py-3 px-3.5 w-32">Timing</th>
                {DAY_KEYS.map((dKey) => (
                  <th key={dKey} className="py-3 px-3 font-bold text-brand-text-primary">
                    {DAY_LABELS[dKey]}
                    {dKey === 'fri' && (
                      <span className="ml-1 text-[10px] text-amber-600 font-normal">(Short Day)</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {currentEntry.periods.map((period, pIdx) => {
                const isBreakAfter = pIdx === 3;

                return (
                  <React.Fragment key={period.no}>
                    <tr className="hover:bg-brand-bg/30 transition-colors">
                      <td className="py-3 px-3.5 font-bold text-brand-text-primary">
                        Period {period.no}
                      </td>
                      <td className="py-3 px-3.5 text-brand-text-secondary text-[11px] leading-tight">
                        <div>{period.start} - {period.end}</div>
                        {period.friStart && period.friEnd && period.friStart !== '—' && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400">
                            Fri: {period.friStart} - {period.friEnd}
                          </div>
                        )}
                      </td>
                      {DAY_KEYS.map((dKey) => {
                        const cellVal = period[dKey] || '—';
                        const parsed = parseTimetableCell(cellVal, selectedClassLabel, teachers);

                        const clashingTeacher = parsed.teachers.find((t) => {
                          const avail = checkTeacherAvailability(
                            t.id,
                            dKey,
                            pIdx,
                            timetableMap,
                            selectedClassLabel,
                            teachers
                          );
                          return avail.isBusy;
                        });

                        let clashNotice = '';
                        if (clashingTeacher) {
                          const avail = checkTeacherAvailability(
                            clashingTeacher.id,
                            dKey,
                            pIdx,
                            timetableMap,
                            selectedClassLabel,
                            teachers
                          );
                          clashNotice = `Clash: ${clashingTeacher.name} busy in ${avail.busyInClass}`;
                        }

                        return (
                          <td key={dKey} className="py-2 px-2.5">
                            <button
                              type="button"
                              onClick={() => onOpenCellEditor(dKey, pIdx)}
                              className={`w-full text-left p-2.5 rounded-xl border transition-[color,background-color,border-color,box-shadow] relative cursor-pointer ${
                                parsed.empty
                                  ? 'border-dashed border-brand-border/70 hover:border-brand-primary/50 text-brand-text-secondary/50 bg-brand-bg/20'
                                  : clashingTeacher
                                  ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-brand-text-primary shadow-xs ring-1 ring-rose-400'
                                  : 'border-brand-border hover:border-brand-primary bg-brand-bg/60 hover:bg-brand-bg text-brand-text-primary shadow-xs'
                              }`}
                            >
                              {parsed.empty ? (
                                <div className="text-[11px] font-medium text-brand-text-secondary/60">
                                  + Assign Slot
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-xs truncate text-brand-text-primary">
                                    {parsed.label}
                                  </div>
                                  {parsed.teachers.length > 0 ? (
                                    <div className="text-[10px] text-brand-text-secondary truncate">
                                      {parsed.teachers.map((t) => t.name).join(', ')}
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                      No teacher assigned
                                    </div>
                                  )}
                                  {clashNotice && (
                                    <div className="text-[9px] font-bold text-rose-600 dark:text-rose-400 truncate inline-flex items-center gap-1">
                                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                                      <span>{clashNotice}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>

                    {isBreakAfter && (
                      <tr className="bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 font-semibold border-y border-amber-200/60 dark:border-amber-800/40">
                        <td colSpan={8} className="py-2.5 px-4 text-center text-xs tracking-wide">
                          <span className="inline-flex items-center gap-1.5">
                            <Coffee className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Recess Break (10:50 AM – 11:20 AM · Friday: 10:00 AM – 10:30 AM)</span>
                          </span>
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
    </div>
  );
};
