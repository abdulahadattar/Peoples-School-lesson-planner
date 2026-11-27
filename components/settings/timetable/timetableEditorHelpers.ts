import { TimetableClassEntry } from '../../../services/timetable';
import {
  loadTimetableWithSheetMerge,
  type TimetableSheetSnapshot,
} from '../../../services/timetableSheetService';

export const DEFAULT_BASE_PERIODS = [
  { no: 1, start: '8:15 AM', end: '8:50 AM', friStart: '8:15 AM', friEnd: '8:50 AM' },
  { no: 2, start: '8:50 AM', end: '9:30 AM', friStart: '8:50 AM', friEnd: '9:25 AM' },
  { no: 3, start: '9:30 AM', end: '10:10 AM', friStart: '9:25 AM', friEnd: '10:00 AM' },
  { no: 4, start: '10:10 AM', end: '10:50 AM', friStart: '10:30 AM', friEnd: '11:10 AM' },
  { no: 5, start: '11:20 AM', end: '12:00 PM', friStart: '11:10 AM', friEnd: '11:50 AM' },
  { no: 6, start: '12:00 PM', end: '12:40 PM', friStart: '—', friEnd: '—' },
  { no: 7, start: '12:40 PM', end: '01:20 PM', friStart: '—', friEnd: '—' },
];

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
