import React from 'react';
import { Teacher } from '../types';
import { DayKey, TimetableData, DAY_LABELS } from '../services/timetable';
import { SubstitutionAssignment } from '../services/substitutionService';
import { SubstitutionTodayBoard } from './substitution/SubstitutionTodayBoard';
import { SubstitutionLedgerTable } from './substitution/SubstitutionLedgerTable';
import { TeacherProxyStatsModal } from './substitution/TeacherProxyStatsModal';
import { useSubstitutionManager } from './substitution/useSubstitutionManager';

interface SubstitutionManagerProps {
  timetable: TimetableData;
  teachers: Teacher[];
  day: DayKey;
  onSubstitutionsChanged?: (assignments: SubstitutionAssignment[], absentIds: string[]) => void;
}

export const SubstitutionManager: React.FC<SubstitutionManagerProps> = ({
  timetable,
  teachers,
  day,
  onSubstitutionsChanged,
}) => {
  const {
    activeSubTab,
    setActiveSubTab,
    absentTeacherIds,
    selectedTeacherToAdd,
    setSelectedTeacherToAdd,
    handleMarkAbsent,
    handleRemoveAbsent,
    affectedSlots,
    assignments,
    handleAssignProxy,
    handleRemoveAssignment,
    coveredCount,
    whatsappCopied,
    handleCopyWhatsAppNotice,
    handlePrintSlip,
    filteredLedger,
    searchLedger,
    setSearchLedger,
    equitySummary,
    inspectTeacherStats,
    setInspectTeacherStats,
  } = useSubstitutionManager(timetable, teachers, day, onSubstitutionsChanged);

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Toggle */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-brand-text-primary">
                Teacher Substitution & Faculty Proxy Tracker
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                Firestore Synced
              </span>
            </div>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Manage daily absences ({DAY_LABELS[day]}), distribute proxy periods equitably across staff, and dispatch notices.
            </p>
          </div>

          {/* Action Buttons: WhatsApp & Print */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyWhatsAppNotice}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all shadow-sm cursor-pointer ${
                whatsappCopied
                  ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              {whatsappCopied ? 'Notice Copied!' : 'Copy WhatsApp Notice'}
            </button>

            <button
              type="button"
              onClick={handlePrintSlip}
              disabled={affectedSlots.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border disabled:opacity-40 transition-colors shadow-sm cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Substitution Notice
            </button>
          </div>
        </div>

        {/* View Switcher: Today's Allocations vs. Equity Ledger */}
        <div className="flex items-center gap-2 pt-2 border-t border-brand-border">
          <button
            type="button"
            onClick={() => setActiveSubTab('today')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'today'
                ? 'bg-brand-primary text-white shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary bg-brand-bg/50'
            }`}
          >
            Today's Allocations ({affectedSlots.length} Vacant Slots)
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('ledger')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'ledger'
                ? 'bg-brand-primary text-white shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary bg-brand-bg/50'
            }`}
          >
            <span>Faculty Proxy Equity Ledger</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-brand-bg/90 text-brand-text-secondary">
              {teachers.length} Staff
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: TODAY'S ALLOCATIONS */}
      {activeSubTab === 'today' && (
        <SubstitutionTodayBoard
          teachers={teachers}
          absentTeacherIds={absentTeacherIds}
          selectedTeacherToAdd={selectedTeacherToAdd}
          setSelectedTeacherToAdd={setSelectedTeacherToAdd}
          onMarkAbsent={handleMarkAbsent}
          onRemoveAbsent={handleRemoveAbsent}
          affectedSlots={affectedSlots}
          assignments={assignments}
          onAssignProxy={handleAssignProxy}
          onRemoveAssignment={handleRemoveAssignment}
          coveredCount={coveredCount}
        />
      )}

      {/* TAB 2: FACULTY PROXY LOAD & EQUITY LEDGER */}
      {activeSubTab === 'ledger' && (
        <SubstitutionLedgerTable
          filteredLedger={filteredLedger}
          searchLedger={searchLedger}
          setSearchLedger={setSearchLedger}
          equitySummary={equitySummary}
          onInspectTeacher={stats => setInspectTeacherStats(stats)}
        />
      )}

      {/* Teacher Assignment History Modal */}
      {inspectTeacherStats && (
        <TeacherProxyStatsModal
          inspectTeacherStats={inspectTeacherStats}
          onClose={() => setInspectTeacherStats(null)}
        />
      )}
    </div>
  );
};

export default SubstitutionManager;
