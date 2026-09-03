export interface Activity {
  name: string;
  duration: number;
  description: string;
  teacherActions?: string;
  studentResponses?: string;
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

export interface PaperConfig {
  gradeId: string;
  subjectId: string;
  chapterId: string;
  totalMarks: number;
  mcqCount: number;
  shortQuestionCount: number;
  longQuestionCount: number;
  durationMinutes: number;
}

export interface GeneratedPaper {
  title: string;
  gradeLevel: string;
  subject: string;
  chapterName: string;
  totalMarks: number;
  durationMinutes: number;
  sections: PaperSection[];
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

export interface Teacher {
  id: string;
  name: string;
  schoolName: string;
  designation?: string;
  subjects: string[];
  grades: string[];
}

export type View = 'home' | 'lesson' | 'paper' | 'results';
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
