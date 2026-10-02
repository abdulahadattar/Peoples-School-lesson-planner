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
  getSubstitutionsForDate,
  saveSubstitutionsForDate,
  getAllSubstitutionsHistory,
  computeTeacherProxyStats,
  formatWhatsAppProxyNotice,
  SubstitutionAssignment,
  DailySubstitutionRecord,
  TeacherProxyStats,
} from '../services/substitutionService';
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
  const [historyRecords, setHistoryRecords] = useState<DailySubstitutionRecord[]>([]);
  const [selectedTeacherToAdd, setSelectedTeacherToAdd] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'today' | 'ledger'>('today');
  const [whatsappCopied, setWhatsappCopied] = useState(false);
  const [inspectTeacherStats, setInspectTeacherStats] = useState<TeacherProxyStats | null>(null);
  const [searchLedger, setSearchLedger] = useState('');

  // Load today's stored state + historical records for proxy equity tracking
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [todayRec, history] = await Promise.all([
          getSubstitutionsForDate(todayKey),
          getAllSubstitutionsHistory(),
        ]);

        if (mounted) {
          setAbsentTeacherIds(todayRec.absentTeacherIds || []);
          setAssignments(todayRec.assignments || []);
          setHistoryRecords(history);
          setIsLoaded(true);
          onSubstitutionsChanged?.(todayRec.assignments || [], todayRec.absentTeacherIds || []);
        }
      } catch (err) {
        console.error('Failed to load substitutions:', err);
        if (mounted) setIsLoaded(true);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [todayKey]);

  // Compute live teacher proxy workload statistics
  const combinedHistory = useMemo(() => {
    // Merge today's uncommitted in-memory assignments with history
    const existingOtherDates = historyRecords.filter(r => r.dateKey !== todayKey);
    const todayRecord: DailySubstitutionRecord = {
      dateKey: todayKey,
      absentTeacherIds,
      assignments,
      updatedAt: Date.now(),
    };
    return [todayRecord, ...existingOtherDates];
  }, [historyRecords, todayKey, absentTeacherIds, assignments]);

  const teacherProxyStats = useMemo(() => {
    return computeTeacherProxyStats(teachers, combinedHistory, new Date());
  }, [teachers, combinedHistory]);

  const statsMap = useMemo(() => {
    const map = new Map<string, TeacherProxyStats>();
    teacherProxyStats.forEach(s => map.set(s.teacherId, s));
    return map;
  }, [teacherProxyStats]);

  // Save changes to IndexedDB & Firestore
  const persistChanges = (newAbsent: string[], newAssignments: SubstitutionAssignment[]) => {
    setAbsentTeacherIds(newAbsent);
    setAssignments(newAssignments);
    saveSubstitutionsForDate(todayKey, newAbsent, newAssignments);
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
      freeTeachers: (Teacher & {
        thisWeekCount: number;
        teachesSameSubject: boolean;
        loadLevel: 'low' | 'moderate' | 'heavy';
      })[];
    }[] = [];

    const absentSet = new Set(absentTeacherIds);
    const maxPeriods =
      day === 'fri' ? 5 : Math.max(...timetable.classes.map(c => c.periods.length));

    for (let pIdx = 0; pIdx < maxPeriods; pIdx++) {
      const staffStatus = computeStaff(timetable.classes, teachers, day, pIdx);
      const availableFreeTeachers = staffStatus.free.filter(t => !absentSet.has(t.id));

      for (const entry of timetable.classes) {
        if (pIdx >= entry.periods.length) continue;
        const period = entry.periods[pIdx];
        const slot = resolveSlot(entry, day, pIdx, teachers);

        for (const t of slot.teachers) {
          if (absentSet.has(t.id)) {
            // Annotate and sort free teachers by workload equity (least proxies this week first)
            const annotated = availableFreeTeachers.map(ft => {
              const st = statsMap.get(ft.id);
              const teachesSameSubject = ft.subjects.some(sub =>
                slot.label.toLowerCase().includes(sub.name.toLowerCase())
              );
              return {
                ...ft,
                thisWeekCount: st?.thisWeekCount || 0,
                teachesSameSubject,
                loadLevel: st?.loadLevel || 'low',
              };
            });

            // Sort: subject match first, then lowest weekly proxy load, then alphabetical
            annotated.sort((a, b) => {
              if (a.teachesSameSubject && !b.teachesSameSubject) return -1;
              if (!a.teachesSameSubject && b.teachesSameSubject) return 1;
              if (a.thisWeekCount !== b.thisWeekCount) return a.thisWeekCount - b.thisWeekCount;
              return a.name.localeCompare(b.name);
            });

            results.push({
              periodNo: period.no,
              periodIndex: pIdx,
              classLabel: entry.label,
              subjectName: slot.label,
              absentTeacher: t,
              freeTeachers: annotated,
            });
          }
        }
      }
    }

    return results.sort((a, b) => a.periodNo - b.periodNo || a.classLabel.localeCompare(b.classLabel));
  }, [absentTeacherIds, timetable, teachers, day, statsMap]);

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
      a =>
        !(
          a.periodNo === slot.periodNo &&
          a.classLabel === slot.classLabel &&
          a.absentTeacherName === slot.absentTeacher.name
        )
    );
    persistChanges(absentTeacherIds, [...filtered, newAssignment]);
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    const filtered = assignments.filter(a => a.id !== assignmentId);
    persistChanges(absentTeacherIds, filtered);
  };

  // WhatsApp Notice Generation & Copy
  const handleCopyWhatsAppNotice = () => {
    const absentTeacherNames = absentTeacherIds
      .map(id => teachers.find(t => t.id === id)?.name)
      .filter((n): n is string => !!n);

    const message = formatWhatsAppProxyNotice(todayKey, absentTeacherNames, assignments);
    navigator.clipboard.writeText(message);
    setWhatsappCopied(true);
    setTimeout(() => setWhatsappCopied(false), 3000);
  };

  // Official Printable Notice Slip
  const handlePrintSlip = () => {
    const absentTeacherNames = absentTeacherIds
      .map(id => teachers.find(t => t.id === id)?.name)
      .filter((n): n is string => !!n);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Daily Faculty Substitution Slip - ${todayKey}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
          h2 { margin: 4px 0 0 0; font-size: 13px; font-weight: normal; color: #444; }
          .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 16px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #999; padding: 7px 10px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          .unassigned { color: #dc2626; font-weight: bold; }
          .sign { margin-top: 48px; display: flex; justify-content: space-between; font-size: 12px; }
          .absent-box { margin-bottom: 14px; padding: 8px 12px; background: #fafafa; border: 1px dashed #ccc; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Peoples Higher Secondary School Jamshoro</h1>
          <h2>Daily Faculty Substitution & Proxy Roster</h2>
        </div>
        <div class="meta">
          <div><strong>Date:</strong> ${todayKey} (${DAY_LABELS[day]})</div>
          <div><strong>Total Vacant Slots:</strong> ${affectedSlots.length}</div>
          <div><strong>Assigned Proxies:</strong> ${assignments.length}</div>
        </div>

        ${
          absentTeacherNames.length > 0
            ? `<div class="absent-box"><strong>Absent Faculty Members:</strong> ${absentTeacherNames.join(', ')}</div>`
            : ''
        }

        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Class</th>
              <th>Subject</th>
              <th>Absent Teacher</th>
              <th>Assigned Proxy Teacher</th>
              <th>Teacher Signature</th>
            </tr>
          </thead>
          <tbody>
            ${affectedSlots
              .map(slot => {
                const assigned = assignments.find(
                  a =>
                    a.periodNo === slot.periodNo &&
                    a.classLabel === slot.classLabel &&
                    a.absentTeacherName === slot.absentTeacher.name
                );
                return `
                <tr>
                  <td><strong>Period ${slot.periodNo}</strong></td>
                  <td>${slot.classLabel}</td>
                  <td>${slot.subjectName}</td>
                  <td>${slot.absentTeacher.name}</td>
                  <td>${
                    assigned
                      ? `<strong>${assigned.proxyTeacherName}</strong>`
                      : '<span class="unassigned">UNASSIGNED</span>'
                  }</td>
                  <td style="width: 140px;"></td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>

        <div class="sign">
          <div>Prepared By: ____________________</div>
          <div>Vice Principal / Principal: ____________________</div>
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
    assignments.some(
      a =>
        a.periodNo === s.periodNo &&
        a.classLabel === s.classLabel &&
        a.absentTeacherName === s.absentTeacher.name
    )
  ).length;

  // Equity summary metrics
  const equitySummary = useMemo(() => {
    let totalWeekProxies = 0;
    let heavyCount = 0;
    let moderateCount = 0;
    let optimalCount = 0;

    teacherProxyStats.forEach(s => {
      totalWeekProxies += s.thisWeekCount;
      if (s.loadLevel === 'heavy') heavyCount++;
      else if (s.loadLevel === 'moderate') moderateCount++;
      else optimalCount++;
    });

    const activeTeachersCount = teachers.length || 1;
    const avgLoad = (totalWeekProxies / activeTeachersCount).toFixed(1);

    return {
      totalWeekProxies,
      avgLoad,
      heavyCount,
      moderateCount,
      optimalCount,
    };
  }, [teacherProxyStats, teachers.length]);

  const filteredLedger = useMemo(() => {
    if (!searchLedger.trim()) return teacherProxyStats;
    const q = searchLedger.toLowerCase();
    return teacherProxyStats.filter(
      t =>
        t.teacherName.toLowerCase().includes(q) ||
        (t.designation && t.designation.toLowerCase().includes(q))
    );
  }, [teacherProxyStats, searchLedger]);

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
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all shadow-sm ${
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border disabled:opacity-40 transition-colors shadow-sm"
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
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
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
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
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
        <div className="space-y-5 animate-fadeIn">
          {/* Mark Teacher Absent Input */}
          <div className="glass-card rounded-2xl p-4 border border-brand-border flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <SelectField
                id="absent-teacher-select"
                label="Mark Teacher Absent Today:"
                value={selectedTeacherToAdd}
                onChange={e => setSelectedTeacherToAdd(e.target.value)}
                placeholder="Select teacher..."
              >
                <option value="">Select teacher...</option>
                {teachers
                  .filter(t => !absentTeacherIds.includes(t.id))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.designation || 'Teacher'})
                    </option>
                  ))}
              </SelectField>
            </div>
            <button
              type="button"
              onClick={handleMarkAbsent}
              disabled={!selectedTeacherToAdd}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white transition-colors shadow-sm"
            >
              + Mark Absent
            </button>
          </div>

          {/* Absent Teachers Chips */}
          {absentTeachersList.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">
                Marked Absent Today ({absentTeachersList.length}):
              </label>
              <div className="flex flex-wrap gap-2">
                {absentTeachersList.map(teacher => (
                  <span
                    key={teacher.id}
                    className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 shadow-xs"
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>{teacher.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAbsent(teacher.id)}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-rose-200 dark:hover:bg-rose-800 text-rose-600 dark:text-rose-400 transition-colors ml-0.5"
                      title="Remove absence"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border">
              <span className="text-[10px] uppercase font-bold text-brand-text-secondary block">
                Absent Faculty
              </span>
              <span className="text-lg font-extrabold text-rose-600 font-mono">
                {absentTeacherIds.length}
              </span>
            </div>
            <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border">
              <span className="text-[10px] uppercase font-bold text-brand-text-secondary block">
                Affected Slots
              </span>
              <span className="text-lg font-extrabold text-amber-600 font-mono">
                {affectedSlots.length}
              </span>
            </div>
            <div className="bg-brand-surface p-3.5 rounded-xl border border-brand-border">
              <span className="text-[10px] uppercase font-bold text-brand-text-secondary block">
                Proxies Assigned
              </span>
              <span className="text-lg font-extrabold text-emerald-600 font-mono">
                {coveredCount} / {affectedSlots.length}
              </span>
            </div>
          </div>

          {/* Vacant Slots Table */}
          {affectedSlots.length === 0 ? (
            <div className="text-center py-10 bg-brand-surface/40 rounded-2xl border border-dashed border-brand-border p-6">
              <h4 className="text-sm font-semibold text-brand-text-primary">
                {absentTeacherIds.length === 0
                  ? 'No Teachers Marked Absent Today'
                  : 'All Periods Covered or No Scheduled Classes'}
              </h4>
              <p className="text-xs text-brand-text-secondary mt-1">
                {absentTeacherIds.length === 0
                  ? 'Select an absent teacher above to detect vacant periods and assign balanced proxy coverage.'
                  : 'The marked teachers have no classes scheduled on this timetable day.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary">
                  Vacant Periods Requiring Proxy Coverage ({affectedSlots.length})
                </h4>
                <span className="text-[11px] text-brand-text-secondary">
                  💡 Recommendation engine prioritizes subject specialists and least-loaded teachers this week
                </span>
              </div>

              <div className="space-y-2.5">
                {affectedSlots.map(slot => {
                  const currentAssignment = assignments.find(
                    a =>
                      a.periodNo === slot.periodNo &&
                      a.classLabel === slot.classLabel &&
                      a.absentTeacherName === slot.absentTeacher.name
                  );

                  return (
                    <div
                      key={`${slot.periodNo}_${slot.classLabel}_${slot.absentTeacher.id}`}
                      className="bg-brand-surface p-4 rounded-xl border border-brand-border hover:border-brand-primary/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                    >
                      {/* Class & Slot Details */}
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

                      {/* Substitution Selection with Equity Hint */}
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
                          <div className="flex items-center gap-2 min-w-[320px]">
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
                                <option value="">
                                  Assign Free Teacher ({slot.freeTeachers.length} available)...
                                </option>
                                {slot.freeTeachers.map(ft => {
                                  let burdenTag = `${ft.thisWeekCount} this wk`;
                                  if (ft.thisWeekCount === 0) burdenTag = '0 proxies this wk ⭐';
                                  else if (ft.thisWeekCount >= 3) burdenTag = `⚠️ ${ft.thisWeekCount} proxies this wk`;

                                  const subjectTag = ft.teachesSameSubject ? '• Subject Match' : '';

                                  return (
                                    <option key={ft.id} value={ft.id}>
                                      {ft.name} ({burdenTag} {subjectTag})
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
      )}

      {/* TAB 2: FACULTY PROXY LOAD & EQUITY LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Equity Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-brand-text-secondary">
                Proxies This Week
              </span>
              <span className="text-xl font-extrabold text-brand-primary font-mono block mt-0.5">
                {equitySummary.totalWeekProxies}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-brand-text-secondary">
                Avg Weekly Load / Staff
              </span>
              <span className="text-xl font-extrabold text-brand-text-primary font-mono block mt-0.5">
                {equitySummary.avgLoad} periods
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                Optimal Load Staff
              </span>
              <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 font-mono block mt-0.5">
                {equitySummary.optimalCount}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">
                High Burden Staff (≥3)
              </span>
              <span className="text-xl font-extrabold text-rose-700 dark:text-rose-300 font-mono block mt-0.5">
                {equitySummary.heavyCount}
              </span>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary">
                Staff Workload Distribution & Assignment History
              </h4>
              <p className="text-[11px] text-brand-text-secondary">
                Monitors proxy fairness over the current week and month to prevent faculty burnout.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <input
                type="text"
                value={searchLedger}
                onChange={e => setSearchLedger(e.target.value)}
                placeholder="Search teacher by name..."
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-brand-surface border border-brand-border text-brand-text-primary outline-hidden focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Faculty Ledger Table */}
          <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-semibold">
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-3 text-center">Today</th>
                    <th className="py-3 px-3 text-center">This Week</th>
                    <th className="py-3 px-3 text-center">This Month</th>
                    <th className="py-3 px-3 text-center">Total Lifetime</th>
                    <th className="py-3 px-3 text-center">Equity Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {filteredLedger.map(stats => {
                    return (
                      <tr key={stats.teacherId} className="hover:bg-brand-bg/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-brand-text-primary text-xs">
                            {stats.teacherName}
                          </div>
                          <div className="text-[11px] text-brand-text-secondary">
                            {stats.designation || 'Faculty Member'}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center font-mono font-bold text-brand-text-primary">
                          {stats.todayCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                              {stats.todayCount}
                            </span>
                          ) : (
                            <span className="text-brand-text-secondary/40">0</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center font-mono font-bold">
                          <span
                            className={`px-2.5 py-0.5 rounded-full ${
                              stats.thisWeekCount === 0
                                ? 'bg-slate-100 dark:bg-slate-800 text-brand-text-secondary'
                                : stats.thisWeekCount < 3
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                            }`}
                          >
                            {stats.thisWeekCount}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center font-mono text-brand-text-primary font-semibold">
                          {stats.thisMonthCount}
                        </td>

                        <td className="py-3 px-3 text-center font-mono text-brand-text-secondary font-medium">
                          {stats.totalCount}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {stats.loadLevel === 'heavy' ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">
                              Heavy (≥3)
                            </span>
                          ) : stats.loadLevel === 'moderate' ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                              Moderate (2)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40">
                              Optimal (0-1)
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectTeacherStats(stats)}
                            className="px-2.5 py-1 text-xs rounded-lg bg-brand-bg hover:bg-brand-border text-brand-text-secondary hover:text-brand-text-primary border border-brand-border transition-colors"
                          >
                            View Log ({stats.recentAssignments.length})
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Assignment History Modal */}
      {inspectTeacherStats && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-brand-surface border border-brand-border rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <div>
                <h4 className="text-sm font-bold text-brand-text-primary">
                  Proxy History: {inspectTeacherStats.teacherName}
                </h4>
                <p className="text-xs text-brand-text-secondary">
                  {inspectTeacherStats.designation} • Total Proxies: {inspectTeacherStats.totalCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectTeacherStats(null)}
                className="text-brand-text-secondary hover:text-brand-text-primary font-bold text-base"
              >
                ✕
              </button>
            </div>

            {inspectTeacherStats.recentAssignments.length === 0 ? (
              <div className="py-8 text-center text-xs text-brand-text-secondary">
                No proxy periods recorded for this teacher yet.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {inspectTeacherStats.recentAssignments.map((a, idx) => (
                  <div
                    key={a.id || idx}
                    className="p-3 rounded-xl bg-brand-bg/60 border border-brand-border flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-brand-text-primary">
                        Period {a.periodNo} • Class {a.classLabel}
                      </div>
                      <div className="text-[11px] text-brand-text-secondary mt-0.5">
                        Subject: {a.subjectName} • Relieving: {a.absentTeacherName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-[11px] font-semibold text-brand-primary block">
                        {a.dateKey}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-brand-border">
              <button
                type="button"
                onClick={() => setInspectTeacherStats(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-brand-primary text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
