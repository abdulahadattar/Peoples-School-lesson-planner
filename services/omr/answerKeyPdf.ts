import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { triggerPdfDownload } from '../marksheet/pdfGenerator';
import { A4_HEIGHT_MM, A4_WIDTH_MM, a4MmToPdfPoint, mmToPt } from './layoutGeometry';
import { sanitizePdfText } from './pdfText';
import { normalizeAnswerKeyString } from './types';

export interface AnswerKeyPdfOptions {
  schoolName?: string;
  subject: string;
  classLevel: string;
  title: string;
  testCode: string;
  testNumber: string;
  testDate: string;
  questionCount: number;
  answerKey: string;
  questionSnippets?: string[];
}

const DARK_NAVY = rgb(0.11, 0.24, 0.45);
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.46, 0.52);
const LIGHT_BG = rgb(0.95, 0.97, 0.99);
const BORDER = rgb(0.72, 0.76, 0.82);

export async function generateAnswerKeyPdf(options: AnswerKeyPdfOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const sansRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const page = pdfDoc.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)]);
  const school = sanitizePdfText(
    options.schoolName || 'Peoples Higher Secondary School Jamshoro'
  );
  const count = Math.max(1, Math.min(100, Math.round(options.questionCount)));
  const normalizedKey = normalizeAnswerKeyString(options.answerKey, count);

  // Header
  page.drawText(school, {
    ...a4MmToPdfPoint(18, 20),
    size: 13,
    font: sansBold,
    color: DARK_NAVY,
  });
  page.drawText('OFFICIAL OMR MCQ ANSWER KEY', {
    ...a4MmToPdfPoint(18, 27),
    size: 11,
    font: sansBold,
    color: INK,
  });
  page.drawText(sanitizePdfText(options.title).slice(0, 82), {
    ...a4MmToPdfPoint(18, 33),
    size: 9.5,
    font: sansRegular,
    color: MUTED,
  });

  // Metadata Box
  const metaPt = a4MmToPdfPoint(18, 38);
  page.drawRectangle({
    x: metaPt.x,
    y: metaPt.y - mmToPt(20),
    width: mmToPt(174),
    height: mmToPt(20),
    color: LIGHT_BG,
    borderColor: BORDER,
    borderWidth: 0.75,
  });

  page.drawText(sanitizePdfText(`Subject: ${options.subject}    |    Class: ${options.classLevel}    |    Total MCQs: ${count}`), {
    ...a4MmToPdfPoint(22, 45.5),
    size: 9.5,
    font: sansBold,
    color: INK,
  });
  page.drawText(sanitizePdfText(`Test No: ${options.testNumber}    |    Test Code: ${options.testCode}    |    Date: ${options.testDate}`), {
    ...a4MmToPdfPoint(22, 52.5),
    size: 9.0,
    font: monoBold,
    color: DARK_NAVY,
  });

  // Grid of Q# -> Key
  const cols = count <= 25 ? 2 : count <= 60 ? 3 : 4;
  const rowsPerCol = Math.ceil(count / cols);
  const gridLeftMm = 18;
  const colGapMm = 4;
  const colWidthMm = (174 - colGapMm * (cols - 1)) / cols;
  const startY = 66;
  const rowH = Math.min(8.2, Math.max(5.8, (265 - startY) / (rowsPerCol + 1)));

  for (let c = 0; c < cols; c++) {
    const cx = gridLeftMm + c * (colWidthMm + colGapMm);
    const hdrPt = a4MmToPdfPoint(cx, startY);
    page.drawRectangle({
      x: hdrPt.x,
      y: hdrPt.y - mmToPt(rowH),
      width: mmToPt(colWidthMm),
      height: mmToPt(rowH),
      color: DARK_NAVY,
    });
    page.drawText('Q #', {
      ...a4MmToPdfPoint(cx + 3, startY + rowH * 0.68),
      size: 8.2,
      font: sansBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('KEY', {
      ...a4MmToPdfPoint(cx + colWidthMm - 13, startY + rowH * 0.68),
      size: 8.2,
      font: sansBold,
      color: rgb(1, 1, 1),
    });
  }

  for (let i = 0; i < count; i++) {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const cx = gridLeftMm + col * (colWidthMm + colGapMm);
    const cy = startY + (row + 1) * rowH;

    const cellPt = a4MmToPdfPoint(cx, cy);
    page.drawRectangle({
      x: cellPt.x,
      y: cellPt.y - mmToPt(rowH),
      width: mmToPt(colWidthMm),
      height: mmToPt(rowH),
      color: row % 2 === 0 ? rgb(1, 1, 1) : LIGHT_BG,
      borderColor: BORDER,
      borderWidth: 0.45,
    });

    page.drawText(`Q${String(i + 1).padStart(2, '0')}`, {
      ...a4MmToPdfPoint(cx + 3, cy + rowH * 0.66),
      size: 8.5,
      font: monoBold,
      color: INK,
    });

    const snippet = options.questionSnippets?.[i];
    if (snippet && cols <= 2) {
      page.drawText(sanitizePdfText(snippet).slice(0, 32), {
        ...a4MmToPdfPoint(cx + 14, cy + rowH * 0.66),
        size: 7.2,
        font: sansRegular,
        color: MUTED,
      });
    }

    page.drawText(normalizedKey[i] || 'A', {
      ...a4MmToPdfPoint(cx + colWidthMm - 11, cy + rowH * 0.68),
      size: 9.5,
      font: monoBold,
      color: DARK_NAVY,
    });
  }

  // Footer
  page.drawText(
    sanitizePdfText(`Compact Key String: ${normalizedKey}`),
    {
      ...a4MmToPdfPoint(18, 276),
      size: 8,
      font: monoBold,
      color: MUTED,
    }
  );
  page.drawText(
    sanitizePdfText(`PHSSJ Examination System  |  Test Code: ${options.testCode}`),
    {
      ...a4MmToPdfPoint(18, 282),
      size: 7.8,
      font: sansRegular,
      color: MUTED,
    }
  );

  return pdfDoc.save();
}

export function triggerAnswerKeyPdfDownload(bytes: Uint8Array, testCode: string): void {
  const safeCode = testCode.replace(/[^a-zA-Z0-9_-]+/g, '_');
  triggerPdfDownload(bytes, `Answer_Key_${safeCode}.pdf`);
}

export function formatAnswerKeyCsv(options: AnswerKeyPdfOptions): string {
  const lines = [
    `# School,${options.schoolName || 'Peoples Higher Secondary School Jamshoro'}`,
    `# Subject,${options.subject}`,
    `# Class,${options.classLevel}`,
    `# Test Number,${options.testNumber}`,
    `# Test Code,${options.testCode}`,
    `# Test Date,${options.testDate}`,
    'Question,Correct Answer',
  ];
  const key = normalizeAnswerKeyString(options.answerKey, options.questionCount);
  for (let i = 0; i < options.questionCount; i++) {
    lines.push(`${i + 1},${key[i]}`);
  }
  return lines.join('\n');
}
