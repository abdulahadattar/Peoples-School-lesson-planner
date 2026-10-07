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
} from 'docx';
import saveAs from 'file-saver';
import { LessonPlan, TeacherInfo } from '../../types';
import {
  formatFileName,
  createHeaderRun,
  createSectionHeading,
  createBulletList,
  createRichParagraph,
  A4_PAGE_WIDTH,
  A4_PAGE_HEIGHT,
  DOCX_PAGE_MARGINS,
} from './docxHelpers';

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
            borders: { top: { style: 'single', size: 12 }, bottom: { style: 'single', size: 12 }, left: { style: 'none' }, right: { style: 'none' } }
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`GRADE: ${gradeShort}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'none' }, bottom: { style: 'none' }, left: { style: 'none' }, right: { style: 'none' } } }),
          new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`SUBJECT: ${lessonPlan.subject}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'none' }, bottom: { style: 'none' }, left: { style: 'none' }, right: { style: 'none' } } }),
          new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`PERIODS: ${period}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'none' }, bottom: { style: 'none' }, left: { style: 'none' }, right: { style: 'none' } } }),
          new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`DATE/TIMELINE: ${dateTimeline}`, true, 24)] })], verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'none' }, bottom: { style: 'none' }, left: { style: 'none' }, right: { style: 'none' } } }),
        ],
      }),
      new TableRow({
        children: [new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`LESSON TOPIC: ${lessonPlan.title}`, false, 24)] })], columnSpan: 4, verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'single', size: 6 }, bottom: { style: 'none' }, left: { style: 'none' }, right: { style: 'none' } } })],
      }),
      new TableRow({
        children: [new TableCell({ children: [new Paragraph({ children: [createHeaderRun(`LEARNING OBJECTIVE: ${lessonPlan.objective}`, false, 24)] })], columnSpan: 4, verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'single', size: 2 }, bottom: { style: 'none' }, left: { style: 'none' }, right: { style: 'none' } } })],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [createHeaderRun(`TEACHER: `, false, 24), createHeaderRun(teacherName, true, 24)] })],
            columnSpan: 4, verticalAlign: VerticalAlign.CENTER, borders: { top: { style: 'single', size: 2 }, bottom: { style: 'single', size: 12 }, left: { style: 'none' }, right: { style: 'none' } }
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
      children: [new TextRun({ text: `${activity.name.toUpperCase()} (${activity.duration} mins)`, bold: true, size: 22 })],
      spacing: { before: 120, after: 60 }
    }));
    children.push(await createRichParagraph(activity.description));
  }
  children.push(createSectionHeading('HOMEWORK ASSIGNMENT'));
  children.push(await createRichParagraph(lessonPlan.homework));

  return children;
};

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
