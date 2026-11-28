import { TimetableClassEntry } from '../../../services/timetable';
import {
  DEFAULT_SCHOOL_CONFIG,
  extractTeachingPeriods,
} from '../../../services/schoolConfigService';
import {
  loadTimetableWithSheetMerge,
  type TimetableSheetSnapshot,
} from '../../../services/timetableSheetService';

export const DEFAULT_BASE_PERIODS = extractTeachingPeriods(DEFAULT_SCHOOL_CONFIG.periods);

export function toClassMap(classes: TimetableClassEntry[]): Record<string, TimetableClassEntry> {
  const map: Record<string, TimetableClassEntry> = {};
  classes.forEach((c) => {
    if (!c || !c.label) return;
    map[c.label] = {
      label: c.label,
      classTeacher: c.classTeacher,
      periods: (c.periods || []).map((p) => ({
        no: p.no,
        start: p.start,
        end: p.end,
        friStart: p.friStart,
        friEnd: p.friEnd,
        mon: p.mon,
        tue: p.tue,
        wed: p.wed,
        thu: p.thu,
        fri: p.fri,
        sat: p.sat,
      })),
    };
  });
  return map;
}

export function mergeSheetOverLocal(
  localClasses: TimetableClassEntry[],
  snapshot: TimetableSheetSnapshot
): { classes: TimetableClassEntry[]; degraded: number } | null {
  try {
    const merged = loadTimetableWithSheetMerge({ generatedAt: '', classes: localClasses }, snapshot);
    const classes = merged?.data?.classes;
    if (!Array.isArray(classes) || classes.length === 0) return null;
    return { classes: classes as TimetableClassEntry[], degraded: merged?.degraded?.length ?? 0 };
  } catch {
    return null;
  }
}
