import { useState, useEffect, useMemo } from 'react';
import {
  DayKey,
  DAY_KEYS,
  dayKeyForDate,
  getSchoolStatus,
  standardSchedule,
  TimetableData,
  StandardPeriod,
} from '../../services/timetable';

export function useLiveScheduleClock(syncedTimetable: TimetableData | null) {
  const [now, setNow] = useState(() => new Date());
  const [previewDay, setPreviewDay] = useState<DayKey | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clockDate = now;
  const liveDay = dayKeyForDate(clockDate);
  const isLive = previewDay === null && previewPeriod === null;
  const effectiveDay: DayKey = previewDay ?? (liveDay ?? 'mon');

  const schedule = useMemo<StandardPeriod[]>(
    () => (syncedTimetable ? standardSchedule(syncedTimetable.classes, effectiveDay) : []),
    [syncedTimetable, effectiveDay]
  );

  const effectiveMinutes = clockDate.getHours() * 60 + clockDate.getMinutes();

  const schoolStatus = useMemo(() => {
    if (!syncedTimetable) return null;
    return getSchoolStatus(syncedTimetable.classes, effectiveDay, effectiveMinutes);
  }, [syncedTimetable, effectiveDay, effectiveMinutes]);

  const livePeriodIndex = schoolStatus?.state === 'in_period' ? schoolStatus.periodIndex : -1;

  const autoLivePeriodIndex = useMemo(() => {
    if (livePeriodIndex >= 0) return livePeriodIndex;
    if (schoolStatus?.state === 'break' && schoolStatus.nextPeriodNo) {
      return Math.max(0, schoolStatus.nextPeriodNo - 1);
    }
    if (schoolStatus?.state === 'before_school') return 0;
    if (schoolStatus?.state === 'after_school') return Math.max(0, schedule.length - 1);
    return 0;
  }, [livePeriodIndex, schoolStatus, schedule.length]);

  const effectiveCardPeriodIndex = useMemo(() => {
    if (previewPeriod !== null) {
      return Math.min(Math.max(0, previewPeriod), Math.max(0, schedule.length - 1));
    }
    return Math.min(Math.max(0, autoLivePeriodIndex), Math.max(0, schedule.length - 1));
  }, [previewPeriod, autoLivePeriodIndex, schedule.length]);

  const isCurrentLivePeriodActive =
    livePeriodIndex >= 0 &&
    effectiveCardPeriodIndex === livePeriodIndex &&
    (previewDay === null || previewDay === liveDay);

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

  return {
    now,
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
    previewDay,
    setPreviewDay,
    previewPeriod,
    setPreviewPeriod,
    goLive,
    stepPeriod,
    stepDay,
  };
}
