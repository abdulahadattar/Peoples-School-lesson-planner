import { LessonPlan, GeneratedPaper, TeacherInfo } from '../../types';
import { parseTextWithEquations, dataUrlToBase64 } from '../equationRenderer';
import { latexToUnicodeText } from '../latexSanitizer';
import {
  hasOptions,
  layoutOptions,
  optionLetter,
  paperSectionNote,
  questionNumber,
  sectionInstruction,
  cleanQuestionText,
} from '../paperLayout';
import { formatFileName, PDF_A4_WIDTH, PDF_A4_HEIGHT, PDF_PAGE_MARGINS } from './docxHelpers';

declare const pdfMake: any;

if (typeof pdfMake !== 'undefined' && pdfMake.tableLayouts) {
  pdfMake.tableLayouts.lessonPlanHeader = {
    hLineWidth: function (i: number, node: any) {
      if (i === 0 || i === node.table.body.length) return 1.5;
      if (i === 1) return 1.5;
      return 1;
    },
    vLineWidth: function (i: number, node: any) {
      if (i === 0 || i === node.table.widths.length) return 1.5;
      return 1;
    },
    hLineColor: function () { return '#000000'; },
    vLineColor: function () { return '#000000'; },
    paddingLeft: function () { return 5; },
    paddingRight: function () { return 5; },
    paddingTop: function () { return 4; },
    paddingBottom: function () { return 4; }
  };
}

export const renderPdfRichText = async (
  text: string,
  style: string = 'body',
  prefix?: string,
  fontSize: number = 11
): Promise<any[]> => {
  const segments = await parseTextWithEquations(text, fontSize);
  const items: any[] = [];
  let runs: any[] = [];

  if (prefix) runs.push(prefix);
  const flush = () => {
    if (runs.length > 0) {
      items.push({ text: runs, style });
      runs = [];
    }
  };

  for (const seg of segments) {
    if (seg.type === 'equation' && seg.image) {
      const val = seg.value || '';
      const isSimpleInline = !seg.display &&
        !/\\begin|matrix|pmatrix|bmatrix|vmatrix|frac|sqrt|sum|int|prod|array|aligned/i.test(val) &&
        !val.includes('\\\\') &&
        val.length <= 4 &&
        !val.includes('=');

      if (isSimpleInline) {
        runs.push(latexToUnicodeText(val));
        continue;
      }

      flush();
      const base64 = dataUrlToBase64(seg.image);
      const isBlock = seg.display || /\\begin|matrix|pmatrix|bmatrix|vmatrix|array|aligned/i.test(val) || (seg.height && seg.height > 22);
      const naturalWidth = seg.width || 120;
      const targetWidth = Math.max(16, Math.min(Math.round(naturalWidth * 0.9), 450));

      items.push({
        image: `data:image/png;base64,${base64}`,
        width: targetWidth,
        alignment: isBlock ? ('center' as const) : ('left' as const),
        margin: isBlock ? [0, 4, 0, 4] : [0, 2, 0, 2],
        style,
      });
      continue;
    }
    if (seg.type === 'equation') {
      runs.push(latexToUnicodeText(seg.value || ''));
      continue;
    }
    runs.push(seg.value);
  }
  flush();

  return items.length > 0 ? items : [{ text: runs.length > 0 ? runs : [text], style }];
};

export const createPdfContentForPlan = async (lessonPlan: LessonPlan, teacherInfo?: TeacherInfo): Promise<any[]> => {
  const teacherName = teacherInfo?.name || "Abdul Ahad";
  const schoolPlaceholder = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";
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
          { text: [{ text: 'DATE/TIMELINE: ', bold: true }, dateTimeline], style: 'headerTableSub' }
        ],
        [{ colSpan: 4, text: [{ text: 'LESSON TOPIC: ', bold: true }, lessonPlan.title], style: 'headerTableBody' }, {}, {}, {}],
        [{ colSpan: 4, text: [{ text: 'LEARNING OBJECTIVE: ', bold: true }, lessonPlan.objective], style: 'headerTableBody' }, {}, {}, {}],
        [{ colSpan: 4, text: [{ text: 'TEACHER: ', bold: true }, { text: teacherName, bold: true }], style: 'headerTableBody' }, {}, {}, {}],
      ]
    },
    margin: [0, 0, 0, 10]
  };

  const resourcesSection = [
    { text: 'RESOURCES', style: 'sectionHeader' },
    { ul: lessonPlan.materials.length > 0 ? lessonPlan.materials.map(m => ({ text: m, style: 'body' })) : [{ text: 'No materials required.', style: 'body' }] },
  ];

  const procedureSection: any[] = [
    { text: 'LESSON PROCEDURE & TIMINGS', style: 'sectionHeader' },
  ];
  for (const activity of lessonPlan.activities) {
    procedureSection.push(
      { text: `${activity.name.toUpperCase()} (${activity.duration} mins)`, bold: true, margin: [0, 8, 0, 4] },
    );
    const descItems = await renderPdfRichText(activity.description, 'body');
    procedureSection.push(...descItems.map((item: any) => ({ ...item, margin: item.margin || [0, 0, 0, 4] })));
  }

  const hwItems = await renderPdfRichText(lessonPlan.homework, 'body');
  const homeworkSection: any[] = [
    { text: 'HOMEWORK ASSIGNMENT', style: 'sectionHeader' },
    ...hwItems,
  ];

  return [headerTable, ...resourcesSection, ...procedureSection, ...homeworkSection];
};

export const exportAsPdf = async (lessonPlan: LessonPlan, sloId?: string, teacherInfo?: TeacherInfo): Promise<void> => {
  const fileName = `${formatFileName(lessonPlan.title, sloId)}.pdf`;
  const content = await createPdfContentForPlan(lessonPlan, teacherInfo);
  const docDefinition: any = {
    pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
    pageMargins: PDF_PAGE_MARGINS,
    content: content,
    styles: {
      headerTableTitle: { fontSize: 12, bold: true, alignment: 'center', margin: [0, 1, 0, 1] },
      headerTableSub: { fontSize: 8, alignment: 'left' },
      headerTableBody: { fontSize: 8, alignment: 'left' },
      sectionHeader: { fontSize: 10, bold: true, color: '#1F4E79', margin: [0, 8, 0, 3], decoration: 'underline', decorationColor: '#1F4E79' },
      body: { fontSize: 9, lineHeight: 1.15, alignment: 'justify' },
    },
    defaultStyle: { font: 'Roboto' }
  };
  if (typeof pdfMake !== 'undefined' && typeof pdfMake.createPdf === 'function') {
    pdfMake.createPdf(docDefinition).download(fileName);
  } else {
    throw new Error('PDF export is unavailable: pdfMake library has not loaded yet. Please try again in a moment.');
  }
};

export const exportMultipleLessonsAsPdf = async (lessonPlans: LessonPlan[], fileName: string, teacherInfo?: TeacherInfo): Promise<void> => {
  const allContent: any[] = [];
  for (let index = 0; index < lessonPlans.length; index++) {
    const content = await createPdfContentForPlan(lessonPlans[index], teacherInfo);
    if (index > 0) {
      allContent.push({ text: '', pageBreak: 'before' as const });
    }
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
    defaultStyle: { font: 'Roboto' }
  };

  if (typeof pdfMake !== 'undefined' && typeof pdfMake.createPdf === 'function') {
    pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
  } else {
    throw new Error('PDF export is unavailable: pdfMake library has not loaded yet. Please try again in a moment.');
  }
};

export const createPaperPdfContent = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo, mathScale: number = 85): Promise<any[]> => {
  const schoolName = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";
  const teacherName = teacherInfo?.name || "";

  const headerContent = [
    { text: schoolName, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 14, margin: [0, 0, 0, 2] },
    { text: paper.title, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 12, margin: [0, 0, 0, 2] },
    { text: `Subject: ${paper.subject}    |    Class: ${paper.gradeLevel}    |    Total Marks: ${paper.totalMarks}    |    Duration: ${paper.durationMinutes} minutes`, style: 'paperHeader', alignment: 'center', fontSize: 10, margin: [0, 0, 0, 3] },
    teacherName ? { text: `Teacher: ${teacherName}`, style: 'paperHeader', alignment: 'center', fontSize: 10, margin: [0, 0, 0, 2] } : null,
  ].filter(Boolean);

  const pdfMathFontSize = Math.round(13 * (mathScale / 100));

  const sectionsContent: any[] = [];
  for (let sIdx = 0; sIdx < paper.sections.length; sIdx++) {
    const section = paper.sections[sIdx];
    sectionsContent.push({ text: section.title, style: 'sectionTitle', margin: [0, 10, 0, 4] });
    const genericInstruction = sectionInstruction(section);
    if (genericInstruction) {
      sectionsContent.push({ text: genericInstruction, style: 'sectionInstruction', margin: [0, 0, 0, 4] });
    }
    const markingNote = paperSectionNote(paper, sIdx, section);
    if (markingNote) {
      sectionsContent.push({ text: markingNote, style: 'sectionMarkingNote', margin: [0, 0, 0, 6] });
    }

    for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
      const q = section.questions[qIdx];
      const cleanedQ = cleanQuestionText(q.question);
      const qText = `${questionNumber(qIdx)}. ${cleanedQ}`;
      if (hasOptions(q)) {
        const qItems = await renderPdfRichText(qText, 'questionText', undefined, pdfMathFontSize);
        sectionsContent.push(...qItems.map((item: any) => ({ ...item, margin: item.margin || [0, 4, 0, 2] })));
        const rows = layoutOptions(q.options || []);
        for (const row of rows) {
          const columns: any[] = [];
          for (const o of row.options) {
            const optLines = await renderPdfRichText(
              o.text || '',
              'optionText',
              `${optionLetter(o.index)}) `,
              pdfMathFontSize
            );
            const optionBlock: any = {
              columns: [
                { width: 12, canvas: [{ type: 'circle', x: 6, y: 5, r: 3.1, lineWidth: 1, lineColor: '#000000' }] },
                { width: '*', stack: optLines },
              ],
              columnGap: 3,
            };
            columns.push({ width: row.options.length === 2 ? 235 : '*', stack: [optionBlock] });
          }
          sectionsContent.push({
            columns,
            columnGap: row.options.length === 2 ? 10 : 0,
            margin: [0, 1, 0, 4],
          });
        }
      } else {
        const qItems = await renderPdfRichText(qText, 'questionText', undefined, pdfMathFontSize);
        sectionsContent.push(...qItems.map((item: any) => ({ ...item, margin: item.margin || [0, 4, 0, 6] })));
      }
    }
  }

  return [
    ...headerContent,
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595.28, y2: 0, lineWidth: 1, lineColor: '#000000' }], margin: [0, 0, 0, 6] },
    ...sectionsContent,
    { text: '\n\n', margin: [0, 20, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595.28, y2: 0, lineWidth: 1, lineColor: '#000000' }], margin: [0, 0, 0, 10] },
    { text: '--- End of Paper ---', alignment: 'center', fontSize: 10, margin: [0, 10, 0, 0] },
  ];
};

export const exportPaperAsPdf = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo, mathScale: number = 85): Promise<void> => {
  const fileName = `${formatFileName(paper.title)}.pdf`;
  const content = await createPaperPdfContent(paper, teacherInfo, mathScale);
  const docDefinition: any = {
    pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
    pageMargins: PDF_PAGE_MARGINS,
    content: content,
    styles: {
      paperHeader: { margin: [0, 0, 0, 4] },
      sectionTitle: { bold: true, fontSize: 12, color: '#1F4E79', margin: [0, 10, 0, 4] },
      sectionInstruction: { italics: true, fontSize: 10, margin: [0, 0, 0, 6] },
      sectionMarkingNote: { bold: true, fontSize: 10, margin: [0, 0, 0, 6] },
      questionText: { fontSize: 10, margin: [0, 4, 0, 6] },
      optionText: { fontSize: 9, margin: [0, 0, 0, 2] },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3 }
  };
  if (typeof pdfMake !== 'undefined' && typeof pdfMake.createPdf === 'function') {
    pdfMake.createPdf(docDefinition).download(fileName);
  } else {
    throw new Error('PDF export is unavailable: pdfMake library has not loaded yet. Please try again in a moment.');
  }
};
