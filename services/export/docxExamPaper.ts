import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
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
  shouldStackOptions,
  cleanQuestionText,
} from '../paperLayout';
import {
  formatFileName,
  parseTextForDocx,
  A4_PAGE_WIDTH,
  A4_PAGE_HEIGHT,
  DOCX_PAGE_MARGINS,
} from './docxHelpers';

/** Exact OOXML geometry constants (in twips: 1440 twips = 1 inch). */
export const EXAM_DOCX_LAYOUT = {
  /** 0.35" left indent for both 2x2 left column and stacked option labels. */
  LEFT_INDENT_TWIPS: 504,
  /** 3.65" fixed left tab stop for 2x2 right column (options b and d). */
  RIGHT_COL_TAB_TWIPS: 5256,
  /** 0.22" hanging indent for wrapped lines in stacked options. */
  STACKED_HANGING_TWIPS: 317,
  /** 0.35" + 0.22" = 0.57" left margin for wrapped lines in stacked options. */
  STACKED_LEFT_TWIPS: 821,
  /** Clear vertical spacing after each stacked option paragraph (50-60 twips). */
  STACKED_AFTER_TWIPS: 55,
} as const;

const QUESTION_FONT_SIZE = 20; // 10pt Calibri
const OPTION_FONT_SIZE = 19;   // 9.5pt Calibri

export const buildExamPaperDocx = async (
  paper: GeneratedPaper,
  teacherInfo?: TeacherInfo,
  mathScale: number = 85
): Promise<Document> => {
  const schoolName = teacherInfo?.schoolName || 'Peoples Higher Secondary School Jamshoro';
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: schoolName, bold: true, size: 26, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: paper.title, bold: true, size: 22, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 30 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Subject: ${paper.subject}    Class: ${paper.gradeLevel}    Total Marks: ${paper.totalMarks}    Duration: ${paper.durationMinutes} minutes`,
          size: 19,
          font: 'Calibri',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
    })
  );

  if (paper.omrMeta?.enabled) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${paper.omrMeta.testNumber}    |    Date: ${paper.omrMeta.testDate}    |    OMR Test Code: ${paper.omrMeta.testCode}`,
            bold: true,
            size: 19,
            color: '1F4E79',
            font: 'Calibri',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      })
    );
  }

  if (teacherInfo?.name) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Teacher: ${teacherInfo.name}`, size: 19, font: 'Calibri' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 30 },
      })
    );
  }

  children.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: 'single', size: 6, color: '000000' } },
      spacing: { after: 80 },
    })
  );

  for (let sIdx = 0; sIdx < paper.sections.length; sIdx++) {
    const section = paper.sections[sIdx];

    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.title, bold: true, size: 22, font: 'Calibri', color: '1F4E79' })],
        spacing: { before: 140, after: 50 },
        keepNext: true,
      })
    );

    const genericInstruction = sectionInstruction(section);
    if (genericInstruction) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: genericInstruction, italics: true, size: 19, font: 'Calibri' })],
          spacing: { after: 40 },
          keepNext: true,
        })
      );
    }

    const markingNote = paperSectionNote(paper, sIdx, section);
    if (markingNote) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: markingNote, bold: true, size: 19, font: 'Calibri' })],
          spacing: { after: 80 },
          keepNext: true,
        })
      );
    }

    for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
      const q = section.questions[qIdx];
      const cleanedQ = cleanQuestionText(q.question);
      const qHasOptions = hasOptions(q);
      const qRuns = await parseTextForDocx(`${questionNumber(qIdx)}. ${cleanedQ}`, mathScale, QUESTION_FONT_SIZE);

      children.push(
        new Paragraph({
          children: qRuns,
          spacing: { before: 70, after: qHasOptions ? 35 : 100 },
          keepNext: qHasOptions,
        })
      );

      if (qHasOptions) {
        const rawOpts = q.options || [];
        const stacked = shouldStackOptions(rawOpts);
        const rows = layoutOptions(rawOpts);

        if (stacked) {
          for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const opt = rows[rIdx].options[0];
            const isLast = rIdx === rows.length - 1;
            const optRuns = await parseTextForDocx(optionLine(opt.index, opt.text), mathScale, OPTION_FONT_SIZE, false);
            children.push(
              new Paragraph({
                children: optRuns,
                indent: {
                  left: EXAM_DOCX_LAYOUT.STACKED_LEFT_TWIPS,
                  hanging: EXAM_DOCX_LAYOUT.STACKED_HANGING_TWIPS,
                },
                spacing: { after: isLast ? 80 : EXAM_DOCX_LAYOUT.STACKED_AFTER_TWIPS },
                keepNext: !isLast,
              })
            );
          }
        } else {
          for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const row = rows[rIdx];
            const isLastRow = rIdx === rows.length - 1;
            const firstRuns = await parseTextForDocx(
              optionLine(row.options[0].index, row.options[0].text),
              mathScale,
              OPTION_FONT_SIZE,
              false
            );
            const rowRuns = [...firstRuns];
            if (row.options.length === 2) {
              const secondRuns = await parseTextForDocx(
                optionLine(row.options[1].index, row.options[1].text),
                mathScale,
                OPTION_FONT_SIZE,
                false
              );
              rowRuns.push(new TextRun({ children: [new Tab()], font: 'Calibri', size: OPTION_FONT_SIZE }));
              rowRuns.push(...secondRuns);
            }

            children.push(
              new Paragraph({
                children: rowRuns,
                indent: { left: EXAM_DOCX_LAYOUT.LEFT_INDENT_TWIPS },
                tabStops: [{ type: TabStopType.LEFT, position: EXAM_DOCX_LAYOUT.RIGHT_COL_TAB_TWIPS }],
                spacing: { after: isLastRow ? 70 : 35 },
                keepNext: !isLastRow,
              })
            );
          }
        }
      }
    }
  }

  children.push(
    new Paragraph({
      children: [],
      border: { bottom: { style: 'single', size: 6, color: '000000' } },
      spacing: { before: 200, after: 100 },
    })
  );

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT },
            margin: DOCX_PAGE_MARGINS,
          },
        },
        children,
      },
    ],
  });
};

export const exportPaperAsDocx = async (
  paper: GeneratedPaper,
  teacherInfo?: TeacherInfo,
  mathScale: number = 85
): Promise<void> => {
  const fileName = `${formatFileName(paper.title)}.docx`;
  const doc = await buildExamPaperDocx(paper, teacherInfo, mathScale);
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
};
