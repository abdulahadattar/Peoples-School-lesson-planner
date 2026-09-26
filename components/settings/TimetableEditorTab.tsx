import React, { useState, useMemo } from 'react';
import { Teacher } from '../../types';
import {
  SchoolConfig,
  DEFAULT_CLASS_SUBJECTS,
} from '../../services/schoolConfigService';
import {
  TimetableClassEntry,
  TimetablePeriod,
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
} from '../../services/timetable';
import rawTimetableData from '../../data/timetable.json';
import {
  parseTimetableCell,
  formatTimetableCell,
  getQualifiedTeachersForSubject,
  checkTeacherAvailability,
  auditFullTimetable,
  buildTeacherMasterSchedule,
  suggestBestTeacherForSlot,
} from '../../services/timetableConflictEngine';
import {
  exportClassWiseTimetableToExcel,
  exportTeacherWiseTimetableToExcel,
  exportSingleClassToExcel,
  exportSingleTeacherToExcel,
} from '../../services/timetableExcelExport';

interface TimetableEditorTabProps {
  config: SchoolConfig;
  teachers: Teacher[];
  onUpdateCustomTimetable: (updatedCustomTimetable: TimetableClassEntry[]) => void;
  isSaving?: boolean;
}

type ViewMode = 'class' | 'faculty' | 'auditor';

const DEFAULT_BASE_PERIODS: { no: number; start: string; end: string; friStart: string; friEnd: string }[] = [
  { no: 1, start: '8:15 AM', end: '8:50 AM', friStart: '8:15 AM', friEnd: '8:50 AM' },
  { no: 2, start: '8:50 AM', end: '9:30 AM', friStart: '8:50 AM', friEnd: '9:25 AM' },
  { no: 3, start: '9:30 AM', end: '10:10 AM', friStart: '9:25 AM', friEnd: '10:00 AM' },
  { no: 4, start: '10:10 AM', end: '10:50 AM', friStart: '10:30 AM', friEnd: '11:10 AM' },
  { no: 5, start: '11:20 AM', end: '12:00 PM', friStart: '11:10 AM', friEnd: '11:50 AM' },
  { no: 6, start: '12:00 PM', end: '12:40 PM', friStart: '—', friEnd: '—' },
  { no: 7, start: '12:40 PM', end: '01:20 PM', friStart: '—', friEnd: '—' },
];

export const TimetableEditorTab: React.FC<TimetableEditorTabProps> = ({
  config,
  teachers,
  onUpdateCustomTimetable,
  isSaving,
}) => {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('class');

  // Search & Filter state
  const [classFilter, setClassFilter] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Ordered classes list
  const classList = useMemo(() => {
    return config.classes.map(c => ({
      key: c.classKey,
      label: c.romanName || c.displayName || c.classKey,
      classTeacher: c.classTeacher && c.classTeacher !== 'Unassigned' ? c.classTeacher : '',
      subjects: c.subjects || DEFAULT_CLASS_SUBJECTS[c.classKey] || [],
    }));
  }, [config.classes]);

  // Filtered classes list
  const filteredClasses = useMemo(() => {
    if (!classFilter.trim()) return classList;
    const q = classFilter.toLowerCase();
    return classList.filter(
      c => c.label.toLowerCase().includes(q) || c.classTeacher.toLowerCase().includes(q)
    );
  }, [classList, classFilter]);

  // Active selected class for editing
  const [selectedClassLabel, setSelectedClassLabel] = useState<string>(
    classList[0]?.label || 'IV-A'
  );

  // Active selected faculty for Teacher Master Schedule view
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    teachers[0]?.id || ''
  );

  // Local working copy of custom timetable classes
  const [timetableMap, setTimetableMap] = useState<Record<string, TimetableClassEntry>>(() => {
    const map: Record<string, TimetableClassEntry> = {};

    // 1. Load default timetable classes from data/timetable.json
    const defaultClasses = (rawTimetableData as { classes: TimetableClassEntry[] }).classes || [];
    defaultClasses.forEach(c => {
      map[c.label] = JSON.parse(JSON.stringify(c));
    });

    // 2. Synthesize primary classes if not in timetable.json
    config.classes.forEach(sc => {
      const label = sc.romanName || sc.displayName || sc.classKey;
      if (!map[label]) {
        const subjects = sc.subjects && sc.subjects.length > 0
          ? sc.subjects
          : DEFAULT_CLASS_SUBJECTS[sc.classKey] || ['General Studies'];
        const validTeacher = sc.classTeacher && sc.classTeacher !== 'Unassigned' ? sc.classTeacher : '';

        const synthPeriods: TimetablePeriod[] = DEFAULT_BASE_PERIODS.map((bp, pIdx) => {
          const sub = subjects[pIdx % subjects.length] || 'General Studies';
          return {
            no: bp.no,
            start: bp.start,
            end: bp.end,
            friStart: bp.friStart,
            friEnd: bp.friEnd,
            mon: sub,
            tue: sub,
            wed: sub,
            thu: sub,
            fri: pIdx < 5 ? sub : '—',
            sat: '—',
          };
        });

        map[label] = {
          label,
          classTeacher: validTeacher || 'Unassigned',
          periods: synthPeriods,
        };
      }
    });

    // 3. Override with any stored customTimetable in schoolConfig
    if (config.customTimetable && config.customTimetable.length > 0) {
      config.customTimetable.forEach(ct => {
        map[ct.label] = JSON.parse(JSON.stringify(ct));
      });
    }

    return map;
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Cell Editing Modal State
  const [editingCell, setEditingCell] = useState<{
    classLabel: string;
    dayKey: DayKey;
    periodIndex: number;
    periodNo: number;
    currentValue: string;
  } | null>(null);

  // Cell Modal Form State
  const [cellSubject, setCellSubject] = useState('');
  const [cellTeacher, setCellTeacher] = useState('');
  const [isParallel, setIsParallel] = useState(false);
  const [parallelSubject, setParallelSubject] = useState('');
  const [parallelTeacher, setParallelTeacher] = useState('');

  // Currently active class entry
  const currentEntry = timetableMap[selectedClassLabel] || {
    label: selectedClassLabel,
    classTeacher: 'Unassigned',
    periods: DEFAULT_BASE_PERIODS.map(p => ({
      ...p,
      mon: '—',
      tue: '—',
      wed: '—',
      thu: '—',
      fri: '—',
      sat: '—',
    })),
  };

  const selectedClassInfo = classList.find(c => c.label === selectedClassLabel);

  // Full Timetable Audit
  const auditReport = useMemo(() => {
    return auditFullTimetable(timetableMap, teachers);
  }, [timetableMap, teachers]);

  // Teacher Master Schedule (when in faculty mode)
  const teacherSchedule = useMemo(() => {
    if (!selectedTeacherId) return null;
    return buildTeacherMasterSchedule(selectedTeacherId, timetableMap, teachers);
  }, [selectedTeacherId, timetableMap, teachers]);

  // Filtered teachers list for faculty view
  const filteredFaculty = useMemo(() => {
    if (!teacherSearch.trim()) return teachers;
    const q = teacherSearch.toLowerCase();
    return teachers.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.subjects.some(s => s.name.toLowerCase().includes(q)) ||
        (t.designation && t.designation.toLowerCase().includes(q))
    );
  }, [teachers, teacherSearch]);

  // Qualified faculty options for currently edited subject
  const qualifiedFaculty = useMemo(() => {
    if (!editingCell || !cellSubject.trim()) {
      return { primaryTeacher: null, qualifiedTeachers: [], allTeachers: teachers };
    }
    return getQualifiedTeachersForSubject(cellSubject, editingCell.classLabel, teachers);
  }, [editingCell, cellSubject, teachers]);

  // Availability / Clash detection for the teacher selected in modal
  const selectedTeacherAvailability = useMemo(() => {
    if (!editingCell || !cellTeacher) return null;
    const teacherObj = teachers.find(t => t.name === cellTeacher);
    if (!teacherObj) return null;

    return checkTeacherAvailability(
      teacherObj.id,
      editingCell.dayKey,
      editingCell.periodIndex,
      timetableMap,
      editingCell.classLabel,
      teachers,
    );
  }, [editingCell, cellTeacher, timetableMap, teachers]);

  // Availability / Clash detection for parallel teacher
  const parallelTeacherAvailability = useMemo(() => {
    if (!editingCell || !isParallel || !parallelTeacher) return null;
    const teacherObj = teachers.find(t => t.name === parallelTeacher);
    if (!teacherObj) return null;

    return checkTeacherAvailability(
      teacherObj.id,
      editingCell.dayKey,
      editingCell.periodIndex,
      timetableMap,
      editingCell.classLabel,
      teachers,
    );
  }, [editingCell, isParallel, parallelTeacher, timetableMap, teachers]);

  // Helper for showing temporary notices
  const showNotice = (msg: string) => {
    setExportNotice(msg);
    setTimeout(() => {
      setExportNotice(null);
    }, 4000);
  };

  // Open Cell Editor Modal
  const handleOpenCellEditor = (dayKey: DayKey, periodIndex: number, targetClassLabel?: string) => {
    const classLabelToEdit = targetClassLabel || selectedClassLabel;
    const entry = timetableMap[classLabelToEdit];
    if (!entry) return;
    const period = entry.periods[periodIndex];
    if (!period) return;
    const rawVal = period[dayKey] || '';

    const parsed = parseTimetableCell(rawVal, classLabelToEdit, teachers);

    let sub1 = '';
    let teacher1 = '';
    let sub2 = '';
    let teacher2 = '';

    if (parsed.empty) {
      sub1 = '';
      teacher1 = '';
      setIsParallel(false);
    } else if (parsed.isParallel && parsed.parts.length > 1) {
      setIsParallel(true);
      sub1 = parsed.parts[0].subject;
      teacher1 = parsed.parts[0].teacher?.name || '';
      sub2 = parsed.parts[1].subject;
      teacher2 = parsed.parts[1].teacher?.name || '';
    } else {
      setIsParallel(false);
      sub1 = parsed.parts[0]?.subject || parsed.label;
      teacher1 = parsed.parts[0]?.teacher?.name || '';
    }

    setCellSubject(sub1 === '—' ? '' : sub1);
    setCellTeacher(teacher1);
    setParallelSubject(sub2);
    setParallelTeacher(teacher2);

    setEditingCell({
      classLabel: classLabelToEdit,
      dayKey,
      periodIndex,
      periodNo: period.no,
      currentValue: rawVal,
    });
  };

  // Quick Subject Selection: sets subject AND immediately links designated teacher from roster
  const handleSelectSubject = (subjectName: string) => {
    setCellSubject(subjectName);
    if (!editingCell) return;

    const qual = getQualifiedTeachersForSubject(subjectName, editingCell.classLabel, teachers);
    if (qual.primaryTeacher) {
      setCellTeacher(qual.primaryTeacher.name);
    } else if (qual.qualifiedTeachers.length > 0) {
      setCellTeacher(qual.qualifiedTeachers[0].name);
    }
  };

  // Suggest conflict-free faculty
  const handleSuggestConflictFree = () => {
    if (!editingCell || !cellSubject) return;
    const suggestion = suggestBestTeacherForSlot(
      cellSubject,
      editingCell.classLabel,
      editingCell.dayKey,
      editingCell.periodIndex,
      timetableMap,
      teachers,
    );

    if (suggestion) {
      setCellTeacher(suggestion.teacher.name);
    }
  };

  // Save Cell Edit
  const handleSaveCell = () => {
    if (!editingCell) return;
    const { classLabel, dayKey, periodIndex } = editingCell;

    // Format clean value using centralized formatter
    const finalValue = formatTimetableCell(
      cellSubject,
      cellTeacher,
      isParallel,
      parallelSubject,
      parallelTeacher,
    );

    setTimetableMap(prev => {
      const copy = { ...prev };
      const entry = { ...copy[classLabel] };
      const periods = [...entry.periods];
      periods[periodIndex] = {
        ...periods[periodIndex],
        [dayKey]: finalValue,
      };
      entry.periods = periods;
      copy[classLabel] = entry;
      return copy;
    });

    setHasUnsavedChanges(true);
    setEditingCell(null);
  };

  // Copy Day schedule to all other weekdays
  const handleCopyDayToWeekdays = (sourceDay: DayKey) => {
    const confirmCopy = window.confirm(
      `Copy ${DAY_LABELS[sourceDay]}'s schedule to Tuesday, Wednesday, and Thursday for Class ${selectedClassLabel}?`
    );
    if (!confirmCopy) return;

    setTimetableMap(prev => {
      const copy = { ...prev };
      const entry = { ...copy[selectedClassLabel] };
      entry.periods = entry.periods.map(p => ({
        ...p,
        tue: p[sourceDay],
        wed: p[sourceDay],
        thu: p[sourceDay],
      }));
      copy[selectedClassLabel] = entry;
      return copy;
    });

    setHasUnsavedChanges(true);
    showNotice(`Copied ${DAY_LABELS[sourceDay]}'s schedule across Tue–Thu for Class ${selectedClassLabel}`);
  };

  // Auto-Fill Empty Slots from Class Curriculum without creating clashes
  const handleAutoFillEmptySlots = () => {
    const subjects = selectedClassInfo?.subjects || [];
    if (subjects.length === 0) {
      alert('No curriculum subjects defined for this class.');
      return;
    }

    let assignedCount = 0;
    setTimetableMap(prev => {
      const copy = { ...prev };
      const entry = { ...copy[selectedClassLabel] };
      const periods = entry.periods.map((p, pIdx) => {
        const updatedPeriod = { ...p };

        DAY_KEYS.forEach(dayKey => {
          // On Friday, don't fill periods after 5
          if (dayKey === 'fri' && pIdx >= 5) return;

          const currentVal = updatedPeriod[dayKey];
          if (!currentVal || currentVal === '—') {
            // Find a subject whose primary teacher is free at this slot
            for (let i = 0; i < subjects.length; i++) {
              const candidateSubject = subjects[(pIdx + i) % subjects.length];
              const qual = getQualifiedTeachersForSubject(candidateSubject, selectedClassLabel, teachers);

              if (qual.primaryTeacher) {
                const avail = checkTeacherAvailability(
                  qual.primaryTeacher.id,
                  dayKey,
                  pIdx,
                  copy,
                  selectedClassLabel,
                  teachers,
                );
                if (!avail.isBusy) {
                  updatedPeriod[dayKey] = candidateSubject;
                  assignedCount++;
                  break;
                }
              } else {
                updatedPeriod[dayKey] = candidateSubject;
                assignedCount++;
                break;
              }
            }
          }
        });

        return updatedPeriod;
      });

      entry.periods = periods;
      copy[selectedClassLabel] = entry;
      return copy;
    });

    setHasUnsavedChanges(true);
    showNotice(`Successfully scheduled ${assignedCount} empty slots with conflict-free curriculum subjects!`);
  };

  // Reset class back to institutional default
  const handleResetClass = () => {
    const confirmReset = window.confirm(
      `Reset timetable for Class ${selectedClassLabel} back to base institutional defaults?`
    );
    if (!confirmReset) return;

    const defaultClasses = (rawTimetableData as { classes: TimetableClassEntry[] }).classes || [];
    const found = defaultClasses.find(c => c.label === selectedClassLabel);

    if (found) {
      setTimetableMap(prev => ({
        ...prev,
        [selectedClassLabel]: JSON.parse(JSON.stringify(found)),
      }));
    } else {
      const subjects = selectedClassInfo?.subjects || ['General Studies'];
      const validTeacher = selectedClassInfo?.classTeacher && selectedClassInfo.classTeacher !== 'Unassigned'
        ? selectedClassInfo.classTeacher
        : '';
      const synthPeriods: TimetablePeriod[] = DEFAULT_BASE_PERIODS.map((bp, pIdx) => {
        const sub = subjects[pIdx % subjects.length] || 'General Studies';
        return {
          no: bp.no,
          start: bp.start,
          end: bp.end,
          friStart: bp.friStart,
          friEnd: bp.friEnd,
          mon: sub,
          tue: sub,
          wed: sub,
          thu: sub,
          fri: pIdx < 5 ? sub : '—',
          sat: '—',
        };
      });

      setTimetableMap(prev => ({
        ...prev,
        [selectedClassLabel]: {
          label: selectedClassLabel,
          classTeacher: validTeacher || 'Unassigned',
          periods: synthPeriods,
        },
      }));
    }

    setHasUnsavedChanges(true);
    showNotice(`Class ${selectedClassLabel} timetable reset to institutional defaults.`);
  };

  // Push custom timetable to parent / Cloud config
  const handleSaveToCloud = () => {
    const updatedCustomList = Object.values(timetableMap);
    onUpdateCustomTimetable(updatedCustomList);
    setHasUnsavedChanges(false);
    showNotice('All timetable changes synced to cloud database successfully!');
  };

  // EXCEL EXPORTS
  const handleExportAllClassesExcel = () => {
    const file = exportClassWiseTimetableToExcel(timetableMap, teachers, 'Peoples Secondary School');
    showNotice(`Downloaded Class-Wise Excel Workbook: ${file}`);
  };

  const handleExportSingleClassExcel = () => {
    const file = exportSingleClassToExcel(currentEntry, teachers, 'Peoples Secondary School');
    showNotice(`Downloaded Excel Timetable for Class ${selectedClassLabel}: ${file}`);
  };

  const handleExportAllTeachersExcel = () => {
    const file = exportTeacherWiseTimetableToExcel(timetableMap, teachers, 'Peoples Secondary School');
    showNotice(`Downloaded Teacher-Wise Master Excel Workbook: ${file}`);
  };

  const handleExportSingleTeacherExcel = () => {
    const file = exportSingleTeacherToExcel(selectedTeacherId, timetableMap, teachers, 'Peoples Secondary School');
    const teacherName = teachers.find(t => t.id === selectedTeacherId)?.name || 'Teacher';
    showNotice(`Downloaded Excel Schedule for ${teacherName}: ${file}`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {exportNotice && (
        <div className="fixed top-5 right-5 z-[130] px-4 py-3 rounded-2xl bg-brand-surface border border-brand-primary text-brand-text-primary shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-base">
            📊
          </div>
          <div className="text-xs font-semibold">{exportNotice}</div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-brand-text-secondary hover:text-brand-text-primary font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner & Control Deck */}
      <div className="bg-brand-surface rounded-2xl p-5 border border-brand-border flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold text-brand-text-primary">
              Institutional Timetable & Faculty Master Matrix
            </h3>
            {hasUnsavedChanges && (
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                Unsaved Changes
              </span>
            )}
            {auditReport.healthy ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                ✓ 0 Double-Booking Clashes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                ⚠️ {auditReport.totalClashes} Clash{auditReport.totalClashes > 1 ? 'es' : ''} Detected
              </span>
            )}
          </div>
          <p className="text-xs text-brand-text-secondary mt-1">
            Real-time synchronization between curriculum subjects, teacher assignments, double-booking prevention, and institutional Excel exports.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 bg-brand-bg rounded-xl border border-brand-border">
            <button
              type="button"
              onClick={() => setViewMode('class')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'class'
                  ? 'bg-brand-surface text-brand-text-primary shadow-xs font-bold border border-brand-border'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Class Timetables
            </button>
            <button
              type="button"
              onClick={() => setViewMode('faculty')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'faculty'
                  ? 'bg-brand-surface text-brand-text-primary shadow-xs font-bold border border-brand-border'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Teacher Master Load
            </button>
            <button
              type="button"
              onClick={() => setViewMode('auditor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                viewMode === 'auditor'
                  ? 'bg-brand-surface text-brand-text-primary shadow-xs font-bold border border-brand-border'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Conflict Auditor
              {auditReport.totalClashes > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 text-[9px] rounded-full bg-rose-600 text-white">
                  {auditReport.totalClashes}
                </span>
              )}
            </button>
          </div>

          {/* Primary Excel Export Hub Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
              title="Download Timetables in Microsoft Excel format (.xlsx)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export Excel</span>
              <svg className="w-3 h-3 ml-0.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Options */}
            <div className="absolute right-0 mt-1 w-64 p-1.5 bg-brand-surface rounded-2xl border border-brand-border shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-40 space-y-1 text-xs">
              <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-brand-text-secondary">
                Spreadsheet Exports (.xlsx)
              </div>
              <button
                type="button"
                onClick={handleExportAllClassesExcel}
                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-brand-text-primary flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold">Class-Wise Timetable</div>
                  <div className="text-[10px] text-brand-text-secondary">Master overview + all classes</div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                  .xlsx
                </span>
              </button>

              <button
                type="button"
                onClick={handleExportAllTeachersExcel}
                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-brand-text-primary flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold">Teacher-Wise Timetable</div>
                  <div className="text-[10px] text-brand-text-secondary">Workload summary + all faculty</div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                  .xlsx
                </span>
              </button>

              <div className="border-t border-brand-border my-1" />

              <button
                type="button"
                onClick={handleExportSingleClassExcel}
                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary transition-colors text-[11px]"
              >
                📄 Export Class {selectedClassLabel} Only
              </button>

              <button
                type="button"
                onClick={handleExportSingleTeacherExcel}
                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary transition-colors text-[11px]"
              >
                👤 Export Selected Teacher Only
              </button>
            </div>
          </div>

          {/* Cloud Save Button */}
          <button
            type="button"
            onClick={handleSaveToCloud}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover disabled:opacity-50 transition-colors shadow-xs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {isSaving ? 'Syncing...' : 'Save to Cloud'}
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODE 1: CLASS SCHEDULE VIEW
          ───────────────────────────────────────────────────────────── */}
      {viewMode === 'class' && (
        <div className="space-y-4">
          {/* Class Selector Bar with Search & Quick Filter */}
          <div className="bg-brand-surface p-3.5 rounded-2xl border border-brand-border space-y-2.5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-[11px] font-bold text-brand-text-secondary uppercase tracking-wider flex items-center gap-2">
                <span>Select Class Section:</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-bg text-brand-text-secondary font-medium">
                  {filteredClasses.length} of {classList.length} sections
                </span>
              </div>

              <div className="relative w-full sm:w-60">
                <input
                  type="text"
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  placeholder="Filter by class or teacher..."
                  className="w-full px-3 py-1.5 pl-8 text-xs rounded-xl bg-brand-bg border border-brand-border focus:border-brand-primary text-brand-text-primary outline-hidden"
                />
                <svg className="w-3.5 h-3.5 text-brand-text-secondary absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {classFilter && (
                  <button
                    type="button"
                    onClick={() => setClassFilter('')}
                    className="absolute right-2.5 top-2 text-xs text-brand-text-secondary hover:text-brand-text-primary"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Class Buttons Grid */}
            <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto p-1 bg-brand-bg/60 rounded-xl border border-brand-border/60">
              {filteredClasses.map(cls => {
                const isSelected = cls.label === selectedClassLabel;
                const hasClashInClass = auditReport.clashes.some(c => c.classes.includes(cls.label));

                return (
                  <button
                    key={cls.key}
                    type="button"
                    onClick={() => setSelectedClassLabel(cls.label)}
                    className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-brand-primary text-white shadow-sm ring-2 ring-brand-primary/20 font-bold'
                        : 'bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface/90 border border-brand-border/60'
                    }`}
                  >
                    <span>{cls.label}</span>
                    {hasClashInClass && (
                      <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Scheduling clash in this class" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Class Meta & Quick Action Bar */}
          <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center font-bold text-brand-primary text-base border border-brand-primary/20">
                {selectedClassLabel}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-brand-text-primary">
                    Class {selectedClassLabel} Weekly Timetable
                  </h4>
                  <span className="text-xs px-2.5 py-0.5 rounded-lg bg-brand-bg text-brand-text-secondary border border-brand-border">
                    Class Teacher: <strong className="text-brand-text-primary">{selectedClassInfo?.classTeacher || 'Unassigned'}</strong>
                  </span>
                </div>
                <p className="text-xs text-brand-text-secondary mt-0.5">
                  Click any slot to assign subjects, swap teachers, resolve conflicts, or configure dual streams.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportSingleClassExcel}
                className="text-xs px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors font-semibold flex items-center gap-1.5"
                title="Download this specific class timetable as Excel"
              >
                <span>📊 Export Class {selectedClassLabel}</span>
              </button>
              <button
                type="button"
                onClick={handleAutoFillEmptySlots}
                className="text-xs px-3 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors font-medium"
                title="Fill empty slots using conflict-free subjects from class curriculum"
              >
                ⚡ Auto-Fill Empty Slots
              </button>
              <button
                type="button"
                onClick={() => handleCopyDayToWeekdays('mon')}
                className="text-xs px-3 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors font-medium"
                title="Copy Monday's subjects to Tue, Wed, Thu"
              >
                📋 Copy Mon → Tue–Thu
              </button>
              <button
                type="button"
                onClick={handleResetClass}
                className="text-xs px-3 py-1.5 rounded-xl bg-brand-bg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 border border-brand-border transition-colors font-medium"
                title="Revert this class to base institutional timetable"
              >
                Reset Class
              </button>
            </div>
          </div>

          {/* Weekly Schedule Grid */}
          <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-semibold">
                    <th className="py-3 px-3.5 w-28">Period</th>
                    <th className="py-3 px-3.5 w-32">Timing</th>
                    {DAY_KEYS.map(dKey => (
                      <th key={dKey} className="py-3 px-3 font-bold text-brand-text-primary">
                        {DAY_LABELS[dKey]}
                        {dKey === 'fri' && (
                          <span className="ml-1 text-[10px] text-amber-600 font-normal">(Short Day)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {currentEntry.periods.map((period, pIdx) => {
                    const isBreakAfter = pIdx === 3; // Break after Period 4

                    return (
                      <React.Fragment key={period.no}>
                        <tr className="hover:bg-brand-bg/30 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-brand-text-primary">
                            Period {period.no}
                          </td>
                          <td className="py-3 px-3.5 text-brand-text-secondary text-[11px] leading-tight">
                            <div>{period.start} - {period.end}</div>
                            {period.friStart && period.friEnd && period.friStart !== '—' && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                Fri: {period.friStart} - {period.friEnd}
                              </div>
                            )}
                          </td>
                          {DAY_KEYS.map(dKey => {
                            const cellVal = period[dKey] || '—';
                            const parsed = parseTimetableCell(cellVal, selectedClassLabel, teachers);

                            // Detect if any teacher in this slot is double-booked
                            const clashingTeacher = parsed.teachers.find(t => {
                              const avail = checkTeacherAvailability(
                                t.id,
                                dKey,
                                pIdx,
                                timetableMap,
                                selectedClassLabel,
                                teachers,
                              );
                              return avail.isBusy;
                            });

                            let clashNotice = '';
                            if (clashingTeacher) {
                              const avail = checkTeacherAvailability(
                                clashingTeacher.id,
                                dKey,
                                pIdx,
                                timetableMap,
                                selectedClassLabel,
                                teachers,
                              );
                              clashNotice = `Clash: ${clashingTeacher.name} busy in ${avail.busyInClass}`;
                            }

                            return (
                              <td key={dKey} className="py-2 px-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCellEditor(dKey, pIdx)}
                                  className={`w-full text-left p-2.5 rounded-xl border transition-all relative ${
                                    parsed.empty
                                      ? 'border-dashed border-brand-border/70 hover:border-brand-primary/50 text-brand-text-secondary/50 bg-brand-bg/20'
                                      : clashingTeacher
                                      ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-brand-text-primary shadow-xs ring-1 ring-rose-400'
                                      : 'border-brand-border hover:border-brand-primary bg-brand-bg/60 hover:bg-brand-bg text-brand-text-primary shadow-xs'
                                  }`}
                                >
                                  {parsed.empty ? (
                                    <div className="text-[11px] font-medium text-brand-text-secondary/60">
                                      + Assign Slot
                                    </div>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <div className="font-bold text-xs truncate text-brand-text-primary">
                                        {parsed.label}
                                      </div>
                                      {parsed.teachers.length > 0 ? (
                                        <div className="text-[10px] text-brand-text-secondary truncate flex items-center gap-1">
                                          <span>👤</span>
                                          <span>{parsed.teachers.map(t => t.name).join(', ')}</span>
                                        </div>
                                      ) : (
                                        <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                          No teacher assigned
                                        </div>
                                      )}
                                      {clashNotice && (
                                        <div className="text-[9px] font-bold text-rose-600 dark:text-rose-400 truncate">
                                          ⚠️ {clashNotice}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>

                        {/* Recess Break Banner after Period 4 */}
                        {isBreakAfter && (
                          <tr className="bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 font-semibold border-y border-amber-200/60 dark:border-amber-800/40">
                            <td colSpan={8} className="py-2.5 px-4 text-center text-xs tracking-wider uppercase">
                              ☕ Recess Break (10:50 AM – 11:20 AM / Friday: 10:00 AM – 10:30 AM)
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE 2: FACULTY MASTER LOAD VIEW
          ───────────────────────────────────────────────────────────── */}
      {viewMode === 'faculty' && (
        <div className="space-y-4">
          {/* Faculty Selector & Workload Metric Bar */}
          <div className="bg-brand-surface p-4 rounded-2xl border border-brand-border flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider flex items-center gap-2">
                <span>Select Faculty Member:</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-bg text-brand-text-secondary font-medium">
                  {teachers.length} faculty registered
                </span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedTeacherId}
                  onChange={e => setSelectedTeacherId(e.target.value)}
                  className="w-full sm:w-80 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-bg border border-brand-border focus:border-brand-primary text-brand-text-primary outline-hidden"
                >
                  {teachers
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.subjects.map(s => s.name).join(', ')} ({t.designation || 'Teacher'})
                      </option>
                    ))}
                </select>

                <button
                  type="button"
                  onClick={handleExportSingleTeacherExcel}
                  className="text-xs px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors font-semibold flex items-center gap-1.5 whitespace-nowrap"
                  title="Download selected teacher weekly timetable as Excel"
                >
                  <span>📊 Export Faculty Schedule</span>
                </button>
              </div>
            </div>

            {teacherSchedule && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
                  <div className="text-[10px] uppercase font-bold text-brand-text-secondary">Weekly Load</div>
                  <div className="text-base font-bold text-brand-text-primary">
                    {teacherSchedule.totalTeachingPeriods} <span className="text-xs font-normal">periods</span>
                  </div>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
                  <div className="text-[10px] uppercase font-bold text-brand-text-secondary">Classes Taught</div>
                  <div className="text-xs font-bold text-brand-text-primary">
                    {teacherSchedule.classesTaught.join(', ') || 'None'}
                  </div>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-brand-bg border border-brand-border text-center">
                  <div className="text-[10px] uppercase font-bold text-brand-text-secondary">Clash Status</div>
                  <div className={`text-xs font-bold ${teacherSchedule.clashCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {teacherSchedule.clashCount > 0 ? `⚠️ ${teacherSchedule.clashCount} Clashes` : '✓ Conflict Free'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Teacher Weekly Grid */}
          {teacherSchedule && (
            <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-semibold">
                      <th className="py-3 px-3.5 w-24">Period</th>
                      {DAY_KEYS.map(dKey => (
                        <th key={dKey} className="py-3 px-3 font-bold text-brand-text-primary">
                          {DAY_LABELS[dKey]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {[1, 2, 3, 4, 5, 6, 7].map(periodNo => {
                      const pIdx = periodNo - 1;
                      const isBreakAfter = periodNo === 4;

                      return (
                        <React.Fragment key={periodNo}>
                          <tr className="hover:bg-brand-bg/30 transition-colors">
                            <td className="py-3 px-3.5 font-bold text-brand-text-primary">
                              Period {periodNo}
                            </td>
                            {DAY_KEYS.map(dKey => {
                              const slots = teacherSchedule.weeklySchedule[dKey].filter(
                                s => s.periodNo === periodNo
                              );

                              if (slots.length === 0) {
                                return (
                                  <td key={dKey} className="py-2.5 px-3">
                                    <div className="p-2 rounded-xl border border-dashed border-brand-border/60 bg-brand-bg/10 text-brand-text-secondary/50 text-[11px] font-medium text-center">
                                      Free (Staff Room)
                                    </div>
                                  </td>
                                );
                              }

                              const isClash = slots.length > 1;

                              return (
                                <td key={dKey} className="py-2.5 px-3">
                                  {slots.map((slot, sIdx) => (
                                    <div
                                      key={sIdx}
                                      onClick={() => handleOpenCellEditor(dKey, pIdx, slot.classLabel)}
                                      className={`p-2 rounded-xl border cursor-pointer transition-all mb-1 last:mb-0 ${
                                        isClash
                                          ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                                          : 'border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-text-primary'
                                      }`}
                                    >
                                      <div className="font-bold text-xs flex items-center justify-between">
                                        <span>Class {slot.classLabel}</span>
                                        {isClash && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-rose-600 text-white font-bold">
                                            CLASH
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-brand-text-secondary truncate mt-0.5">
                                        {slot.subject}
                                      </div>
                                      {slot.clashingWithClass && (
                                        <div className="text-[9px] text-rose-600 dark:text-rose-400 font-medium">
                                          Double-booked with Class {slot.clashingWithClass}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </td>
                              );
                            })}
                          </tr>

                          {isBreakAfter && (
                            <tr className="bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 font-semibold border-y border-amber-200/60 dark:border-amber-800/40">
                              <td colSpan={7} className="py-2 px-4 text-center text-xs tracking-wider uppercase">
                                ☕ Recess Break (Staff Room)
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE 3: CONFLICT AUDITOR VIEW
          ───────────────────────────────────────────────────────────── */}
      {viewMode === 'auditor' && (
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
                        onClick={() => {
                          setSelectedClassLabel(clash.classes[0]);
                          setViewMode('class');
                          handleOpenCellEditor(clash.dayKey, clash.periodIndex, clash.classes[0]);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-surface hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs"
                      >
                        Resolve in Class {clash.classes[0]}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClassLabel(clash.classes[1]);
                          setViewMode('class');
                          handleOpenCellEditor(clash.dayKey, clash.periodIndex, clash.classes[1]);
                        }}
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
      )}

      {/* ─────────────────────────────────────────────────────────────
          PERIOD CELL EDITOR MODAL
          ───────────────────────────────────────────────────────────── */}
      {editingCell && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-brand-surface border border-brand-border rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <div>
                <h4 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
                  <span>Edit Period {editingCell.periodNo} ({DAY_LABELS[editingCell.dayKey]})</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-brand-primary/10 text-brand-primary">
                    Class {editingCell.classLabel}
                  </span>
                </h4>
                <p className="text-xs text-brand-text-secondary mt-0.5">
                  Synchronized with official faculty roster & curriculum
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="w-8 h-8 rounded-lg hover:bg-brand-bg flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary font-bold text-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Quick Subject Assignment (Direct Subject Sync) */}
            {selectedClassInfo?.subjects && selectedClassInfo.subjects.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-brand-text-secondary uppercase">
                    Curriculum Subjects:
                  </label>
                  <span className="text-[10px] text-brand-text-secondary">
                    Auto-assigns designated teacher
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-brand-bg/70 rounded-xl border border-brand-border max-h-28 overflow-y-auto">
                  {selectedClassInfo.subjects.map((sub, sIdx) => {
                    const qual = getQualifiedTeachersForSubject(sub, editingCell.classLabel, teachers);
                    const hasTeacher = !!qual.primaryTeacher || qual.qualifiedTeachers.length > 0;
                    const isSelected = cellSubject.toLowerCase() === sub.toLowerCase();

                    return (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => handleSelectSubject(sub)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-brand-primary text-white shadow-xs font-bold'
                            : 'bg-brand-surface hover:bg-brand-border text-brand-text-primary border border-brand-border'
                        }`}
                      >
                        {sub}
                        {hasTeacher && <span className="ml-1 opacity-75">★</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subject Name Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-secondary">
                Subject Name:
              </label>
              <input
                type="text"
                value={cellSubject}
                onChange={e => setCellSubject(e.target.value)}
                placeholder="e.g. Mathematics, Physics, English..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-brand-bg border border-brand-border focus:border-brand-primary text-brand-text-primary outline-hidden"
              />
            </div>

            {/* Assigned Teacher Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-brand-text-secondary">
                  Assigned Faculty:
                </label>
                {selectedTeacherAvailability?.isBusy && (
                  <button
                    type="button"
                    onClick={handleSuggestConflictFree}
                    className="text-[11px] font-semibold text-brand-primary hover:underline"
                  >
                    Suggest Free Alternative
                  </button>
                )}
              </div>
              <select
                value={cellTeacher}
                onChange={e => setCellTeacher(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl bg-brand-bg border text-brand-text-primary outline-hidden transition-colors ${
                  selectedTeacherAvailability?.isBusy
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-brand-border focus:border-brand-primary'
                }`}
              >
                <option value="">No specific teacher (or Class Teacher)</option>

                {/* Section designated teacher first */}
                {qualifiedFaculty.primaryTeacher && (
                  <optgroup label="Designated Section Faculty (teachers.json)">
                    <option value={qualifiedFaculty.primaryTeacher.name}>
                      ★ {qualifiedFaculty.primaryTeacher.name} (Designated for Class {editingCell.classLabel})
                    </option>
                  </optgroup>
                )}

                {/* Alternative subject specialists */}
                {qualifiedFaculty.qualifiedTeachers.length > 0 && (
                  <optgroup label="Alternative Subject Specialists">
                    {qualifiedFaculty.qualifiedTeachers
                      .filter(t => !qualifiedFaculty.primaryTeacher || t.id !== qualifiedFaculty.primaryTeacher.id)
                      .map(t => (
                        <option key={t.id} value={t.name}>
                          {t.name} ({t.designation || 'Subject Specialist'})
                        </option>
                      ))}
                  </optgroup>
                )}

                {/* All other faculty */}
                <optgroup label="Other School Faculty">
                  {teachers
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(t => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Live Clash Warning Alert */}
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

            {/* Parallel / Dual Subject Configuration */}
            <div className="pt-2 border-t border-brand-border space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-brand-text-primary">
                <input
                  type="checkbox"
                  checked={isParallel}
                  onChange={e => setIsParallel(e.target.checked)}
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
                        onChange={e => setParallelSubject(e.target.value)}
                        placeholder="e.g. Sindhi"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-brand-surface border border-brand-border text-brand-text-primary outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-brand-text-secondary">2nd Teacher:</label>
                      <select
                        value={parallelTeacher}
                        onChange={e => setParallelTeacher(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-brand-surface border border-brand-border text-brand-text-primary outline-hidden"
                      >
                        <option value="">Select faculty...</option>
                        {teachers.map(t => (
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

            {/* Modal Actions */}
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
                className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors font-medium"
              >
                Clear Slot (—)
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary border border-brand-border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCell}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover shadow-sm"
                >
                  Apply to Timetable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
