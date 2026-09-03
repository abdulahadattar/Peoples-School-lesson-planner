import { useState, useCallback, useRef } from 'react';
import { Part } from '@google/genai';
import { LessonPlan, GeneratedPaper, PaperConfig, TeacherInfo, ExportOption, SLO } from '../types';
import { generateLessonPlan as generateGeminiLessonPlan, downloadPdfAsPart } from '../services/geminiService';
import { generateExamPaper, reviseExamPaper } from '../services/paperService';
import { exportAsDocx, exportAsPdf, exportMultipleLessonsAsDocx, exportMultipleLessonsAsPdf, formatFileName } from '../services/exportService';
import { curriculumData, getSubjectById, getChapterById } from '../curriculum';

export type GenerationMode = 'single-slo' | 'whole-chapter' | 'topic';
export type UiExportFormat = 'docx' | 'pdf' | 'both';

export interface GenerationOptions {
  selectedSloIds?: string[];
  exportFormat: UiExportFormat;
  teacherInfo: TeacherInfo;
}

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
    setLogMessages(prev => [...prev, msg]);
  }, []);

  /**
   * Generate lesson plan(s) for a chapter.
   * Mode 'single-slo': generate one plan for the selected SLO
   * Mode 'whole-chapter': generate plans for all SLOs in the chapter
   * Mode 'topic': generate plan for custom topic text
   */
  const generateLessonPlan = useCallback(async (
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

    // Convert UI export format to internal export option
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
      addLog(`Looking up: classId="${classId}", subjectId="${subjectId}", chapterId="${chapterId}"`);
      addLog(`Available classes: ${curriculumData.classes.map(c => c.id).join(', ')}`);
      const cls = curriculumData.classes.find(c => c.id === classId);
      const subject = getSubjectById(curriculumData.classes, classId, subjectId);
      const chapter = cls && chapterId ? getChapterById(cls, subjectId, chapterId) : null;
      addLog(`Found class: ${cls?.name || 'null'}, subject: ${subject?.name || 'null'}`);

      if (!cls || !subject) {
        throw new Error('Invalid selection. Please check class and subject.');
      }

      addLog(`Selected: ${cls.name} | ${subject.name} | Chapter: ${chapter?.name || 'N/A'}`);

      let slosToGenerate: SLO[] = [];
      let chapterName: string;
      let unitNumber: string;

      if (mode === 'topic' && topicOverride) {
        // Topic mode: single generation with custom text
        const mockSlo: SLO = {
          SLO_ID: `TOPIC-${Date.now()}`,
          SLO_Text: topicOverride,
          grade: cls.name,
          Unit_Name: topicOverride,
          Unit_Number: chapterId.replace('ch', '') || '1',
          Section_Name: topicOverride,
          Cognitive_Level_Code: 'U',
          uniqueId: `${classId}_${subjectId}_topic_${Date.now()}`,
        };
        slosToGenerate = [mockSlo];
        chapterName = topicOverride;
        unitNumber = chapterId.replace('ch', '') || '1';
        addLog(`Topic mode: "${topicOverride}"`);
      } else if (mode === 'single-slo' && selectedSloIds.length > 0 && allChapterSlos.length > 0) {
        // Single SLO mode
        const selectedSlos = allChapterSlos.filter(s => selectedSloIds.includes(s.uniqueId || s.SLO_ID));
        if (selectedSlos.length === 0) {
          throw new Error('Please select at least one SLO.');
        }
        slosToGenerate = selectedSlos.map((slo, idx) => ({
          ...slo,
          grade: cls.name,
          Unit_Name: chapter?.name || 'Unknown',
          Unit_Number: chapterId.replace('ch', ''),
          Section_Name: chapter?.name || 'Unknown',
          uniqueId: slo.uniqueId || `${classId}_${subjectId}_${chapterId}_slo_${idx}`,
        })) as SLO[];
        chapterName = chapter?.name || 'Unknown';
        unitNumber = chapterId.replace('ch', '');
        addLog(`Single SLO mode: ${selectedSlos.length} SLO(s) selected`);
      } else if (mode === 'whole-chapter' && chapter) {
        // Whole chapter mode — try curriculum data first, fall back to SLO JSON files
        if (chapter.slos.length > 0) {
          slosToGenerate = chapter.slos.map((slo: any, idx: number) => ({
            SLO_ID: slo.id || `SLO_${idx}`,
            SLO_Text: slo.text || '',
            grade: cls.name,
            Unit_Name: chapter.name,
            Unit_Number: chapterId.replace('ch', ''),
            Section_Name: chapter.name,
            Cognitive_Level_Code: slo.cognitiveLevel || 'U',
            uniqueId: slo.uniqueId || `${classId}_${subjectId}_${chapterId}_slo_${idx}`,
          }));
        } else {
          // Curriculum data has empty SLOs — load from SLO JSON files in public/curriculum/slos/
          addLog('Loading SLOs from curriculum data files...');
          const gradeNum = classId.replace('class', '');
          const grade = `Grade ${parseInt(gradeNum, 10)}`;
          const sloPath = `/curriculum/slos/${grade}/${subjectId.toLowerCase()}.json`;
          try {
            const sloResponse = await fetch(sloPath);
            if (sloResponse.ok) {
              const sloData = await sloResponse.json();
              const chapterNum = parseInt(chapterId.replace('ch', ''), 10);
              const sloChapter = sloData.chapters?.find((c: any) => c.chapter_number === chapterNum);
              if (sloChapter?.slos?.length > 0) {
                slosToGenerate = sloChapter.slos.map((slo: any, idx: number) => ({
                  SLO_ID: slo.id || `SLO_${idx}`,
                  SLO_Text: slo.text || '',
                  grade: cls.name,
                  Unit_Name: chapter.name,
                  Unit_Number: chapterId.replace('ch', ''),
                  Section_Name: chapter.name,
                  Cognitive_Level_Code: slo.cognitive_level || 'U',
                  uniqueId: `${classId}_${subjectId}_${chapterId}_slo_${idx}`,
                }));
                addLog(`Loaded ${slosToGenerate.length} SLO(s) from curriculum data`);
              }
            }
          } catch (err) {
            console.warn('[useGeneralGeneration] Error loading SLOs:', err);
          }
          // If still empty, create a single generic SLO
          if (slosToGenerate.length === 0) {
            slosToGenerate = [{
              SLO_ID: `CH-${chapterId}`,
              SLO_Text: `Learn about ${chapter.name} in ${subject.name}`,
              grade: cls.name,
              Unit_Name: chapter.name,
              Unit_Number: chapterId.replace('ch', ''),
              Section_Name: chapter.name,
              Cognitive_Level_Code: 'U',
              uniqueId: `${classId}_${subjectId}_${chapterId}_all`,
            }];
            addLog('No SLOs found — using generic chapter plan');
          }
        }
        chapterName = chapter.name;
        unitNumber = chapterId.replace('ch', '');
        addLog(`Whole chapter mode: ${slosToGenerate.length} SLO(s) will be generated`);
      } else {
        throw new Error('Invalid generation mode or missing selection.');
      }

      const totalSlos = slosToGenerate.length;
      setGenerationProgress({ current: 0, total: totalSlos });
      setStatusMessage('Preparing lesson plans...');

      const allGeneratedPlans: LessonPlan[] = [];

      // Download chapter PDF once before the loop — same PDF reused for every SLO in this chapter
      let chapterPdfPart: Part | null = null;
      if (mode !== 'topic') {
        addLog('Downloading chapter textbook PDF for context...');
        const pdfUrl = await downloadPdfUrlForChapter(classId, subjectId, chapterId);
        if (pdfUrl) {
          addLog(`PDF URL: ${pdfUrl}`);
          chapterPdfPart = await downloadPdfAsPart(pdfUrl);
          if (chapterPdfPart) {
            const sizeKB = ((chapterPdfPart.inlineData?.data?.length || 0) * 0.75 / 1024).toFixed(0);
            addLog(`PDF context loaded (${sizeKB}KB) — will be sent with EACH SLO request below`);
          } else {
            addLog('WARN: Could not download PDF. AI will use general knowledge instead.');
          }
        } else {
          addLog('WARN: No PDF URL found for this chapter. AI will use general knowledge instead.');
        }
      }

      addLog(`\nGenerating ${totalSlos} isolated lesson plan(s) — one API request per SLO:`);

      for (let i = 0; i < totalSlos; i++) {
        if (isCancelledRef.current) break; // Allow cancellation

        const slo = slosToGenerate[i];
        setGenerationProgress({ current: i + 1, total: totalSlos });
        setStatusMessage(`Generating plan ${i + 1} of ${totalSlos}...`);
        addLog(`\n── Request ${i + 1}/${totalSlos}: SLO "${slo.SLO_ID}" ──`);
        addLog(`   Topic: ${slo.SLO_Text}`);
        addLog(`   PDF attached: ${chapterPdfPart ? 'Yes' : 'No'}`);

        try {
          // Each SLO gets its own isolated API request with the chapter PDF
          const contextFileParts: any[] = chapterPdfPart ? [chapterPdfPart] : [];

          const plan = await generateGeminiLessonPlan(slo, slosToGenerate, contextFileParts, subject.name, addLog);

          plan.gradeLevel = cls.name;
          plan.subject = subject.name;
          plan.chapterName = chapterName;

          allGeneratedPlans.push(plan);
          addLog(`✓ Done: "${plan.title}"`);

          // Export based on format (skip if cancelled)
          if (isIndividualExport && !isCancelledRef.current) {
            addLog('Exporting DOCX and PDF...');
            try {
              await Promise.race([
                exportAsDocx(plan, slo.SLO_ID, teacherInfo),
                new Promise((_, reject) => setTimeout(() => reject(new Error('DOCX export timed out')), 30000))
              ]);
              if (isCancelledRef.current) break;
              await new Promise(resolve => setTimeout(resolve, 250));
              await Promise.race([
                exportAsPdf(plan, slo.SLO_ID, teacherInfo),
                new Promise((_, reject) => setTimeout(() => reject(new Error('PDF export timed out')), 30000))
              ]);
            } catch (exportError) {
              addLog(`WARN: Export failed for ${slo.SLO_ID}: ${exportError instanceof Error ? exportError.message : 'Unknown error'}`);
            }
          }

          // Delay between requests (except for last one, skip if cancelled)
          if (i < totalSlos - 1 && !isCancelledRef.current) {
            addLog('Waiting 2 seconds before next request...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (sloError) {
          const errorMsg = sloError instanceof Error ? sloError.message : String(sloError);
          addLog(`✗ ERROR for ${slo.SLO_ID}: ${errorMsg}`);
          console.error(`Failed to generate plan for ${slo.SLO_ID}:`, sloError);
          
          // Continue with next SLO instead of stopping
          if (i < totalSlos - 1) {
            addLog('Continuing with next SLO...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // Batch export if not individual (skip if cancelled)
      if (exportOption !== 'individual' && allGeneratedPlans.length > 0 && !isCancelledRef.current) {
        const fileName = formatFileName(`${cls.name} ${subject.name} ${chapterName}`);
        addLog(`\nExporting ${allGeneratedPlans.length} plans...`);
        
        try {
          if (!isCancelledRef.current) {
            addLog('Generating DOCX...');
            await Promise.race([
              exportMultipleLessonsAsDocx(allGeneratedPlans, fileName, teacherInfo),
              new Promise((_, reject) => setTimeout(() => reject(new Error('DOCX export timed out after 60s')), 60000))
            ]);
            addLog('✓ DOCX exported');
          }
          if (!isCancelledRef.current) {
            await new Promise(resolve => setTimeout(resolve, 250));
            addLog('Generating PDF...');
            await Promise.race([
              exportMultipleLessonsAsPdf(allGeneratedPlans, fileName, teacherInfo),
              new Promise((_, reject) => setTimeout(() => reject(new Error('PDF export timed out after 60s')), 60000))
            ]);
            addLog('✓ PDF exported');
          }
        } catch (batchError) {
          addLog(`WARN: Batch export failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
        }
      }

      setGeneratedPlans(allGeneratedPlans);
      setGenerationProgress(null);
      setStatusMessage(allGeneratedPlans.length > 0 ? 'Complete!' : 'No plans generated');
      addLog(`\n✓ Generation complete: ${allGeneratedPlans.length}/${totalSlos} plans created`);

      return allGeneratedPlans;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate lesson plans';
      console.error(errorMsg);
      addLog(`ERROR: ${errorMsg}`);
      setError(errorMsg);
      setIsLoading(false);
      setGenerationProgress(null);
      setStatusMessage('');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [addLog]);

  const generatePaper = useCallback(async (config: PaperConfig): Promise<GeneratedPaper | null> => {
    setIsLoading(true);
    isCancelledRef.current = false;
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
        config.durationMinutes,
        addLog
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

  const exportPlan = useCallback(async (plan: LessonPlan, teacherInfo: TeacherInfo, exportFormatOption?: ExportOption) => {
    try {
      if (exportFormatOption === 'individual') {
        await exportAsDocx(plan, undefined, teacherInfo);
        await new Promise(resolve => setTimeout(resolve, 250));
        await exportAsPdf(plan, undefined, teacherInfo);
      } else if (exportFormatOption === 'all' || exportFormatOption === 'byUnit' || exportFormatOption === 'byGrade') {
        // Batch export handled in generation
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to export plan';
      setError(errorMsg);
      throw error;
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

  const revisePaper = useCallback(async (revisionPrompt: string): Promise<GeneratedPaper | null> => {
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
      addLog(`Revision instructions: "${revisionPrompt}"`);
      const revised = await reviseExamPaper(currentPaper, revisionPrompt, addLog);
      setGeneratedPapers([revised]);
      addLog('\n✓ Paper revised successfully!');
      setIsLoading(false);
      return revised;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to revise paper';
      addLog(`ERROR: ${errorMsg}`);
      setError(errorMsg);
      setIsLoading(false);
      return null;
    }
  }, [generatedPapers, addLog]);

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
    revisePaper,
    stopGeneration,
    clearResults,
  };
};

/**
 * Download PDF URL for a chapter from the SLO curriculum data.
 */
async function downloadPdfUrlForChapter(classId: string, subjectId: string, chapterId: string): Promise<string | null> {
  try {
    // Extract grade from classId
    const gradeNum = classId.replace('class', '');
    const grade = `Grade ${parseInt(gradeNum, 10)}`;
    
    // Extract chapter number
    const chapterNum = parseInt(chapterId.replace('ch', ''), 10);
    
    // Load from SLO JSON files
    const response = await fetch(`/curriculum/slos/${grade}/${subjectId.toLowerCase()}.json`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const chapter = data.chapters?.find((c: any) => c.chapter_number === chapterNum);
    return chapter?.pdf_url || null;
  } catch (error) {
    console.error('[useGeneralGeneration] Error getting PDF URL:', error);
    return null;
  }
}