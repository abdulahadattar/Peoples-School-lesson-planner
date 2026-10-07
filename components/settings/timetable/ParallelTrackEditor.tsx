import React from 'react';
import { Teacher } from '../../../types';

export interface ParallelTrackEditorProps {
  isParallel: boolean;
  setIsParallel: (val: boolean) => void;
  parallelSubject: string;
  setParallelSubject: (val: string) => void;
  parallelTeacher: string;
  setParallelTeacher: (val: string) => void;
  teachers: Teacher[];
  parallelTeacherAvailability?: {
    isBusy: boolean;
    busyInClass?: string;
  };
}

export const ParallelTrackEditor: React.FC<ParallelTrackEditorProps> = ({
  isParallel,
  setIsParallel,
  parallelSubject,
  setParallelSubject,
  parallelTeacher,
  setParallelTeacher,
  teachers,
  parallelTeacherAvailability,
}) => {
  return (
    <div className="pt-2 border-t border-brand-border space-y-2.5">
      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-brand-text-primary">
        <input
          type="checkbox"
          checked={isParallel}
          onChange={(e) => setIsParallel(e.target.checked)}
          className="rounded border-brand-border text-brand-primary focus:ring-brand-primary"
        />
        <span>Parallel / Dual Stream Subject (e.g. Urdu / Sindhi bilingual split)</span>
      </label>

      {isParallel && (
        <div className="p-3 rounded-xl bg-brand-bg/60 border border-brand-border space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-brand-text-secondary">2nd Subject:</label>
              <input
                type="text"
                value={parallelSubject}
                onChange={(e) => setParallelSubject(e.target.value)}
                placeholder="e.g. Sindhi"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-brand-surface border border-brand-border text-brand-text-primary outline-hidden"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-brand-text-secondary">2nd Teacher:</label>
              <select
                value={parallelTeacher}
                onChange={(e) => setParallelTeacher(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-brand-surface border border-brand-border text-brand-text-primary outline-hidden"
              >
                <option value="">Select faculty...</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {parallelTeacherAvailability?.isBusy && (
            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              ⚠️ {parallelTeacher} is already busy in Class {parallelTeacherAvailability.busyInClass} at this period.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
