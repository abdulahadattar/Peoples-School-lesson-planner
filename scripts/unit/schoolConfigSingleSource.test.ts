import {
  DEFAULT_SCHOOL_CONFIG,
  sanitizeSchoolConfig,
} from '../../services/schoolConfig/defaults';
import {
  buildDefaultClassConfigs,
  getSectionIdentifiers,
  resolveClassTeacherForSection,
} from '../../services/schoolConfig/classStructure';
import {
  buildMasterTimetableClasses,
  extractTeachingPeriods,
  toOptionalClockTime,
} from '../../services/schoolConfig/timetableSeed';
import {
  getCachedSchoolConfig,
  resetCachedSchoolConfigForTesting,
  setCachedSchoolConfig,
  subscribeSchoolConfigStore,
} from '../../services/schoolConfig/store';
import {
  applySchoolConfigToMarksheetConfig,
  enrollmentsFromSchoolConfig,
  syncSchoolConfigEnrollments,
} from '../../services/schoolConfig/propagation';
import { DEFAULT_GRADE_ENROLLMENTS } from '../../services/attendance/types';
import { buildAttendanceRows } from '../../services/attendance/calculations';
import { DEFAULT_MARKSHEET_CONFIG } from '../../services/marksheet/config';
import { loadTimetable, peekCachedTimetable } from '../../services/timetable/resolver';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  itAsync: (name: string, fn: () => Promise<void>) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runSchoolConfigSingleSourceTests(h: Harness) {
  const { describe, it, itAsync, eq } = h;

  describe('schoolConfig.store & Single Source of Truth (Milestone 1)');

  it('notifies all reactive subscribers on setCachedSchoolConfig and cleans up unsubscribe', () => {
    resetCachedSchoolConfigForTesting();
    const seenNames: string[] = [];
    const unsub = subscribeSchoolConfigStore((cfg) => {
      seenNames.push(cfg.schoolName);
    });

    const updated = setCachedSchoolConfig({
      ...DEFAULT_SCHOOL_CONFIG,
      schoolName: 'PHSSJ Unified Campus',
      updatedBy: 'Admin Test',
    });

    eq(updated.schoolName, 'PHSSJ Unified Campus');
    eq(getCachedSchoolConfig().schoolName, 'PHSSJ Unified Campus');
    eq(seenNames.length, 1);
    eq(seenNames[0], 'PHSSJ Unified Campus');

    unsub();
    setCachedSchoolConfig({
      ...DEFAULT_SCHOOL_CONFIG,
      schoolName: 'PHSSJ Second Update',
      updatedBy: 'Admin Test',
    });
    eq(seenNames.length, 1, 'unsubscribed listener must not receive further updates');
    resetCachedSchoolConfigForTesting();
  });

  it('preserves Admin faculty, custom timetable, and branding URLs through sanitizeSchoolConfig', () => {
    const editedTeachers = [
      {
        id: 'custom-t1',
        name: 'Sir Tariq Mehmood',
        designation: 'Senior Teacher',
        schoolName: 'PHSSJ Custom Campus',
        subjects: [{ name: 'Physics', sections: ['IX', 'X-A'] }],
      },
    ];
    const editedTimetable = [
      {
        label: 'IX',
        classTeacher: 'Sir Tariq Mehmood',
        periods: [
          {
            no: 1,
            start: '08:00 AM',
            end: '08:45 AM',
            friStart: '08:00 AM',
            friEnd: '08:40 AM',
            mon: 'Physics / Sir Tariq Mehmood',
            tue: 'Physics / Sir Tariq Mehmood',
            wed: 'Physics / Sir Tariq Mehmood',
            thu: 'Physics / Sir Tariq Mehmood',
            fri: 'Physics / Sir Tariq Mehmood',
            sat: '—',
          },
        ],
      },
    ];

    const sanitized = sanitizeSchoolConfig({
      schoolName: 'PHSSJ Custom Campus',
      affiliation: 'Affiliated with Sindh Board',
      academicSession: '2026-2027',
      principalName: 'Dr. Saima Noor',
      schoolLogoUrl: 'https://example.org/logo.png',
      affiliationLogoUrl: 'https://example.org/board.png',
      principalSignatureUrl: 'https://example.org/sig.png',
      teachers: editedTeachers,
      customTimetable: editedTimetable,
      updatedBy: 'Admin User',
    });

    eq(sanitized.teachers.length, 1);
    eq(sanitized.teachers[0].name, 'Sir Tariq Mehmood');
    eq(sanitized.customTimetable?.length, 1);
    eq(sanitized.customTimetable?.[0].classTeacher, 'Sir Tariq Mehmood');
    eq(sanitized.schoolLogoUrl, 'https://example.org/logo.png');
    eq(sanitized.affiliationLogoUrl, 'https://example.org/board.png');
    eq(sanitized.principalSignatureUrl, 'https://example.org/sig.png');
  });

  it('propagates custom affiliation, logos, signature, and branding to MarksheetConfig', () => {
    const customConfig = {
      ...DEFAULT_SCHOOL_CONFIG,
      schoolName: 'PHSSJ Model Campus',
      affiliation: 'Affiliated with Ziauddin University Board Karachi',
      academicSession: '2026-2027',
      principalName: 'Prof. Nadia Hussain',
      schoolLogoUrl: '/logos/custom-school.png',
      affiliationLogoUrl: '/logos/custom-board.png',
      principalSignatureUrl: '/logos/custom-sig.png',
      classes: DEFAULT_SCHOOL_CONFIG.classes.map((c) =>
        c.classKey === 'XI' ? { ...c, classTeacher: 'Sir Bilal Ahmed' } : c
      ),
    };

    const ms = applySchoolConfigToMarksheetConfig(DEFAULT_MARKSHEET_CONFIG, customConfig);
    eq(ms.schoolName, 'PHSSJ Model Campus');
    eq(ms.boardName, 'Ziauddin University Board Karachi');
    eq(ms.academicYear, '2026-2027');
    eq(ms.principalName, 'Prof. Nadia Hussain');
    eq(ms.schoolLogoUrl, '/logos/custom-school.png');
    eq(ms.affiliationLogoUrl, '/logos/custom-board.png');
    eq(ms.principalSignatureUrl, '/logos/custom-sig.png');
    eq(ms.classTeachers.XI, 'Sir Bilal Ahmed');
    eq(ms.classTeachers.X, DEFAULT_MARKSHEET_CONFIG.classTeachers.X);
  });

  itAsync('resolves master timetable and bell timings exclusively from unified SchoolConfig', async () => {
    resetCachedSchoolConfigForTesting();
    eq(toOptionalClockTime('Dismissal'), null);
    eq(toOptionalClockTime('—'), null);
    eq(toOptionalClockTime('08:15 AM'), '08:15 AM');

    const teachingPeriods = extractTeachingPeriods(DEFAULT_SCHOOL_CONFIG.periods);
    eq(teachingPeriods.length, 7);
    eq(teachingPeriods[5].friStart, null);
    eq(teachingPeriods[6].friEnd, null);

    const modifiedPeriods = DEFAULT_SCHOOL_CONFIG.periods.map((p) =>
      p.no === 1 ? { ...p, start: '08:05 AM', end: '08:45 AM' } : p
    );
    const modifiedTimetable = (DEFAULT_SCHOOL_CONFIG.customTimetable || []).map((entry) =>
      entry.label === 'IX'
        ? {
            ...entry,
            periods: entry.periods.map((p) =>
              p.no === 1 ? { ...p, mon: 'Quantum Mechanics / Sir Abdul Ahad' } : p
            ),
          }
        : entry
    );

    const activeCfg = setCachedSchoolConfig({
      ...DEFAULT_SCHOOL_CONFIG,
      periods: modifiedPeriods,
      customTimetable: modifiedTimetable,
      updatedBy: 'Admin Test',
    });

    const peeked = peekCachedTimetable();
    const loaded = await loadTimetable(activeCfg);
    const ixPeek = peeked.classes.find((c) => c.label === 'IX');
    const ixLoad = loaded.classes.find((c) => c.label === 'IX');

    eq(ixPeek?.periods[0].start, '08:05 AM');
    eq(ixPeek?.periods[0].end, '08:45 AM');
    eq(ixPeek?.periods[0].mon, 'Quantum Mechanics / Sir Abdul Ahad');
    eq(ixLoad?.periods[0].mon, 'Quantum Mechanics / Sir Abdul Ahad');
    eq(buildMasterTimetableClasses(activeCfg).length, 16);

    resetCachedSchoolConfigForTesting();
  });

  it('preserves 868 total enrollment, 16 ordered sections, room/capacity metadata, and attendance fallback advisors', () => {
    resetCachedSchoolConfigForTesting();
    const defaults = buildDefaultClassConfigs();
    eq(defaults.length, 13);

    const baselineTotal = defaults.reduce(
      (sum, c) => sum + (c.totalEnrollment || c.enrolledBoys + c.enrolledGirls),
      0
    );
    eq(baselineTotal, 868);

    const sectionIds = getSectionIdentifiers(defaults);
    eq(sectionIds.length, 16);
    eq(sectionIds[0], 'ECE');
    eq(sectionIds.includes('IV-A'), true);
    eq(sectionIds.includes('IV-B'), true);
    eq(sectionIds.includes('VI-A'), true);
    eq(sectionIds.includes('VI-B'), true);
    eq(sectionIds.includes('X-A'), true);
    eq(sectionIds.includes('X-B'), true);
    eq(sectionIds[sectionIds.length - 1], 'XII');

    eq(resolveClassTeacherForSection(defaults, 'IV-B'), 'Miss Fatima Qureshi');
    eq(resolveClassTeacherForSection(defaults, 'X-A'), 'Miss Asra');
    eq(resolveClassTeacherForSection(defaults, 'X-B'), 'Sir Muhammad Rajab');

    // Syncing attendance enrollment changes must retain roomNumber, capacity, and sections
    const enrollments = enrollmentsFromSchoolConfig(defaults, DEFAULT_GRADE_ENROLLMENTS);
    const roundTripped = syncSchoolConfigEnrollments(
      defaults,
      enrollments.map((e) =>
        e.classKey === 'IX' ? { ...e, enrolledBoys: 55, enrolledGirls: 35, totalEnrollment: 90 } : e
      )
    );
    const ix = roundTripped.find((c) => c.classKey === 'IX');
    eq(ix?.roomNumber, 'Room F-05');
    eq(ix?.capacity, 95);
    eq(ix?.sections?.join(','), 'IX');

    // Attendance buildAttendanceRows reads fallback class teacher from live SchoolConfig
    setCachedSchoolConfig({
      ...DEFAULT_SCHOOL_CONFIG,
      classes: DEFAULT_SCHOOL_CONFIG.classes.map((c) =>
        c.classKey === 'VII' ? { ...c, classTeacher: 'Sir Imran Shaikh' } : c
      ),
      updatedBy: 'Admin Test',
    });
    const rows = buildAttendanceRows(DEFAULT_GRADE_ENROLLMENTS, {});
    const viiRow = rows.find((r) => r.classKey === 'VII');
    eq(viiRow?.classTeacher, 'Sir Imran Shaikh');

    resetCachedSchoolConfigForTesting();
  });
}
