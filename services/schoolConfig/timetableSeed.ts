import rawTimetableData from '../../data/timetable.json';
import { parseTimeToMinutes } from '../timetable/timeMath';
import type { TimetableClassEntry, TimetableData, TimetablePeriod } from '../timetable/types';
import {
  compareClassLabels,
  lookupClassSubjectsSeed,
  normalizeClassAliasKey,
  normalizeTeacherDisplayName,
  resolveClassTeacherForSection,
} from './classStructure';
import type { ClassTeacherConfig, PeriodTiming, SchoolConfig } from './types';

export interface TeachingBellSlot {
  no: number;
  start: string;
  end: string;
  friStart: string | null;
  friEnd: string | null;
}

const PLACEHOLDER_TEACHERS = /^(miss\s+)?(fozia|hina|rabia|saima|nadia|farzana)$/i;

export function isValidClockTimeStr(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed.toLowerCase() === 'dismissal') {
    return false;
  }
  return !Number.isNaN(parseTimeToMinutes(trimmed));
}

export function toOptionalClockTime(value: unknown): string | null {
  if (!isValidClockTimeStr(value)) return null;
  return String(value).trim();
}

export function extractTeachingPeriods(periods: PeriodTiming[] | undefined): TeachingBellSlot[] {
  if (!Array.isArray(periods) || periods.length === 0) return [];
  return periods
    .filter((p) => !p.isBreak && Number(p.no) >= 1)
    .slice()
    .sort((a, b) => a.no - b.no)
    .map((p) => ({
      no: p.no,
      start: p.start,
      end: p.end,
      friStart: toOptionalClockTime(p.friStart),
      friEnd: toOptionalClockTime(p.friEnd),
    }));
}

export function getSeedBaselineTimetableData(): TimetableData {
  const raw = rawTimetableData as TimetableData;
  const classes = (raw.classes || []).map((entry) => ({
    label: entry.label,
    classTeacher: normalizeTeacherDisplayName(entry.classTeacher),
    periods: (entry.periods || []).map((p) => ({
      ...p,
      friStart: toOptionalClockTime(p.friStart),
      friEnd: toOptionalClockTime(p.friEnd),
    })),
  }));
  return {
    generatedAt: raw.generatedAt || new Date().toISOString().split('T')[0],
    classes,
  };
}

export function getSeedBaselineTimetableClasses(): TimetableClassEntry[] {
  return getSeedBaselineTimetableData().classes;
}

export function getBaselineTimetableClass(
  label: string,
  periods?: PeriodTiming[]
): TimetableClassEntry | null {
  const seed = getSeedBaselineTimetableClasses();
  const targetNorm = normalizeClassAliasKey(label);
  const found = seed.find((c) => normalizeClassAliasKey(c.label) === targetNorm);
  if (!found) return null;
  const [applied] = periods && periods.length > 0 ? applyPeriodTimingsToTimetable([found], periods) : [found];
  return applied;
}

export function applyPeriodTimingsToTimetable(
  classes: TimetableClassEntry[],
  periods: PeriodTiming[] | undefined
): TimetableClassEntry[] {
  const teachingBells = extractTeachingPeriods(periods);
  if (teachingBells.length === 0) return classes;

  const byNo = new Map<number, TeachingBellSlot>(teachingBells.map((b) => [b.no, b]));
  return classes.map((entry) => ({
    ...entry,
    periods: (entry.periods || []).map((p, idx) => {
      const bell = byNo.get(p.no) || teachingBells[idx];
      if (!bell) {
        return {
          ...p,
          friStart: toOptionalClockTime(p.friStart),
          friEnd: toOptionalClockTime(p.friEnd),
        };
      }
      return {
        ...p,
        start: bell.start || p.start,
        end: bell.end || p.end,
        friStart: bell.friStart,
        friEnd: bell.friEnd,
      };
    }),
  }));
}

function isUsableClassTeacher(name?: string): boolean {
  const clean = String(name || '').trim();
  if (!clean) return false;
  if (clean.toLowerCase() === 'unassigned') return false;
  if (PLACEHOLDER_TEACHERS.test(clean)) return false;
  return true;
}

function buildSynthesizedPrimaryEntry(
  sc: ClassTeacherConfig,
  sectionLabel: string,
  templatePeriods: TeachingBellSlot[]
): TimetableClassEntry {
  const subjects =
    sc.subjects && sc.subjects.length > 0
      ? sc.subjects
      : lookupClassSubjectsSeed(sc.classKey, sc.romanName);

  const resolvedTeacher = resolveClassTeacherForSection([sc], sectionLabel, 'Unassigned');
  const validTeacher = isUsableClassTeacher(resolvedTeacher) ? resolvedTeacher : '';

  const periods: TimetablePeriod[] = templatePeriods.map((bp, pIdx) => {
    const subject = subjects[pIdx % subjects.length] || 'General Studies';
    const cellVal = validTeacher ? `${subject} / ${validTeacher}` : subject;
    return {
      no: bp.no,
      start: bp.start,
      end: bp.end,
      friStart: bp.friStart,
      friEnd: bp.friEnd,
      mon: cellVal,
      tue: cellVal,
      wed: cellVal,
      thu: cellVal,
      fri: bp.friStart && bp.friEnd ? cellVal : '—',
      sat: '—',
    };
  });

  return {
    label: sectionLabel,
    classTeacher: validTeacher || 'Unassigned',
    periods,
  };
}

function timetableCoversConfigClass(
  timetableLabels: string[],
  sc: ClassTeacherConfig
): boolean {
  const n1 = normalizeClassAliasKey(sc.classKey);
  const n2 = normalizeClassAliasKey(sc.romanName);
  const configSections = (sc.sections || []).map(normalizeClassAliasKey);

  return timetableLabels.some((lbl) => {
    const cNorm = normalizeClassAliasKey(lbl);
    if (cNorm === n1 || cNorm === n2 || configSections.includes(cNorm)) return true;
    if (/^[A-Z0-9]+$/.test(n1) && (cNorm === `${n1}-A` || cNorm === `${n1}-B` || cNorm === `${n1}-C`)) {
      return true;
    }
    if (/^[A-Z0-9]+$/.test(n2) && (cNorm === `${n2}-A` || cNorm === `${n2}-B` || cNorm === `${n2}-C`)) {
      return true;
    }
    return false;
  });
}

/**
 * Single source of truth resolver for the master timetable:
 * - Uses `schoolConfig.customTimetable` when present (falling back to bundled JSON seed only if missing).
 * - Applies `schoolConfig.classes` class advisors and fills any unscheduled primary grades.
 * - Applies `schoolConfig.periods` bell timings onto all class period rows.
 */
export function buildMasterTimetableClasses(
  schoolConfig?: Pick<SchoolConfig, 'classes' | 'periods' | 'customTimetable'> | null,
  fallbackTimetable?: TimetableData | null
): TimetableClassEntry[] {
  const hasCustom = Boolean(
    schoolConfig?.customTimetable && schoolConfig.customTimetable.length > 0
  );
  const baseEntries: TimetableClassEntry[] = hasCustom
    ? schoolConfig!.customTimetable!
    : fallbackTimetable?.classes && fallbackTimetable.classes.length > 0
      ? fallbackTimetable.classes
      : getSeedBaselineTimetableClasses();

  const updatedBase: TimetableClassEntry[] = baseEntries.map((entry) => {
    const cleanDefault = normalizeTeacherDisplayName(entry.classTeacher);
    const resolved = schoolConfig?.classes
      ? resolveClassTeacherForSection(schoolConfig.classes, entry.label, cleanDefault)
      : cleanDefault;

    return {
      ...entry,
      classTeacher: isUsableClassTeacher(resolved) ? resolved : cleanDefault,
      periods: (entry.periods || []).map((p) => ({
        ...p,
        friStart: toOptionalClockTime(p.friStart),
        friEnd: toOptionalClockTime(p.friEnd),
      })),
    };
  });

  const teachingBells =
    schoolConfig?.periods && schoolConfig.periods.length > 0
      ? extractTeachingPeriods(schoolConfig.periods)
      : (updatedBase[0]?.periods || []).map((p) => ({
          no: p.no,
          start: p.start,
          end: p.end,
          friStart: toOptionalClockTime(p.friStart),
          friEnd: toOptionalClockTime(p.friEnd),
        }));

  const existingLabels = updatedBase.map((c) => c.label);
  const additional: TimetableClassEntry[] = [];

  if (schoolConfig?.classes) {
    for (const sc of schoolConfig.classes) {
      if (timetableCoversConfigClass(existingLabels, sc)) continue;
      const targets =
        Array.isArray(sc.sections) && sc.sections.length > 0
          ? sc.sections
          : [sc.romanName || sc.displayName || sc.classKey];
      for (const secLabel of targets) {
        if (existingLabels.some((lbl) => normalizeClassAliasKey(lbl) === normalizeClassAliasKey(secLabel))) {
          continue;
        }
        additional.push(buildSynthesizedPrimaryEntry(sc, secLabel, teachingBells));
        existingLabels.push(secLabel);
      }
    }
  }

  const combined = [...additional, ...updatedBase];
  const withBellTimings = applyPeriodTimingsToTimetable(combined, schoolConfig?.periods);

  return withBellTimings.sort((a, b) => compareClassLabels(a.label, b.label));
}
