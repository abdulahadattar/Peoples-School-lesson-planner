import React from 'react';
import { Teacher } from '../../../types';
import { DayKey, DAY_LABELS } from '../../../services/timetable';
import { ParallelTrackEditor } from './ParallelTrackEditor';

export interface EditingCellData {
  dayKey: DayKey;
  periodIndex: number;
  periodNo: number;
  classLabel: string;
}

export interface TimetableCellEditorModalProps {
  editingCell: EditingCellData | null;
  cellSubject: string;
  setCellSubject: (val: string) => void;
  cellTeacher: string;
  setCellTeacher: (val: string) => void;
  isParallel: boolean;
  setIsParallel: (val: boolean) => void;
  parallelSubject: string;
  setParallelSubject: (val: string) => void;
  parallelTeacher: string;
  setParallelTeacher: (val: string) => void;
  selectedClassInfo?: { subjects?: string[] };
  teachers: Teacher[];
  qualifiedFaculty: {
    primaryTeacher: Teacher | null;
    qualifiedTeachers: Teacher[];
  };
  selectedTeacherAvailability?: {
    isBusy: boolean;
    busyInClass?: string;
    subject?: string;
    periodNo?: number;
  };
  parallelTeacherAvailability?: {
    isBusy: boolean;
    busyInClass?: string;
  };
  onSelectSubject: (sub: string) => void;
  onSuggestConflictFree: () => void;
  onSave: () => void;
  onClose: () => void;
}

export const TimetableCellEditorModal: React.FC<TimetableCellEditorModalProps> = ({
  editingCell,
  cellSubject,
  setCellSubject,
  cellTeacher,
  setCellTeacher,
  isParallel,
  setIsParallel,
  parallelSubject,
  setParallelSubject,
  parallelTeacher,
  setParallelTeacher,
  selectedClassInfo,
  teachers,
  qualifiedFaculty,
  selectedTeacherAvailability,
  parallelTeacherAvailability,
  onSelectSubject,
  onSuggestConflictFree,
  onSave,
  onClose,
}) => {
  if (!editingCell) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl glass-card border border-brand-border shadow-2xl p-5 space-y-4 animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-brand-border">
          <div>
            <h3 className="text-sm font-bold text-brand-text-primary">
              Edit Class {editingCell.classLabel} — Period {editingCell.periodNo}
            </h3>
            <p className="text-xs text-brand-text-secondary">
              {DAY_LABELS[editingCell.dayKey]} • Adjust assigned subject and faculty
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-brand-text-secondary hover:text-brand-text-primary flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-xs font-semibold text-brand-text-primary mb-1">
              Select Curriculum Subject:
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-xl bg-brand-bg/60 border border-brand-border">
              {selectedClassInfo?.subjects?.map((sub) => {
                const isSelected = cellSubject.toLowerCase() === sub.toLowerCase();
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => onSelectSubject(sub)}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-primary text-white shadow-xs'
                        : 'bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    {sub}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-brand-text-secondary mb-1">
                Subject Name:
              </label>
              <input
                type="text"
                value={cellSubject}
                onChange={(e) => setCellSubject(e.target.value)}
                placeholder="e.g. Mathematics"
                className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-brand-text-secondary">
                  Assigned Teacher:
                </label>
                <button
                  type="button"
                  onClick={onSuggestConflictFree}
                  className="text-[10px] text-brand-primary hover:underline font-bold cursor-pointer"
                  title="Auto-pick free teacher qualified for this subject"
                >
                  ⚡ Suggest Free
                </button>
              </div>
              <input
                type="text"
                value={cellTeacher}
                onChange={(e) => setCellTeacher(e.target.value)}
                placeholder="e.g. Sir Ali"
                className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-brand-text-secondary mb-1">
              Qualified Teachers for this Subject:
            </label>
            <select
              value={cellTeacher}
              onChange={(e) => setCellTeacher(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary outline-hidden"
            >
              <option value="">Select recommended faculty...</option>
              {qualifiedFaculty.primaryTeacher && (
                <optgroup label="Primary Subject Teacher">
                  <option value={qualifiedFaculty.primaryTeacher.name}>
                    ⭐ {qualifiedFaculty.primaryTeacher.name} (Official In-Charge)
                  </option>
                </optgroup>
              )}

              {qualifiedFaculty.qualifiedTeachers.length > 0 && (
                <optgroup label="Alternative Subject Specialists">
                  {qualifiedFaculty.qualifiedTeachers
                    .filter((t) => !qualifiedFaculty.primaryTeacher || t.id !== qualifiedFaculty.primaryTeacher.id)
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name} ({t.designation || 'Subject Specialist'})
                      </option>
                    ))}
                </optgroup>
              )}

              <optgroup label="Other School Faculty">
                {teachers
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          {selectedTeacherAvailability?.isBusy && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>⛔ Double-Booking Clash Detected</span>
              </div>
              <p>
                <strong>{cellTeacher}</strong> is already teaching <em>{selectedTeacherAvailability.subject}</em> in <strong>Class {selectedTeacherAvailability.busyInClass}</strong> during Period {selectedTeacherAvailability.periodNo} on {DAY_LABELS[editingCell.dayKey]}.
              </p>
            </div>
          )}

          <ParallelTrackEditor
            isParallel={isParallel}
            setIsParallel={setIsParallel}
            parallelSubject={parallelSubject}
            setParallelSubject={setParallelSubject}
            parallelTeacher={parallelTeacher}
            setParallelTeacher={setParallelTeacher}
            teachers={teachers}
            parallelTeacherAvailability={parallelTeacherAvailability}
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-brand-border">
          <button
            type="button"
            onClick={() => {
              setCellSubject('');
              setCellTeacher('');
              setIsParallel(false);
              setParallelSubject('');
              setParallelTeacher('');
            }}
            className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors font-medium cursor-pointer"
          >
            Clear Slot (—)
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary border border-brand-border cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover shadow-sm cursor-pointer"
            >
              Apply to Timetable
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
