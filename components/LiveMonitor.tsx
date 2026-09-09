import React, { useState, useEffect, useMemo } from 'react';
import { Teacher } from '../types';
import {
  TimetableData,
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
  dayKeyForDate,
  getSchoolStatus,
  loadTimetable,
  standardSchedule,
  computeStaff,
} from '../services/timetable';
import { SubstitutionAssignment, getStoredSubstitutions } from '../services/storageService';
import { ClassTier, getClassTier } from '../services/tierHelpers';
import { SubstitutionManager } from './SubstitutionManager';
import { BreakDutiesPanel } from './BreakDutiesPanel';
import { LiveClassCard } from './live/LiveClassCard';
import { StaffRoomPanel } from './live/StaffRoomPanel';
import { LiveMonitorHeader } from './live/LiveMonitorHeader';

export const LiveMonitor: React.FC<{ teachers: Teacher[] }> = ({ teachers = [] }) => {
  const [timetable, setTimetable] = useState<TimetableData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Real-time device clock
  const [now, setNow] = useState(() => new Date());

  // previewDay / previewPeriod === null -> auto-synced to current clock
  const [previewDay, setPreviewDay] = useState<DayKey | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<number | null>(null);

  const [monitorMode, setMonitorMode] = useState<'classes' | 'duties' | 'substitutions'>('classes');
  const [substitutions, setSubstitutions] = useState<SubstitutionAssignment[]>([]);
  const [absentTeacherIds, setAbsentTeacherIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<'all' | ClassTier>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Live timer: updates every 1 second directly from device clock
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
        setAbsentTeacherIds(stored.absentTeacherIds || []);
        setSubstitutions(stored.assignments || []);
      })
      .catch(console.error);
  }, []);

  // Directly synchronized to device clock
  const clockDate = now;
  const liveDay = dayKeyForDate(clockDate);
  const isLive = previewDay === null && previewPeriod === null;

  // Active day: if user explicitly selected previewDay, use it; otherwise use liveDay, or default to Monday if Sunday
  const effectiveDay: DayKey = previewDay ?? (liveDay ?? 'mon');

  const schedule = useMemo(
    () => (timetable ? standardSchedule(timetable.classes, effectiveDay) : []),
    [timetable, effectiveDay],
  );

  const effectiveMinutes = clockDate.getHours() * 60 + clockDate.getMinutes();

  // Compute school status for current clock time
  const schoolStatus = useMemo(() => {
    if (!timetable) return null;
    return getSchoolStatus(timetable.classes, effectiveDay, effectiveMinutes);
  }, [timetable, effectiveDay, effectiveMinutes]);

  // Live active period index (if inside an active running period)
  const livePeriodIndex = schoolStatus?.state === 'in_period' ? schoolStatus.periodIndex : -1;

  // Automatically detect which period should be displayed in live mode
  const autoLivePeriodIndex = useMemo(() => {
    if (livePeriodIndex >= 0) return livePeriodIndex;
    if (schoolStatus?.state === 'break' && schoolStatus.nextPeriodNo) {
      return Math.max(0, schoolStatus.nextPeriodNo - 1);
    }
    if (schoolStatus?.state === 'before_school') return 0;
    if (schoolStatus?.state === 'after_school') return Math.max(0, schedule.length - 1);
    return 0;
  }, [livePeriodIndex, schoolStatus, schedule.length]);

  // Currently viewed period index:
  const effectiveCardPeriodIndex = useMemo(() => {
    if (previewPeriod !== null) {
      return Math.min(Math.max(0, previewPeriod), Math.max(0, schedule.length - 1));
    }
    return Math.min(Math.max(0, autoLivePeriodIndex), Math.max(0, schedule.length - 1));
  }, [previewPeriod, autoLivePeriodIndex, schedule.length]);

  // Whether the currently viewed period is actively running in real-time right now
  const isCurrentLivePeriodActive =
    livePeriodIndex >= 0 &&
    effectiveCardPeriodIndex === livePeriodIndex &&
    (previewDay === null || previewDay === liveDay);

  // Compute staff busy & free for the currently displayed period
  const staff = useMemo(() => {
    if (!timetable) return null;
    return computeStaff(timetable.classes, teachers, effectiveDay, effectiveCardPeriodIndex);
  }, [timetable, teachers, effectiveDay, effectiveCardPeriodIndex]);

  // Filter classes by tier group (Primary, Elementary, Middle, Secondary)
  const filteredClasses = useMemo(() => {
    if (!timetable) return [];
    return timetable.classes.filter(c => {
      const tier = getClassTier(c.label);
      if (classFilter !== 'all' && tier !== classFilter) return false;
      return true;
    });
  }, [timetable, classFilter]);

  const goLive = () => {
    setPreviewDay(null);
    setPreviewPeriod(null);
  };

  const stepPeriod = (dir: 1 | -1) => {
    if (schedule.length === 0) return;
    const base = effectiveCardPeriodIndex;
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

  const currentPeriodInfo = schedule[effectiveCardPeriodIndex] ?? null;

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

  const formattedTime = clockDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-5 animate-fadeIn">
      {/* Header & Control Bar */}
      <LiveMonitorHeader
        monitorMode={monitorMode}
        onMonitorModeChange={setMonitorMode}
        absentCount={absentTeacherIds.length}
        isLive={isLive}
        onGoLive={goLive}
        effectiveDay={effectiveDay}
        liveDay={liveDay}
        onSelectDay={d => {
          setPreviewDay(d);
          if (previewPeriod === null) setPreviewPeriod(effectiveCardPeriodIndex);
        }}
        effectiveCardPeriodIndex={effectiveCardPeriodIndex}
        livePeriodIndex={livePeriodIndex}
        previewPeriod={previewPeriod}
        onSelectPeriod={i => {
          if (livePeriodIndex === i && previewPeriod !== null) {
            goLive();
          } else {
            setPreviewPeriod(i);
            if (previewDay === null) setPreviewDay(effectiveDay);
          }
        }}
        schedule={schedule}
        currentPeriodInfo={currentPeriodInfo}
        clockDate={clockDate}
        schoolStatus={schoolStatus}
        classFilter={classFilter}
        onClassFilterChange={setClassFilter}
        totalClassesCount={timetable.classes.length}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {/* Mode View: Substitutions */}
      {monitorMode === 'substitutions' && (
        <SubstitutionManager
          timetable={timetable}
          teachers={teachers}
          day={effectiveDay}
          onSubstitutionsChanged={(newSubs, newAbsent) => {
            setSubstitutions(newSubs);
            setAbsentTeacherIds(newAbsent);
          }}
        />
      )}

      {/* Mode View: Ground Duties */}
      {monitorMode === 'duties' && (
        <div className="space-y-4">
          {/* Day selection tabs for Ground Duties */}
          <div className="glass-card rounded-2xl p-4 border border-brand-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-text-tertiary">
                Select Day:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DAY_KEYS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPreviewDay(d)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      effectiveDay === d
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
                    }`}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-brand-text-secondary flex items-center gap-2">
              <span>Current Time: <strong className="text-brand-text-primary font-mono">{formattedTime}</strong></span>
              {isLive && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Live Sync
                </span>
              )}
            </div>
          </div>

          <BreakDutiesPanel
            day={effectiveDay}
            onDayChange={setPreviewDay}
            teachers={teachers}
            absentTeacherIds={absentTeacherIds}
            currentMinutes={effectiveMinutes}
          />
        </div>
      )}

      {/* Mode View: Live Classes & Staff Room */}
      {monitorMode === 'classes' && (
        <>
          {/* Class Cards Grid */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClasses.map(c => (
              <LiveClassCard
                key={c.label}
                entry={c}
                day={effectiveDay}
                periodIndex={effectiveCardPeriodIndex}
                live={isLive}
                isLivePeriodActive={isCurrentLivePeriodActive}
                schoolStatusState={schoolStatus?.state}
                teachers={teachers}
                now={clockDate}
                substitutions={substitutions}
                absentTeacherIds={absentTeacherIds}
                searchQuery={searchQuery}
              />
            ))}
          </div>

          {/* Empty Search State */}
          {filteredClasses.length === 0 && (
            <div className="text-center py-12 glass-card rounded-2xl border border-brand-border">
              <p className="text-sm text-brand-text-secondary">No classes match the current filter.</p>
            </div>
          )}

          {/* Staff Room Live Availability Panel */}
          {staff && (
            <StaffRoomPanel
              day={effectiveDay}
              periodIndex={effectiveCardPeriodIndex}
              periodInfo={currentPeriodInfo}
              freeTeachers={staff.free}
              busyTeachers={staff.busy}
              absentTeacherIds={absentTeacherIds}
            />
          )}
        </>
      )}
    </div>
  );
};

export default LiveMonitor;
