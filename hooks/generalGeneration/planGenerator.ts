import { Part } from '@google/genai';
import { LessonPlan, TeacherInfo, SLO, ExportOption } from '../../types';
import { generateLessonPlan as generateGeminiLessonPlan, downloadPdfAsPart } from '../../services/geminiService';
import { curriculumData, getSubjectById, getChapterById } from '../../curriculum';
import { loadSloChapter } from '../../services/sloData';
import { saveLessonPlanToDb } from '../../services/storageService';
import { GenerationMode, UiExportFormat, withTimeout } from './types';

export interface PlanResolutionResult {
  slosToGenerate: SLO[];
  chapterName: string;
  unitNumber: string;
  clsName: string;
  subjectName: string;
}

export async function resolveSlosToGenerate(
  classId: string,
  subjectId: string,
  chapterId: string,
  mode: GenerationMode,
  topicOverride?: string,
  selectedSloIds: string[] = [],
  allChapterSlos: SLO[] = [],
  addLog: (msg: string) => void = () => {}
): Promise<PlanResolutionResult> {
  const cls = curriculumData.classes.find((c) => c.id === classId);
  const subject = getSubjectById(curriculumData.classes, classId, subjectId);
  const chapter = cls && chapterId ? getChapterById(cls, subjectId, chapterId) : null;

  if (!cls || !subject) {
    throw new Error('Invalid selection. Please check class and subject.');
  }

  let slosToGenerate: SLO[] = [];
  let chapterName: string;
  let unitNumber: string;

  if (mode === 'topic' && topicOverride) {
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
    const selectedSlos = allChapterSlos.filter((s) => selectedSloIds.includes(s.uniqueId || s.SLO_ID));
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
      addLog('Loading SLOs from curriculum data files...');
      try {
        const sloChapter = await loadSloChapter(classId, subjectId, chapterId);
        if (sloChapter?.slos && sloChapter.slos.length > 0) {
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
      } catch (err) {
        console.warn('[useGeneralGeneration] Error loading SLOs:', err);
      }
      if (slosToGenerate.length === 0) {
        slosToGenerate = [
          {
            SLO_ID: `CH-${chapterId}`,
            SLO_Text: `Learn about ${chapter.name} in ${subject.name}`,
            grade: cls.name,
            Unit_Name: chapter.name,
            Unit_Number: chapterId.replace('ch', ''),
            Section_Name: chapter.name,
            Cognitive_Level_Code: 'U',
            uniqueId: `${classId}_${subjectId}_${chapterId}_all`,
          },
        ];
        addLog('No SLOs found — using generic chapter plan');
      }
    }
    chapterName = chapter.name;
    unitNumber = chapterId.replace('ch', '');
    addLog(`Whole chapter mode: ${slosToGenerate.length} SLO(s) will be generated`);
  } else {
    throw new Error('Invalid generation mode or missing selection.');
  }

  return {
    slosToGenerate,
    chapterName,
    unitNumber,
    clsName: cls.name,
    subjectName: subject.name,
  };
}

export async function loadChapterPdf(
  classId: string,
  subjectId: string,
  chapterId: string,
  addLog: (msg: string) => void
): Promise<Part | null> {
  addLog('Downloading chapter textbook PDF for context...');
  const pdfUrl = (await loadSloChapter(classId, subjectId, chapterId))?.pdf_url || null;
  if (!pdfUrl) {
    addLog('WARN: No PDF URL found for this chapter. AI will use general knowledge instead.');
    return null;
  }
  addLog(`PDF URL: ${pdfUrl}`);
  const chapterPdfPart = await downloadPdfAsPart(pdfUrl);
  if (chapterPdfPart) {
    const sizeKB = (((chapterPdfPart.inlineData?.data?.length || 0) * 0.75) / 1024).toFixed(0);
    addLog(`PDF context loaded (${sizeKB}KB) — will be sent with EACH SLO request below`);
  } else {
    addLog('WARN: Could not download PDF. AI will use general knowledge instead.');
  }
  return chapterPdfPart;
}
