export type MarksheetExamType = 'midterm' | 'mock' | 'preboard';
export type GradingSystemType = 'zueb' | 'classic';
export type MarksheetGradeLevel = 'IX' | 'X' | 'XI' | 'XII';
export type CodeOfConduct = 'Satisfactory' | 'Average' | 'Unsatisfactory';
export type OptionalLanguage = 'Sindhi' | 'Urdu';
export type OptionalElective = 'Biology' | 'ICT' | 'Mathematics';

export type SubjectKey =
  | 'english'
  | 'chemistry'
  | 'physics'
  | 'islamicStudies'
  | 'pakistanStudies'
  | 'sindhi'
  | 'urdu'
  | 'biology'
  | 'ict'
  | 'mathematics';

export interface GradeBand {
  minPct: number;
  maxPct: number;
  grade: string;
  remarks: string;
  displayRange: string;
}

export interface MarksheetConfig {
  schoolName: string;
  schoolAddress: string;
  boardName: string;
  academicYear: string;
  division: string;
  reopenDate: string;
  totalWorkingDays: number;
  principalName: string;
  schoolLogoUrl?: string;
  affiliationLogoUrl?: string;
  principalSignatureUrl?: string;
  activeGradingSystem: GradingSystemType;
  classTeachers: Record<MarksheetGradeLevel, string>;
  subjectMaxMarks: Record<
    MarksheetExamType,
    Record<MarksheetGradeLevel, Partial<Record<SubjectKey, number>>>
  >;
}

export interface StudentMarkEntry {
  grNo: string;
  studentName?: string;
  fatherName?: string;
  currentClass?: string;
  section?: string;
  gender?: string;
  dob?: string;
  optionalLanguage?: OptionalLanguage;
  optionalElective?: OptionalElective;
  scores: Partial<Record<SubjectKey, number | 'A' | null>>;
  daysPresent?: number | null;
  codeOfConduct?: CodeOfConduct;
  teacherRemarks?: string;
  examType?: MarksheetExamType;
  updatedAt?: number;
}

export interface MarksheetRosterStudent {
  grNo: string;
  studentName: string;
  fatherName: string;
  gradeLevel: MarksheetGradeLevel;
  currentClass: string;
  section: string;
  gender: string;
  dob: string;
  status: string;
  fromSheet: boolean;
}

export interface ComputedSubjectRow {
  key: SubjectKey;
  label: string;
  maxMarks: number;
  obtained: number | 'A' | null;
  percentage: number | null;
  grade: string;
  remarks: string;
  passed: boolean;
}

export interface ComputedStudentMarksheet {
  student: MarksheetRosterStudent;
  examType: MarksheetExamType;
  examLabel: string;
  gradingSystem: GradingSystemType;
  sectionTier: 'SSC' | 'HSSC';
  classTeacher: string;
  subjects: ComputedSubjectRow[];
  totalMaxMarks: number;
  totalObtainedMarks: number;
  hasAnyScore: boolean;
  overallPercentage: number | null;
  overallGrade: string;
  overallRemarks: string;
  resultStatus: 'PASS' | 'NEEDS IMPROVEMENT' | 'PENDING';
  daysPresent: number | null;
  totalWorkingDays: number;
  attendancePercentage: number | null;
  codeOfConduct: CodeOfConduct;
  teacherRemarks: string;
  optionalLanguage: OptionalLanguage;
  optionalElective: OptionalElective;
}
