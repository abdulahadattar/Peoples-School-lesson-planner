import React, { useMemo } from 'react';
import { Teacher } from '../../types';
import {
  DayKey,
  TimetableClassEntry,
  resolveSlot,
} from '../../services/timetable';
import { canonicalName } from '../../services/teacherRoster';
import { UserIcon } from '../icons/MiscIcons';
import { SubstitutionAssignment } from '../../services/storageService';
import { getClassTier, TIER_CONFIG, getTeacherTierHint } from '../../services/tierHelpers';
import { Avatar, LiveDot } from './LiveCommon';

export interface LiveClassCardProps {
  entry: TimetableClassEntry;
  day: DayKey;
  periodIndex: number;
  live: boolean;
  isLivePeriodActive: boolean;
  schoolStatusState?: string;
  teachers: Teacher[];
  now: Date;
  substitutions?: SubstitutionAssignment[];
  absentTeacherIds?: string[];
  searchQuery?: string;
}

export const LiveClassCard: React.FC<LiveClassCardProps> = ({
  entry,
  day,
  periodIndex,
  live,
  isLivePeriodActive,
  schoolStatusState,
  teachers = [],
  substitutions = [],
  absentTeacherIds = [],
  searchQuery = '',
}) => {
  const periodCount = entry.periods?.length ?? 0;
  const effIndex = Math.min(Math.max(0, periodIndex), Math.max(0, periodCount - 1));

  const slot = useMemo(
    () => (effIndex >= 0 && effIndex < periodCount ? resolveSlot(entry, day, effIndex, teachers) : null),
    [entry, day, effIndex, teachers, periodCount],
  );

  const period = effIndex >= 0 && effIndex < periodCount ? entry.periods[effIndex] : null;

  const activeSub = useMemo(() => {
    if (!period) return null;
    return substitutions.find(
      s => s.periodNo === period.no && s.classLabel === entry.label
    );
  }, [period, substitutions, entry.label]);

  const isAbsent = useMemo(() => {
    if (!slot || absentTeacherIds.length === 0) return false;
    return slot.teachers.some(t => t?.id && absentTeacherIds.includes(t.id));
  }, [slot, absentTeacherIds]);

  const tier = getClassTier(entry.label || '');
  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.secondary;

  // Filter check
  const isMatch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (entry.label?.toLowerCase().includes(q)) return true;
    if (entry.classTeacher?.toLowerCase().includes(q)) return true;
    if (slot?.label?.toLowerCase().includes(q)) return true;
    if (slot?.teachers.some(t => t?.name?.toLowerCase().includes(q))) return true;
    if (activeSub?.proxyTeacherName?.toLowerCase().includes(q)) return true;
    return false;
  }, [entry, slot, activeSub, searchQuery]);

  if (!isMatch) return null;

  const rawClassTeacher = entry.classTeacher || '';
  const classTeacherCanonical = canonicalName(rawClassTeacher, teachers);
  const classTeacherObj = rawClassTeacher
    ? teachers.find(
        t =>
          t.name?.toLowerCase().includes(rawClassTeacher.toLowerCase()) ||
          rawClassTeacher.toLowerCase().includes(t.name?.toLowerCase() || '')
      )
    : null;
  const classTeacherTierHint = classTeacherObj ? getTeacherTierHint(classTeacherObj) : null;

  // Meaningful status indicator ONLY when dynamic/necessary (no duplicate static "Period 3" badges)
  let liveAlertBadge: React.ReactNode = null;
  if (isLivePeriodActive) {
    liveAlertBadge = (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
        <LiveDot />
        <span>LIVE</span>
      </span>
    );
  } else if (live && schoolStatusState === 'break') {
    liveAlertBadge = (
      <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-[10px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
        ☕ BREAK
      </span>
    );
  } else if (activeSub) {
    liveAlertBadge = (
      <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
        🔄 PROXY
      </span>
    );
  } else if (isAbsent) {
    liveAlertBadge = (
      <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/30 text-[10px] font-bold text-rose-700 dark:text-rose-300 shrink-0">
        ⚠️ ABSENT
      </span>
    );
  }

  return (
    <div
      className={`glass-card rounded-2xl p-4 flex flex-col justify-between gap-2.5 transition-all hover:shadow-card-hover border ${tierConfig.borderAccent} ${
        isLivePeriodActive
          ? 'ring-2 ring-emerald-500/40 border-emerald-400/40 bg-emerald-50/20 dark:bg-emerald-950/10'
          : 'border-brand-border'
      }`}
    >
      <div className="space-y-2.5">
        {/* Top Line: Class badge + Tier Pill + Optional Live Alert */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border ${
                isLivePeriodActive
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                  : tierConfig.classBadgeClass
              }`}
            >
              {entry.label}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${tierConfig.badgeClass}`}>
              {tierConfig.label}
            </span>
          </div>
          {liveAlertBadge}
        </div>

        {/* Dedicated Class Teacher Row: unclipped and cleanly wrapped */}
        <div className="px-2.5 py-1.5 rounded-lg bg-brand-bg/70 dark:bg-brand-panel/60 border border-brand-border/60 flex items-start gap-1.5 text-xs">
          <UserIcon className="w-3.5 h-3.5 text-brand-text-tertiary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-normal">
            <span className="text-[10px] font-bold text-brand-text-tertiary uppercase tracking-wider">
              Class Teacher:
            </span>
            <span className="text-xs font-semibold text-brand-text-primary leading-normal break-words flex items-center gap-1">
              {classTeacherTierHint && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${classTeacherTierHint.config.dotClass}`}
                  title={classTeacherTierHint.label}
                />
              )}
              <span>{classTeacherCanonical || 'Not assigned'}</span>
            </span>
          </div>
        </div>

        {/* Subject & Instructor Details (Clean, no redundant Period header/timing) */}
        <div className="py-2.5 px-3 rounded-xl bg-brand-bg/70 dark:bg-brand-panel/60 border border-brand-border/60">
          {slot && !slot.empty ? (
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-bold text-brand-text-primary leading-tight">
                  {slot.label}
                </p>
                {slot.parts.length > 1 && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-brand-primary dark:text-blue-300 bg-brand-primary-soft dark:bg-brand-primary/20 rounded px-1.5 py-0.2">
                    Parallel
                  </span>
                )}
              </div>

              {slot.teachers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {slot.teachers.map(t => {
                    const teacherIsAbsent = t?.id ? absentTeacherIds.includes(t.id) : false;
                    const teacherTier = getTeacherTierHint(t);
                    return (
                      <span
                        key={t.id}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
                          teacherIsAbsent
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 line-through opacity-75'
                            : 'bg-white dark:bg-brand-panel border-brand-border text-brand-text-primary'
                        }`}
                      >
                        <Avatar name={t.name} />
                        <span className="text-[11px] font-medium flex items-center gap-1">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${teacherTier.config.dotClass}`}
                            title={teacherTier.label}
                          />
                          <span>{t.name}</span>
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
    </div>
  );
};
