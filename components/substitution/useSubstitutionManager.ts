import { useState, useEffect, useMemo } from 'react';
import { Teacher } from '../../types';
import {
  DayKey,
  TimetableData,
  computeStaff,
  resolveSlot,
} from '../../services/timetable';
import {
  getSubstitutionsForDate,
  saveSubstitutionsForDate,
  getAllSubstitutionsHistory,
  computeTeacherProxyStats,
  formatWhatsAppProxyNotice,
  SubstitutionAssignment,
  DailySubstitutionRecord,
  TeacherProxyStats,
} from '../../services/substitutionService';
import { copyToClipboard } from '../../utils/clipboard';
import { AffectedSlot } from './SubstitutionTodayBoard';
import { printSubstitutionSlip } from '../../services/substitutionPrint';

export function useSubstitutionManager(
  timetable: TimetableData,
  teachers: Teacher[],
  day: DayKey,
  onSubstitutionsChanged?: (assignments: SubstitutionAssignment[], absentIds: string[]) => void
) {
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
  }, [todayKey, onSubstitutionsChanged]);

  const combinedHistory = useMemo(() => {
    const existingOtherDates = historyRecords.filter((r) => r.dateKey !== todayKey);
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
    teacherProxyStats.forEach((s) => map.set(s.teacherId, s));
    return map;
  }, [teacherProxyStats]);

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
    const newAbsent = absentTeacherIds.filter((id) => id !== teacherId);
    const absentTeacher = teachers.find((t) => t.id === teacherId);
    const newAssignments = assignments.filter(
      (a) => !absentTeacher || a.absentTeacherName !== absentTeacher.name
    );
    persistChanges(newAbsent, newAssignments);
  };

  const affectedSlots: AffectedSlot[] = useMemo(() => {
    if (absentTeacherIds.length === 0) return [];
    const results: AffectedSlot[] = [];
    const absentSet = new Set(absentTeacherIds);
    const maxPeriods =
      day === 'fri' ? 5 : Math.max(...timetable.classes.map((c) => c.periods.length));

    for (let pIdx = 0; pIdx < maxPeriods; pIdx++) {
      const staffStatus = computeStaff(timetable.classes, teachers, day, pIdx);
      const availableFreeTeachers = staffStatus.free.filter((t) => !absentSet.has(t.id));

      for (const entry of timetable.classes) {
        if (pIdx >= entry.periods.length) continue;
        const period = entry.periods[pIdx];
        const slot = resolveSlot(entry, day, pIdx, teachers);

        for (const t of slot.teachers) {
          if (absentSet.has(t.id)) {
            const annotated = availableFreeTeachers.map((ft) => {
              const st = statsMap.get(ft.id);
              const teachesSameSubject = ft.subjects.some((sub) =>
                slot.label.toLowerCase().includes(sub.name.toLowerCase())
              );
              return {
                ...ft,
                thisWeekCount: st?.thisWeekCount || 0,
                teachesSameSubject,
                loadLevel: st?.loadLevel || 'low',
              };
            });

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

  const handleAssignProxy = (slot: AffectedSlot, proxyTeacherId: string) => {
    const proxyTeacher = teachers.find((t) => t.id === proxyTeacherId);
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
      (a) =>
        !(
          a.periodNo === slot.periodNo &&
          a.classLabel === slot.classLabel &&
          a.absentTeacherName === slot.absentTeacher.name
        )
    );
    persistChanges(absentTeacherIds, [...filtered, newAssignment]);
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    const filtered = assignments.filter((a) => a.id !== assignmentId);
    persistChanges(absentTeacherIds, filtered);
  };

  const handleCopyWhatsAppNotice = async () => {
    const absentTeacherNames = absentTeacherIds
      .map((id) => teachers.find((t) => t.id === id)?.name)
      .filter((n): n is string => !!n);

    const message = formatWhatsAppProxyNotice(todayKey, absentTeacherNames, assignments);
    const success = await copyToClipboard(message);
    if (success) {
      setWhatsappCopied(true);
      setTimeout(() => setWhatsappCopied(false), 3000);
    }
  };

  const handlePrintSlip = () => {
    const absentTeacherNames = absentTeacherIds
      .map((id) => teachers.find((t) => t.id === id)?.name)
      .filter((n): n is string => !!n);

    printSubstitutionSlip(todayKey, day, affectedSlots, assignments, absentTeacherNames);
  };

  const coveredCount = affectedSlots.filter((s) =>
    assignments.some(
      (a) =>
        a.periodNo === s.periodNo &&
        a.classLabel === s.classLabel &&
        a.absentTeacherName === s.absentTeacher.name
    )
  ).length;

  const equitySummary = useMemo(() => {
    let totalWeekProxies = 0;
    let heavyCount = 0;
    let moderateCount = 0;
    let optimalCount = 0;

    teacherProxyStats.forEach((s) => {
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
      (t) =>
        t.teacherName.toLowerCase().includes(q) ||
        (t.designation && t.designation.toLowerCase().includes(q))
    );
  }, [teacherProxyStats, searchLedger]);

  return {
    isLoaded,
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
  };
}
