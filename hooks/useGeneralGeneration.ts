import { useState, useCallback } from 'react';
import { LessonPlan, GeneratedPaper, PaperConfig, TeacherInfo } from '../types';
import { generateLessonPlan as generateLessonPlanFromService } from '../services/geminiService';
import { generateExamPaper } from '../services/paperService';
import { exportAsDocx, exportAsPdf } from '../services/exportService';
import { curriculumData, getSubjectById, getChapterById } from '../curriculum';

export const useGeneralGeneration = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [generatedPlans, setGeneratedPlans] = useState<LessonPlan[]>([]);
  const [generatedPapers, setGeneratedPapers] = useState<GeneratedPaper[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateLessonPlan = useCallback(async (
    classId: string,
    subjectId: string,
    chapterId: string,
    teacherInfo: TeacherInfo,
    topicOverride?: string
  ): Promise<LessonPlan | null> => {
    setIsLoading(true);
    setError(null);
    setGeneratedPlans([]);
    setGeneratedPapers([]);
    setGenerationProgress({ current: 0, total: 3 });
    setStatusMessage('Preparing lesson plan...');

    try {
      const cls = curriculumData.classes.find(c => c.id === classId);
      const subject = getSubjectById(curriculumData.classes, classId, subjectId);
      const chapter = chapterId ? getChapterById(cls!, subjectId, chapterId) : null;

      if (!cls || !subject) {
        throw new Error('Invalid selection');
      }

      let sloText: string;
      let chapterName: string;
      let unitNumber: string;

      if (topicOverride) {
        sloText = topicOverride;
        chapterName = topicOverride;
        unitNumber = chapterId.replace('ch', '') || '1';
      } else if (chapter) {
        sloText = chapter.slos.length > 0
          ? chapter.slos[0].text
          : `Learn about ${chapter.name} in ${subject.name}`;
        chapterName = chapter.name;
        unitNumber = chapterId.replace('ch', '');
      } else {
        throw new Error('Invalid selection');
      }

      setGenerationProgress({ current: 1, total: 3 });
      setStatusMessage('Generating lesson plan with AI...');

      const mockSlo = {
        SLO_ID: chapterId ? `CH-${chapterId}` : 'TOPIC',
        SLO_Text: sloText,
        grade: cls.name,
        Unit_Name: chapterName,
        Unit_Number: unitNumber,
        Section_Name: chapterName,
        Cognitive_Level_Code: 'U',
        uniqueId: `${classId}_${subjectId}_${chapterId || 'topic'}_${Date.now()}`,
      };

      const plan = await generateLessonPlanFromService(mockSlo, [], undefined, subject.name);
      
      setGenerationProgress({ current: 2, total: 3 });
      setStatusMessage('Formatting document...');

      plan.gradeLevel = cls.name;
      plan.subject = subject.name;
      plan.chapterName = chapterName;

      setGenerationProgress({ current: 3, total: 3 });
      setStatusMessage('Complete!');

      setGeneratedPlans([plan]);
      setIsLoading(false);
      setGenerationProgress(null);
      return plan;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate lesson plan';
      setError(errorMsg);
      setIsLoading(false);
      setGenerationProgress(null);
      setStatusMessage('');
      return null;
    }
  }, []);

  const generatePaper = useCallback(async (config: PaperConfig): Promise<GeneratedPaper | null> => {
    setIsLoading(true);
    setError(null);
    setGeneratedPlans([]);
    setGeneratedPapers([]);
    setGenerationProgress({ current: 0, total: 3 });
    setStatusMessage('Preparing exam paper...');

    try {
      setGenerationProgress({ current: 1, total: 3 });
      setStatusMessage('Generating questions with AI...');

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

      setGenerationProgress({ current: 2, total: 3 });
      setStatusMessage('Formatting document...');

      setGenerationProgress({ current: 3, total: 3 });
      setStatusMessage('Complete!');

      setGeneratedPapers([paper]);
      setIsLoading(false);
      setGenerationProgress(null);
      return paper;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate exam paper';
      setError(errorMsg);
      setIsLoading(false);
      setGenerationProgress(null);
      setStatusMessage('');
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
    setGenerationProgress(null);
    setStatusMessage('');
  }, []);

  return {
    isLoading,
    generationProgress,
    statusMessage,
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
