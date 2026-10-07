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
} from 'docx';
import saveAs from 'file-saver';
import { GeneratedPaper, TeacherInfo } from '../../types';
import {
  hasOptions,
  layoutOptions,
  optionLine,
  paperSectionNote,
  questionNumber,
  sectionInstruction,
  cleanQuestionText,
} from '../paperLayout';
import {
  formatFileName,
  parseTextForDocx,
  A4_PAGE_WIDTH,
  A4_PAGE_HEIGHT,
  DOCX_PAGE_MARGINS,
} from './docxHelpers';

export const exportPaperAsDocx = async (paper: GeneratedPaper, teacherInfo?: TeacherInfo, mathScale: number = 85): Promise<void> => {
  const fileName = `${formatFileName(paper.title)}.docx`;
  const schoolName = teacherInfo?.schoolName || "Peoples Higher Secondary School Jamshoro";

  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: schoolName, bold: true, size: 28, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: paper.title, bold: true, size: 24, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
  }));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: `Subject: ${paper.subject}    Class: ${paper.gradeLevel}    Total Marks: ${paper.totalMarks}    Duration: ${paper.durationMinutes} minutes`, size: 20, font: "Calibri" }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }));

  if (teacherInfo?.name) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Teacher: ${teacherInfo.name}`, size: 20, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }));
  }

  children.push(new Paragraph({
    children: [],
    border: { bottom: { style: 'single', size: 6, color: '000000' } },
    spacing: { after: 120 },
  }));

  const noBorders = {
    top: { style: 'none' as const }, bottom: { style: 'none' as const },
    left: { style: 'none' as const }, right: { style: 'none' as const },
  };

  const optionCell = async (o: { index: number; text: string }): Promise<TableCell> => new TableCell({
    children: [
      new Paragraph({
        children: await parseTextForDocx(optionLine(o.index, o.text), mathScale),
        spacing: { after: 30 },
        indent: { left: 80 },
      }),
    ],
    borders: noBorders,
    width: { size: 50, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
  });

  for (let sIdx = 0; sIdx < paper.sections.length; sIdx++) {
    const section = paper.sections[sIdx];

    children.push(new Paragraph({
      children: [new TextRun({ text: section.title, bold: true, size: 24, font: "Calibri", color: "1F4E79" })],
      spacing: { before: 300, after: 100 },
    }));

    const genericInstruction = sectionInstruction(section);
    if (genericInstruction) {
      children.push(new Paragraph({
        children: [new TextRun({ text: genericInstruction, italics: true, size: 20, font: "Calibri" })],
        spacing: { after: 80 },
      }));
    }

    const markingNote = paperSectionNote(paper, sIdx, section);
    if (markingNote) {
      children.push(new Paragraph({
        children: [new TextRun({ text: markingNote, bold: true, size: 20, font: "Calibri" })],
        spacing: { after: 150 },
      }));
    }

    for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
      const q = section.questions[qIdx];
      const cleanedQ = cleanQuestionText(q.question);
      const qRuns = await parseTextForDocx(`${questionNumber(qIdx)}. ${cleanedQ}`, mathScale);
      children.push(new Paragraph({
        children: qRuns,
        spacing: { after: hasOptions(q) ? 60 : 120 },
      }));

      if (hasOptions(q)) {
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
                      children: await parseTextForDocx(optionLine(row.options[0].index, row.options[0].text), mathScale),
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

  children.push(new Paragraph({
    children: [],
    border: { bottom: { style: 'single', size: 6, color: '000000' } },
    spacing: { before: 400, after: 200 },
  }));

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
