import React, { useState, useEffect, useMemo } from 'react';
import { Teacher } from '../types';
import {
  DayKey,
  TimetableData,
  computeStaff,
  resolveSlot,
  DAY_LABELS,
} from '../services/timetable';
import {
  getStoredSubstitutions,
  saveStoredSubstitutions,
  SubstitutionAssignment,
} from '../services/storageService';
import SelectField from './ui/SelectField';
import { UserIcon } from './icons/MiscIcons';
import { printHtml } from '../utils/printHelper';

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
  const todayKey = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [absentTeacherIds, setAbsentTeacherIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<SubstitutionAssignment[]>([]);
  const [selectedTeacherToAdd, setSelectedTeacherToAdd] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load stored state
  useEffect(() => {
    let mounted = true;
    getStoredSubstitutions(todayKey).then(stored => {
      if (mounted) {
        setAbsentTeacherIds(stored.absentTeacherIds);
        setAssignments(stored.assignments);
        setIsLoaded(true);
        onSubstitutionsChanged?.(stored.assignments, stored.absentTeacherIds);
      }
    });
    return () => { mounted = false; };
  }, [todayKey]);

  // Save changes to IndexedDB
  const persistChanges = (newAbsent: string[], newAssignments: SubstitutionAssignment[]) => {
    setAbsentTeacherIds(newAbsent);
    setAssignments(newAssignments);
    saveStoredSubstitutions(todayKey, newAbsent, newAssignments);
    onSubstitutionsChanged?.(newAssignments, newAbsent);
  };

  const handleMarkAbsent = () => {
    if (!selectedTeacherToAdd) return;
    if (absentTeacherIds.includes(selectedTeacherToAdd)) return;
    const newAbsent = [...absentTeacherIds, selectedTeacherToAdd];
    persistChanges(newAbsent, assignments);
    setSelectedTeacherToAdd('');
  };

  const handleRemoveAbsent = (teacherId: string) => {
    const newAbsent = absentTeacherIds.filter(id => id !== teacherId);
    // Also remove any assignments covering this teacher
    const absentTeacher = teachers.find(t => t.id === teacherId);
    const newAssignments = assignments.filter(
      a => !absentTeacher || a.absentTeacherName !== absentTeacher.name
    );
    persistChanges(newAbsent, newAssignments);
  };

  // Find all affected slots today for the absent teachers
  const affectedSlots = useMemo(() => {
    if (absentTeacherIds.length === 0) return [];
    const results: {
      periodNo: number;
      periodIndex: number;
      classLabel: string;
      subjectName: string;
      absentTeacher: Teacher;
      freeTeachers: Teacher[];
    }[] = [];

    const absentSet = new Set(absentTeacherIds);
    const maxPeriods = day === 'fri'
      ? 5
      : Math.max(...timetable.classes.map(c => c.periods.length));

    for (let pIdx = 0; pIdx < maxPeriods; pIdx++) {
      const staffStatus = computeStaff(timetable.classes, teachers, day, pIdx);
      // Free teachers at this period who are NOT themselves absent
      const availableFreeTeachers = staffStatus.free.filter(t => !absentSet.has(t.id));

      for (const entry of timetable.classes) {
        if (pIdx >= entry.periods.length) continue;
        const period = entry.periods[pIdx];
        const slot = resolveSlot(entry, day, pIdx, teachers);

        for (const t of slot.teachers) {
          if (absentSet.has(t.id)) {
            // Check if slot has matching subject
            results.push({
              periodNo: period.no,
              periodIndex: pIdx,
              classLabel: entry.label,
              subjectName: slot.label,
              absentTeacher: t,
              freeTeachers: availableFreeTeachers,
            });
          }
        }
      }
    }

    return results.sort((a, b) => a.periodNo - b.periodNo || a.classLabel.localeCompare(b.classLabel));
  }, [absentTeacherIds, timetable, teachers, day]);

  const handleAssignProxy = (
    slot: {
      periodNo: number;
      classLabel: string;
      subjectName: string;
      absentTeacher: Teacher;
    },
    proxyTeacherId: string
  ) => {
    const proxyTeacher = teachers.find(t => t.id === proxyTeacherId);
    if (!proxyTeacher) return;

    const assignmentId = `${todayKey}_${slot.periodNo}_${slot.classLabel}_${slot.absentTeacher.id}`;
    const newAssignment: SubstitutionAssignment = {
      id: assignmentId,
      dateKey: todayKey,
      periodNo: slot.periodNo,
      classLabel: slot.classLabel,
      subjectName: slot.subjectName,
      absentTeacherName: slot.absentTeacher.name,
      proxyTeacherId: proxyTeacher.id,
      proxyTeacherName: proxyTeacher.name,
      assignedAt: Date.now(),
    };

    const filtered = assignments.filter(
      a => !(a.periodNo === slot.periodNo && a.classLabel === slot.classLabel && a.absentTeacherName === slot.absentTeacher.name)
    );
    persistChanges(absentTeacherIds, [...filtered, newAssignment]);
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    const filtered = assignments.filter(a => a.id !== assignmentId);
    persistChanges(absentTeacherIds, filtered);
  };

  const handlePrintSlip = () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Daily Substitution Slip - ${todayKey}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
          h2 { margin: 4px 0 0 0; font-size: 14px; font-weight: normal; color: #555; }
          .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          .unassigned { color: #dc2626; font-weight: bold; }
          .sign { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Peoples Higher Secondary School Jamshoro</h1>
          <h2>Daily Teacher Substitution & Proxy Roster</h2>
        </div>
        <div class="meta">
          <span><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span><strong>Day:</strong> ${DAY_LABELS[day]}</span>
          <span><strong>Absent Staff:</strong> ${absentTeacherIds.map(id => teachers.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'None'}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Class</th>
              <th>Subject</th>
              <th>Absent Teacher</th>
              <th>Assigned Substitute (Proxy)</th>
              <th>Teacher Signature</th>
            </tr>
          </thead>
          <tbody>
            ${affectedSlots.map(slot => {
              const assigned = assignments.find(
                a => a.periodNo === slot.periodNo && a.classLabel === slot.classLabel && a.absentTeacherName === slot.absentTeacher.name
              );
              return `
                <tr>
                  <td><strong>Period ${slot.periodNo}</strong></td>
                  <td>${slot.classLabel}</td>
                  <td>${slot.subjectName}</td>
                  <td>${slot.absentTeacher.name}</td>
                  <td>${assigned ? `<strong>${assigned.proxyTeacherName}</strong>` : '<span class="unassigned">UNASSIGNED</span>'}</td>
                  <td style="width: 120px;"></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div class="sign">
          <div>Prepared By: ____________________</div>
          <div>Principal / Vice Principal: ____________________</div>
        </div>
      </body>
      </html>
    `;

    printHtml(html);
  };

  const absentTeachersList = absentTeacherIds
    .map(id => teachers.find(t => t.id === id))
    .filter((t): t is Teacher => !!t);

  const coveredCount = affectedSlots.filter(s =>
    assignments.some(a => a.periodNo === s.periodNo && a.classLabel === s.classLabel && a.absentTeacherName === s.absentTeacher.name)
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Absence Action */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-brand-text-primary">
              Teacher Substitution & Proxy Manager
            </h3>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Track absent teachers today ({DAY_LABELS[day]}), match free teachers to vacant periods, and generate official proxy slips.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintSlip}
              disabled={affectedSlots.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border disabled:opacity-40 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Substitution Notice
            </button>
          </div>
        </div>

        {/* Mark Teacher Absent Input */}
        <div className="pt-3 border-t border-brand-border flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <SelectField
              id="absent-teacher-select"
              label="Mark Teacher Absent Today"
              icon={<UserIcon className="w-3.5 h-3.5" />}
              value={selectedTeacherToAdd}
              onChange={e => setSelectedTeacherToAdd(e.target.value)}
              className="h-10 text-xs"
              placeholder="Select absent teacher..."
            >
              <option value="">Select teacher...</option>
              {teachers
                .filter(t => !absentTeacherIds.includes(t.id))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {`${t.name} (${t.designation || 'Teacher'})`}
                  </option>
                ))}
            </SelectField>
          </div>
          <button
            type="button"
            onClick={handleMarkAbsent}
            disabled={!selectedTeacherToAdd}
            className="h-10 px-4 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 transition-colors shadow-sm shrink-0"
          >
            + Add Absence
          </button>

          {absentTeachersList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <span className="text-xs text-brand-text-secondary">Absent today:</span>
              {absentTeachersList.map(t => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                >
                  <span>{t.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAbsent(t.id)}
                    className="text-rose-500 hover:text-rose-700 font-bold"
                    title="Remove absence"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Metrics Summary */}
      {absentTeacherIds.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border flex items-center justify-between">
            <span className="text-xs text-brand-text-secondary">Absent Staff</span>
            <span className="text-lg font-bold text-rose-600">{absentTeacherIds.length}</span>
          </div>
          <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border flex items-center justify-between">
            <span className="text-xs text-brand-text-secondary">Vacant Periods</span>
            <span className="text-lg font-bold text-brand-text-primary">{affectedSlots.length}</span>
          </div>
          <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border flex items-center justify-between">
            <span className="text-xs text-brand-text-secondary">Assigned Substitutes</span>
            <span className={`text-lg font-bold ${coveredCount === affectedSlots.length ? 'text-emerald-600' : 'text-amber-600'}`}>
              {coveredCount} / {affectedSlots.length}
            </span>
          </div>
        </div>
      )}

      {/* Vacant Classes & Substitution Table */}
      {affectedSlots.length === 0 ? (
        <div className="text-center py-12 px-4 bg-brand-surface rounded-2xl border border-dashed border-brand-border">
          <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 font-bold">
            ✓
          </div>
          <h4 className="text-sm font-semibold text-brand-text-primary">
            {absentTeacherIds.length === 0 ? 'No teachers marked absent' : 'No teaching periods affected for absent teachers today'}
          </h4>
          <p className="text-xs text-brand-text-secondary mt-1">
            {absentTeacherIds.length === 0
              ? 'Select an absent teacher from the dropdown above to manage substitutions.'
              : 'The marked teachers have no classes scheduled on this timetable day.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary">
            Vacant Periods Requiring Coverage ({affectedSlots.length})
          </h4>

          <div className="space-y-2.5">
            {affectedSlots.map(slot => {
              const currentAssignment = assignments.find(
                a => a.periodNo === slot.periodNo && a.classLabel === slot.classLabel && a.absentTeacherName === slot.absentTeacher.name
              );

              return (
                <div
                  key={`${slot.periodNo}_${slot.classLabel}_${slot.absentTeacher.id}`}
                  className="bg-brand-surface p-4 rounded-xl border border-brand-border hover:border-brand-primary/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Class & Subject Details */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-brand-primary/10 text-brand-primary">
                        Period {slot.periodNo}
                      </span>
                      <span className="text-sm font-bold text-brand-text-primary">
                        Class {slot.classLabel}
                      </span>
                      <span className="text-xs text-brand-text-secondary font-medium">
                        • {slot.subjectName}
                      </span>
                    </div>

                    <p className="text-xs text-brand-text-secondary">
                      Absent Teacher: <strong className="text-rose-600 font-medium">{slot.absentTeacher.name}</strong>
                    </p>
                  </div>

                  {/* Substitution Selection */}
                  <div className="flex flex-wrap items-center gap-2">
                    {currentAssignment ? (
                      <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-xl">
                        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                          Proxy: {currentAssignment.proxyTeacherName}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignment(currentAssignment.id)}
                          className="text-xs text-emerald-700 hover:text-red-600 font-bold ml-1"
                          title="Change or remove proxy"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-[260px]">
                        <div className="flex-1">
                          <SelectField
                            id={`proxy-select-${slot.periodNo}-${slot.classLabel}`}
                            value=""
                            onChange={e => {
                              if (e.target.value) {
                                handleAssignProxy(slot, e.target.value);
                              }
                            }}
                            className="min-h-9 h-9 text-xs py-1"
                            placeholder={`Assign Free Teacher (${slot.freeTeachers.length} available)...`}
                          >
                            <option value="">Assign Free Teacher ({slot.freeTeachers.length} available)...</option>
                            {slot.freeTeachers.map(freeTeacher => {
                              const teachesSameSubject = freeTeacher.subjects.some(
                                sub => slot.subjectName.toLowerCase().includes(sub.name.toLowerCase())
                              );
                              return (
                                <option key={freeTeacher.id} value={freeTeacher.id}>
                                  {freeTeacher.name} {teachesSameSubject ? '— ⭐ Subject Match' : ''}
                                </option>
                              );
                            })}
                          </SelectField>
                        </div>
                        <span className="shrink-0 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-900/30 rounded-lg uppercase tracking-wide">
                          Unassigned
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
