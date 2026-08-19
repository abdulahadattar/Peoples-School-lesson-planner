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

export const getSubjectById = (classes: CurriculumClass[], classId: string, subjectId: string): CurriculumSubject | undefined => {
  const cls = classes.find(c => c.id === classId);
  return cls?.subjects.find(s => s.id === subjectId);
};

export const getChapterById = (cls: CurriculumClass, subjectId: string, chapterId: string): CurriculumChapter | undefined => {
  const subject = cls.subjects.find(s => s.id === subjectId);
  return subject?.chapters.find(ch => ch.id === chapterId);
};
