export interface Activity {
  name: string;
  duration: number;
  description: string;
}

export interface LessonPlan {
  title: string;
  objective: string;
  gradeLevel: string;
  subject: string;
  materials: string[];
  activities: Activity[];
  homework: string;
  unitNumber?: string;
  chapterName?: string;
}

export interface CurriculumSLO {
  id: string;
  text: string;
  cognitiveLevel?: string;
}

export interface CurriculumChapter {
  id: string;
  name: string;
  slos: CurriculumSLO[];
}

export interface CurriculumSubject {
  id: string;
  name: string;
  chapters: CurriculumChapter[];
}

export interface CurriculumClass {
  id: string;
  name: string;
  shortName: string;
  subjects: CurriculumSubject[];
}

export interface CurriculumData {
  classes: CurriculumClass[];
}

export interface PaperQuestion {
  id: string;
  type: 'mcq' | 'short' | 'long';
  question: string;
  options?: string[];
  /** Correct option letter ('A' | 'B' | 'C' | 'D') for MCQ questions, used by OMR grading. */
  correctAnswer?: string;
  marks: number;
  topic?: string;
}

export type PaperDifficulty = 'easy' | 'medium' | 'hard';
export type ClassroomTestFrequency = 'weekly' | 'monthly';

export interface PaperOmrMeta {
  enabled: boolean;
  /** Short unique test code printed on both the paper and OMR sheet QR payload (matches OmrQrPayload.pid). */
  testCode: string;
  /** Human-readable test identifier e.g. "Test #01", "Quiz #3". */
  testNumber: string;
  /** ISO date string YYYY-MM-DD. */
  testDate: string;
  /** Weekly or Monthly classroom MCQ test cadence. */
  testFrequency?: ClassroomTestFrequency;
  examType?: 'midterm' | 'mock' | 'preboard';
}

export interface PaperConfig {
  gradeId: string;
  subjectId: string;
  chapterId: string;
  totalMarks: number;
  mcqCount: number;
  /** Overall difficulty of the generated questions. */
  difficulty?: PaperDifficulty;
  /** Number of short questions listed on the paper (students attempt `shortAttemptCount`). */
  shortQuestionCount: number;
  /** Number of short questions students must attempt (<= shortQuestionCount). */
  shortAttemptCount: number;
  /** Marks per short question (default 2 for quiz/class test, 4 for mid/board). */
  shortMarksPerQuestion?: number;
  /** Number of long questions listed on the paper (students attempt `longAttemptCount`). */
  longQuestionCount: number;
  /** Number of long questions students must attempt (<= longQuestionCount). */
  longAttemptCount: number;
  /** Marks per long question (default 4 for class test, 8 or 10 for mid/board). */
  longMarksPerQuestion?: number;
  durationMinutes: number;
  /** Auto-paired OMR sheet + answer key metadata when generating MCQ-only tests. */
  omrMeta?: Omit<PaperOmrMeta, 'testCode'> & { testCode?: string };
}

/**
 * Per-section marking structure used to print the section instruction line
 * ("Each question carries N marks" / "Attempt any X of the Y questions").
 */
export interface PaperSectionBlueprint {
  /** Questions listed on the paper (all are candidates for the attempt-any rule). */
  questionCount: number;
  /** Questions the student must actually attempt. */
  attemptCount: number;
  /** Uniform marks carried by every question in this section. */
  perQuestionMarks: number;
}

export type PaperAuditIssueCategory =
  | 'answer_key'
  | 'factual_hallucination'
  | 'spelling_grammar'
  | 'latex_math'
  | 'formatting_layout'
  | 'duplicate'
  | 'syllabus'
  | 'count_marks';

export interface PaperAuditFixRecord {
  sectionIndex?: number;
  questionNumber?: number;
  category: PaperAuditIssueCategory;
  reason: string;
  applied: boolean;
}

export interface PaperAuditReport {
  status: 'verified' | 'fixed' | 'needs_review';
  score: number;
  passesCompleted: number;
  issuesFixedCount: number;
  remainingIssuesCount: number;
  checkedPdf: boolean;
  checkedDocx: boolean;
  summary: string;
  fixes: PaperAuditFixRecord[];
  warnings: string[];
  checkedAt: number;
}

export interface GeneratedPaper {
  title: string;
  gradeLevel: string;
  subject: string;
  chapterName: string;
  totalMarks: number;
  durationMinutes: number;
  sections: PaperSection[];
  /** Marking structure per section (index-aligned with `sections`). Absent after AI revision. */
  sectionBlueprints?: PaperSectionBlueprint[];
  /** Paired OMR test code, test number, date, and exam cycle for MCQ-only / OMR tests. */
  omrMeta?: PaperOmrMeta;
  /** Automated PDF + Word visual/accuracy audit summary. */
  auditReport?: PaperAuditReport;
  /**
   * Storage id of the saved copy in History (SavedExamPaperItem.id), stamped on
   * when the paper is opened from History. Edits update that record in place
   * instead of appending a duplicate, which is what this field exists to make
   * possible. Absent for a paper that has never been saved.
   */
  savedPaperId?: string;
}

export interface PaperSection {
  title: string;
  instruction: string;
  questions: PaperQuestion[];
}

export interface TeacherInfo {
  name: string;
  schoolName: string;
  designation?: string;
  subjects?: string[];
  grades?: string[];
}

/** A subject a teacher teaches, scoped to the exact class sections (e.g. "Physics" in ["IX", "X-A", "X-B", "XI", "XII"]). */
export interface TeacherSubject {
  name: string;
  sections: string[];
}

export interface Teacher {
  id: string;
  name: string;
  schoolName: string;
  designation?: string;
  /** Per-subject class sections — the single source of truth for where a teacher teaches. */
  subjects: TeacherSubject[];
}

export type View = 'home' | 'records' | 'archive' | 'attendance' | 'marksheets' | 'omr-scanner' | 'lesson' | 'paper' | 'results' | 'live' | 'history' | 'settings';
export type Theme = 'light' | 'dark';

export interface SLO {
  SLO_ID: string;
  Unit_Name: string;
  SLO_Text: string;
  grade?: string;
  Section_Name: string;
  Unit_Number: string;
  Cognitive_Level_Code: string;
  uniqueId?: string;
  chapterId?: string;
}

export type GroupedSlos = Record<string, SLO[]>;

export interface UnitsByGrade {
  [grade: string]: GroupedSlos;
}

export interface ContextPdf {
    name: string;
    grade: string;
    unit: string;
    file?: File;
    url?: string;
}

export type ExportOption = 'individual' | 'byUnit' | 'byGrade' | 'all';
export type ExportFormat = 'docx' | 'pdf' | 'both';

export type { SchoolConfig } from './services/schoolConfigService';
