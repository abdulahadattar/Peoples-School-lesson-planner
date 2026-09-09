import React, { useEffect, useMemo, useState } from 'react';
import { Teacher } from '../types';
import {
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
  TimetableClassEntry,
  TimetableData,
  computeStaff,
  dayKeyForDate,
  formatMinutes,
  getSchoolStatus,
  loadTimetable,
  locatePeriod,
  periodTimeRange,
  resolveSlot,
  standardSchedule,
} from '../services/timetable';
import { canonicalName, subjectNames } from '../services/teacherRoster';
import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon, UserIcon } from './icons/MiscIcons';
import { SubstitutionManager } from './SubstitutionManager';
import { SubstitutionAssignment, getStoredSubstitutions } from '../services/storageService';

function initials(name: string): string {
  const parts = name.replace(/^(sir|miss|ma'am|mrs|mr)\s+/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[9px]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ${dim} bg-brand-primary-soft text-brand-primary dark:bg-brand-primary/20 dark:text-blue-300 ring-1 ring-brand-border shrink-0`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

function LiveDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 ${className}`}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

const ClassCard: React.FC<{
  entry: TimetableClassEntry;
  day: DayKey;
  periodIndex: number;
  live: boolean;
  teachers: Teacher[];
  now: Date;
  substitutions?: SubstitutionAssignment[];
  absentTeacherIds?: string[];
  searchQuery?: string;
}> = ({
  entry,
  day,
  periodIndex,
  live,
  teachers,
  now,
  substitutions = [],
  absentTeacherIds = [],
  searchQuery = '',
}) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const loc = useMemo(() => {
    if (!live) return { index: periodIndex, state: 'in' as const, label: `Period ${entry.periods[periodIndex]?.no ?? 1}` };
    return locatePeriod(entry, day, minutes);
  }, [entry, day, live, periodIndex, minutes]);

  // When live but outside active period, fallback to showing the selected or period 0
  const effIndex = loc.state === 'in' ? loc.index : (periodIndex >= 0 ? periodIndex : 0);
  const slot = useMemo(
    () => (effIndex >= 0 && effIndex < entry.periods.length ? resolveSlot(entry, day, effIndex, teachers) : null),
    [entry, day, effIndex, teachers],
  );
  const period = effIndex >= 0 && effIndex < entry.periods.length ? entry.periods[effIndex] : null;
  const time = period ? periodTimeRange(period, day) : null;

  const activeSub = useMemo(() => {
    if (!period) return null;
    return substitutions.find(
      s => s.periodNo === period.no && s.classLabel === entry.label
    );
  }, [period, substitutions, entry.label]);

  const isAbsent = useMemo(() => {
    if (!slot || absentTeacherIds.length === 0) return false;
    return slot.teachers.some(t => absentTeacherIds.includes(t.id));
  }, [slot, absentTeacherIds]);

  // Determine state display
  let statusBadge = (
    <span className="text-[10px] font-semibold text-brand-text-tertiary">Period {period?.no ?? 1}</span>
  );
  let isLiveActive = false;

  if (live) {
    if (loc.state === 'in') {
      isLiveActive = true;
      statusBadge = (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
          <LiveDot />
          <span>IN SESSION</span>
        </span>
      );
    } else if (loc.state === 'break') {
      statusBadge = (
        <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          ☕ RECESS BREAK
        </span>
      );
    } else if (loc.state === 'before') {
      statusBadge = (
        <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-[10px] font-bold text-blue-700 dark:text-blue-300">
          UPCOMING: P1
        </span>
      );
    } else if (loc.state === 'after') {
      statusBadge = (
        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-brand-border text-[10px] font-bold text-brand-text-secondary">
          SCHEDULE OVER
        </span>
      );
    }
  }

  // Filter check
  const isMatch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (entry.label.toLowerCase().includes(q)) return true;
    if (entry.classTeacher.toLowerCase().includes(q)) return true;
    if (slot?.label.toLowerCase().includes(q)) return true;
    if (slot?.teachers.some(t => t.name.toLowerCase().includes(q))) return true;
    if (activeSub?.proxyTeacherName.toLowerCase().includes(q)) return true;
    return false;
  }, [entry, slot, activeSub, searchQuery]);

  if (!isMatch) return null;

  return (
    <div
      className={`glass-card rounded-2xl p-4 flex flex-col justify-between gap-3 transition-all hover:shadow-card-hover ${
        isLiveActive
          ? 'ring-2 ring-emerald-500/40 border-emerald-400/40 bg-emerald-50/20 dark:bg-emerald-950/10'
          : 'border-brand-border'
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
              isLiveActive
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary'
            }`}>
              {entry.label}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-text-primary leading-tight truncate">
                Class {entry.label}
              </p>
              <p className="text-[10px] text-brand-text-secondary truncate flex items-center gap-1">
                <UserIcon className="w-3 h-3 shrink-0" />
                <span>Class Teacher: {canonicalName(entry.classTeacher, teachers)}</span>
              </p>
            </div>
          </div>
          {statusBadge}
        </div>

        <div className="py-2 px-3 rounded-xl bg-brand-bg/70 dark:bg-brand-panel/60 border border-brand-border/60">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
              {loc.state === 'break' ? 'Next Subject' : `Period ${period?.no ?? 1}`}
            </span>
            {time && (
              <span className="text-[10px] font-medium text-brand-text-tertiary">
                {formatMinutes(time.start)} – {formatMinutes(time.end)}
              </span>
            )}
          </div>

          {slot && !slot.empty ? (
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-bold text-brand-text-primary">
                  {slot.label}
                </p>
                {slot.parts.length > 1 && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-brand-primary dark:text-blue-300 bg-brand-primary-soft dark:bg-brand-primary/20 rounded px-1.5 py-0.5">
                    Parallel
                  </span>
                )}
              </div>

              {slot.teachers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {slot.teachers.map(t => {
                    const teacherIsAbsent = absentTeacherIds.includes(t.id);
                    return (
                      <span
                        key={t.id}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${
                          teacherIsAbsent
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 line-through opacity-75'
                            : 'bg-white dark:bg-brand-panel border-brand-border text-brand-text-primary'
                        }`}
                      >
                        <Avatar name={t.name} />
                        <span className="text-[11px] font-medium">
                          {t.name}
                          {t.designation ? (
                            <span className="text-brand-text-tertiary"> · {t.designation}</span>
                          ) : null}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-brand-text-tertiary mt-1">Teacher unassigned</p>
              )}
            </div>
          ) : (
            <p className="text-xs font-medium text-brand-text-tertiary py-1">
              Free Period / No Lesson
            </p>
          )}

          {/* Proxy & Absence Notifications */}
          {activeSub && (
            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 flex items-center justify-between text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1">
                <span>🔄 Proxy:</span>
                <span className="font-bold">{activeSub.proxyTeacherName}</span>
              </span>
              <span className="text-[9px] font-normal text-emerald-600 dark:text-emerald-400">
                covering {activeSub.absentTeacherName}
              </span>
            </div>
          )}
          {!activeSub && isAbsent && (
            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700/60 text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
              <span>⚠️ Teacher Absent — Proxy Needed</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] text-brand-text-tertiary flex items-center justify-between pt-1 border-t border-brand-border/60">
        <span>Class {entry.label}</span>
        <span>{entry.periods.length} Total Periods</span>
      </div>
    </div>
  );
};

export const LiveMonitor: React.FC<{ teachers: Teacher[] }> = ({ teachers }) => {
  const [timetable, setTimetable] = useState<TimetableData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  
  // previewDay / previewPeriod === null -> synced to live clock
  const [previewDay, setPreviewDay] = useState<DayKey | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<number | null>(null);
  
  const [monitorMode, setMonitorMode] = useState<'classes' | 'substitutions'>('classes');
  const [substitutions, setSubstitutions] = useState<SubstitutionAssignment[]>([]);
  const [absentTeacherIds, setAbsentTeacherIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<'all' | 'primary' | 'middle' | 'secondary'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Live timer: updates every 1 second to keep clock and periods synced
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Load timetable data
  useEffect(() => {
    loadTimetable()
      .then(setTimetable)
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load timetable'));
  }, []);

  // Load substitutions for today
  useEffect(() => {
    const todayKey = new Date().toISOString().split('T')[0];
    getStoredSubstitutions(todayKey)
      .then(stored => {
        setAbsentTeacherIds(stored.absentTeacherIds);
        setSubstitutions(stored.assignments);
      })
      .catch(console.error);
  }, []);

  const liveDay = dayKeyForDate(now);
  const isSunday = liveDay === null;
  const isLive = previewDay === null && previewPeriod === null;

  // Active day: if user explicitly selected previewDay, use it; otherwise use liveDay, or default to Monday if Sunday
  const effectiveDay: DayKey = previewDay ?? (liveDay ?? 'mon');

  const schedule = useMemo(
    () => (timetable ? standardSchedule(timetable.classes, effectiveDay) : []),
    [timetable, effectiveDay],
  );

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Compute school status for current time
  const schoolStatus = useMemo(() => {
    if (!timetable) return null;
    return getSchoolStatus(timetable.classes, effectiveDay, nowMinutes);
  }, [timetable, effectiveDay, nowMinutes]);

  // Live active period index (if inside an active running period)
  const livePeriodIndex = schoolStatus?.state === 'in_period' ? schoolStatus.periodIndex : -1;

  // Active period index for display:
  // - In preview mode: user's selected period (previewPeriod)
  // - In live mode during class: the live running period (livePeriodIndex)
  // - In live mode during break: next upcoming period index
  // - In live mode before school: period 0
  // - In live mode after school / weekend: -1 (no period is currently active)
  const activePeriodIndex = useMemo(() => {
    if (previewPeriod !== null) return previewPeriod;
    if (livePeriodIndex >= 0) return livePeriodIndex;
    if (schoolStatus?.state === 'before_school') return 0;
    if (schoolStatus?.state === 'break' && schoolStatus.nextPeriodNo) {
      return Math.max(0, schoolStatus.nextPeriodNo - 1);
    }
    return -1;
  }, [previewPeriod, livePeriodIndex, schoolStatus]);

  // Safe period index for card rendering and staff room when no period is running
  const effectiveCardPeriodIndex = activePeriodIndex >= 0 ? activePeriodIndex : (schedule.length > 0 ? 0 : 0);

  // Compute staff busy & free
  const staff = useMemo(() => {
    if (!timetable) return null;
    return computeStaff(timetable.classes, teachers, effectiveDay, effectiveCardPeriodIndex);
  }, [timetable, teachers, effectiveDay, effectiveCardPeriodIndex]);

  // Filter classes by group
  const filteredClasses = useMemo(() => {
    if (!timetable) return [];
    return timetable.classes.filter(c => {
      const lbl = c.label.toUpperCase();
      if (classFilter === 'primary') return lbl.startsWith('IV') || lbl.startsWith('V');
      if (classFilter === 'middle') return lbl.startsWith('VI') || lbl.startsWith('VII') || lbl.startsWith('VIII');
      if (classFilter === 'secondary') return lbl.startsWith('IX') || lbl.startsWith('X') || lbl.startsWith('XI') || lbl.startsWith('XII');
      return true;
    });
  }, [timetable, classFilter]);

  const goLive = () => {
    setPreviewDay(null);
    setPreviewPeriod(null);
    setNow(new Date());
  };

  const stepPeriod = (dir: 1 | -1) => {
    if (schedule.length === 0) return;
    const base = previewPeriod ?? (livePeriodIndex >= 0 ? livePeriodIndex : 0);
    const next = Math.min(schedule.length - 1, Math.max(0, base + dir));
    setPreviewPeriod(next);
    if (previewDay === null) setPreviewDay(effectiveDay);
  };

  const stepDay = (dir: 1 | -1) => {
    const idx = DAY_KEYS.indexOf(effectiveDay);
    const next = (idx + dir + 6) % 6;
    setPreviewDay(DAY_KEYS[next]);
    if (previewPeriod === null) setPreviewPeriod(effectiveCardPeriodIndex);
  };

  const currentPeriodInfo = previewPeriod !== null
    ? schedule[previewPeriod]
    : (livePeriodIndex >= 0 ? schedule[livePeriodIndex] : null);

  if (loadError) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center animate-fadeInUp">
        <h2 className="text-lg font-bold text-brand-text-primary mb-2">Couldn't load the timetable</h2>
        <p className="text-sm text-brand-text-secondary">{loadError}</p>
      </div>
    );
  }

  if (!timetable) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-4 animate-pulse">
        <div className="h-24 glass-card rounded-2xl" />
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 glass-card rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Formatted date and time strings
  const formattedDate = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const isPMHour = now.getHours() >= 12;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-5 animate-fadeIn">
      {/* Top Banner: Mode & Live Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-brand-bg dark:bg-brand-panel p-1 rounded-xl border border-brand-border">
          <button
            type="button"
            onClick={() => setMonitorMode('classes')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              monitorMode === 'classes'
                ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-sm'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            ⚡ Live Classes & Staff Room
          </button>
          <button
            type="button"
            onClick={() => setMonitorMode('substitutions')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              monitorMode === 'substitutions'
                ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-sm'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            <span>🔄 Teacher Substitution & Proxy</span>
            {absentTeacherIds.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white leading-none">
                {absentTeacherIds.length}
              </span>
            )}
          </button>
        </div>

        {/* Live sync status badge */}
        <div className="flex items-center gap-2 flex-wrap">
          {isLive ? (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-sm">
              <LiveDot />
              <span>SYNCED WITH SYSTEM TIME</span>
            </span>
          ) : (
            <button
              onClick={goLive}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-all shadow-sm"
              title="Click to reset to real-time clock"
            >
              <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
              <span>PREVIEW MODE — Return to Live</span>
            </button>
          )}
        </div>
      </div>

      {monitorMode === 'substitutions' ? (
        <SubstitutionManager
          timetable={timetable}
          teachers={teachers}
          day={effectiveDay}
          onSubstitutionsChanged={(newSubs, newAbsent) => {
            setSubstitutions(newSubs);
            setAbsentTeacherIds(newAbsent);
          }}
        />
      ) : (
        <>
          {/* Main Monitor Header & Live Clock Dashboard */}
          <div className="glass-card rounded-2xl p-5 md:p-6 shadow-soft border border-brand-border">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left Column: Date, Time & Live School Status */}
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h2 className="text-xl font-extrabold text-brand-text-primary tracking-tight">
                    Live Classes Monitor
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-md bg-brand-primary-soft text-brand-primary dark:bg-brand-primary/20 dark:text-blue-300 text-[11px] font-bold">
                    {DAY_LABELS[effectiveDay]}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs md:text-sm text-brand-text-secondary font-medium flex-wrap">
                  <span>📅 {formattedDate}</span>
                  <span>·</span>
                  <span className="font-mono font-bold text-brand-text-primary inline-flex items-center gap-1">
                    <span>🕒 {formattedTime}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase ${
                      isPMHour ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                    }`}>
                      {isPMHour ? 'PM (Afternoon/Night)' : 'AM (Morning)'}
                    </span>
                  </span>
                </div>

                {/* Real-time status bar */}
                {schoolStatus && (
                  <div className="mt-3 inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white dark:bg-brand-panel border border-brand-border text-xs font-medium flex-wrap">
                    {schoolStatus.state === 'in_period' && (
                      <>
                        <LiveDot />
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {schoolStatus.periodLabel} In Session
                        </span>
                        <span className="text-brand-text-secondary">
                          ({formatMinutes(schoolStatus.startMinutes)} – {formatMinutes(schoolStatus.endMinutes)})
                        </span>
                        <span className="text-[11px] font-bold text-brand-primary bg-brand-primary-soft dark:bg-brand-primary/20 px-2.5 py-0.5 rounded-full">
                          ⏱️ {schoolStatus.remainingMinutes} min remaining
                        </span>
                      </>
                    )}

                    {schoolStatus.state === 'break' && (
                      <>
                        <span className="text-amber-500 font-bold">☕ {schoolStatus.periodLabel}</span>
                        <span className="text-brand-text-secondary">
                          ({formatMinutes(schoolStatus.startMinutes)} – {formatMinutes(schoolStatus.endMinutes)})
                        </span>
                        {schoolStatus.nextPeriodNo && (
                          <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                            Period {schoolStatus.nextPeriodNo} starts in {schoolStatus.remainingMinutes} min
                          </span>
                        )}
                      </>
                    )}

                    {schoolStatus.state === 'before_school' && (
                      <>
                        <span className="text-blue-600 dark:text-blue-400 font-bold">🌅 Before School Hours</span>
                        <span className="text-brand-text-secondary">
                          Period 1 commences at 8:15 AM (in {schoolStatus.remainingMinutes} min)
                        </span>
                      </>
                    )}

                    {schoolStatus.state === 'after_school' && (
                      <>
                        <span className="text-slate-600 dark:text-slate-400 font-bold">🌙 School Day Completed</span>
                        <span className="text-brand-text-secondary">
                          Classes ended at 2:30 PM (7 Periods Completed)
                        </span>
                      </>
                    )}

                    {schoolStatus.state === 'closed' && (
                      <>
                        <span className="text-amber-600 dark:text-amber-400 font-bold">📅 Weekend (School Closed)</span>
                        <span className="text-brand-text-secondary">
                          Previewing Monday schedule
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Period Stepper Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepDay(-1)}
                  className="p-2.5 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary transition-all shadow-sm active:scale-95"
                  title="Previous day"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepPeriod(-1)}
                  disabled={effectiveCardPeriodIndex <= 0}
                  className="p-2.5 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                  title="Previous period"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>

                <div className="px-4 py-2 rounded-xl bg-brand-bg dark:bg-brand-panel border border-brand-border text-center shadow-inner min-w-[150px]">
                  <p className="text-xs font-bold text-brand-text-primary">
                    {currentPeriodInfo
                      ? `Period ${currentPeriodInfo.no}`
                      : schoolStatus?.state === 'after_school'
                        ? '🌙 Day Completed'
                        : schoolStatus?.state === 'before_school'
                          ? '🌅 Before School'
                          : schoolStatus?.state === 'break'
                            ? '☕ Recess / Break'
                            : 'Schedule Overview'}
                  </p>
                  <p className="text-[10px] text-brand-text-secondary">
                    {currentPeriodInfo
                      ? (currentPeriodInfo.formattedRange || `${currentPeriodInfo.start} – ${currentPeriodInfo.end}`)
                      : schoolStatus?.state === 'after_school'
                        ? 'Ended at 2:30 PM'
                        : schoolStatus?.state === 'before_school'
                          ? 'Starts at 8:15 AM'
                          : schoolStatus?.state === 'break'
                            ? 'Next period soon'
                            : '7 Total Periods'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => stepPeriod(1)}
                  disabled={effectiveCardPeriodIndex >= schedule.length - 1}
                  className="p-2.5 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                  title="Next period"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepDay(1)}
                  className="p-2.5 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary transition-all shadow-sm active:scale-95"
                  title="Next day"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>

                {!isLive && (
                  <button
                    type="button"
                    onClick={goLive}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white brand-gradient hover:opacity-95 active:scale-95 transition-all shadow-card"
                  >
                    <RefreshIcon className="w-3.5 h-3.5" />
                    <span>Sync Live</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Selectors: Day Tabs & Period Pills */}
            <div className="mt-5 pt-4 border-t border-brand-border flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-text-tertiary mr-1">
                  Day:
                </span>
                {DAY_KEYS.map(d => {
                  const isCurrentLiveDay = liveDay === d;
                  const isSelected = effectiveDay === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setPreviewDay(d);
                        if (previewPeriod === null) setPreviewPeriod(effectiveCardPeriodIndex);
                      }}
                      className={`relative px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-brand-primary text-white shadow-card'
                          : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
                      }`}
                    >
                      {DAY_LABELS[d].slice(0, 3)}
                      {isCurrentLiveDay && !isSelected && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-text-tertiary mr-1">
                  Period:
                </span>
                {schedule.map((p, i) => {
                  const isSelected = previewPeriod !== null ? previewPeriod === i : livePeriodIndex === i;
                  const isLiveInThisPeriod = livePeriodIndex === i;
                  return (
                    <button
                      key={p.no}
                      type="button"
                      onClick={() => {
                        setPreviewPeriod(i);
                        if (previewDay === null) setPreviewDay(effectiveDay);
                      }}
                      className={`relative px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-brand-primary text-white shadow-card'
                          : isLiveInThisPeriod
                            ? 'bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-400 text-emerald-800 dark:text-emerald-300 font-extrabold'
                            : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
                      }`}
                      title={p.formattedRange || `${p.start} – ${p.end}`}
                    >
                      <span>P{p.no}</span>
                      {isLiveInThisPeriod && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="mt-4 pt-4 border-t border-brand-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <span className="text-[11px] font-bold text-brand-text-tertiary mr-1">Filter:</span>
                {(['all', 'primary', 'middle', 'secondary'] as const).map(grp => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setClassFilter(grp)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                      classFilter === grp
                        ? 'bg-brand-primary-soft text-brand-primary dark:bg-brand-primary/20 dark:text-blue-300 font-bold'
                        : 'text-brand-text-secondary hover:text-brand-text-primary'
                    }`}
                  >
                    {grp === 'all' ? 'All Classes' : grp}
                  </button>
                ))}
              </div>

              <div className="w-full sm:w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search class, subject, or teacher..."
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-primary placeholder:text-brand-text-tertiary outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </div>
            </div>
          </div>

          {/* Sunday Notice */}
          {isSunday && isLive && (
            <div className="rounded-2xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs md:text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3">
              <span>
                🏫 <strong>Sunday Notice:</strong> School is closed today. The monitor is displaying Monday's timetable for planning.
              </span>
              <button
                type="button"
                onClick={() => setPreviewDay('mon')}
                className="px-3 py-1 rounded-lg bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold text-xs shrink-0"
              >
                Plan Monday
              </button>
            </div>
          )}

          {/* Classes Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredClasses.map(entry => (
              <ClassCard
                key={entry.label}
                entry={entry}
                day={effectiveDay}
                periodIndex={effectiveCardPeriodIndex}
                live={isLive}
                teachers={teachers}
                now={now}
                substitutions={substitutions}
                absentTeacherIds={absentTeacherIds}
                searchQuery={searchQuery}
              />
            ))}
          </div>

          {/* Staff Room Live Availability */}
          {staff && (
            <div className="glass-card rounded-2xl p-5 md:p-6 shadow-soft border border-brand-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-brand-primary-soft dark:bg-brand-primary/20 flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-brand-primary dark:text-blue-300" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-brand-text-primary">Staff Room Availability</h3>
                    <p className="text-xs text-brand-text-secondary">
                      Teacher status for {DAY_LABELS[effectiveDay]} · Period {schedule[effectiveCardPeriodIndex]?.no ?? 1} ({schedule[effectiveCardPeriodIndex]?.formattedRange || `${schedule[effectiveCardPeriodIndex]?.start} – ${schedule[effectiveCardPeriodIndex]?.end}`})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300">
                    🟢 {staff.free.length} Free / Available
                  </span>
                  <span className="rounded-full bg-brand-primary-soft dark:bg-brand-primary/20 border border-brand-primary/30 px-3 py-1 font-bold text-brand-primary dark:text-blue-300">
                    📚 {staff.busy.length} Teaching
                  </span>
                </div>
              </div>

              {/* Free Teachers Grid */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-tertiary mb-2.5">
                    Available Teachers in Staff Room ({staff.free.length})
                  </h4>
                  {staff.free.length === 0 ? (
                    <p className="text-xs text-brand-text-tertiary italic">
                      All teachers are currently assigned to classes for this period.
                    </p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                      {staff.free.map(t => {
                        const isTeacherAbsent = absentTeacherIds.includes(t.id);
                        return (
                          <div
                            key={t.id}
                            className={`flex items-center gap-2.5 rounded-xl p-2.5 border transition-all ${
                              isTeacherAbsent
                                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 opacity-60'
                                : 'bg-white dark:bg-brand-panel border-brand-border'
                            }`}
                          >
                            <Avatar name={t.name} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-bold truncate ${
                                isTeacherAbsent ? 'text-rose-700 dark:text-rose-300 line-through' : 'text-brand-text-primary'
                              }`}>
                                {t.name}
                              </p>
                              <p className="text-[10px] text-brand-text-tertiary truncate">
                                {isTeacherAbsent ? 'Marked Absent Today' : (t.designation ?? subjectNames(t).join(', '))}
                              </p>
                            </div>
                            {!isTeacherAbsent && (
                              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Free" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Currently Teaching */}
                {staff.busy.length > 0 && (
                  <div className="pt-4 border-t border-brand-border">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-tertiary mb-2.5">
                      Currently Teaching ({staff.busy.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {staff.busy.map(s => (
                        <div
                          key={s.teacher.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-brand-panel border border-brand-border px-3 py-1.5 shadow-sm"
                        >
                          <Avatar name={s.teacher.name} />
                          <div className="text-left">
                            <span className="text-xs font-semibold text-brand-text-primary">{s.teacher.name}</span>
                            <span className="text-[10px] text-brand-primary dark:text-blue-300 font-bold ml-1.5">
                              in {s.busyIn.join(', ')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LiveMonitor;
