import timetableData from '../../data/timetable.json';
import { Teacher } from '../../types';
import {
  DayKey,
  TimetableClassEntry,
  TimetableData,
  ResolvedSlot,
  StaffStatus,
} from './types';
import { parseTimetableCell } from '../timetableConflictEngine';

let cache: TimetableData | null = null;

export async function loadTimetable(): Promise<TimetableData> {
  if (cache) return cache;
  cache = timetableData as TimetableData;
  return cache;
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
