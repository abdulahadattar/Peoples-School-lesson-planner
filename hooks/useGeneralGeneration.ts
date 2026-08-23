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
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [generatedPlans, setGeneratedPlans] = useState<LessonPlan[]>([]);
  const [generatedPapers, setGeneratedPapers] = useState<GeneratedPaper[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showStatusPanel, setShowStatusPanel] = useState(false);

  const addLog = useCallback((msg: string) => {
    console.log(`[useGeneralGeneration] ${msg}`);
    setLogMessages(prev => [...prev, msg]);
  }, []);

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
    setLogMessages([]);
    setGenerationProgress({ current: 0, total: 3 });
    setStatusMessage('Preparing lesson plan...');
    setShowStatusPanel(true);
    addLog('Starting lesson plan generation...');

    try {
      const cls = curriculumData.classes.find(c => c.id === classId);
      const subject = getSubjectById(curriculumData.classes, classId, subjectId);
      const chapter = cls && chapterId ? getChapterById(cls, subjectId, chapterId) : null;

      if (!cls || !subject) {
        throw new Error('Invalid selection');
      }
      addLog(`Selected class: ${cls.name} | Subject: ${subject.name}`);

      let sloText: string;
      let chapterName: string;
      let unitNumber: string;

      if (topicOverride) {
        sloText = topicOverride;
        chapterName = topicOverride;
        unitNumber = chapterId.replace('ch', '') || '1';
        addLog(`Using custom topic: ${topicOverride}`);
      } else if (chapter) {
        sloText = chapter.slos.length > 0
          ? chapter.slos[0].text
          : `Learn about ${chapter.name} in ${subject.name}`;
        chapterName = chapter.name;
        unitNumber = chapterId.replace('ch', '');
        addLog(`Selected chapter: ${chapterName} | SLOs in chapter: ${chapter.slos.length}`);
      } else {
        throw new Error('Invalid selection');
      }

      setGenerationProgress({ current: 1, total: 3 });
      setStatusMessage('Generating lesson plan with AI...');
      addLog('Progress 1/3: Sending request to AI model...');

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

      const plan = await generateLessonPlanFromService(mockSlo, [], undefined, subject.name, addLog);

      setGenerationProgress({ current: 2, total: 3 });
      setStatusMessage('Formatting document...');
      addLog('Progress 2/3: Formatting lesson plan document...');

      plan.gradeLevel = cls.name;
      plan.subject = subject.name;
      plan.chapterName = chapterName;
      addLog(`Format applied: gradeLevel="${plan.gradeLevel}" subject="${plan.subject}"`);

      setGenerationProgress({ current: 3, total: 3 });
      setStatusMessage('Complete!');
      addLog('Progress 3/3: Generation complete!');

      setGeneratedPlans([plan]);
      setIsLoading(false);
      setGenerationProgress(null);
      setShowStatusPanel(true);
      return plan;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate lesson plan';
      console.error(errorMsg);
      addLog(`ERROR: ${errorMsg}`);
      setError(errorMsg);
      setIsLoading(false);
      setGenerationProgress(null);
      setStatusMessage('');
      setShowStatusPanel(true);
      return null;
    }
  }, [addLog]);

  const generatePaper = useCallback(async (config: PaperConfig): Promise<GeneratedPaper | null> => {
    setIsLoading(true);
    setError(null);
    setGeneratedPlans([]);
    setGeneratedPapers([]);
    setLogMessages([]);
    setGenerationProgress({ current: 0, total: 3 });
    setStatusMessage('Preparing exam paper...');
    setShowStatusPanel(true);
    addLog('Starting exam paper generation...');

    try {
      setGenerationProgress({ current: 1, total: 3 });
      setStatusMessage('Generating questions with AI...');
      addLog('Progress 1/3: Generating questions with AI model...');

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
      addLog('Progress 2/3: Formatting exam paper document...');

      setGenerationProgress({ current: 3, total: 3 });
      setStatusMessage('Complete!');
      addLog('Progress 3/3: Paper generation complete!');

      setGeneratedPapers([paper]);
      setIsLoading(false);
      setGenerationProgress(null);
      setShowStatusPanel(true);
      return paper;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate exam paper';
      console.error(errorMsg);
      addLog(`ERROR: ${errorMsg}`);
      setError(errorMsg);
      setIsLoading(false);
      setGenerationProgress(null);
      setStatusMessage('');
      setShowStatusPanel(true);
      return null;
    }
  }, [addLog]);

  const exportPlan = useCallback(async (plan: LessonPlan, teacherInfo: TeacherInfo) => {
    try {
      await exportAsDocx(plan, undefined, teacherInfo);
      await exportAsPdf(plan, undefined, teacherInfo);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to export plan';
      setError(errorMsg);
    }
  }, []);

  const exportPaper = useCallback(async (paper: GeneratedPaper, teacherInfo: TeacherInfo) => {
    try {
      const { exportPaperAsDocx, exportPaperAsPdf } = await import('../services/exportService');
      await exportPaperAsDocx(paper, teacherInfo);
      await exportPaperAsPdf(paper, teacherInfo);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to export paper';
      setError(errorMsg);
    }
  }, []);

  const clearResults = useCallback(() => {
    setGeneratedPlans([]);
    setGeneratedPapers([]);
    setError(null);
    setLogMessages([]);
    setGenerationProgress(null);
    setStatusMessage('');
    setShowStatusPanel(false);
  }, []);

  return {
    isLoading,
    generationProgress,
    statusMessage,
    logMessages,
    generatedPlans,
    generatedPapers,
    error,
    showStatusPanel,
    setShowStatusPanel,
    generateLessonPlan,
    generatePaper,
    exportPlan,
    exportPaper,
    clearResults,
  };
};
