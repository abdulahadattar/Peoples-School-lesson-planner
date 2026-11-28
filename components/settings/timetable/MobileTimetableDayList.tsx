import React from 'react';
import { AlertTriangle, Coffee, Plus } from 'lucide-react';
import { Teacher } from '../../../types';
import {
  DAY_KEYS,
  DAY_LABELS,
  DayKey,
  TimetableClassEntry,
} from '../../../services/timetable';
import {
  checkTeacherAvailability,
  parseTimetableCell,
} from '../../../services/timetableConflictEngine';

const SHORT_DAY_LABELS: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

export interface MobileTimetableDayListProps {
  selectedDay: DayKey;
  onSelectDay: (day: DayKey) => void;
  currentEntry: TimetableClassEntry;
  selectedClassLabel: string;
  timetableMap: Record<string, TimetableClassEntry>;
  teachers: Teacher[];
  onOpenCellEditor: (dayKey: DayKey, periodIndex: number) => void;
}

export const MobileTimetableDayList: React.FC<MobileTimetableDayListProps> = ({
  selectedDay,
  onSelectDay,
  currentEntry,
  selectedClassLabel,
  timetableMap,
  teachers,
  onOpenCellEditor,
}) => {
  return (
    <div className="md:hidden space-y-3">
      {/* Touch-friendly 6-day selector */}
      <div
        role="tablist"
        aria-label="Select weekday schedule"
        className="grid grid-cols-6 gap-1 p-1 rounded-xl bg-brand-panel border border-brand-border"
      >
        {DAY_KEYS.map((day) => {
          const active = selectedDay === day;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectDay(day)}
              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                active
                  ? 'bg-brand-primary text-white shadow-xs'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <span>{SHORT_DAY_LABELS[day]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-brand-text-secondary">
        <span className="font-semibold text-brand-text-primary">{DAY_LABELS[selectedDay]}</span>
        {selectedDay === 'fri' && (
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
            Short Day Schedule
          </span>
        )}
      </div>

      {/* Stacked Period Cards */}
      <div className="space-y-2.5">
        {currentEntry.periods.map((period, pIdx) => {
          const isBreakAfter = pIdx === 3;
          const cellVal = period[selectedDay] || '—';
          const parsed = parseTimetableCell(cellVal, selectedClassLabel, teachers);

          const clashingTeacher = parsed.teachers.find((t) => {
            const avail = checkTeacherAvailability(
              t.id,
              selectedDay,
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
              selectedDay,
              pIdx,
              timetableMap,
              selectedClassLabel,
              teachers
            );
            clashNotice = `Clash: ${clashingTeacher.name} busy in ${avail.busyInClass}`;
          }

          const timingText =
            selectedDay === 'fri' && period.friStart && period.friEnd && period.friStart !== '—'
              ? `${period.friStart} – ${period.friEnd}`
              : `${period.start} – ${period.end}`;

          return (
            <React.Fragment key={period.no}>
              <button
                type="button"
                onClick={() => onOpenCellEditor(selectedDay, pIdx)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-colors cursor-pointer space-y-1.5 ${
                  parsed.empty
                    ? 'border-dashed border-brand-border bg-brand-surface/70 hover:border-brand-primary/60'
                    : clashingTeacher
                    ? 'border-rose-400 bg-rose-50/75 dark:bg-rose-950/40'
                    : 'border-brand-border bg-brand-surface hover:border-brand-primary/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-brand-primary">Period {period.no}</span>
                  <span className="font-mono tabular-nums text-brand-text-secondary">
                    {timingText}
                  </span>
                </div>

                {parsed.empty ? (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-brand-text-secondary pt-0.5">
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tap to assign subject & faculty</span>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-brand-text-primary">{parsed.label}</div>
                    <div className="text-xs text-brand-text-secondary">
                      {parsed.teachers.length > 0
                        ? parsed.teachers.map((t) => t.name).join(', ')
                        : 'No teacher assigned'}
                    </div>
                    {clashNotice && (
                      <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 pt-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{clashNotice}</span>
                      </div>
                    )}
                  </div>
                )}
              </button>

              {isBreakAfter && (
                <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/75 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center justify-center gap-2">
                  <Coffee className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Recess Break · {selectedDay === 'fri' ? '10:00 AM – 10:30 AM' : '10:50 AM – 11:20 AM'}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
