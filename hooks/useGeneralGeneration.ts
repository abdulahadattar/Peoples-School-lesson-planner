import { useState, useCallback, useRef } from 'react';
import { LessonPlan, GeneratedPaper, PaperConfig, TeacherInfo, ExportOption, SLO } from '../types';
import { generateLessonPlan as generateGeminiLessonPlan } from '../services/geminiService';
import { saveLessonPlanToDb } from '../services/storageService';
import {
  GenerationMode,
  UiExportFormat,
  GenerationOptions,
  withTimeout,
} from './generalGeneration/types';
import {
  resolveSlosToGenerate,
  loadChapterPdf,
} from './generalGeneration/planGenerator';
import {
  generateExamPaperAction,
  reviseExamPaperAction,
} from './generalGeneration/paperGenerator';
import { toUserErrorMessage } from '../utils/userMessage';

export type { GenerationMode, UiExportFormat, GenerationOptions };

/**
 * Shared generation hook for lesson plans and exam papers.
 * Tracks loading state, progress, logs, and results for both generators.
 */
export const useGeneralGeneration = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [generatedPlans, setGeneratedPlans] = useState<LessonPlan[]>([]);
  const [generatedPapers, setGeneratedPapers] = useState<GeneratedPaper[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const isCancelledRef = useRef(false);

  const addLog = useCallback((msg: string) => {
    console.log(`[useGeneralGeneration] ${msg}`);
    const match = msg.match(/^((?:Attempt|Response parse attempt)\s+\d+\s+failed):\s*(.+)$/i);
    if (match) {
      const cleanDetail = toUserErrorMessage(match[2], 'Could not reach the server. Please try again.');
      setLogMessages((prev) => [...prev, `WARN: ${cleanDetail}`]);
      return;
    }
    setLogMessages((prev) => [...prev, msg]);
  }, []);

  const generateLessonPlan = useCallback(
    async (
      classId: string,
      subjectId: string,
      chapterId: string,
      teacherInfo: TeacherInfo,
      topicOverride?: string,
      options?: {
        mode?: GenerationMode;
        selectedSloIds?: string[];
        exportFormat?: UiExportFormat;
        allChapterSlos?: SLO[];
      }
    ): Promise<LessonPlan[] | null> => {
      const mode = options?.mode || 'topic';
      const selectedSloIds = options?.selectedSloIds || [];
      const uiExportFormat = options?.exportFormat || 'docx';
      const allChapterSlos = options?.allChapterSlos || [];

      const exportOption: ExportOption = uiExportFormat === 'both' ? 'all' : 'individual';
      const isIndividualExport = uiExportFormat !== 'both';

      setIsLoading(true);
      isCancelledRef.current = false;
      setError(null);
      setGeneratedPlans([]);
      setGeneratedPapers([]);
      setLogMessages([]);
      setShowStatusPanel(true);
      addLog('Starting lesson plan generation...');

      try {
        const { slosToGenerate, chapterName, clsName, subjectName } = await resolveSlosToGenerate(
          classId,
          subjectId,
          chapterId,
          mode,
          topicOverride,
          selectedSloIds,
          allChapterSlos,
          addLog
        );

        const totalSlos = slosToGenerate.length;
        setGenerationProgress({ current: 0, total: totalSlos });
        setStatusMessage('Preparing lesson plans...');

        const allGeneratedPlans: LessonPlan[] = [];
        let chapterPdfPart = null;
        if (mode !== 'topic') {
          chapterPdfPart = await loadChapterPdf(classId, subjectId, chapterId, addLog);
        }

        addLog(`Preparing ${totalSlos} lesson plan(s)...`);

        for (let i = 0; i < totalSlos; i++) {
          if (isCancelledRef.current) break;

          const slo = slosToGenerate[i];
          setGenerationProgress({ current: i + 1, total: totalSlos });
          setStatusMessage(`Preparing plan ${i + 1} of ${totalSlos}...`);
          addLog(`Plan ${i + 1}/${totalSlos}: ${slo.SLO_Text}`);

          try {
            const contextFileParts: any[] = chapterPdfPart ? [chapterPdfPart] : [];
            const plan = await generateGeminiLessonPlan(slo, slosToGenerate, contextFileParts, subjectName, addLog);

            plan.gradeLevel = clsName;
            plan.subject = subjectName;
            plan.chapterName = chapterName;

            allGeneratedPlans.push(plan);
            addLog(`✓ Done: "${plan.title}"`);
            saveLessonPlanToDb(plan, slo.SLO_ID, teacherInfo).catch((err) =>
              console.error('Failed to auto-save plan to DB:', err)
            );

            if (isIndividualExport && !isCancelledRef.current) {
              addLog(`Exporting (${uiExportFormat})...`);
              try {
                const { exportAsDocx, exportAsPdf } = await import('../services/exportService');
                if (uiExportFormat === 'docx') {
                  await withTimeout(exportAsDocx(plan, slo.SLO_ID, teacherInfo), 30000, 'DOCX export timed out');
                } else if (uiExportFormat === 'pdf') {
                  await withTimeout(exportAsPdf(plan, slo.SLO_ID, teacherInfo), 30000, 'PDF export timed out');
                }
              } catch (exportError) {
                addLog(`WARN: Could not export ${slo.SLO_ID}: ${toUserErrorMessage(exportError, 'Export failed.')}`);
              }
            }

            if (i < totalSlos - 1 && !isCancelledRef.current) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          } catch (sloError) {
            const safeMsg = toUserErrorMessage(sloError, 'Could not create lesson plan.');
            addLog(`ERROR: ${slo.SLO_ID}: ${safeMsg}`);
            console.error(`Failed to generate plan for ${slo.SLO_ID}:`, sloError);

            if (i < totalSlos - 1) {
              addLog('Continuing with next topic...');
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
        }

        if (exportOption !== 'individual' && allGeneratedPlans.length > 0 && !isCancelledRef.current) {
          const { exportMultipleLessonsAsDocx, exportMultipleLessonsAsPdf, formatFileName } = await import('../services/exportService');
          const fileName = formatFileName(`${clsName} ${subjectName} ${chapterName}`);
          addLog(`\nExporting ${allGeneratedPlans.length} plans...`);

          try {
            addLog('Generating DOCX...');
            await withTimeout(
              exportMultipleLessonsAsDocx(allGeneratedPlans, fileName, teacherInfo),
              60000,
              'DOCX export timed out after 60s'
            );
            if (!isCancelledRef.current) {
              addLog('✓ DOCX exported');
              await new Promise((resolve) => setTimeout(resolve, 250));
              if (!isCancelledRef.current) {
                addLog('Generating PDF...');
                await withTimeout(
                  exportMultipleLessonsAsPdf(allGeneratedPlans, fileName, teacherInfo),
                  60000,
                  'PDF export timed out after 60s'
                );
                addLog('✓ PDF exported');
              }
            }
          } catch (batchError) {
            addLog(`WARN: ${toUserErrorMessage(batchError, 'Export failed.')}`);
          }
        }

        setGeneratedPlans(allGeneratedPlans);
        setGenerationProgress(null);
        setStatusMessage(allGeneratedPlans.length > 0 ? 'Complete!' : 'No plans generated');
        addLog(`✓ Complete: ${allGeneratedPlans.length}/${totalSlos} plans created`);

        return allGeneratedPlans;
      } catch (err) {
        const safeMsg = toUserErrorMessage(err, 'Failed to create lesson plans. Please try again.');
        console.error(err);
        addLog(`ERROR: ${safeMsg}`);
        setError(safeMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [addLog]
  );

  const generatePaper = useCallback(
    async (config: PaperConfig, teacherInfo?: TeacherInfo): Promise<GeneratedPaper | null> => {
      setIsLoading(true);
      isCancelledRef.current = false;
      setError(null);
      setGeneratedPlans([]);
      setGeneratedPapers([]);
      setLogMessages([]);
      setGenerationProgress({ current: 0, total: 4 });
      setStatusMessage('Preparing exam paper...');
      setShowStatusPanel(true);
      addLog('Starting exam paper generation...');

      try {
        const paper = await generateExamPaperAction(
          config,
          addLog,
          setGenerationProgress,
          setStatusMessage,
          teacherInfo
        );
        setGeneratedPapers([paper]);
        setIsLoading(false);
        setGenerationProgress(null);
        setShowStatusPanel(true);
        return paper;
      } catch (err) {
        const safeMsg = toUserErrorMessage(err, 'Failed to create exam paper. Please try again.');
        console.error(err);
        addLog(`ERROR: ${safeMsg}`);
        setError(safeMsg);
        setIsLoading(false);
        setGenerationProgress(null);
        setStatusMessage('');
        setShowStatusPanel(true);
        return null;
      }
    },
    [addLog]
  );

  const exportPlan = useCallback(
    async (plan: LessonPlan, teacherInfo: TeacherInfo, exportFormatOption?: UiExportFormat) => {
      try {
        const { exportAsDocx, exportAsPdf } = await import('../services/exportService');
        const fmt = exportFormatOption || 'both';
        if (fmt === 'docx') {
          await exportAsDocx(plan, undefined, teacherInfo);
        } else if (fmt === 'pdf') {
          await exportAsPdf(plan, undefined, teacherInfo);
        } else {
          await exportAsDocx(plan, undefined, teacherInfo);
          await new Promise((resolve) => setTimeout(resolve, 250));
          await exportAsPdf(plan, undefined, teacherInfo);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to export plan';
        setError(errorMsg);
        throw error;
      }
    },
    []
  );

  const stopGeneration = useCallback(() => {
    isCancelledRef.current = true;
    setIsLoading(false);
    setError('Generation cancelled by user.');
    addLog('Generation cancelled by user.');
    setGenerationProgress(null);
    setStatusMessage('Cancelled');
  }, [addLog]);

  const clearResults = useCallback(() => {
    isCancelledRef.current = true;
    setGeneratedPlans([]);
    setGeneratedPapers([]);
    setError(null);
    setLogMessages([]);
    setGenerationProgress(null);
    setStatusMessage('');
    setShowStatusPanel(false);
  }, []);

  const revisePaper = useCallback(
    async (revisionPrompt: string, teacherInfo?: TeacherInfo): Promise<GeneratedPaper | null> => {
      if (generatedPapers.length === 0) {
        setError('No paper to revise. Generate a paper first.');
        return null;
      }

      const currentPaper = generatedPapers[0];
      setIsLoading(true);
      isCancelledRef.current = false;
      setError(null);
      setLogMessages([]);
      setShowStatusPanel(true);
      addLog('Starting paper revision...');

      try {
        const revised = await reviseExamPaperAction(currentPaper, revisionPrompt, addLog, teacherInfo);
        setGeneratedPapers([revised]);
        setIsLoading(false);
        return revised;
      } catch (err) {
        const safeMsg = toUserErrorMessage(err, 'Failed to revise exam paper. Please try again.');
        addLog(`ERROR: ${safeMsg}`);
        setError(safeMsg);
        setIsLoading(false);
        return null;
      }
    },
    [generatedPapers, addLog]
  );

  return {
    isLoading,
    generationProgress,
    statusMessage,
    logMessages,
    generatedPlans,
    generatedPapers,
    setGeneratedPlans,
    setGeneratedPapers,
    error,
    showStatusPanel,
    setShowStatusPanel,
    generateLessonPlan,
    generatePaper,
    exportPlan,
    revisePaper,
    stopGeneration,
    clearResults,
  };
};
