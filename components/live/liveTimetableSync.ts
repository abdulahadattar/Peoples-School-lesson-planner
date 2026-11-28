import { TimetableClassEntry, TimetableData } from '../../services/timetable';
import {
  SchoolConfig,
  buildMasterTimetableClasses,
} from '../../services/schoolConfigService';

export function syncClassesWithConfig(
  timetable: TimetableData | null,
  schoolConfig: SchoolConfig | null | undefined
): TimetableClassEntry[] {
  if (!timetable && !schoolConfig) return [];
  return buildMasterTimetableClasses(schoolConfig, timetable);
}
