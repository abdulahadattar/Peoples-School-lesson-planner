import { DEFAULT_CLASS_TEACHERS, DEFAULT_SCHOOL_CONFIG } from './defaults';
import type { ClassTeacherConfig, SchoolConfig } from './types';
import type { ClassEnrollment } from '../attendance/types';
import type { MarksheetConfig, MarksheetGradeLevel } from '../marksheet/types';

function normalizeKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

const MARKSHEET_GRADES: MarksheetGradeLevel[] = ['IX', 'X', 'XI', 'XII'];

function baseGradeForKey(raw: string): MarksheetGradeLevel | null {
  const norm = normalizeKey(raw).replace(/^CLASS/, '');
  const stripped = norm.split('-')[0];
  return (MARKSHEET_GRADES as string[]).includes(stripped)
    ? (stripped as MarksheetGradeLevel)
    : null;
}

/**
 * Maps Admin `SchoolConfig.classes` onto Daily Attendance `ClassEnrollment[]`.
 * Preserves existing baseline order/display labels while applying Admin counts.
 */
export function enrollmentsFromSchoolConfig(
  classes: ClassTeacherConfig[],
  existing: ClassEnrollment[] = [],
): ClassEnrollment[] {
  if (!Array.isArray(classes) || classes.length === 0) {
    return existing;
  }

  const byExactKey = new Map<string, ClassTeacherConfig>();
  const consumedKeys = new Set<string>();

  for (const cls of classes) {
    if (cls?.classKey) {
      byExactKey.set(normalizeKey(cls.classKey), cls);
    }
  }

  const baseList = existing.length > 0 ? existing : [];
  const result: ClassEnrollment[] = baseList.map((entry) => {
    const keyNorm = normalizeKey(entry.classKey);
    const exact = byExactKey.get(keyNorm);
    if (exact) {
      consumedKeys.add(keyNorm);
      const boys = Math.max(0, Number(exact.enrolledBoys) || 0);
      const girls = Math.max(0, Number(exact.enrolledGirls) || 0);
      const total = Math.max(Number(exact.totalEnrollment) || 0, boys + girls);
      return {
        ...entry,
        enrolledBoys: boys,
        enrolledGirls: girls,
        totalEnrollment: total,
      };
    }

    const sectionMatches = classes.filter((c) => {
      const ck = normalizeKey(c.classKey);
      return ck.startsWith(`${keyNorm}-`);
    });
    if (sectionMatches.length > 0) {
      let boys = 0;
      let girls = 0;
      let total = 0;
      for (const sec of sectionMatches) {
        consumedKeys.add(normalizeKey(sec.classKey));
        const b = Math.max(0, Number(sec.enrolledBoys) || 0);
        const g = Math.max(0, Number(sec.enrolledGirls) || 0);
        boys += b;
        girls += g;
        total += Math.max(Number(sec.totalEnrollment) || 0, b + g);
      }
      return {
        ...entry,
        enrolledBoys: boys,
        enrolledGirls: girls,
        totalEnrollment: total,
      };
    }

    return entry;
  });

  // Append any newly added class sections from Admin Settings that were not in the existing list
  for (const cls of classes) {
    const ck = normalizeKey(cls.classKey);
    if (!ck || consumedKeys.has(ck)) continue;
    const boys = Math.max(0, Number(cls.enrolledBoys) || 0);
    const girls = Math.max(0, Number(cls.enrolledGirls) || 0);
    result.push({
      classKey: cls.classKey,
      romanName: cls.romanName || cls.classKey,
      displayName: cls.romanName || cls.displayName || cls.classKey,
      enrolledBoys: boys,
      enrolledGirls: girls,
      totalEnrollment: Math.max(Number(cls.totalEnrollment) || 0, boys + girls),
    });
  }

  return result;
}

/**
 * Propagates edits from Attendance's EnrollmentEditorModal back into `SchoolConfig.classes`.
 */
export function syncSchoolConfigEnrollments(
  classes: ClassTeacherConfig[],
  updatedEnrollments: ClassEnrollment[],
): ClassTeacherConfig[] {
  const byKey = new Map<string, ClassEnrollment>();
  for (const enr of updatedEnrollments) {
    if (enr?.classKey) {
      byKey.set(normalizeKey(enr.classKey), enr);
    }
  }

  const seen = new Set<string>();
  const nextClasses = classes.map((cls) => {
    const keyNorm = normalizeKey(cls.classKey);
    const match = byKey.get(keyNorm);
    if (!match) return cls;
    seen.add(keyNorm);
    const boys = Math.max(0, Number(match.enrolledBoys) || 0);
    const girls = Math.max(0, Number(match.enrolledGirls) || 0);
    return {
      ...cls,
      enrolledBoys: boys,
      enrolledGirls: girls,
      totalEnrollment: Math.max(Number(match.totalEnrollment) || 0, boys + girls),
    };
  });

  for (const enr of updatedEnrollments) {
    const keyNorm = normalizeKey(enr.classKey);
    if (!keyNorm || seen.has(keyNorm)) continue;
    const boys = Math.max(0, Number(enr.enrolledBoys) || 0);
    const girls = Math.max(0, Number(enr.enrolledGirls) || 0);
    nextClasses.push({
      classKey: enr.classKey,
      romanName: enr.romanName || enr.classKey,
      displayName: enr.displayName || `Class ${enr.romanName || enr.classKey}`,
      classTeacher: DEFAULT_CLASS_TEACHERS[enr.classKey] || 'Unassigned',
      enrolledBoys: boys,
      enrolledGirls: girls,
      totalEnrollment: Math.max(Number(enr.totalEnrollment) || 0, boys + girls),
    });
  }

  return nextClasses;
}

/**
 * Overlays customized Admin institutional metadata & Grade IX–XII class teachers onto MarksheetConfig.
 * Leaves spreadsheet-synced metadata intact when Admin settings are still at system baseline.
 */
export function applySchoolConfigToMarksheetConfig(
  baseConfig: MarksheetConfig,
  schoolConfig?: SchoolConfig | null,
): MarksheetConfig {
  if (!schoolConfig) return baseConfig;

  const isCustomized = (val: string | undefined, baseline: string | undefined): boolean => {
    const trimmed = String(val || '').trim();
    if (!trimmed) return false;
    return trimmed !== String(baseline || '').trim();
  };

  const nextClassTeachers: Record<MarksheetGradeLevel, string> = {
    ...baseConfig.classTeachers,
  };

  for (const cls of schoolConfig.classes || []) {
    const grade = baseGradeForKey(cls.classKey || cls.romanName);
    if (!grade) continue;
    const teacher = String(cls.classTeacher || '').trim();
    if (!teacher || teacher.toLowerCase() === 'unassigned') continue;
    const baselineTeacher =
      DEFAULT_CLASS_TEACHERS[cls.classKey] || DEFAULT_CLASS_TEACHERS[grade] || '';
    if (teacher !== baselineTeacher) {
      nextClassTeachers[grade] = teacher;
    }
  }

  return {
    ...baseConfig,
    schoolName: isCustomized(schoolConfig.schoolName, DEFAULT_SCHOOL_CONFIG.schoolName)
      ? schoolConfig.schoolName.trim()
      : baseConfig.schoolName,
    schoolAddress: isCustomized(schoolConfig.schoolAddress, DEFAULT_SCHOOL_CONFIG.schoolAddress)
      ? schoolConfig.schoolAddress!.trim()
      : baseConfig.schoolAddress,
    academicYear: isCustomized(schoolConfig.academicSession, DEFAULT_SCHOOL_CONFIG.academicSession)
      ? schoolConfig.academicSession.trim()
      : baseConfig.academicYear,
    principalName: isCustomized(schoolConfig.principalName, DEFAULT_SCHOOL_CONFIG.principalName)
      ? schoolConfig.principalName.trim()
      : baseConfig.principalName,
    classTeachers: nextClassTeachers,
  };
}
