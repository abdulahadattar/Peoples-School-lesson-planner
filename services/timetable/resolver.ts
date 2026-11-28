import { Teacher } from '../../types';
import { SchoolConfig } from '../schoolConfig/types';
import { getCachedSchoolConfig } from '../schoolConfig/store';
import { buildMasterTimetableClasses } from '../schoolConfig/timetableSeed';
import {
  DayKey,
  TimetableClassEntry,
  TimetableData,
  ResolvedSlot,
  StaffStatus,
} from './types';
import { parseTimetableCell } from '../timetableConflictEngine';

export function peekCachedTimetable(schoolConfig?: SchoolConfig | null): TimetableData {
  const activeConfig = schoolConfig ?? getCachedSchoolConfig();
  const classes = buildMasterTimetableClasses(activeConfig);
  const generatedAt = activeConfig.updatedAt
    ? new Date(activeConfig.updatedAt).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return {
    generatedAt,
    classes,
  };
}

export async function loadTimetable(schoolConfig?: SchoolConfig | null): Promise<TimetableData> {
  return peekCachedTimetable(schoolConfig);
}

export function resolveSlot(
  entry: TimetableClassEntry,
  day: DayKey,
  periodIndex: number,
  teachers: Teacher[],
): ResolvedSlot {
  const period = entry.periods[periodIndex];
  const raw = period?.[day]?.trim() ?? '';
  const parsed = parseTimetableCell(raw, entry.label, teachers);

  return {
    label: parsed.empty ? 'Free period' : parsed.label,
    parts: parsed.parts,
    teachers: parsed.teachers,
    empty: parsed.empty,
  };
}

export function computeStaff(
  classes: TimetableClassEntry[],
  teachers: Teacher[],
  day: DayKey,
  periodIndex: number,
): { busy: StaffStatus[]; free: Teacher[] } {
  const busyMap = new Map<string, string[]>();
  for (const entry of classes) {
    const slot = resolveSlot(entry, day, periodIndex, teachers);
    for (const t of slot.teachers) {
      const list = busyMap.get(t.id) ?? [];
      list.push(entry.label);
      busyMap.set(t.id, list);
    }
  }
  const busy: StaffStatus[] = [];
  for (const [id, classesList] of busyMap) {
    const teacher = teachers.find(t => t.id === id);
    if (teacher) busy.push({ teacher, busyIn: classesList, status: 'busy' });
  }
  const busyIds = new Set(busyMap.keys());
  const free = teachers.filter(t => !busyIds.has(t.id));
  return { busy, free };
}
