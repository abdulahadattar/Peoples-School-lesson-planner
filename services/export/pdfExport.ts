import { LessonPlan, GeneratedPaper, TeacherInfo } from '../../types';
import { parseTextWithEquations, dataUrlToBase64 } from '../equationRenderer';
import {
  hasOptions,
  layoutOptions,
  optionLetter,
  paperSectionNote,
  questionNumber,
  sectionInstruction,
  shouldStackOptions,
  cleanQuestionText,
  cleanOptionText,
} from '../paperLayout';
import { formatFileName, PDF_A4_WIDTH, PDF_A4_HEIGHT, PDF_PAGE_MARGINS } from './docxHelpers';
import { InlineRichRun, latexToInlineRuns, parseTextToRichParts } from './inlineMathParser';
import { ensurePdfMakeLoaded, registerPdfMakeLayouts } from './externalLibs';

declare const pdfMake: any;

/** Usable content width inside A4 margins in pt (~539.28 pt = 7.49"). */
const PDF_USABLE_WIDTH = PDF_A4_WIDTH - PDF_PAGE_MARGINS[0] - PDF_PAGE_MARGINS[2];

/** Exact option geometry matching DOCX (72 pt = 1 inch). */
export const EXAM_PDF_LAYOUT = {
  /** 0.35" left indent (25.2 pt). */
  LEFT_INDENT_PT: 25.2,
  /** 3.65" right column x-position from printable left margin (262.8 pt). */
  RIGHT_COL_START_PT: 262.8,
  /** Width of col 1 between 0.35" and 3.65" (237.6 pt = 3.30"). */
  COL1_WIDTH_PT: 262.8 - 25.2,
  /** Compact stacked option gap (~56 twips = 2.8 pt). */
  STACKED_AFTER_PT: 2.8,
} as const;

export function inlineRunsToPdfRuns(runs: InlineRichRun[]): any[] {
  return runs.map((r) => {
    if (!r.bold && !r.italic && !r.sup && !r.sub) return r.text;
    const node: Record<string, any> = { text: r.text };
    if (r.bold) node.bold = true;
    if (r.italic) node.italics = true;
    if (r.sup) node.sup = true;
    if (r.sub) node.sub = true;
    return node;
  });
}

export interface PdfRichRenderOptions {
  allowBlockEquations?: boolean;
  imageAlign?: 'left' | 'center';
  imageMargin?: [number, number, number, number];
}

/**
 * Convert CSS pixel equation dimensions to proportional PDF points (72/96 = 0.75)
 * without inflating narrow digits/symbols (previously Math.max(16, ...) stretched
 * single digits like "5" to ~30pt tall). Also caps tall vertical scaling.
 */
export function computePdfEquationWidth(
  naturalWidth: number,
  naturalHeight?: number,
  fontSize: number = 10
): number {
  const safeW = Math.max(4, Number(naturalWidth) || 24);
  let targetW = Math.max(4, Math.min(Math.round(safeW * 0.75), 440));
  const safeH = Number(naturalHeight) || 0;
  if (safeH > 0) {
    const projectedPtHeight = (safeH / safeW) * targetW;
    const maxAllowedHeightPt = Math.max(fontSize * 4.5, 48);
    if (projectedPtHeight > maxAllowedHeightPt) {
      targetW = Math.max(4, Math.round(targetW * (maxAllowedHeightPt / projectedPtHeight)));
    }
  }
  return targetW;
}

export const renderPdfRichText = async (
  text: string,
  style: string = 'body',
  prefix?: string,
  fontSize: number = 10,
  options: PdfRichRenderOptions = {}
): Promise<any[]> => {
  const parts = parseTextToRichParts(text, {
    mode: 'inline-all',
    allowBlockEquations: options.allowBlockEquations ?? true,
  });
  const items: any[] = [];
  let runs: any[] = [];

  if (prefix) runs.push(prefix);

  const flush = () => {
    if (runs.length > 0) {
      items.push({ text: runs, style });
      runs = [];
    }
  };

  for (const part of parts) {
    if (part.kind === 'runs') {
      runs.push(...inlineRunsToPdfRuns(part.runs));
      continue;
    }

    const delimited = part.display ? `$$${part.latex}$$` : `$${part.latex}$`;
    const rendered = await parseTextWithEquations(delimited, fontSize);
    const eqSeg = rendered.find((s) => s.type === 'equation' && s.image);
    if (eqSeg?.image) {
      flush();
      const base64 = dataUrlToBase64(eqSeg.image);
      const targetWidth = computePdfEquationWidth(eqSeg.width || 120, eqSeg.height, fontSize);
      items.push({
        image: `data:image/png;base64,${base64}`,
        width: targetWidth,
        alignment: options.imageAlign ?? ('center' as const),
        margin: options.imageMargin ?? [0, 3, 0, 3],
        style,
      });
    } else {
      runs.push(...inlineRunsToPdfRuns(latexToInlineRuns(part.latex)));
    }
  }
  flush();

  return items.length > 0 ? items : [{ text: prefix ? [prefix, text] : [text], style }];
};

export const createPdfContentForPlan = async (lessonPlan: LessonPlan, teacherInfo?: TeacherInfo): Promise<any[]> => {
  const teacherName = teacherInfo?.name || 'Abdul Ahad';
  const schoolPlaceholder = teacherInfo?.schoolName || 'Peoples Higher Secondary School Jamshoro';
  const dateTimeline = '____________________';
  const period = '1';
  const gradeShort = lessonPlan.gradeLevel.replace('Grade ', '').split(' ')[0];

  const headerTable = {
    layout: 'lessonPlanHeader',
    table: {
      widths: ['auto', '*', 'auto', '*'],
      body: [
        [{ colSpan: 4, text: `${schoolPlaceholder}\nDAILY LESSON PLAN`, style: 'headerTableTitle' }, {}, {}, {}],
        [
          { text: [{ text: 'GRADE: ', bold: true }, gradeShort], style: 'headerTableSub' },
          { text: [{ text: 'SUBJECT: ', bold: true }, { text: lessonPlan.subject, bold: true }], style: 'headerTableSub' },
          { text: [{ text: 'PERIODS: ', bold: true }, { text: period, bold: true }], style: 'headerTableSub' },
          { text: [{ text: 'DATE/TIMELINE: ', bold: true }, dateTimeline], style: 'headerTableSub' },
        ],
        [{ colSpan: 4, text: [{ text: 'LESSON TOPIC: ', bold: true }, lessonPlan.title], style: 'headerTableBody' }, {}, {}, {}],
        [{ colSpan: 4, text: [{ text: 'LEARNING OBJECTIVE: ', bold: true }, lessonPlan.objective], style: 'headerTableBody' }, {}, {}, {}],
        [{ colSpan: 4, text: [{ text: 'TEACHER: ', bold: true }, { text: teacherName, bold: true }], style: 'headerTableBody' }, {}, {}, {}],
      ],
    },
    margin: [0, 0, 0, 10],
  };

  const resourcesSection = [
    { text: 'RESOURCES', style: 'sectionHeader' },
    { ul: lessonPlan.materials.length > 0 ? lessonPlan.materials.map((m) => ({ text: m, style: 'body' })) : [{ text: 'No materials required.', style: 'body' }] },
  ];

  const procedureSection: any[] = [{ text: 'LESSON PROCEDURE & TIMINGS', style: 'sectionHeader' }];
  for (const activity of lessonPlan.activities) {
    procedureSection.push({ text: `${activity.name.toUpperCase()} (${activity.duration} mins)`, bold: true, margin: [0, 8, 0, 4] });
    const descItems = await renderPdfRichText(activity.description, 'body');
    procedureSection.push(...descItems.map((item: any) => ({ ...item, margin: item.margin || [0, 0, 0, 4] })));
  }

  const hwItems = await renderPdfRichText(lessonPlan.homework, 'body');
  return [
    headerTable,
    ...resourcesSection,
    ...procedureSection,
    { text: 'HOMEWORK ASSIGNMENT', style: 'sectionHeader' },
    ...hwItems,
  ];
};

export const exportAsPdf = async (lessonPlan: LessonPlan, sloId?: string, teacherInfo?: TeacherInfo): Promise<void> => {
  await ensurePdfMakeLoaded();
  registerPdfMakeLayouts();
  const fileName = `${formatFileName(lessonPlan.title, sloId)}.pdf`;
  const content = await createPdfContentForPlan(lessonPlan, teacherInfo);
  const docDefinition: any = {
    pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
    pageMargins: PDF_PAGE_MARGINS,
    content,
    styles: {
      headerTableTitle: { fontSize: 12, bold: true, alignment: 'center', margin: [0, 1, 0, 1] },
      headerTableSub: { fontSize: 8, alignment: 'left' },
      headerTableBody: { fontSize: 8, alignment: 'left' },
      sectionHeader: { fontSize: 10, bold: true, color: '#1F4E79', margin: [0, 8, 0, 3], decoration: 'underline', decorationColor: '#1F4E79' },
      body: { fontSize: 9, lineHeight: 1.15, alignment: 'justify' },
    },
    defaultStyle: { font: 'Roboto' },
  };
  if (typeof pdfMake !== 'undefined' && typeof pdfMake.createPdf === 'function') {
    pdfMake.createPdf(docDefinition).download(fileName);
  } else {
    throw new Error('PDF export is unavailable right now. Please try again in a moment.');
  }
};

export const exportMultipleLessonsAsPdf = async (lessonPlans: LessonPlan[], fileName: string, teacherInfo?: TeacherInfo): Promise<void> => {
  await ensurePdfMakeLoaded();
  registerPdfMakeLayouts();
  const allContent: any[] = [];
  for (let index = 0; index < lessonPlans.length; index++) {
    const content = await createPdfContentForPlan(lessonPlans[index], teacherInfo);
    if (index > 0) allContent.push({ text: '', pageBreak: 'before' as const });
    allContent.push(...content);
  }
  const docDefinition: any = {
    pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
    pageMargins: PDF_PAGE_MARGINS,
    content: allContent,
    styles: {
      headerTableTitle: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 2, 0, 2] },
      headerTableSub: { fontSize: 9, alignment: 'left' },
      headerTableBody: { fontSize: 9, alignment: 'left' },
      sectionHeader: { fontSize: 12, bold: true, color: '#1F4E79', margin: [0, 15, 0, 5], decoration: 'underline', decorationColor: '#1F4E79' },
      body: { fontSize: 10, lineHeight: 1.2, alignment: 'justify' },
    },
    defaultStyle: { font: 'Roboto' },
  };
  if (typeof pdfMake !== 'undefined' && typeof pdfMake.createPdf === 'function') {
    pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
  } else {
    throw new Error('PDF export is unavailable right now. Please try again in a moment.');
  }
};

async function buildCompactOptionCell(index: number, rawText: string, pdfMathFontSize: number): Promise<any> {
  const clean = cleanOptionText(rawText);
  const optLines = await renderPdfRichText(clean, 'optionText', undefined, pdfMathFontSize, {
    allowBlockEquations: false,
    imageAlign: 'left',
    imageMargin: [0, 1, 0, 1],
  });
  return {
    columns: [
      { width: 10, canvas: [{ type: 'ellipse', x: 4, y: 5.1, r1: 2.7, r2: 2.7, lineWidth: 0.85, lineColor: '#000000' }] },
      { width: 13, text: `${optionLetter(index)}) `, style: 'optionText' },
      { width: '*', stack: optLines },
    ],
    columnGap: 1,
  };
}

export const createPaperPdfContent = async (
  paper: GeneratedPaper,
  teacherInfo?: TeacherInfo,
  mathScale: number = 85
): Promise<any[]> => {
  const schoolName = teacherInfo?.schoolName || 'Peoples Higher Secondary School Jamshoro';
  const teacherName = teacherInfo?.name || '';

  const headerContent = [
    { text: schoolName, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 13, margin: [0, 0, 0, 1.5] },
    { text: paper.title, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 11, margin: [0, 0, 0, 1.5] },
    {
      text: `Subject: ${paper.subject}    |    Class: ${paper.gradeLevel}    |    Total Marks: ${paper.totalMarks}    |    Duration: ${paper.durationMinutes} minutes`,
      style: 'paperHeader',
      alignment: 'center',
      fontSize: 9,
      margin: [0, 0, 0, 2],
    },
    paper.omrMeta?.enabled
      ? {
          text: `${paper.omrMeta.testNumber}    |    Date: ${paper.omrMeta.testDate}    |    OMR Test Code: ${paper.omrMeta.testCode}`,
          style: 'paperHeader',
          alignment: 'center',
          bold: true,
          color: '#1F4E79',
          fontSize: 8.5,
          margin: [0, 0, 0, 2],
        }
      : null,
    teacherName ? { text: `Teacher: ${teacherName}`, style: 'paperHeader', alignment: 'center', fontSize: 9, margin: [0, 0, 0, 1.5] } : null,
  ].filter(Boolean);

  const pdfMathFontSize = Math.round(12 * (mathScale / 100));
  const sectionsContent: any[] = [];

  for (let sIdx = 0; sIdx < paper.sections.length; sIdx++) {
    const section = paper.sections[sIdx];
    const secHeaderStack: any[] = [{ text: section.title, style: 'sectionTitle', margin: [0, 6, 0, 2] }];

    const genericInstruction = sectionInstruction(section);
    if (genericInstruction) {
      secHeaderStack.push({ text: genericInstruction, style: 'sectionInstruction', margin: [0, 0, 0, 2] });
    }
    const markingNote = paperSectionNote(paper, sIdx, section);
    if (markingNote) {
      secHeaderStack.push({ text: markingNote, style: 'sectionMarkingNote', margin: [0, 0, 0, 4] });
    }
    sectionsContent.push({ stack: secHeaderStack, unbreakable: true });

    for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
      const q = section.questions[qIdx];
      const cleanedQ = cleanQuestionText(q.question);
      const qText = `${questionNumber(qIdx)}. ${cleanedQ}`;
      const qItems = await renderPdfRichText(qText, 'questionText', undefined, pdfMathFontSize);

      if (hasOptions(q)) {
        const rawOpts = q.options || [];
        const stacked = shouldStackOptions(rawOpts);
        const rows = layoutOptions(rawOpts);
        const questionStack: any[] = qItems.map((item: any, idx: number) => ({
          ...item,
          margin: item.margin || [0, idx === 0 ? 1 : 0, 0, idx === qItems.length - 1 ? 2 : 1],
        }));

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const isLastRow = rIdx === rows.length - 1;
          if (!stacked && row.options.length === 2) {
            const leftBlock = await buildCompactOptionCell(row.options[0].index, row.options[0].text, pdfMathFontSize);
            const rightBlock = await buildCompactOptionCell(row.options[1].index, row.options[1].text, pdfMathFontSize);
            questionStack.push({
              columns: [
                { width: EXAM_PDF_LAYOUT.LEFT_INDENT_PT, text: '' },
                { width: EXAM_PDF_LAYOUT.COL1_WIDTH_PT, stack: [leftBlock] },
                { width: '*', stack: [rightBlock] },
              ],
              columnGap: 0,
              margin: [0, 0.5, 0, isLastRow ? 2 : 1.5],
            });
          } else if (!stacked) {
            const leftBlock = await buildCompactOptionCell(row.options[0].index, row.options[0].text, pdfMathFontSize);
            questionStack.push({
              columns: [
                { width: EXAM_PDF_LAYOUT.LEFT_INDENT_PT, text: '' },
                { width: '*', stack: [leftBlock] },
              ],
              columnGap: 0,
              margin: [0, 0.5, 0, 2],
            });
          } else {
            const optBlock = await buildCompactOptionCell(row.options[0].index, row.options[0].text, pdfMathFontSize);
            questionStack.push({
              columns: [
                { width: EXAM_PDF_LAYOUT.LEFT_INDENT_PT, text: '' },
                { width: '*', stack: [optBlock] },
              ],
              columnGap: 0,
              margin: [0, 0.5, 0, isLastRow ? 2.5 : EXAM_PDF_LAYOUT.STACKED_AFTER_PT],
            });
          }
        }

        sectionsContent.push({
          stack: questionStack,
          unbreakable: true,
          margin: [0, 1, 0, 3.5],
        });
      } else {
        sectionsContent.push({
          stack: qItems.map((item: any) => ({ ...item, margin: item.margin || [0, 1, 0, 2] })),
          unbreakable: true,
          margin: [0, 1, 0, 4],
        });
      }
    }
  }

  return [
    ...headerContent,
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PDF_USABLE_WIDTH, y2: 0, lineWidth: 0.8, lineColor: '#000000' }], margin: [0, 1, 0, 4] },
    ...sectionsContent,
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PDF_USABLE_WIDTH, y2: 0, lineWidth: 0.8, lineColor: '#000000' }], margin: [0, 8, 0, 5] },
    { text: '--- End of Paper ---', alignment: 'center', fontSize: 9, margin: [0, 2, 0, 0] },
  ];
};

export const buildExamPaperPdfDefinition = async (
  paper: GeneratedPaper,
  teacherInfo?: TeacherInfo,
  mathScale: number = 85
): Promise<any> => {
  const content = await createPaperPdfContent(paper, teacherInfo, mathScale);
  return {
    pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
    pageMargins: PDF_PAGE_MARGINS,
    content,
    styles: {
      paperHeader: { margin: [0, 0, 0, 2] },
      sectionTitle: { bold: true, fontSize: 10.5, color: '#1F4E79', margin: [0, 6, 0, 2] },
      sectionInstruction: { italics: true, fontSize: 9, margin: [0, 0, 0, 2] },
      sectionMarkingNote: { bold: true, fontSize: 9, margin: [0, 0, 0, 4] },
      questionText: { fontSize: 9.5, lineHeight: 1.18, margin: [0, 0, 0, 1] },
      optionText: { fontSize: 9, lineHeight: 1.15, margin: [0, 0, 0, 0] },
    },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.18 },
  };
};

export const exportPaperAsPdf = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo, mathScale: number = 85): Promise<void> => {
  await ensurePdfMakeLoaded();
  registerPdfMakeLayouts();
  const fileName = `${formatFileName(paper.title)}.pdf`;
  const docDefinition = await buildExamPaperPdfDefinition(paper, teacherInfo, mathScale);
  if (typeof pdfMake !== 'undefined' && typeof pdfMake.createPdf === 'function') {
    pdfMake.createPdf(docDefinition).download(fileName);
  } else {
    throw new Error('PDF export is unavailable right now. Please try again in a moment.');
  }
};
