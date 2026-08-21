import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  ISectionOptions,
} from 'docx';
import saveAs from 'file-saver';
import { LessonPlan, GeneratedPaper, PaperQuestion, PaperSection, TeacherInfo } from '../types';

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

export const formatFileName = (title: string, sloId?: string): string => {
  const baseName = sloId ? `${sloId}_${title}` : title;
  return baseName.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 100);
};

const parseTextForDocx = (text: string): TextRun[] => {
  const runs: TextRun[] = [];
  const regex = /(\$\$[\s\S]*?\$\$|\$[^\s](?:[^\$]*[^\s])?\$|\*\*.*?\*\*|\*.*?\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.substring(lastIndex, match.index), font: "Calibri", size: 22 }));
    }
    const matchedText = match[0];
    if (matchedText.startsWith('$$') && matchedText.endsWith('$$')) {
      runs.push(new TextRun({ text: matchedText.slice(2, -2).trim(), bold: true, font: "Cambria Math", size: 24 }));
    } else if (matchedText.startsWith('$') && matchedText.endsWith('$')) {
      runs.push(new TextRun({ text: matchedText.slice(1, -1), bold: true, font: "Cambria Math", size: 22 }));
    } else if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
      runs.push(new TextRun({ text: matchedText.slice(2, -2), bold: true, font: "Calibri", size: 22 }));
    } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
      runs.push(new TextRun({ text: matchedText.slice(1, -1), italics: true, font: "Calibri", size: 22 }));
    }
    lastIndex = match.index + matchedText.length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.substring(lastIndex), font: "Calibri", size: 22 }));
  }
  return runs;
};

const createRichParagraph = (text: string): Paragraph => new Paragraph({
  children: parseTextForDocx(text),
  spacing: { after: 100 },
  alignment: AlignmentType.JUSTIFIED,
});

const createBulletList = (items: string[]): Paragraph[] => items.map(item => new Paragraph({
  children: parseTextForDocx(item),
  bullet: { level: 0 },
  spacing: { after: 50 },
}));

const createSectionHeading = (title: string): Paragraph => new Paragraph({
  children: [new TextRun({ text: title, bold: true, size: 28, color: "1F4E79" })],
  spacing: { before: 300, after: 100 },
  alignment: AlignmentType.LEFT,
  border: { bottom: { color: "1F4E79", space: 4, style: "single", size: 6 } }
});

const createHeaderRun = (text: string, bold: boolean = false, size: number = 20): TextRun => new TextRun({
  text, bold, size, font: "Calibri",
});

const A4_PAGE_WIDTH = 11906;
const A4_PAGE_HEIGHT = 16838;
const A4_MARGIN = 1134;

export const createDocxContentForPlan = (lessonPlan: LessonPlan, teacherInfo?: TeacherInfo): (Paragraph | Table)[] => {
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
  children.push(...(lessonPlan.materials.length > 0 ? createBulletList(lessonPlan.materials) : [createRichParagraph('No materials required.')]));
  children.push(createSectionHeading('LESSON PROCEDURE & TIMINGS'));
  lessonPlan.activities.forEach(activity => {
      children.push(new Paragraph({
          children: [ new TextRun({ text: `${activity.name.toUpperCase()} (${activity.duration} mins)`, bold: true, size: 24 })],
          spacing: { before: 200, after: 100 }
      }));
      children.push(createRichParagraph(activity.description));
      if (activity.teacherActions) {
          children.push(new Paragraph({
              children: [ new TextRun({ text: 'Teacher Actions: ', bold: true, size: 22 }), new TextRun({ text: activity.teacherActions, size: 22 })],
              spacing: { after: 50 },
              indent: { left: 200 }
          }));
      }
      if (activity.studentResponses) {
          children.push(new Paragraph({
              children: [ new TextRun({ text: 'Student Responses: ', bold: true, size: 22 }), new TextRun({ text: activity.studentResponses, size: 22 })],
              spacing: { after: 100 },
              indent: { left: 200 }
          }));
      }
  });
  children.push(createSectionHeading('HOMEWORK ASSIGNMENT'));
  children.push(createRichParagraph(lessonPlan.homework));

  return children;
};

const PDF_A4_WIDTH = 595.28;
const PDF_A4_HEIGHT = 841.89;
const PDF_MARGIN = 56.7;

export const exportAsDocx = async (lessonPlan: LessonPlan, sloId?: string, teacherInfo?: TeacherInfo): Promise<void> => {
  const fileName = `${formatFileName(lessonPlan.title, sloId)}.docx`;
  const children = createDocxContentForPlan(lessonPlan, teacherInfo);
  const doc = new Document({
      sections: [{
          properties: {
              page: {
                  size: { width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT },
                  margin: { top: A4_MARGIN, right: A4_MARGIN, bottom: A4_MARGIN, left: A4_MARGIN }
              }
          },
          children: children,
      }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
};

export const exportAsPdf = async (lessonPlan: LessonPlan, sloId?: string, teacherInfo?: TeacherInfo): Promise<void> => {
  const fileName = `${formatFileName(lessonPlan.title, sloId)}.pdf`;
  const content = createPdfContentForPlan(lessonPlan, teacherInfo);
  const docDefinition: any = {
      pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
      pageMargins: [PDF_MARGIN, PDF_MARGIN, PDF_MARGIN, PDF_MARGIN],
      content: content,
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
    pdfMake.createPdf(docDefinition).download(fileName);
  } else {
    throw new Error('PDF export is unavailable: pdfMake library has not loaded yet. Please try again in a moment.');
  }
};

const createPdfContentForPlan = (lessonPlan: LessonPlan, teacherInfo?: TeacherInfo): any[] => {
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

    const procedureSection = [
        { text: 'LESSON PROCEDURE & TIMINGS', style: 'sectionHeader' },
        ...lessonPlan.activities.flatMap(activity => {
            const parts: any[] = [
                { text: `${activity.name.toUpperCase()} (${activity.duration} mins)`, bold: true, margin: [0, 8, 0, 4] },
                { text: activity.description, style: 'body' },
            ];
            if (activity.teacherActions) {
                parts.push({ text: `Teacher Actions: ${activity.teacherActions}`, style: 'body', margin: [0, 2, 0, 2] });
            }
            if (activity.studentResponses) {
                parts.push({ text: `Student Responses: ${activity.studentResponses}`, style: 'body', margin: [0, 2, 0, 6] });
            }
            return parts;
        }),
    ];

    const homeworkSection = [
        { text: 'HOMEWORK ASSIGNMENT', style: 'sectionHeader' },
        { text: lessonPlan.homework, style: 'body' },
    ];

    return [headerTable, ...resourcesSection, ...procedureSection, ...homeworkSection];
};

export const exportMultipleLessonsAsDocx = async (lessonPlans: LessonPlan[], fileName: string, teacherInfo?: TeacherInfo): Promise<void> => {
    const sections: ISectionOptions[] = lessonPlans.map((plan, index) => ({
        properties: {
            page: {
                size: { width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT },
                margin: { top: A4_MARGIN, right: A4_MARGIN, bottom: A4_MARGIN, left: A4_MARGIN }
            },
        },
        pageBreakBefore: index > 0,
        children: createDocxContentForPlan(plan, teacherInfo),
    }));

    const doc = new Document({ sections });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${fileName}.docx`);
};

export const exportMultipleLessonsAsPdf = async (lessonPlans: LessonPlan[], fileName: string, teacherInfo?: TeacherInfo): Promise<void> => {
    const allContent = lessonPlans.flatMap((plan, index) => {
        const content = createPdfContentForPlan(plan, teacherInfo);
        if (index > 0) {
            return [{ text: '', pageBreak: 'before' as const }, ...content];
        }
        return content;
    });

    const docDefinition: any = {
        pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
        pageMargins: [PDF_MARGIN, PDF_MARGIN, PDF_MARGIN, PDF_MARGIN],
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

const createPaperPdfContent = (paper: GeneratedPaper, teacherInfo?: TeacherInfo): any[] => {
    const schoolName = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";
    const teacherName = teacherInfo?.name || "";

    const headerContent = [
        { text: schoolName, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 14, margin: [0, 0, 0, 4] },
        { text: paper.title, style: 'paperHeader', alignment: 'center', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
        { text: `Subject: ${paper.subject}    |    Class: ${paper.gradeLevel}    |    Total Marks: ${paper.totalMarks}    |    Duration: ${paper.durationMinutes} minutes`, style: 'paperHeader', alignment: 'center', fontSize: 10, margin: [0, 0, 0, 10] },
        teacherName ? { text: `Teacher: ${teacherName}`, style: 'paperHeader', alignment: 'center', fontSize: 10, margin: [0, 0, 0, 8] } : {},
    ].filter(Boolean);

    const sectionsContent = paper.sections.flatMap((section: PaperSection) => {
        const sectionContent: any[] = [
            { text: section.title, style: 'sectionTitle', margin: [0, 10, 0, 4] },
            { text: section.instruction, style: 'sectionInstruction', margin: [0, 0, 0, 6] },
        ];

        section.questions.forEach((q: PaperQuestion) => {
            const qText = `${q.id}. ${q.question} [${q.marks} marks]`;
            if (q.type === 'mcq' && q.options && q.options.length > 0) {
                sectionContent.push({
                    text: qText,
                    style: 'questionText',
                    margin: [0, 4, 0, 2]
                });
                sectionContent.push({
                    ul: q.options.map(opt => ({ text: opt, style: 'optionText' })),
                    margin: [0, 0, 0, 6]
                });
            } else {
                sectionContent.push({
                    text: qText,
                    style: 'questionText',
                    margin: [0, 4, 0, 6]
                });
            }
        });

        return sectionContent;
    });

    return [
        ...headerContent,
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595.28, y2: 0, lineWidth: 1, lineColor: '#000000' }], margin: [0, 0, 0, 10] },
        ...sectionsContent,
        { text: '\n\n', margin: [0, 20, 0, 0] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595.28, y2: 0, lineWidth: 1, lineColor: '#000000' }], margin: [0, 0, 0, 10] },
        { text: '--- End of Paper ---', alignment: 'center', fontSize: 10, margin: [0, 10, 0, 0] },
    ];
};

export const exportPaperAsDocx = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo): Promise<void> => {
    const fileName = `${formatFileName(paper.title)}.docx`;
    const schoolName = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";

    const children: (Paragraph | Table)[] = [];

    const headerParagraph = new Paragraph({
        children: [
            new TextRun({ text: schoolName, bold: true, size: 28, font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
    });
    children.push(headerParagraph);

    const titleParagraph = new Paragraph({
        children: [
            new TextRun({ text: paper.title, bold: true, size: 24, font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
    });
    children.push(titleParagraph);

    const infoParagraph = new Paragraph({
        children: [
            new TextRun({ text: `Subject: ${paper.subject}    Class: ${paper.gradeLevel}    Total Marks: ${paper.totalMarks}    Duration: ${paper.durationMinutes} minutes`, size: 20, font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
    });
    children.push(infoParagraph);

    if (teacherInfo?.name) {
        const teacherParagraph = new Paragraph({
            children: [
                new TextRun({ text: `Teacher: ${teacherInfo.name}`, size: 20, font: "Calibri" }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
        });
        children.push(teacherParagraph);
    }

    const divider = new Paragraph({
        children: [],
        border: { bottom: { style: 'single', size: 6, color: '000000' } },
        spacing: { after: 200 },
    });
    children.push(divider);

    paper.sections.forEach((section: PaperSection) => {
        const sectionTitle = new Paragraph({
            children: [new TextRun({ text: section.title, bold: true, size: 24, font: "Calibri", color: "1F4E79" })],
            spacing: { before: 300, after: 100 },
        });
        children.push(sectionTitle);

        const instruction = new Paragraph({
            children: [new TextRun({ text: section.instruction, italics: true, size: 20, font: "Calibri" })],
            spacing: { after: 150 },
        });
        children.push(instruction);

        section.questions.forEach((q: PaperQuestion) => {
            const qText = `${q.id}. ${q.question}`;
            if (q.type === 'mcq' && q.options && q.options.length > 0) {
                const qPara = new Paragraph({
                    children: [new TextRun({ text: qText, size: 22, font: "Calibri" })],
                    spacing: { after: 80 },
                });
                children.push(qPara);
                q.options.forEach(opt => {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: opt, size: 20, font: "Calibri" })],
                        indent: { left: 400 },
                        spacing: { after: 40 },
                    }));
                });
            } else {
                children.push(new Paragraph({
                    children: [new TextRun({ text: qText, size: 22, font: "Calibri" })],
                    spacing: { after: 120 },
                }));
            }
        });
    });

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
                    margin: { top: A4_MARGIN, right: A4_MARGIN, bottom: A4_MARGIN, left: A4_MARGIN }
                }
            },
            children: children,
        }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, fileName);
};

export const exportPaperAsPdf = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo): Promise<void> => {
    const fileName = `${formatFileName(paper.title)}.pdf`;
    const content = createPaperPdfContent(paper, teacherInfo);
    const docDefinition: any = {
        pageSize: { width: PDF_A4_WIDTH, height: PDF_A4_HEIGHT },
        pageMargins: [PDF_MARGIN, PDF_MARGIN, PDF_MARGIN, PDF_MARGIN],
        content: content,
        styles: {
            paperHeader: { margin: [0, 0, 0, 4] },
            sectionTitle: { bold: true, fontSize: 12, color: '#1F4E79', margin: [0, 10, 0, 4] },
            sectionInstruction: { italics: true, fontSize: 10, margin: [0, 0, 0, 6] },
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
