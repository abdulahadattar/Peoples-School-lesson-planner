import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  ISectionOptions,
  ImageRun,
  HorizontalPositionAlign,
  VerticalAlign as DocxVerticalAlign,
} from 'docx';
import saveAs from 'file-saver';
import { LessonPlan, GeneratedPaper, PaperQuestion, PaperSection, TeacherInfo } from '../types';
import { parseTextWithEquations, dataUrlToBase64 } from './equationRenderer';
import { latexToUnicodeText } from './latexSanitizer';
import {
  hasOptions,
  layoutOptions,
  optionLetter,
  optionLine,
  paperSectionNote,
  questionNumber,
  sectionInstruction,
} from './paperLayout';

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
    paddingLeft: function() { return 5; },
    paddingRight: function() { return 5; },
    paddingTop: function() { return 4; },
    paddingBottom: function() { return 4; }
  };
}

/**
 * Sanitize a title for use as a file name.
 */
export const formatFileName = (title: string, sloId?: string): string => {
  const baseName = sloId ? `${sloId}_${title}` : title;
  return baseName.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 100);
};

/**
 * Parse text with LaTeX equations and bold/italic markdown.
 * Equations are rendered to images via KaTeX and embedded as ImageRun.
 * Bold/italic text is rendered as formatted TextRun.
 */
const parseTextForDocx = async (text: string): Promise<(TextRun | any)[]> => {
  const runs: (TextRun | any)[] = [];

  // Parse equations through the browser-safe MathJax pipeline (falls back to
  // plain text automatically when no renderer is available).
  const segments = await parseTextWithEquations(text, 14);
  for (const seg of segments) {
    if (seg.type === 'equation' && seg.image) {
      // Convert data URL to base64 and create an ImageRun at its natural size
      // (measured in CSS px before the 2x rasterization).
      const base64 = dataUrlToBase64(seg.image);
      runs.push(new ImageRun({
        data: base64,
        transformation: {
          width: Math.min(seg.width || 120, 400),
          height: Math.min(seg.height || 24, 60),
        },
      }));
    } else {
      // Plain text — check for bold/italic markdown
      runs.push(...parseMarkdownRuns(seg.value));
    }
  }
  return runs;
};

/**
 * Parse bold/italic markdown into TextRun[]
 */
const parseMarkdownRuns = (text: string): TextRun[] => {
  const runs: TextRun[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.substring(lastIndex, match.index), font: 'Calibri', size: 22 }));
    }
    const matchedText = match[0];
    if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
      runs.push(new TextRun({ text: matchedText.slice(2, -2), bold: true, font: 'Calibri', size: 22 }));
    } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
      runs.push(new TextRun({ text: matchedText.slice(1, -1), italics: true, font: 'Calibri', size: 22 }));
    }
    lastIndex = match.index + matchedText.length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.substring(lastIndex), font: 'Calibri', size: 22 }));
  }
  return runs;
};

const createRichParagraph = async (text: string): Promise<Paragraph> => new Paragraph({
  children: await parseTextForDocx(text),
  spacing: { after: 60 },
  alignment: AlignmentType.JUSTIFIED,
});

const createBulletList = async (items: string[]): Promise<Paragraph[]> => {
  const paragraphs: Paragraph[] = [];
  for (const item of items) {
    paragraphs.push(new Paragraph({
      children: await parseTextForDocx(item),
      bullet: { level: 0 },
      spacing: { after: 30 },
    }));
  }
  return paragraphs;
};

const createSectionHeading = (title: string): Paragraph => new Paragraph({
  children: [new TextRun({ text: title, bold: true, size: 24, color: "1F4E79" })],
  spacing: { before: 150, after: 60 },
  alignment: AlignmentType.LEFT,
  border: { bottom: { color: "1F4E79", space: 4, style: "single", size: 4 } }
});

const createHeaderRun = (text: string, bold: boolean = false, size: number = 18): TextRun => new TextRun({
  text, bold, size, font: "Calibri",
});

const A4_PAGE_WIDTH = 11906;
const A4_PAGE_HEIGHT = 16838;
// Word Page Setup (from the school template): top 0.3", bottom 0.5",
// left/right 0.75", portrait. 1 inch = 1440 twips.
const DOCX_PAGE_MARGINS = { top: 432, right: 1080, bottom: 720, left: 1080 };

/**
 * Build the DOCX body content for a single lesson plan.
 */
export const createDocxContentForPlan = async (lessonPlan: LessonPlan, teacherInfo?: TeacherInfo): Promise<(Paragraph | Table)[]> => {
  const teacherName = teacherInfo?.name || "Abdul Ahad";
  const schoolPlaceholder = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";
  const dateTimeline = '____________________';
  const period = '1';
  const gradeShort = lessonPlan.gradeLevel.replace('Grade ', '').split(' ')[0];

  const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
          new TableRow({
              children: [
                  new TableCell({
                      children: [
                          new Paragraph({ children: [createHeaderRun(schoolPlaceholder, true, 24)], alignment: AlignmentType.CENTER }),
                          new Paragraph({ children: [createHeaderRun('DAILY LESSON PLAN', true, 36)], alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
                      ],
                      columnSpan: 4,
                      borders: { top: { style: 'single', size: 12 }, bottom: { style: 'single', size: 12 }, left: { style: 'none'}, right: { style: 'none'} }
                  }),
              ],
          }),
          new TableRow({
              children: [
                  new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`GRADE: ${gradeShort}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: {top: {style: 'none'}, bottom: {style: 'none'}, left: {style: 'none'}, right: {style: 'none'}} }),
                  new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`SUBJECT: ${lessonPlan.subject}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: {top: {style: 'none'}, bottom: {style: 'none'}, left: {style: 'none'}, right: {style: 'none'}} }),
                  new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`PERIODS: ${period}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: {top: {style: 'none'}, bottom: {style: 'none'}, left: {style: 'none'}, right: {style: 'none'}} }),
                  new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`DATE/TIMELINE: ${dateTimeline}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: {top: {style: 'none'}, bottom: {style: 'none'}, left: {style: 'none'}, right: {style: 'none'}} }),
              ],
          }),
          new TableRow({
              children: [ new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`LESSON TOPIC: ${lessonPlan.title}`, false, 24)] })], columnSpan: 4, verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'single', size: 6 }, bottom: {style: 'none'}, left: {style: 'none'}, right: {style: 'none'} } })],
          }),
          new TableRow({
              children: [ new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`LEARNING OBJECTIVE: ${lessonPlan.objective}`, false, 24)] })], columnSpan: 4, verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'single', size: 2 }, bottom: {style: 'none'}, left: {style: 'none'}, right: {style: 'none'} } })],
          }),
          new TableRow({
              children: [
                  new TableCell({
                      children: [ new Paragraph({ children: [createHeaderRun(`TEACHER: `, false, 24), createHeaderRun(teacherName, true, 24)] })],
                      columnSpan: 4, verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'single', size: 2 }, bottom: { style: 'single', size: 12 }, left: {style: 'none'}, right: {style: 'none'} }
                  }),
              ],
          }),
      ],
  });

  const children: (Paragraph | Table)[] = [headerTable];
  children.push(createSectionHeading('RESOURCES'));
  const materials = lessonPlan.materials.length > 0 ? await createBulletList(lessonPlan.materials) : [await createRichParagraph('No materials required.')];
  children.push(...materials);
  children.push(createSectionHeading('LESSON PROCEDURE & TIMINGS'));
  for (const activity of lessonPlan.activities) {
      children.push(new Paragraph({
          children: [ new TextRun({ text: `${activity.name.toUpperCase()} (${activity.duration} mins)`, bold: true, size: 22 })],
          spacing: { before: 120, after: 60 }
      }));
      children.push(await createRichParagraph(activity.description));
  }
  children.push(createSectionHeading('HOMEWORK ASSIGNMENT'));
  children.push(await createRichParagraph(lessonPlan.homework));

  return children;
};

const PDF_A4_WIDTH = 595.28;
const PDF_A4_HEIGHT = 841.89;
// pdfMake margin order is [left, top, right, bottom] — 0.75 / 0.3 / 0.75 / 0.5 in
const PDF_PAGE_MARGINS: [number, number, number, number] = [54, 21.6, 54, 36];

/**
 * Export a single lesson plan as a DOCX file and trigger a browser download.
 */
export const exportAsDocx = async (lessonPlan: LessonPlan, sloId?: string, teacherInfo?: TeacherInfo): Promise<void> => {
  const fileName = `${formatFileName(lessonPlan.title, sloId)}.docx`;
  const children = await createDocxContentForPlan(lessonPlan, teacherInfo);
  const doc = new Document({
      sections: [{
          properties: {
              page: {
                  size: { width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT },
                  margin: DOCX_PAGE_MARGINS
              }
          },
          children: children,
      }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
};

/**
 * Export a single lesson plan as a PDF file and trigger a browser download.
 */
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

const createPdfContentForPlan = async (lessonPlan: LessonPlan, teacherInfo?: TeacherInfo): Promise<any[]> => {
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

/**
 * Export multiple lesson plans as a single DOCX file with page breaks.
 */
export const exportMultipleLessonsAsDocx = async (lessonPlans: LessonPlan[], fileName: string, teacherInfo?: TeacherInfo): Promise<void> => {
    const sections: any[] = [];
    for (let index = 0; index < lessonPlans.length; index++) {
        sections.push({
            properties: {
                page: {
                    size: { width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT },
                    margin: DOCX_PAGE_MARGINS
                },
            },
            pageBreakBefore: index > 0,
            children: await createDocxContentForPlan(lessonPlans[index], teacherInfo),
        });
    }

    const doc = new Document({ sections });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${fileName}.docx`);
};

/**
 * Export multiple lesson plans as a single PDF file with page breaks.
 */
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

/**
 * Render text with equations for pdfMake.
 * Returns an array of pdfMake content items.
 *
 * pdfMake cannot place images inline inside a sentence (they always jump to a
 * new line and look oversized), so INLINE equations are converted to readable
 * unicode text (g/cm³, 10²³, ρ, √x) that flows at text size. Only standalone
 * display ($$...$$) equations are embedded as raster images.
 */
const renderPdfRichText = async (
  text: string,
  style: string = 'body',
  prefix?: string,
  fontSize: number = 12
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
    if (seg.type === 'equation' && seg.image && seg.display) {
      // Standalone display equation: raster image on its own centered block
      flush();
      const base64 = dataUrlToBase64(seg.image);
      const natural = (seg.width || 200) * 0.75;
      items.push({
        image: `data:image/png;base64,${base64}`,
        width: Math.max(8, Math.min(Math.round(natural), 380)),
        alignment: 'center' as const,
        margin: [0, 2, 0, 2],
        style,
      });
      continue;
    }
    if (seg.type === 'equation') {
      // Inline math -> unicode text at the exact size of surrounding text
      runs.push(latexToUnicodeText(seg.value || ''));
      continue;
    }
    runs.push(seg.value);
  }
  flush();

  return items.length > 0 ? items : [{ text: runs.length > 0 ? runs : [text], style }];
};

const createPaperPdfContent = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo): Promise<any[]> => {
    const schoolName = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";
    const teacherName = teacherInfo?.name || "";

    const headerContent = [
        { text: schoolName, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 14, margin: [0, 0, 0, 2] },
        { text: paper.title, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 12, margin: [0, 0, 0, 2] },
        { text: `Subject: ${paper.subject}    |    Class: ${paper.gradeLevel}    |    Total Marks: ${paper.totalMarks}    |    Duration: ${paper.durationMinutes} minutes`, style: 'paperHeader', alignment: 'center', fontSize: 10, margin: [0, 0, 0, 3] },
        teacherName ? { text: `Teacher: ${teacherName}`, style: 'paperHeader', alignment: 'center', fontSize: 10, margin: [0, 0, 0, 2] } : {},
    ].filter(Boolean);

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
            // Marks are NOT repeated per question — only the section note above says them
            const qText = `${questionNumber(qIdx)}. ${q.question}`;
            if (hasOptions(q)) {
                const qItems = await renderPdfRichText(qText, 'questionText');
                sectionsContent.push(...qItems.map((item: any) => ({ ...item, margin: item.margin || [0, 4, 0, 2] })));
                const rows = layoutOptions(q.options || []);
                for (const row of rows) {
                    const columns: any[] = [];
                    for (const o of row.options) {
                        // The hollow circle is drawn as a vector canvas because
                        // the bundled Roboto font has no ○ (U+25CB) glyph. Inline
                        // math in the option is unicode text, so each option is a
                        // single text line next to its circle.
                        const optLines = await renderPdfRichText(
                            o.text || '',
                            'optionText',
                            `${optionLetter(o.index)}) `
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
                const qItems = await renderPdfRichText(qText, 'questionText');
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

/**
 * Export an exam paper as a DOCX file and trigger a browser download.
 */
export const exportPaperAsDocx = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo): Promise<void> => {
    const fileName = `${formatFileName(paper.title)}.docx`;
    const schoolName = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";

    const children: (Paragraph | Table)[] = [];

    const headerParagraph = new Paragraph({
        children: [
            new TextRun({ text: schoolName, bold: true, size: 28, font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
    });
    children.push(headerParagraph);

    const titleParagraph = new Paragraph({
        children: [
            new TextRun({ text: paper.title, bold: true, size: 24, font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
    });
    children.push(titleParagraph);

    const infoParagraph = new Paragraph({
        children: [
            new TextRun({ text: `Subject: ${paper.subject}    Class: ${paper.gradeLevel}    Total Marks: ${paper.totalMarks}    Duration: ${paper.durationMinutes} minutes`, size: 20, font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
    });
    children.push(infoParagraph);

    if (teacherInfo?.name) {
        const teacherParagraph = new Paragraph({
            children: [
                new TextRun({ text: `Teacher: ${teacherInfo.name}`, size: 20, font: "Calibri" }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
        });
        children.push(teacherParagraph);
    }

    const divider = new Paragraph({
        children: [],
        border: { bottom: { style: 'single', size: 6, color: '000000' } },
        spacing: { after: 120 },
    });
    children.push(divider);

    const noBorders = {
        top: { style: 'none' as const }, bottom: { style: 'none' as const },
        left: { style: 'none' as const }, right: { style: 'none' as const },
    };

    /** One option paragraph inside a borderless cell (keeps columns aligned). */
    const optionCell = async (o: { index: number; text: string }): Promise<TableCell> => new TableCell({
        children: [
            new Paragraph({
                children: await parseTextForDocx(optionLine(o.index, o.text)),
                spacing: { after: 30 },
                indent: { left: 80 },
            }),
        ],
        borders: noBorders,
        width: { size: 50, type: WidthType.PERCENTAGE },
        verticalAlign: DocxVerticalAlign.CENTER,
    });

    for (let sIdx = 0; sIdx < paper.sections.length; sIdx++) {
        const section = paper.sections[sIdx];

        children.push(new Paragraph({
            children: [new TextRun({ text: section.title, bold: true, size: 24, font: "Calibri", color: "1F4E79" })],
            spacing: { before: 300, after: 100 },
        }));

        // Generic AI instruction (suppressed when it would repeat the marking note)
        const genericInstruction = sectionInstruction(section);
        if (genericInstruction) {
            children.push(new Paragraph({
                children: [new TextRun({ text: genericInstruction, italics: true, size: 20, font: "Calibri" })],
                spacing: { after: 80 },
            }));
        }

        // Section-level marking line printed ONCE per section (never per question)
        const markingNote = paperSectionNote(paper, sIdx, section);
        if (markingNote) {
            children.push(new Paragraph({
                children: [new TextRun({ text: markingNote, bold: true, size: 20, font: "Calibri" })],
                spacing: { after: 150 },
            }));
        }

        for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
            const q = section.questions[qIdx];
            // Deterministic Q1/Q2 numbering (per section) — never the AI's id or marks
            const qRuns = await parseTextForDocx(`${questionNumber(qIdx)}. ${q.question}`);
            children.push(new Paragraph({
                children: qRuns,
                spacing: { after: hasOptions(q) ? 60 : 120 },
            }));

            if (hasOptions(q)) {
                // Two short options share one fixed-width line; longer options wrap alone
                const rows = layoutOptions(q.options || []);
                for (const row of rows) {
                    if (row.options.length === 2) {
                        const table = new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: TableBorders.NONE,
                            rows: [new TableRow({ children: [await optionCell(row.options[0]), await optionCell(row.options[1])] })],
                        });
                        children.push(table);
                    } else {
                        const table = new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: TableBorders.NONE,
                            rows: [new TableRow({
                                children: [await new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: await parseTextForDocx(optionLine(row.options[0].index, row.options[0].text)),
                                            spacing: { after: 30 },
                                            indent: { left: 80 },
                                        }),
                                    ],
                                    borders: noBorders,
                                    width: { size: 100, type: WidthType.PERCENTAGE },
                                })],
                            })],
                        });
                        children.push(table);
                    }
                }
            }
        }
    }

    const endDivider = new Paragraph({
        children: [],
        border: { bottom: { style: 'single', size: 6, color: '000000' } },
        spacing: { before: 400, after: 200 },
    });
    children.push(endDivider);

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    size: { width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT },
                    margin: DOCX_PAGE_MARGINS
                }
            },
            children: children,
        }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, fileName);
};

/**
 * Export an exam paper as a PDF file and trigger a browser download.
 */
export const exportPaperAsPdf = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo): Promise<void> => {
    const fileName = `${formatFileName(paper.title)}.pdf`;
    const content = await createPaperPdfContent(paper, teacherInfo);
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
