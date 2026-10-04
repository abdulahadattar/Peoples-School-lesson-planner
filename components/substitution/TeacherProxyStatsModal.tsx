import React from 'react';
import { TeacherProxyStats } from '../../services/substitutionService';
import { BaseModal } from '../ui/BaseModal';

export interface TeacherProxyStatsModalProps {
  inspectTeacherStats: TeacherProxyStats | null;
  onClose: () => void;
}

export const TeacherProxyStatsModal: React.FC<TeacherProxyStatsModalProps> = ({
  inspectTeacherStats,
  onClose,
}) => {
  if (!inspectTeacherStats) return null;

  return (
    <BaseModal
      isOpen={!!inspectTeacherStats}
      onClose={onClose}
      maxWidth="lg"
      title={`Proxy History: ${inspectTeacherStats.teacherName}`}
      subtitle={`${inspectTeacherStats.designation} • Total Proxies: ${inspectTeacherStats.totalCount}`}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Close
        </button>
      }
    >
      {inspectTeacherStats.recentAssignments.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No proxy periods recorded for this teacher yet.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {inspectTeacherStats.recentAssignments.map((a, idx) => (
            <div
              key={a.id || idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-bold text-slate-900 dark:text-white">
                  Period {a.periodNo} • Class {a.classLabel}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Subject: {a.subjectName} • Relieving: {a.absentTeacherName}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-[11px] font-semibold text-primary block">
                  {a.dateKey}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </BaseModal>
  );
};
