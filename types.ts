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
  marks: number;
  topic?: string;
}

export type PaperDifficulty = 'easy' | 'medium' | 'hard';

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
  /** Number of long questions listed on the paper (students attempt `longAttemptCount`). */
  longQuestionCount: number;
  /** Number of long questions students must attempt (<= longQuestionCount). */
  longAttemptCount: number;
  durationMinutes: number;
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

export type View = 'home' | 'lesson' | 'paper' | 'results' | 'live';
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
