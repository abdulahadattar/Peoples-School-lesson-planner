import {
  CLASSIC_GRADING_SCALE,
  EXAM_TYPE_LABELS,
  SUBJECT_LABELS,
  ZUEB_GRADING_SCALE,
} from './config';
import {
  ComputedStudentMarksheet,
  ComputedSubjectRow,
  GradingSystemType,
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  MarksheetRosterStudent,
  OptionalElective,
  OptionalLanguage,
  StudentMarkEntry,
  SubjectKey,
} from './types';

export { buildMarksheetRoster, normalizeGradeLevel } from './roster';

export function isHsscGrade(grade: MarksheetGradeLevel): boolean {
  return grade === 'XI' || grade === 'XII';
}

export function getSubjectsForGrade(grade: MarksheetGradeLevel): SubjectKey[] {
  const hssc = isHsscGrade(grade);
  return [
    'english',
    'mathematics',
    'physics',
    'chemistry',
    grade === 'IX' || grade === 'XI' ? 'islamicStudies' : 'pakistanStudies',
    'biology',
    ...(hssc ? ([] as SubjectKey[]) : (['ict'] as SubjectKey[])),
    'sindhi',
    'urdu',
  ];
}

export function getCombinedMarksheetTitle(
  grade: MarksheetGradeLevel,
  examType: MarksheetExamType
): string {
  const tierCode =
    grade === 'IX'
      ? 'SSC-I'
      : grade === 'X'
        ? 'SSC-II'
        : grade === 'XI'
          ? 'HSSC-I'
          : 'HSSC-II';
  const examWord =
    examType === 'mock' ? 'Mock Test' : examType === 'preboard' ? 'Pre-Board' : 'Mid-Term';
  return `${tierCode} ${examWord} Marksheet`;
}

export function getPassThresholdPct(system: GradingSystemType): number {
  return system === 'zueb' ? 40 : 33;
}

export function getGradeForPercentage(
  percentage: number,
  system: GradingSystemType
): { grade: string; remarks: string } {
  const rounded = Math.max(0, Math.min(100, Math.round(percentage)));
  const scale = system === 'zueb' ? ZUEB_GRADING_SCALE : CLASSIC_GRADING_SCALE;
  for (const band of scale) {
    if (rounded >= band.minPct && rounded <= band.maxPct) {
      return { grade: band.grade, remarks: band.remarks };
    }
  }
  const fallback = scale[scale.length - 1];
  return { grade: fallback.grade, remarks: fallback.remarks };
}

function hasEnteredScore(val: unknown): boolean {
  return val === 'A' || (typeof val === 'number' && Number.isFinite(val));
}

export function resolveActiveSubjects(
  gradeLevel: MarksheetGradeLevel,
  examType: MarksheetExamType,
  config: MarksheetConfig,
  entry?: StudentMarkEntry | null
): {
  keys: SubjectKey[];
  optionalLanguage: OptionalLanguage;
  optionalElective: OptionalElective;
} {
  const maxMap = config.subjectMaxMarks[examType]?.[gradeLevel] || {};
  const scores = entry?.scores || {};
  const hssc = isHsscGrade(gradeLevel);

  // Determine optional language (Sindhi / Urdu)
  const sindhiPos = typeof scores.sindhi === 'number' && scores.sindhi > 0;
  const urduPos = typeof scores.urdu === 'number' && scores.urdu > 0;
  const hasSindhi = hasEnteredScore(scores.sindhi);
  const hasUrdu = hasEnteredScore(scores.urdu);
  const optionalLanguage: OptionalLanguage =
    entry?.optionalLanguage ||
    (urduPos && !sindhiPos ? 'Urdu' : sindhiPos && !urduPos ? 'Sindhi' : hasUrdu && !hasSindhi ? 'Urdu' : 'Sindhi');

  // Determine optional elective: SSC => Biology / ICT; HSSC => Biology / Mathematics
  const bioPos = typeof scores.biology === 'number' && scores.biology > 0;
  const ictPos = typeof scores.ict === 'number' && scores.ict > 0;
  const mathPos = typeof scores.mathematics === 'number' && scores.mathematics > 0;
  const hasBio = hasEnteredScore(scores.biology);
  const hasIct = hasEnteredScore(scores.ict);
  const hasMath = hasEnteredScore(scores.mathematics);

  let optionalElective: OptionalElective;
  if (hssc) {
    optionalElective =
      entry?.optionalElective === 'Mathematics' || entry?.optionalElective === 'Biology'
        ? entry.optionalElective
        : mathPos && !bioPos
          ? 'Mathematics'
          : bioPos && !mathPos
            ? 'Biology'
            : hasMath && !hasBio
              ? 'Mathematics'
              : 'Biology';
  } else {
    optionalElective =
      entry?.optionalElective === 'ICT' || entry?.optionalElective === 'Biology'
        ? entry.optionalElective
        : ictPos && !bioPos
          ? 'ICT'
          : bioPos && !ictPos
            ? 'Biology'
            : hasIct && !hasBio
              ? 'ICT'
              : 'Biology';
  }

  const keys: SubjectKey[] = ['english', 'chemistry', 'physics'];

  if (gradeLevel === 'IX' || gradeLevel === 'XI') {
    keys.push('islamicStudies');
  } else {
    keys.push('pakistanStudies');
  }

  // Language group (include both only when both carry positive scores)
  if (sindhiPos && urduPos && !entry?.optionalLanguage) {
    keys.push('sindhi', 'urdu');
  } else {
    keys.push(optionalLanguage === 'Urdu' ? 'urdu' : 'sindhi');
  }

  // Elective group + Mathematics for SSC (matches Result Sheet order: English, Chem, Phys, Isl/Pst, Lang, Bio/ICT, Math)
  if (!hssc) {
    if (bioPos && ictPos && !entry?.optionalElective) {
      keys.push('biology', 'ict');
    } else {
      keys.push(optionalElective === 'ICT' ? 'ict' : 'biology');
    }
    keys.push('mathematics');
  } else {
    if (bioPos && mathPos && !entry?.optionalElective) {
      keys.push('biology', 'mathematics');
    } else {
      keys.push(optionalElective === 'Mathematics' ? 'mathematics' : 'biology');
    }
  }

  return {
    keys: keys.filter((k) => Number(maxMap[k]) > 0),
    optionalLanguage,
    optionalElective,
  };
}

export function computeStudentMarksheet(
  student: MarksheetRosterStudent,
  entry: StudentMarkEntry | undefined | null,
  config: MarksheetConfig,
  examType: MarksheetExamType,
  gradingSystem: GradingSystemType = config.activeGradingSystem
): ComputedStudentMarksheet {
  const gradeLevel = student.gradeLevel;
  const maxMap = config.subjectMaxMarks[examType]?.[gradeLevel] || {};
  const scores = entry?.scores || {};
  const { keys, optionalLanguage, optionalElective } = resolveActiveSubjects(
    gradeLevel,
    examType,
    config,
    entry
  );

  const passPct = getPassThresholdPct(gradingSystem);
  let totalMaxMarks = 0;
  let totalObtainedMarks = 0;
  let anyScore = false;
  let allPassed = true;

  const subjects: ComputedSubjectRow[] = keys.map((key) => {
    const maxMarks = Number(maxMap[key]) || 50;
    const raw = scores[key];
    totalMaxMarks += maxMarks;

    if (raw === 'A') {
      anyScore = true;
      allPassed = false;
      return {
        key,
        label: SUBJECT_LABELS[key],
        maxMarks,
        obtained: 'A',
        percentage: 0,
        grade: gradingSystem === 'zueb' ? 'U' : 'Fail',
        remarks: 'Absent',
        passed: false,
      };
    }

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const clamped = Math.max(0, Math.min(maxMarks, raw));
      anyScore = true;
      totalObtainedMarks += clamped;
      const pct = maxMarks > 0 ? Number(((clamped / maxMarks) * 100).toFixed(1)) : 0;
      const passed = Math.round(pct) >= passPct;
      if (!passed) allPassed = false;
      const { grade, remarks } = getGradeForPercentage(pct, gradingSystem);
      return {
        key,
        label: SUBJECT_LABELS[key],
        maxMarks,
        obtained: clamped,
        percentage: pct,
        grade,
        remarks,
        passed,
      };
    }

    return {
      key,
      label: SUBJECT_LABELS[key],
      maxMarks,
      obtained: null,
      percentage: null,
      grade: '—',
      remarks: 'Not Entered',
      passed: false,
    };
  });

  const overallPercentage =
    anyScore && totalMaxMarks > 0
      ? Number(((totalObtainedMarks / totalMaxMarks) * 100).toFixed(2))
      : null;

  const overallScale =
    overallPercentage !== null
      ? getGradeForPercentage(overallPercentage, gradingSystem)
      : { grade: '—', remarks: 'Awaiting Scores' };

  const allSubjectsEntered = subjects.length > 0 && subjects.every((s) => s.obtained !== null);
  const resultStatus: 'PASS' | 'NEEDS IMPROVEMENT' | 'PENDING' = !anyScore
    ? 'PENDING'
    : allSubjectsEntered && allPassed && Math.round(overallPercentage || 0) >= passPct
      ? 'PASS'
      : subjects.some((s) => s.obtained !== null && !s.passed)
        ? 'NEEDS IMPROVEMENT'
        : Math.round(overallPercentage || 0) >= passPct
          ? 'PASS'
          : 'NEEDS IMPROVEMENT';

  const daysPresent =
    typeof entry?.daysPresent === 'number' && Number.isFinite(entry.daysPresent)
      ? Math.max(0, Math.min(config.totalWorkingDays, entry.daysPresent))
      : null;

  const attendancePercentage =
    daysPresent !== null && config.totalWorkingDays > 0
      ? Number(((daysPresent / config.totalWorkingDays) * 100).toFixed(1))
      : null;

  return {
    student,
    examType,
    examLabel: EXAM_TYPE_LABELS[examType],
    gradingSystem,
    sectionTier: isHsscGrade(gradeLevel) ? 'HSSC' : 'SSC',
    classTeacher: config.classTeachers[gradeLevel] || 'Abdul Ahad',
    subjects,
    totalMaxMarks,
    totalObtainedMarks,
    hasAnyScore: anyScore,
    overallPercentage,
    overallGrade: overallScale.grade,
    overallRemarks: overallScale.remarks,
    resultStatus,
    daysPresent,
    totalWorkingDays: config.totalWorkingDays,
    attendancePercentage,
    codeOfConduct: entry?.codeOfConduct || 'Satisfactory',
    teacherRemarks: entry?.teacherRemarks?.trim() || '',
    optionalLanguage,
    optionalElective,
  };
}

export function formatMarksheetPdfFilename(grNo: string, studentName: string): string {
  const safeGr = String(grNo || 'Student')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const safeName = String(studentName || 'Marksheet')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `${safeGr || 'Student'}_${safeName || 'Marksheet'}.pdf`;
}
