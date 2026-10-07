import React from 'react';
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
    <div className="space-y-5">
      {/* Health Diagnostics Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border shadow-xs">
          <div className="text-xs font-bold text-brand-text-secondary uppercase">Scheduled Classes</div>
          <div className="text-2xl font-bold text-brand-text-primary mt-1">
            {auditReport.totalClassesCount}
          </div>
          <div className="text-[11px] text-brand-text-secondary mt-0.5">All secondary & primary sections</div>
        </div>

        <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border shadow-xs">
          <div className="text-xs font-bold text-brand-text-secondary uppercase">Active Class Periods</div>
          <div className="text-2xl font-bold text-brand-text-primary mt-1">
            {auditReport.totalSlots}
          </div>
          <div className="text-[11px] text-brand-text-secondary mt-0.5">Evaluated across Mon–Sat</div>
        </div>

        <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border shadow-xs">
          <div className="text-xs font-bold text-brand-text-secondary uppercase">Clashes Detected</div>
          <div className={`text-2xl font-bold mt-1 ${auditReport.totalClashes > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {auditReport.totalClashes}
          </div>
          <div className="text-[11px] text-brand-text-secondary mt-0.5">
            {auditReport.totalClashes === 0 ? 'No teacher double-bookings' : 'Requires immediate resolution'}
          </div>
        </div>

        <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border shadow-xs">
          <div className="text-xs font-bold text-brand-text-secondary uppercase">Conflict-Free Classes</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {auditReport.cleanClassesCount} / {auditReport.totalClassesCount}
          </div>
          <div className="text-[11px] text-brand-text-secondary mt-0.5">Classes with zero double-bookings</div>
        </div>
      </div>

      {/* Clashes Table */}
      <div className="bg-brand-surface rounded-2xl border border-brand-border p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-brand-text-primary">
              Double-Booking Clash Registry
            </h4>
            <p className="text-xs text-brand-text-secondary">
              A teacher cannot be present in two different classrooms during the same period.
            </p>
          </div>
        </div>

        {auditReport.clashes.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center text-xl font-bold">
              ✓
            </div>
            <div className="text-sm font-bold text-brand-text-primary">
              All Timetables Are Completely Conflict-Free!
            </div>
            <p className="text-xs text-brand-text-secondary max-w-md mx-auto">
              Every teacher is scheduled in at most one classroom per period across all sections. No overlapping assignments found.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border border border-brand-border rounded-xl overflow-hidden">
            {auditReport.clashes.map((clash, idx) => (
              <div key={idx} className="p-4 bg-brand-bg/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300">
                      {clash.dayLabel} • Period {clash.periodNo}
                    </span>
                    <strong className="text-sm text-brand-text-primary">
                      {clash.teacher.name}
                    </strong>
                  </div>
                  <p className="text-xs text-brand-text-secondary">
                    Assigned simultaneously to: <strong className="text-brand-text-primary">{clash.classes.map((c, i) => `Class ${c} (${clash.subjects[i]})`).join(' AND ')}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onResolveClash(clash.dayKey, clash.periodIndex, clash.classes[0])}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-surface hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs"
                  >
                    Resolve in Class {clash.classes[0]}
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolveClash(clash.dayKey, clash.periodIndex, clash.classes[1])}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-surface hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs"
                  >
                    Resolve in Class {clash.classes[1]}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
