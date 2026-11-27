import { StudentRecord } from '../googleSheetsService';
import timetableData from '../../data/timetable.json';
import {
  ClassEnrollment,
  ClassAttendanceRow,
  DailyAttendanceRecord,
  AttendanceHistoryEntry,
  SchoolAttendanceSummary,
  DEFAULT_GRADE_ENROLLMENTS,
} from './types';

export function computeEnrollmentsFromRecords(
  records: StudentRecord[],
  baseEnrollments?: ClassEnrollment[]
): ClassEnrollment[] {
  const classMap = new Map<string, { boys: number; girls: number }>();
  const activeBase = baseEnrollments && baseEnrollments.length > 0 ? baseEnrollments : DEFAULT_GRADE_ENROLLMENTS;

  records.forEach((r) => {
    if (r.status?.toLowerCase().includes('dropout') || r.status?.toLowerCase().includes('left')) return;

    let c = r.currentClass?.trim() || 'UNKNOWN';
    if (r.section?.trim()) {
      c += '-' + r.section.trim();
    }

    if (!classMap.has(c)) {
      classMap.set(c, { boys: 0, girls: 0 });
    }
    const counts = classMap.get(c)!;
    const genderNorm = (r.gender || '').trim().toLowerCase();
    if (genderNorm.startsWith('f') || genderNorm.startsWith('g')) {
      counts.girls += 1;
    } else {
      counts.boys += 1;
    }
  });

  return activeBase.map((def) => {
    const r = def.romanName.toLowerCase();
    const c = def.classKey.toLowerCase();

    let totalBoys = 0;
    let totalGirls = 0;

    Array.from(classMap.entries()).forEach(([k, counts]) => {
      const kl = k.toLowerCase().trim();
      if (kl === c || kl === r || kl.startsWith(c + '-') || kl.startsWith(r + '-') || kl.startsWith('class ' + c) || kl.startsWith('class ' + r)) {
        totalBoys += counts.boys;
        totalGirls += counts.girls;
      }
    });

    if (totalBoys === 0 && totalGirls === 0) {
      return def;
    }

    return {
      ...def,
      enrolledBoys: totalBoys,
      enrolledGirls: totalGirls,
      totalEnrollment: totalBoys + totalGirls,
    };
  });
}

export function buildAttendanceRows(
  enrollments: ClassEnrollment[],
  inputs: Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }>,
  classTeachersMap: Record<string, string> = {}
): ClassAttendanceRow[] {
  return enrollments.map((enr) => {
    const input = inputs[enr.classKey] || { presentBoys: '', presentGirls: '' };
    const totalEnrolled = enr.totalEnrollment || (enr.enrolledBoys + enr.enrolledGirls);

    const pb = typeof input.presentBoys === 'number' ? input.presentBoys : 0;
    const pg = typeof input.presentGirls === 'number' ? input.presentGirls : 0;
    const totalPresent = pb + pg;

    const absentBoys = Math.max(0, enr.enrolledBoys - pb);
    const absentGirls = Math.max(0, enr.enrolledGirls - pg);
    const absentTotal = Math.max(0, totalEnrolled - totalPresent);

    const percentage = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;
    const boysPercentage = enr.enrolledBoys > 0 ? Math.round((pb / enr.enrolledBoys) * 100) : 0;
    const girlsPercentage = enr.enrolledGirls > 0 ? Math.round((pg / enr.enrolledGirls) * 100) : 0;

    let defaultTeacher = classTeachersMap[enr.classKey] || '';
    if (!defaultTeacher) {
      const matchingClasses = timetableData.classes.filter(
        (c) =>
          c.label.toLowerCase() === enr.classKey.toLowerCase() ||
          c.label.toLowerCase().startsWith(enr.classKey.toLowerCase() + ' ')
      );
      if (matchingClasses.length > 0) {
        const teachers = Array.from(new Set(matchingClasses.map((c) => c.classTeacher).filter(Boolean)));
        defaultTeacher = teachers.join(' / ');
      } else {
        defaultTeacher = '';
      }
    }

    return {
      ...enr,
      classTeacher: input.classTeacher || defaultTeacher,
      totalEnrolled,
      presentBoys: input.presentBoys,
      presentGirls: input.presentGirls,
      totalPresent,
      absentBoys,
      absentGirls,
      absentTotal,
      percentage,
      boysPercentage,
      girlsPercentage,
    };
  });
}

export function calculateSchoolSummary(date: string, rows: ClassAttendanceRow[]): SchoolAttendanceSummary {
  let totalEnrolled = 0;
  let enrolledBoys = 0;
  let enrolledGirls = 0;
  let totalPresent = 0;
  let presentBoys = 0;
  let presentGirls = 0;
  let totalAbsent = 0;
  let absentBoys = 0;
  let absentGirls = 0;

  rows.forEach((r) => {
    totalEnrolled += r.totalEnrolled;
    enrolledBoys += r.enrolledBoys;
    enrolledGirls += r.enrolledGirls;
    totalPresent += r.totalPresent;
    presentBoys += typeof r.presentBoys === 'number' ? r.presentBoys : 0;
    presentGirls += typeof r.presentGirls === 'number' ? r.presentGirls : 0;
    totalAbsent += r.absentTotal;
    absentBoys += r.absentBoys;
    absentGirls += r.absentGirls;
  });

  return {
    totalEnrolled,
    enrolledBoys,
    enrolledGirls,
    totalPresent,
    presentBoys,
    presentGirls,
    totalAbsent,
    absentBoys,
    absentGirls,
    overallPercentage: totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0,
    boysPercentage: enrolledBoys > 0 ? Math.round((presentBoys / enrolledBoys) * 100) : 0,
    girlsPercentage: enrolledGirls > 0 ? Math.round((presentGirls / enrolledGirls) * 100) : 0,
  };
}

export function countTotalPresent(record: DailyAttendanceRecord): number {
  return Object.values(record.classes || {}).reduce(
    (sum, c) => sum + (c.presentBoys || 0) + (c.presentGirls || 0),
    0
  );
}

export function normalizeClassKey(key: string): string {
  return key.trim().toUpperCase();
}

export function loadCachedEnrollments(): Map<string, number> {
  const map = new Map<string, number>();
  const push = (list: ClassEnrollment[]) => {
    for (const e of list) {
      if (!e?.classKey) continue;
      map.set(normalizeClassKey(e.classKey), e.totalEnrollment || (e.enrolledBoys + e.enrolledGirls));
    }
  };

  try {
    const local = localStorage.getItem('school_class_enrollments');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length) {
        push(parsed);
        return map;
      }
    }
  } catch {
    // fallback
  }

  push(DEFAULT_GRADE_ENROLLMENTS);
  return map;
}

export function resolveAttendancePercentage(record: DailyAttendanceRecord, totalPresent: number): number {
  const enrollments = loadCachedEnrollments();
  let denominator = 0;
  for (const [classKey, counts] of Object.entries(record.classes || {})) {
    const enrolled = enrollments.get(normalizeClassKey(classKey));
    if (enrolled && enrolled > 0) {
      denominator += enrolled;
    } else {
      denominator += (counts.presentBoys || 0) + (counts.presentGirls || 0);
    }
  }

  if (denominator <= 0) return 0;
  return Math.round((totalPresent / denominator) * 100);
}

/**
 * Resolves between cloud and locally-cached attendance records using updatedAt timestamps
 * so newer offline saves are not silently overwritten by stale Firestore documents,
 * while preserving the newest sheet-sync timestamp across both sources.
 */
export function pickNewerAttendanceRecord(
  cloud: DailyAttendanceRecord | null,
  local: DailyAttendanceRecord | null
): DailyAttendanceRecord | null {
  if (!cloud && !local) return null;
  if (!cloud) return local;
  if (!local) return cloud;

  const cloudUpdated = Number(cloud.updatedAt || 0);
  const localUpdated = Number(local.updatedAt || 0);
  const winner = localUpdated > cloudUpdated ? local : cloud;
  const maxSyncedAt = Math.max(
    Number(cloud.syncedToSheetAt || 0),
    Number(local.syncedToSheetAt || 0)
  );

  return {
    ...winner,
    syncedToSheetAt: maxSyncedAt > 0 ? maxSyncedAt : winner.syncedToSheetAt,
  };
}

/**
 * Merges Firestore and localStorage attendance history entries by date, keeping
 * the entry with the newer updatedAt timestamp and preserving syncedToSheetAt.
 */
export function mergeAttendanceHistoryEntries(
  cloudEntries: AttendanceHistoryEntry[],
  localEntries: AttendanceHistoryEntry[]
): AttendanceHistoryEntry[] {
  const byDate = new Map<string, AttendanceHistoryEntry>();
  const mergeOne = (incoming: AttendanceHistoryEntry) => {
    const existing = byDate.get(incoming.date);
    if (!existing) {
      byDate.set(incoming.date, incoming);
      return;
    }
    const existingUpdated = Number(existing.updatedAt || 0);
    const incomingUpdated = Number(incoming.updatedAt || 0);
    const winner = incomingUpdated > existingUpdated ? incoming : existing;
    const maxSyncedAt = Math.max(
      Number(existing.syncedToSheetAt || 0),
      Number(incoming.syncedToSheetAt || 0)
    );
    byDate.set(incoming.date, {
      ...winner,
      updatedAt: Math.max(existingUpdated, incomingUpdated) || undefined,
      syncedToSheetAt: maxSyncedAt > 0 ? maxSyncedAt : winner.syncedToSheetAt,
    });
  };

  for (const c of cloudEntries) mergeOne(c);
  for (const l of localEntries) mergeOne(l);

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

