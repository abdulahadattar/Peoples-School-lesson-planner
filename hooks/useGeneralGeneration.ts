import { useState, useCallback } from 'react';
import { LessonPlan, GeneratedPaper, PaperConfig, TeacherInfo } from '../types';
import { generateLessonPlan as generateLessonPlanFromService } from '../services/geminiService';
import { generateExamPaper } from '../services/paperService';
import { exportAsDocx, exportAsPdf } from '../services/exportService';
import { curriculumData, getSubjectById, getChapterById } from '../curriculum';

export const useGeneralGeneration = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [generatedPlans, setGeneratedPlans] = useState<LessonPlan[]>([]);
  const [generatedPapers, setGeneratedPapers] = useState<GeneratedPaper[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateLessonPlan = useCallback(async (
    classId: string,
    subjectId: string,
    chapterId: string,
    teacherInfo: TeacherInfo
  ): Promise<LessonPlan | null> => {
    setIsLoading(true);
    setError(null);
    setGeneratedPlans([]);
    setGeneratedPapers([]);

    try {
      const cls = curriculumData.classes.find(c => c.id === classId);
      const subject = getSubjectById(curriculumData.classes, classId, subjectId);
      const chapter = getChapterById(cls!, subjectId, chapterId);

      if (!cls || !subject || !chapter) {
        throw new Error('Invalid selection');
      }

      const sloText = chapter.slos.length > 0 
        ? chapter.slos[0].text 
        : `Learn about ${chapter.name} in ${subject.name}`;

      const mockSlo = {
        SLO_ID: `CH-${chapterId}`,
        SLO_Text: sloText,
        grade: cls.name,
        Unit_Name: chapter.name,
        Unit_Number: chapterId.replace('ch', ''),
        Section_Name: chapter.name,
        Cognitive_Level_Code: 'U',
        uniqueId: `${classId}_${subjectId}_${chapterId}`,
      };

      const plan = await generateLessonPlanFromService(mockSlo, [], undefined, subject.name);
      plan.gradeLevel = cls.name;
      plan.subject = subject.name;
      plan.chapterName = chapter.name;

      setGeneratedPlans([plan]);
      setIsLoading(false);
      return plan;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate lesson plan';
      setError(errorMsg);
      setIsLoading(false);
      return null;
    }
  }, []);

  const generatePaper = useCallback(async (config: PaperConfig): Promise<GeneratedPaper | null> => {
    setIsLoading(true);
    setError(null);
    setGeneratedPlans([]);
    setGeneratedPapers([]);

    try {
      const paper = await generateExamPaper(
        config.gradeId,
        config.subjectId,
        config.chapterId,
        config.totalMarks,
        config.mcqCount,
        config.shortQuestionCount,
        config.longQuestionCount,
        config.durationMinutes
      );

      setGeneratedPapers([paper]);
      setIsLoading(false);
      return paper;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate exam paper';
      setError(errorMsg);
      setIsLoading(false);
      return null;
    }
  }, []);

  const exportPlan = useCallback(async (plan: LessonPlan, teacherInfo: TeacherInfo) => {
    await exportAsDocx(plan, undefined, teacherInfo);
    await exportAsPdf(plan, undefined, teacherInfo);
  }, []);

  const exportPaper = useCallback(async (paper: GeneratedPaper, teacherInfo: TeacherInfo) => {
    const { exportPaperAsDocx, exportPaperAsPdf } = await import('../services/exportService');
    await exportPaperAsDocx(paper, teacherInfo);
    await exportPaperAsPdf(paper, teacherInfo);
  }, []);

  const clearResults = useCallback(() => {
    setGeneratedPlans([]);
    setGeneratedPapers([]);
    setError(null);
  }, []);

  return {
    isLoading,
    generatedPlans,
    generatedPapers,
    error,
    generateLessonPlan,
    generatePaper,
    exportPlan,
    exportPaper,
    clearResults,
  };
};
