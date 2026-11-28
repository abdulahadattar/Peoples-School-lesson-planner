import React from 'react';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { TimetableAuditReport } from '../../../services/timetableConflictEngine';
import { DayKey } from '../../../services/timetable';

export interface TimetableAuditorViewProps {
  auditReport: TimetableAuditReport;
  onResolveClash: (dayKey: DayKey, periodIndex: number, classLabel: string) => void;
}

export const TimetableAuditorView: React.FC<TimetableAuditorViewProps> = ({
  auditReport,
  onResolveClash,
}) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Tabular Diagnostics Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <div className="text-xs font-medium text-brand-text-secondary">Scheduled Sections</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-brand-text-primary mt-1">
            {auditReport.totalClassesCount}
          </div>
          <div className="text-[11px] text-brand-text-tertiary mt-0.5">Active weekly grids</div>
        </div>

        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <div className="text-xs font-medium text-brand-text-secondary">Evaluated Slots</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-brand-text-primary mt-1">
            {auditReport.totalSlots}
          </div>
          <div className="text-[11px] text-brand-text-tertiary mt-0.5">Mon–Sat teaching periods</div>
        </div>

        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <div className="text-xs font-medium text-brand-text-secondary">Clashes Detected</div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              auditReport.totalClashes > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {auditReport.totalClashes}
          </div>
          <div className="text-[11px] text-brand-text-tertiary mt-0.5">
            {auditReport.totalClashes === 0 ? 'No faculty double-bookings' : 'Double-booked faculty slots'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <div className="text-xs font-medium text-brand-text-secondary">Conflict-Free Classes</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {auditReport.cleanClassesCount} / {auditReport.totalClassesCount}
          </div>
          <div className="text-[11px] text-brand-text-tertiary mt-0.5">Zero-conflict sections</div>
        </div>
      </div>

      {/* Clash Resolution List */}
      <section className="bg-brand-surface rounded-2xl border border-brand-border p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-brand-text-primary">Teacher Double-Booking Audit</h2>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Verifies that no teacher is scheduled in two classes during the same day and period.
            </p>
          </div>
          {auditReport.unassigned.length > 0 && (
            <span className="text-xs font-mono tabular-nums text-brand-text-secondary">
              {auditReport.unassigned.length} unassigned slot{auditReport.unassigned.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {auditReport.clashes.length === 0 ? (
          <div className="py-10 text-center space-y-2 border-t border-brand-border/60">
            <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="text-sm font-bold text-brand-text-primary">
              No Timetable Clashes Found
            </div>
            <p className="text-xs text-brand-text-secondary max-w-md mx-auto">
              Every scheduled class and period across Monday through Saturday is conflict-free.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border border border-brand-border rounded-xl overflow-hidden">
            {auditReport.clashes.map((clash, idx) => (
              <div
                key={`${clash.dayKey}-${clash.periodIndex}-${clash.teacher.id}-${idx}`}
                className="p-4 bg-brand-surface flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {clash.dayLabel} · Period {clash.periodNo}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-brand-border">·</span>
                    <strong className="text-sm font-bold text-brand-text-primary">
                      {clash.teacher.name}
                    </strong>
                  </div>
                  <p className="text-xs text-brand-text-secondary">
                    Assigned simultaneously to{' '}
                    <span className="font-semibold text-brand-text-primary">
                      {clash.classes
                        .map((c, i) => `Class ${c} (${clash.subjects[i] || clash.subjects[0] || 'Period'})`)
                        .join(' and ')}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {clash.classes.map((clsLabel) => (
                    <button
                      key={clsLabel}
                      type="button"
                      onClick={() => onResolveClash(clash.dayKey, clash.periodIndex, clsLabel)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-semibold rounded-xl bg-brand-panel hover:bg-brand-border/70 text-brand-text-primary border border-brand-border transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>Fix in {clsLabel}</span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progressive Disclosure for Unassigned Slots */}
        {auditReport.unassigned.length > 0 && (
          <details className="pt-2 border-t border-brand-border/70 group">
            <summary className="text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary cursor-pointer select-none py-1.5 min-h-[36px] flex items-center">
              Show unassigned period slots ({auditReport.unassigned.length})
            </summary>
            <div className="mt-3 divide-y divide-brand-border/60 border border-brand-border rounded-xl overflow-hidden max-h-64 overflow-y-auto custom-scrollbar">
              {auditReport.unassigned.map((slot, i) => (
                <div
                  key={`${slot.classLabel}-${slot.dayKey}-${slot.periodIndex}-${i}`}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs bg-brand-panel/30"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-semibold text-brand-text-primary">
                      Class {slot.classLabel}
                    </span>
                    <span className="text-brand-text-secondary">
                      {' · '}
                      {slot.dayLabel} · Period {slot.periodNo} · {slot.subject}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onResolveClash(slot.dayKey, slot.periodIndex, slot.classLabel)}
                    className="text-xs font-semibold text-brand-primary hover:underline px-2 py-1.5 min-h-[36px] shrink-0 cursor-pointer"
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
};
