import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  loadTimetable,
  locatePeriod,
  parseTimeToMinutes,
  periodTimeRange,
  resolveSlot,
  standardSchedule,
} from '../services/timetable';
import { canonicalName } from '../services/teacherRoster';
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, RefreshIcon, UserIcon } from './icons/MiscIcons';

const ACCESS_CODE = 'phssj'; // fixed for now — principal / coordinator access

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
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

const LOCK_KEY = 'liveAccess';

const AccessGate: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().toLowerCase() === ACCESS_CODE) {
      localStorage.setItem(LOCK_KEY, ACCESS_CODE);
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center animate-fadeInUp">
      <div className="w-16 h-16 rounded-2xl bg-brand-primary-soft dark:bg-brand-primary/20 flex items-center justify-center mb-5">
        <LockIcon className="w-8 h-8 text-brand-primary dark:text-blue-300" />
      </div>
      <h2 className="text-xl font-bold text-brand-text-primary mb-1">Staff Monitor</h2>
      <p className="text-sm text-brand-text-secondary text-center mb-8">
        This view is restricted to the Principal and Coordinators.
        <br />
        Enter the access code to continue.
      </p>
      <form onSubmit={submit} className="w-full flex gap-2">
        <input
          type="password"
          autoFocus
          value={code}
          onChange={e => { setCode(e.target.value); setError(false); }}
          placeholder="Access code"
          className={`flex-1 px-4 py-2.5 rounded-xl border text-sm bg-brand-surface dark:bg-brand-panel outline-none transition-colors focus:ring-2 ${
            error
              ? 'border-red-400 focus:ring-red-200'
              : 'border-brand-border focus:ring-brand-primary/30 focus:border-brand-primary'
          }`}
        />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white brand-gradient hover:opacity-95 active:scale-95 transition-all shadow-card"
        >
          Unlock
        </button>
      </form>
      {error && (
        <p className="mt-3 text-xs text-red-500 animate-fadeIn">Incorrect code — please try again.</p>
      )}
    </div>
  );
};

const ClassCard: React.FC<{
  entry: TimetableClassEntry;
  day: DayKey;
  periodIndex: number;
  live: boolean;
  teachers: Teacher[];
  now: Date;
}> = ({ entry, day, periodIndex, live, teachers, now }) => {
  // In live mode each class locates its own current period (VII has its own
  // Friday times). In preview mode the chosen period index applies to all.
  const loc = useMemo(() => {
    if (!live) return { index: periodIndex, state: 'in' as const, label: '' };
    return locatePeriod(entry, day, now.getHours() * 60 + now.getMinutes());
  }, [entry, day, live, periodIndex, now]);

  const effIndex = loc.state === 'in' ? loc.index : -1;
  const slot = useMemo(
    () => (effIndex >= 0 ? resolveSlot(entry, day, effIndex, teachers) : null),
    [entry, day, effIndex, teachers],
  );
  const period = effIndex >= 0 ? entry.periods[effIndex] : null;
  const time = period ? periodTimeRange(period, day) : null;

  let state: 'busy' | 'break' | 'free' | 'closed' = 'busy';
  let stateText = '';
  if (live) {
    if (loc.state === 'in') {
      state = 'busy';
      stateText = `${loc.label} · ${formatMinutes(time!.start)} – ${formatMinutes(time!.end)}`;
    } else if (loc.state === 'break') {
      state = 'break';
      stateText = 'Break';
    } else if (loc.state === 'before' || loc.state === 'after') {
      state = 'closed';
      stateText = loc.label;
    }
  } else {
    state = slot?.empty ? 'free' : 'busy';
    stateText = period
      ? `Period ${period.no} · ${formatMinutes(time!.start)} – ${formatMinutes(time!.end)}`
      : 'No period';
  }

  return (
    <div
      className={`glass-card rounded-2xl p-4 flex flex-col gap-3 transition-shadow hover:shadow-card-hover ${
        state === 'busy' ? 'ring-1 ring-brand-primary/10' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-white dark:bg-brand-panel border border-brand-border flex items-center justify-center text-xs font-bold text-brand-text-primary shrink-0">
            {entry.label}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-text-primary leading-tight truncate">
              Class {entry.label}
            </p>
            <p className="text-[10px] text-brand-text-secondary truncate flex items-center gap-1">
              <UserIcon className="w-3 h-3 shrink-0" />
              {canonicalName(entry.classTeacher, teachers)}
            </p>
          </div>
        </div>
        {state === 'busy' && <LiveDot />}
        {state === 'break' && (
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">BREAK</span>
        )}
        {state === 'free' && (
          <span className="text-[10px] font-semibold text-slate-400 shrink-0">FREE</span>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center gap-2 min-h-[52px]">
        {state === 'busy' && slot && (
          <>
            <p className="text-[13px] font-bold text-brand-text-primary">
              {slot.label}
              {slot.parts.length > 1 && (
                <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-brand-primary dark:text-blue-300 bg-brand-primary-soft dark:bg-brand-primary/20 rounded px-1.5 py-0.5 align-middle">
                  parallel
                </span>
              )}
            </p>
            {slot.teachers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {slot.teachers.map(t => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-brand-panel border border-brand-border px-2 py-1"
                  >
                    <Avatar name={t.name} />
                    <span className="text-[11px] font-medium text-brand-text-primary">
                      {t.name}
                      {t.designation ? (
                        <span className="text-brand-text-tertiary"> · {t.designation}</span>
                      ) : null}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-brand-text-tertiary">Subject only — teacher not assigned</p>
            )}
          </>
        )}
        {state === 'free' && (
          <p className="text-sm text-brand-text-tertiary">No lesson — free period</p>
        )}
        {state === 'break' && (
          <p className="text-sm text-amber-600 dark:text-amber-400">Recess / break between classes</p>
        )}
        {state === 'closed' && (
          <p className="text-sm text-brand-text-tertiary">{stateText}</p>
        )}
      </div>

      <p className="text-[10px] text-brand-text-tertiary border-t border-brand-border pt-2">
        {stateText}
      </p>
    </div>
  );
};

const LiveMonitor: React.FC<{ teachers: Teacher[] }> = ({ teachers }) => {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(LOCK_KEY) === ACCESS_CODE);
  const [timetable, setTimetable] = useState<TimetableData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // previewDay / previewPeriod === null  → live mode
  const [previewDay, setPreviewDay] = useState<DayKey | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<number | null>(null);

  const liveDay = dayKeyForDate(now);
  const day: DayKey | null = previewDay ?? liveDay;
  const isLive = previewDay === null;

  useEffect(() => {
    if (!unlocked) return;
    loadTimetable()
      .then(setTimetable)
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load timetable'));
  }, [unlocked]);

  // Live clock + auto period rollover
  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, [isLive]);

  const schedule = useMemo(
    () => (timetable ? standardSchedule(timetable.classes) : []),
    [timetable],
  );

  const livePeriodIndex = useMemo(() => {
    if (!timetable || !liveDay || timetable.classes.length === 0) return -1;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const loc = locatePeriod(timetable.classes[0], liveDay, minutes);
    return loc.state === 'in' ? loc.index : -1;
  }, [timetable, liveDay, now]);

  // Effective period index across the grid
  const periodIndex = previewPeriod ?? livePeriodIndex;

  const staff = useMemo(() => {
    if (!timetable || day === null) return null;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (isLive) {
      const busyMap = new Map<string, string[]>();
      for (const entry of timetable.classes) {
        const loc = locatePeriod(entry, day, nowMinutes);
        if (loc.state !== 'in') continue;
        const slot = resolveSlot(entry, day, loc.index, teachers);
        for (const t of slot.teachers) {
          const list = busyMap.get(t.id) ?? [];
          list.push(entry.label);
          busyMap.set(t.id, list);
        }
      }
      const busy: { teacher: Teacher; busyIn: string[]; status: 'busy' | 'free' }[] = [];
      for (const [id, classesList] of busyMap) {
        const teacher = teachers.find(t => t.id === id);
        if (teacher) busy.push({ teacher, busyIn: classesList, status: 'busy' });
      }
      const busyIds = new Set(busyMap.keys());
      const free = teachers.filter(t => !busyIds.has(t.id));
      return { busy, free };
    }
    if (periodIndex < 0) {
      // Outside school hours (or preview with no period chosen) — everyone is free.
      return { busy: [], free: teachers };
    }
    return computeStaff(timetable.classes, teachers, day, periodIndex);
  }, [timetable, teachers, day, periodIndex, isLive, now]);

  const currentPeriodInfo = schedule[periodIndex] ?? null;
  const isSunday = liveDay === null;

  const lock = () => {
    localStorage.removeItem(LOCK_KEY);
    setUnlocked(false);
  };

  const goLive = () => {
    setPreviewDay(null);
    setPreviewPeriod(null);
    setNow(new Date());
  };

  const stepPeriod = (dir: 1 | -1) => {
    if (schedule.length === 0) return;
    const base = previewPeriod ?? livePeriodIndex;
    if (base < 0) return;
    const next = Math.min(schedule.length - 1, Math.max(0, base + dir));
    setPreviewPeriod(next);
    if (previewDay === null && liveDay !== null) setPreviewDay(liveDay);
  };

  const stepDay = (dir: 1 | -1) => {
    const idx = day ? DAY_KEYS.indexOf(day) : 0;
    const next = (idx + dir + 6) % 6;
    setPreviewDay(DAY_KEYS[next]);
    if (previewPeriod === null) setPreviewPeriod(0);
  };

  if (!unlocked) {
    return <AccessGate onUnlock={() => setUnlocked(true)} />;
  }

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
            <div key={i} className="h-40 skeleton" />
          ))}
        </div>
      </div>
    );
  }

  const dayLabel = day ? DAY_LABELS[day] : 'Weekend';
  const clockText = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="text-lg font-bold text-brand-text-primary">Live Classes Monitor</h2>
              {isLive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-0.5">
                  <LiveDot />
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">LIVE</span>
                </span>
              ) : (
                <button
                  onClick={goLive}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-2.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">PREVIEW — back to live</span>
                </button>
              )}
            </div>
            <p className="text-xs text-brand-text-secondary">
              {dayLabel} · {clockText}
              {isLive && isSunday ? ' — school is closed on Sunday' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => stepDay(-1)}
              className="p-2 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary transition-colors"
              title="Previous day"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => stepPeriod(-1)}
              disabled={periodIndex <= 0}
              className="p-2 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Previous period"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="px-3 py-1.5 rounded-xl bg-brand-bg dark:bg-brand-panel border border-brand-border text-sm font-semibold text-brand-text-primary whitespace-nowrap">
              {currentPeriodInfo
                ? `Period ${currentPeriodInfo.no} · ${currentPeriodInfo.start} – ${currentPeriodInfo.end}`
                : isLive
                  ? 'Outside school hours'
                  : 'No period selected'}
            </span>
            <button
              onClick={() => stepPeriod(1)}
              disabled={periodIndex >= schedule.length - 1}
              className="p-2 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Next period"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => stepDay(1)}
              className="p-2 rounded-xl border border-brand-border bg-white dark:bg-brand-panel text-brand-text-secondary hover:text-brand-text-primary transition-colors"
              title="Next day"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
            {!isLive && (
              <button
                onClick={goLive}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white brand-gradient hover:opacity-95 active:scale-95 transition-all shadow-card"
              >
                <RefreshIcon className="w-4 h-4" />
                Live now
              </button>
            )}
          </div>
        </div>

        {/* Day + period selector */}
        <div className="mt-4 pt-4 border-t border-brand-border flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-text-tertiary mr-1">Day</span>
          {DAY_KEYS.map((d, i) => (
            <button
              key={d}
              onClick={() => {
                setPreviewDay(d);
                if (previewPeriod === null) setPreviewPeriod(0);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                day === d
                  ? 'bg-brand-primary text-white shadow-card'
                  : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              {DAY_LABELS[d].slice(0, 3)}
            </button>
          ))}
          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-text-tertiary ml-4 mr-1">Period</span>
          {schedule.map((p, i) => (
            <button
              key={p.no}
              onClick={() => {
                setPreviewPeriod(i);
                if (previewDay === null && liveDay !== null) setPreviewDay(liveDay);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                periodIndex === i && !isLive
                  ? 'bg-brand-primary text-white shadow-card'
                  : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              {p.no}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={lock}
              className="text-[11px] text-brand-text-tertiary hover:text-red-500 transition-colors"
            >
              Lock monitor
            </button>
          </div>
        </div>
      </div>

      {isLive && isSunday && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          School is closed today (Sunday). Use the day selector above to preview any school day.
        </div>
      )}

      {/* Class grid */}
      {day && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {timetable.classes.map(entry => (
            <ClassCard
              key={entry.label}
              entry={entry}
              day={day}
              periodIndex={periodIndex >= 0 ? periodIndex : 0}
              live={isLive}
              teachers={teachers}
              now={now}
            />
          ))}
        </div>
      )}

      {/* Staff room */}
      {staff && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-brand-primary-soft dark:bg-brand-primary/20 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-brand-primary dark:text-blue-300" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-brand-text-primary">Staff Room</h3>
                <p className="text-[11px] text-brand-text-secondary">
                  Who is free at {dayLabel}
                  {currentPeriodInfo ? ` · Period ${currentPeriodInfo.no}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
                {staff.free.length} free
              </span>
              <span className="rounded-full bg-brand-primary-soft dark:bg-brand-primary/20 border border-brand-primary/20 px-2.5 py-1 font-semibold text-brand-primary dark:text-blue-300">
                {staff.busy.length} teaching
              </span>
            </div>
          </div>

          {staff.free.length === 0 ? (
            <p className="text-sm text-brand-text-tertiary">Everyone is teaching right now.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {staff.free.map(t => (
                <div
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-xl bg-white dark:bg-brand-panel border border-brand-border px-3 py-2.5"
                >
                  <Avatar name={t.name} size="md" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-brand-text-primary truncate flex items-center gap-1.5">
                      {t.name}
                    </p>
                    <p className="text-[10px] text-brand-text-tertiary truncate">
                      {t.designation ?? (t.subjects ?? []).join(', ')}
                    </p>
                  </div>
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Free" />
                </div>
              ))}
            </div>
          )}

          {staff.busy.length > 0 && (
            <div className="mt-4 pt-4 border-t border-brand-border">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-text-tertiary mb-2">
                Currently teaching
              </p>
              <div className="flex flex-wrap gap-2">
                {staff.busy.map(s => (
                  <span
                    key={s.teacher.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-brand-panel border border-brand-border px-2.5 py-1"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
                    <span className="text-[11px] font-medium text-brand-text-primary">{s.teacher.name}</span>
                    <span className="text-[10px] text-brand-text-tertiary">
                      in {s.busyIn.join(', ')}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveMonitor;