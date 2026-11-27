import { PDFDocument, StandardFonts } from 'pdf-lib';
import { GeneratedPaper } from '../../types';
import { MarksheetExamType } from '../marksheet/types';
import { triggerPdfDownload } from '../marksheet/pdfGenerator';
import { A4_HEIGHT_MM, A4_WIDTH_MM, computeOmrGeometry, mmToPt } from './layoutGeometry';
import {
  ClassroomTestFrequency,
  OmrStudentPrintTarget,
  normalizeAnswerKeyString,
} from './types';
import { drawOmrPage } from './pdfPageRenderer';

export interface PaperOmrExtraction {
  paperId: string;
  title: string;
  subject: string;
  classLevel: string;
  questionCount: number;
  answerKey: string;
  testFrequency: ClassroomTestFrequency;
  testNumber: string;
  testDate: string;
  examType?: MarksheetExamType;
  isMcqOnly: boolean;
}

export function extractPaperOmrData(paper: GeneratedPaper): PaperOmrExtraction {
  const allQuestions = paper.sections.flatMap((sec) => sec.questions || []);
  const mcqQuestions = allQuestions.filter(
    (q) => q.type === 'mcq' || (Array.isArray(q.options) && q.options.length > 0)
  );
  const count = Math.max(1, mcqQuestions.length);
  const rawLetters = mcqQuestions
    .map((q) => {
      const letter = String(q.correctAnswer || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-D]/g, '')
        .slice(0, 1);
      return letter || 'A';
    })
    .join('');

  const today = new Date().toISOString().slice(0, 10);

  return {
    paperId:
      paper.omrMeta?.testCode?.trim() ||
      paper.savedPaperId ||
      `paper_${Date.now().toString(36)}`,
    title: paper.title || `${paper.subject} Classroom Test`,
    subject: paper.subject || 'General',
    classLevel: paper.gradeLevel || 'IX',
    questionCount: count,
    answerKey: normalizeAnswerKeyString(rawLetters, count),
    testFrequency: paper.omrMeta?.testFrequency === 'monthly' ? 'monthly' : 'weekly',
    testNumber: paper.omrMeta?.testNumber?.trim() || 'Test #01',
    testDate: paper.omrMeta?.testDate?.trim() || today,
    examType: paper.omrMeta?.examType,
    isMcqOnly:
      allQuestions.length > 0 && mcqQuestions.length === allQuestions.length,
  };
}

export interface OmrPdfGenerateOptions {
  paperId: string;
  title: string;
  subject: string;
  classLevel: string;
  questionCount: number;
  answerKey: string;
  testFrequency?: ClassroomTestFrequency;
  examType?: MarksheetExamType;
  testNumber?: string;
  testDate?: string;
  schoolName?: string;
  mode: 'batch' | 'blank';
  students?: OmrStudentPrintTarget[];
}

export async function generateOmrPdf(options: OmrPdfGenerateOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    sansRegular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    monoBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
  };

  const isBlank = options.mode === 'blank' || !options.students || options.students.length === 0;
  const geo = computeOmrGeometry(options.questionCount, isBlank);
  const pageWidthPt = mmToPt(A4_WIDTH_MM);
  const pageHeightPt = mmToPt(A4_HEIGHT_MM);

  if (isBlank) {
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    drawOmrPage(page, geo, options, null, fonts);
  } else {
    const targets = options.students!;
    for (let i = 0; i < targets.length; i++) {
      const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
      drawOmrPage(page, geo, options, targets[i], fonts);
      if (i > 0 && i % 20 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  return pdfDoc.save();
}

export function triggerOmrPdfDownload(bytes: Uint8Array, filename: string): void {
  triggerPdfDownload(bytes, filename);
}
