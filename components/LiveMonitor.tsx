import React, { useState, useEffect, useMemo } from 'react';
import { Teacher } from '../types';
import {
  TimetableData,
  DAY_KEYS,
  DAY_LABELS,
  loadTimetable,
  computeStaff,
} from '../services/timetable';
import { SubstitutionAssignment, getStoredSubstitutions } from '../services/storageService';
import { ClassTier, getClassTier } from '../services/tierHelpers';
import { useSchoolConfig } from '../hooks/useSchoolConfig';
import { SubstitutionManager } from './SubstitutionManager';
import { BreakDutiesPanel } from './BreakDutiesPanel';
import { LiveClassCard } from './live/LiveClassCard';
import { StaffRoomPanel } from './live/StaffRoomPanel';
import { LiveMonitorHeader } from './live/LiveMonitorHeader';
import { syncClassesWithConfig } from './live/liveTimetableSync';
import { useLiveScheduleClock } from './live/useLiveScheduleClock';

export const LiveMonitor: React.FC<{ teachers: Teacher[] }> = ({ teachers = [] }) => {
  const [timetable, setTimetable] = useState<TimetableData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [monitorMode, setMonitorMode] = useState<'classes' | 'duties' | 'substitutions'>('classes');
  const [substitutions, setSubstitutions] = useState<SubstitutionAssignment[]>([]);
  const [absentTeacherIds, setAbsentTeacherIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<'all' | ClassTier>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  // Retrieve School Admin settings
  const { config: schoolConfig } = useSchoolConfig();

  // Active faculty roster: prefer live centralized config if available
  const activeTeachers = useMemo(() => {
    if (schoolConfig?.teachers && schoolConfig.teachers.length > 0) {
      return schoolConfig.teachers;
    }
    return teachers;
  }, [schoolConfig?.teachers, teachers]);

  // Merge live School Admin config with timetable classes
  const syncedClasses = useMemo(
    () => syncClassesWithConfig(timetable, schoolConfig),
    [timetable, schoolConfig]
  );

  const syncedTimetable = useMemo(() => {
    if (!timetable) return null;
    return {
      ...timetable,
      classes: syncedClasses,
    };
  }, [timetable, syncedClasses]);

  const {
    clockDate,
    effectiveDay,
    liveDay,
    isLive,
    schedule,
    effectiveMinutes,
    schoolStatus,
    livePeriodIndex,
    effectiveCardPeriodIndex,
    isCurrentLivePeriodActive,
    currentPeriodInfo,
    previewPeriod,
    setPreviewDay,
    setPreviewPeriod,
    goLive,
  } = useLiveScheduleClock(syncedTimetable);

  // Compute staff busy & free for currently displayed period
  const staff = useMemo(() => {
    if (!syncedTimetable) return null;
    return computeStaff(syncedTimetable.classes, activeTeachers, effectiveDay, effectiveCardPeriodIndex);
  }, [syncedTimetable, activeTeachers, effectiveDay, effectiveCardPeriodIndex]);

  // Filter classes by tier group
  const filteredClasses = useMemo(() => {
    if (!syncedTimetable) return [];
    return syncedClasses.filter(c => {
      const tier = getClassTier(c.label);
      if (classFilter !== 'all' && tier !== classFilter) return false;
      return true;
    });
  }, [syncedTimetable, syncedClasses, classFilter]);

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
            setPreviewDay(effectiveDay);
          }
        }}
        schedule={schedule}
        currentPeriodInfo={currentPeriodInfo}
        clockDate={clockDate}
        schoolStatus={schoolStatus}
        classFilter={classFilter}
        onClassFilterChange={setClassFilter}
        totalClassesCount={syncedClasses.length}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {/* Mode View: Substitutions */}
      {monitorMode === 'substitutions' && (
        <SubstitutionManager
          timetable={syncedTimetable || timetable}
          teachers={activeTeachers}
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
            teachers={activeTeachers}
            absentTeacherIds={absentTeacherIds}
            currentMinutes={effectiveMinutes}
          />
        </div>
      )}

      {/* Mode View: Live Classes & Staff Room */}
      {monitorMode === 'classes' && (
        <>
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
                teachers={activeTeachers}
                now={clockDate}
                substitutions={substitutions}
                absentTeacherIds={absentTeacherIds}
                searchQuery={searchQuery}
              />
            ))}
          </div>

          {filteredClasses.length === 0 && (
            <div className="text-center py-12 glass-card rounded-2xl border border-brand-border">
              <p className="text-sm text-brand-text-secondary">No classes match the current filter.</p>
            </div>
          )}

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
