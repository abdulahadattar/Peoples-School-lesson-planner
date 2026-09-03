import { CurriculumClass, CurriculumData, CurriculumSubject } from '../types';
import { englishCurriculum } from './subjects/english';
import { mathematicsCurriculum } from './subjects/mathematics';
import { physicsCurriculum } from './subjects/physics';
import { chemistryCurriculum } from './subjects/chemistry';
import { biologyCurriculum } from './subjects/biology';
import { generalScienceCurriculum } from './subjects/general_science';
import { socialStudiesCurriculum } from './subjects/social_studies';
import { islamiyatCurriculum } from './subjects/islamiyat';
import { computerScienceCurriculum } from './subjects/computer_science';
import { pakStudiesCurriculum } from './subjects/pak_studies';
import { urduCurriculum } from './subjects/urdu';
import { generalKnowledgeCurriculum } from './subjects/general_knowledge';

export function getSubjectById(classes: CurriculumClass[], classId: string, subjectId: string): CurriculumSubject | undefined {
  const cls = classes.find(c => c.id === classId);
  return cls?.subjects.find(s => s.id === subjectId);
}

export function getChapterById(cls: CurriculumClass, subjectId: string, chapterId: string) {
  const subject = cls.subjects.find(s => s.id === subjectId);
  return subject?.chapters.find(ch => ch.id === chapterId);
}

export function mergeCurriculums(): CurriculumClass[] {
  const classMap = new Map<string, CurriculumClass>();

  const allCurricula = [
    englishCurriculum,
    mathematicsCurriculum,
    physicsCurriculum,
    chemistryCurriculum,
    biologyCurriculum,
    generalScienceCurriculum,
    socialStudiesCurriculum,
    islamiyatCurriculum,
    computerScienceCurriculum,
    pakStudiesCurriculum,
    urduCurriculum,
    generalKnowledgeCurriculum,
  ];

  allCurricula.forEach(curriculum => {
    curriculum.forEach(cls => {
      if (!classMap.has(cls.id)) {
        classMap.set(cls.id, {
          id: cls.id,
          name: cls.name,
          shortName: cls.shortName,
          subjects: [],
        });
      }
      const existing = classMap.get(cls.id)!;
      cls.subjects.forEach(sub => {
        if (!existing.subjects.find(s => s.id === sub.id)) {
          existing.subjects.push(sub);
        }
      });
    });
  });

  return Array.from(classMap.values()).sort((a, b) => {
    const numA = parseInt(a.id.replace('class', ''), 10);
    const numB = parseInt(b.id.replace('class', ''), 10);
    return numA - numB;
  });
}

export const curriculumData: CurriculumData = {
  classes: mergeCurriculums(),
};
