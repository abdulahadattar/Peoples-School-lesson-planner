import {
  DayKey,
  DAY_KEYS,
  TimetablePeriod,
  TimetableClassEntry,
  PeriodLocation,
  SchoolTimeStatus,
} from './types';

export function dayKeyForDate(d: Date): DayKey | null {
  const day = d.getDay();
  if (day === 0) return null;
  return DAY_KEYS[day - 1];
}

export function parseTimeToMinutes(t: string): number {
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return NaN;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap) {
    if (h === 12) h = 12;
    else if (h >= 7 && h <= 11) h = h;
    else if (h >= 13) h = h;
    else h += 12;
  }
  return h * 60 + min;
}

export function formatMinutes(min?: number | null): string {
  if (min === undefined || min === null || typeof min !== 'number' || Number.isNaN(min)) {
    return '--:--';
  }
  const safeMin = Math.max(0, Math.floor(min));
  const h24 = Math.floor(safeMin / 60) % 24;
  const m = safeMin % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ap = h24 >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function getPakistanDate(baseDate: Date = new Date()): Date {
  try {
    const pktString = baseDate.toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
    return new Date(pktString);
  } catch {
    const utc = baseDate.getTime() + baseDate.getTimezoneOffset() * 60000;
    return new Date(utc + 5 * 3600000);
  }
}

export function periodTimeRange(p: TimetablePeriod, day: DayKey): { start: number; end: number } {
  if (day === 'fri') {
    if (p.friStart && p.friEnd) {
      return { start: parseTimeToMinutes(p.friStart), end: parseTimeToMinutes(p.friEnd) };
    }
    return { start: NaN, end: NaN };
  }
  return { start: parseTimeToMinutes(p.start), end: parseTimeToMinutes(p.end) };
}

export function locatePeriod(entry: TimetableClassEntry, day: DayKey, minutes: number): PeriodLocation {
  const periods = day === 'fri'
    ? entry.periods.filter(p => p.friStart && p.friEnd)
    : entry.periods;
  const times = periods.map(p => periodTimeRange(p, day));
  for (let i = 0; i < times.length; i++) {
    const { start, end } = times[i];
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (minutes >= start && minutes < end) {
      return { index: i, state: 'in', label: `Period ${periods[i].no}` };
    }
    if (minutes < start) {
      const prevEnd = i > 0 ? times[i - 1].end : -1;
      if (i > 0 && minutes >= prevEnd && minutes < start) {
        return { index: i, state: 'break', label: 'Recess Break' };
      }
      return { index: 0, state: 'before', label: 'Before school' };
    }
  }
  return { index: times.length - 1, state: 'after', label: 'School over' };
}

export function standardSchedule(classes: TimetableClassEntry[], day?: DayKey) {
  const targetDay = day ?? 'mon';
  const entry =
    (targetDay === 'fri' && classes.find(c => c.periods.some(p => p.friStart && p.friEnd))) ||
    classes.find(c => c.periods && c.periods.length >= 7) ||
    classes[0];
  if (!entry) return [];
  return entry.periods
    .filter(p => {
      if (targetDay === 'fri' && (!p.friStart || !p.friEnd)) return false;
      return true;
    })
    .map(p => {
      const time = periodTimeRange(p, targetDay);
      return {
        no: p.no,
        start: p.start,
        end: p.end,
        friStart: p.friStart,
        friEnd: p.friEnd,
        startMin: time.start,
        endMin: time.end,
        formattedRange: `${formatMinutes(time.start)} – ${formatMinutes(time.end)}`,
      };
    });
}

export type StandardPeriod = ReturnType<typeof standardSchedule>[number];

export function getSchoolStatus(
  classes: TimetableClassEntry[],
  day: DayKey | null,
  minutes: number
): SchoolTimeStatus {
  const defaultLastEnd = day === 'fri' ? 710 : 800;
  if (!day || classes.length === 0) {
    return {
      state: 'closed', periodIndex: -1, periodNo: null, periodLabel: 'School Closed (Sunday)',
      startMinutes: 0, endMinutes: 0, remainingMinutes: 0, totalDurationMinutes: 0, progressPercent: 0,
      nextPeriodNo: 1, nextPeriodStartMinutes: 495, firstPeriodStart: 495, lastPeriodEnd: defaultLastEnd,
    };
  }

  const entry =
    (day === 'fri' && classes.find(c => c.periods.some(p => p.friStart && p.friEnd))) ||
    classes.find(c => c.periods && c.periods.length >= 7) ||
    classes[0];
  const periods = day === 'fri'
    ? entry.periods.filter(p => p.friStart && p.friEnd)
    : entry.periods;
  const times = periods.map(p => periodTimeRange(p, day)).filter(t => !Number.isNaN(t.start) && !Number.isNaN(t.end));
  const firstStart = times[0]?.start ?? 495;
  const lastEnd = times[times.length - 1]?.end ?? defaultLastEnd;

  if (minutes < firstStart) {
    return {
      state: 'before_school', periodIndex: -1, periodNo: null, periodLabel: 'Before School Hours',
      startMinutes: 0, endMinutes: firstStart, remainingMinutes: firstStart - minutes, totalDurationMinutes: firstStart,
      progressPercent: 0, nextPeriodNo: 1, nextPeriodStartMinutes: firstStart, firstPeriodStart: firstStart, lastPeriodEnd: lastEnd,
    };
  }

  if (minutes >= lastEnd) {
    return {
      state: 'after_school', periodIndex: -1, periodNo: null, periodLabel: 'School Hours Completed for Today',
      startMinutes: lastEnd, endMinutes: 1440, remainingMinutes: 0, totalDurationMinutes: 0, progressPercent: 100,
      nextPeriodNo: null, nextPeriodStartMinutes: null, firstPeriodStart: firstStart, lastPeriodEnd: lastEnd,
    };
  }

  for (let i = 0; i < times.length; i++) {
    const { start, end } = times[i];
    if (minutes >= start && minutes < end) {
      const dur = end - start;
      const elapsed = minutes - start;
      const pct = dur > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / dur) * 100))) : 0;
      const nextP = i + 1 < periods.length ? periods[i + 1] : null;
      return {
        state: 'in_period', periodIndex: i, periodNo: periods[i].no, periodLabel: `Period ${periods[i].no}`,
        startMinutes: start, endMinutes: end, remainingMinutes: end - minutes, totalDurationMinutes: dur,
        progressPercent: pct, nextPeriodNo: nextP ? nextP.no : null, nextPeriodStartMinutes: i + 1 < times.length ? times[i + 1].start : null,
        firstPeriodStart: firstStart, lastPeriodEnd: lastEnd,
      };
    }
    if (i < times.length - 1) {
      const nextStart = times[i + 1].start;
      if (minutes >= end && minutes < nextStart) {
        const breakDur = nextStart - end;
        const breakElapsed = minutes - end;
        const breakPct = breakDur > 0 ? Math.min(100, Math.max(0, Math.round((breakElapsed / breakDur) * 100))) : 0;
        return {
          state: 'break', periodIndex: -1, periodNo: null, periodLabel: 'Recess / Break',
          startMinutes: end, endMinutes: nextStart, remainingMinutes: nextStart - minutes, totalDurationMinutes: breakDur,
          progressPercent: breakPct, nextPeriodNo: periods[i + 1].no, nextPeriodStartMinutes: nextStart,
          firstPeriodStart: firstStart, lastPeriodEnd: lastEnd,
        };
      }
    }
  }

  return {
    state: 'after_school', periodIndex: -1, periodNo: null, periodLabel: 'School Day Over',
    startMinutes: lastEnd, endMinutes: 1440, remainingMinutes: 0, totalDurationMinutes: 0, progressPercent: 100,
    nextPeriodNo: null, nextPeriodStartMinutes: null, firstPeriodStart: firstStart, lastPeriodEnd: lastEnd,
  };
}
