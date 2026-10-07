import type { SheetDayKey } from '../timetableSheetLayout';
import type { TimetableClassEntry, TimetableData, TimetablePeriod } from '../timetable';
import {
  SheetClassEntry,
  TimetableDiffEntry,
  TimetableSheetSnapshot,
  TimetableSheetMergeResult,
} from './types';
import { SHEET_DAYS, sheetTimeToMinutes, normSubject } from './timeUtils';

function looseLabel(label: string): string {
  return normSubject(label).replace(/[^a-z0-9]/g, '');
}

function classLabelKey(label: string): string {
  return normSubject(label);
}

function timePairMinutes(start: string | null, end: string | null): string {
  const s = sheetTimeToMinutes(start ?? '');
  const e = sheetTimeToMinutes(end ?? '');
  return `${Number.isNaN(s) ? 'x' : s}-${Number.isNaN(e) ? 'x' : e}`;
}

function localPeriodFor(
  local: TimetableClassEntry,
  remotePeriod: TimetablePeriod,
  remoteIndex: number,
): TimetablePeriod | null {
  const byNo = local.periods.find(p => p.no === remotePeriod.no);
  if (byNo) return byNo;
  const byIndex = local.periods[remoteIndex];
  return byIndex && byIndex.no === remotePeriod.no ? byIndex : null;
}

export function diffTimetableAgainstSheet(
  local: TimetableClassEntry[],
  remote: TimetableClassEntry[],
): TimetableDiffEntry[] {
  const localByKey = new Map<string, TimetableClassEntry>();
  const localByLoose = new Map<string, TimetableClassEntry>();
  for (const c of local) {
    localByKey.set(classLabelKey(c.label), c);
    localByLoose.set(looseLabel(c.label), c);
  }

  const out: TimetableDiffEntry[] = [];

  for (const remoteClass of remote) {
    const sheet = remoteClass as Partial<SheetClassEntry>;
    const tabName = sheet.tabName ?? remoteClass.label;
    const localClass = localByKey.get(classLabelKey(remoteClass.label)) ?? localByLoose.get(looseLabel(remoteClass.label));
    if (!localClass) continue;

    const detectedDays = Array.isArray(sheet.detectedDays) && sheet.detectedDays.length
      ? sheet.detectedDays
      : (SHEET_DAYS.map(d => d.key) as SheetDayKey[]);
    const anyFriday = remoteClass.periods.some(p => !!(p.friStart || p.friEnd));
    const compareFriday = sheet.hasFridayTimeColumn === true || anyFriday;

    for (const [remoteIndex, remotePeriod] of remoteClass.periods.entries()) {
      const localPeriod = localPeriodFor(localClass, remotePeriod, remoteIndex);
      if (!localPeriod) continue;
      const periodNo = remotePeriod.no;

      let timeDiffers = timePairMinutes(localPeriod.start, localPeriod.end) !== timePairMinutes(remotePeriod.start, remotePeriod.end);
      if (
        compareFriday &&
        timePairMinutes(localPeriod.friStart, localPeriod.friEnd) !== timePairMinutes(remotePeriod.friStart, remotePeriod.friEnd)
      ) {
        timeDiffers = true;
      }
      if (timeDiffers) {
        const fmt = (p: TimetablePeriod) =>
          [p.start, p.end].filter(Boolean).join(' to ') + (p.friStart ? ` (Fri ${p.friStart}${p.friEnd ? ` to ${p.friEnd}` : ''})` : '');
        out.push({
          classLabel: remoteClass.label,
          tabName,
          periodNo,
          day: 'time',
          local: fmt(localPeriod),
          remote: fmt(remotePeriod),
        });
      }

      for (const day of detectedDays) {
        const l = normSubject(localPeriod[day]);
        const r = normSubject(remotePeriod[day]);
        if (l === r) continue;
        out.push({
          classLabel: remoteClass.label,
          tabName,
          periodNo,
          day,
          local: (localPeriod[day] ?? '').trim(),
          remote: (remotePeriod[day] ?? '').trim(),
        });
      }
    }
  }

  return out;
}

function toClassEntry(c: TimetableClassEntry): TimetableClassEntry {
  return { label: c.label, classTeacher: c.classTeacher, periods: c.periods };
}

export function loadTimetableWithSheetMerge(
  localTimetable: TimetableData,
  snapshot: TimetableSheetSnapshot,
): TimetableSheetMergeResult {
  const localByKey = new Map<string, TimetableClassEntry>();
  for (const c of localTimetable.classes) localByKey.set(classLabelKey(c.label), c);

  const classes: TimetableClassEntry[] = [];
  const fromSheet: string[] = [];
  const keptLocal: string[] = [];
  const present = new Set<string>();
  const usedLocal = new Set<string>();

  const degraded = snapshot.perTab
    .filter(s => !s.ok)
    .map(s => s.classLabel)
    .filter((label, i, all) => all.indexOf(label) === i);

  for (const sheetClass of snapshot.classes) {
    const key = classLabelKey(sheetClass.label);
    const localClass = localByKey.get(key);
    if (localClass) usedLocal.add(key);
    classes.push(toClassEntry(sheetClass));
    present.add(key);
    fromSheet.push(sheetClass.label);
  }

  for (const localClass of localTimetable.classes) {
    const key = classLabelKey(localClass.label);
    if (usedLocal.has(key) || present.has(key)) continue;
    classes.push(toClassEntry(localClass));
    present.add(key);
    keptLocal.push(localClass.label);
  }

  return {
    data: {
      generatedAt: new Date(snapshot.fetchedAt || Date.now()).toISOString(),
      classes,
    },
    fromSheet,
    keptLocal,
    degraded,
  };
}
