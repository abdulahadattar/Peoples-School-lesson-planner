import { PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { sanitizePdfText } from './pdfText';
import { MarksheetExamType } from '../marksheet/types';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  a4MmToPdfPoint,
  mmToPt,
} from './layoutGeometry';
import {
  ClassroomTestFrequency,
  OMR_ANSWER_LETTERS,
  OmrGridGeometry,
  OmrQrPayload,
  OmrStudentPrintTarget,
  encodeOmrQrPayload,
  normalizeAnswerKeyString,
} from './types';
import { formatTestFrequencyBadge } from './classroomRanking';
import { rgb } from 'pdf-lib';

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const DARK_SLATE = rgb(0.15, 0.18, 0.24);
const MUTED_TEXT = rgb(0.42, 0.46, 0.52);
const FAINT_BUBBLE_LETTER = rgb(0.81, 0.83, 0.86);
const SUBTLE_BORDER = rgb(0.65, 0.68, 0.74);
const STRIPE_BG = rgb(0.95, 0.96, 0.98);

export interface OmrPageDrawConfig {
  paperId: string;
  title: string;
  subject: string;
  classLevel: string;
  answerKey: string;
  testFrequency?: ClassroomTestFrequency;
  examType?: MarksheetExamType;
  testNumber?: string;
  testDate?: string;
  schoolName?: string;
}

function drawQrVectorOnPage(
  page: PDFPage,
  payloadString: string,
  xMm: number,
  yMm: number,
  sizeMm: number
) {
  const qr = QRCode.create(payloadString, { errorCorrectionLevel: 'M' });
  const moduleCount = qr.modules.size;
  const quiet = 2;
  const totalModules = moduleCount + quiet * 2;
  const modulePt = mmToPt(sizeMm) / totalModules;
  const topLeft = a4MmToPdfPoint(xMm, yMm);

  page.drawRectangle({
    x: topLeft.x,
    y: topLeft.y - mmToPt(sizeMm),
    width: mmToPt(sizeMm),
    height: mmToPt(sizeMm),
    color: WHITE,
    borderColor: SUBTLE_BORDER,
    borderWidth: 0.6,
  });

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!qr.modules.get(row, col)) continue;
      const rx = topLeft.x + (col + quiet) * modulePt;
      const ry = topLeft.y - (row + quiet + 1) * modulePt;
      page.drawRectangle({
        x: rx,
        y: ry,
        width: modulePt + 0.08,
        height: modulePt + 0.08,
        color: BLACK,
      });
    }
  }
}

function drawFieldRow(
  page: PDFPage,
  fonts: { sansBold: any; sansRegular: any },
  label: string,
  val: string,
  xMm: number,
  yMm: number,
  widthMm: number
) {
  const lblPt = a4MmToPdfPoint(xMm, yMm);
  page.drawText(label, {
    x: lblPt.x,
    y: lblPt.y,
    size: 8.2,
    font: fonts.sansBold,
    color: DARK_SLATE,
  });
  page.drawLine({
    start: a4MmToPdfPoint(xMm + 25, yMm + 0.8),
    end: a4MmToPdfPoint(xMm + widthMm, yMm + 0.8),
    color: SUBTLE_BORDER,
    thickness: 0.65,
  });
  if (val) {
    page.drawText(sanitizePdfText(val).slice(0, 38), {
      x: a4MmToPdfPoint(xMm + 26, yMm).x,
      y: a4MmToPdfPoint(xMm + 26, yMm).y,
      size: 8.8,
      font: fonts.sansRegular,
      color: BLACK,
    });
  }
}

function drawGrBubbleSection(
  page: PDFPage,
  geo: OmrGridGeometry,
  fonts: { sansBold: any; sansRegular: any; monoBold: any }
) {
  const gBox = geo.grGrid.boxMm;
  const gPt = a4MmToPdfPoint(gBox.xMm, gBox.yMm);
  page.drawRectangle({
    x: gPt.x,
    y: gPt.y - mmToPt(gBox.hMm),
    width: mmToPt(gBox.wMm),
    height: mmToPt(gBox.hMm),
    color: WHITE,
    borderColor: SUBTLE_BORDER,
    borderWidth: 0.75,
  });

  page.drawText('SHADE 4-DIGIT GR NUMBER', {
    ...a4MmToPdfPoint(gBox.xMm + 3, gBox.yMm + 4.8),
    size: 6.8,
    font: fonts.sansBold,
    color: DARK_SLATE,
  });

  for (let dIdx = 0; dIdx < geo.grGrid.digits; dIdx++) {
    const sampleBubble = geo.grGrid.bubbles.find((b) => b.digitIndex === dIdx && b.digit === 0);
    if (!sampleBubble) continue;
    const boxPt = a4MmToPdfPoint(sampleBubble.cxMm - 2.3, gBox.yMm + 6.2);
    page.drawRectangle({
      x: boxPt.x,
      y: boxPt.y - mmToPt(3.2),
      width: mmToPt(4.6),
      height: mmToPt(3.2),
      borderColor: SUBTLE_BORDER,
      borderWidth: 0.55,
    });
  }

  for (let digit = 0; digit <= 9; digit++) {
    const rowBubble = geo.grGrid.bubbles.find((b) => b.digitIndex === 0 && b.digit === digit);
    if (!rowBubble) continue;
    page.drawText(String(digit), {
      ...a4MmToPdfPoint(gBox.xMm + 5.5, rowBubble.cyMm + 1),
      size: 6.8,
      font: fonts.monoBold,
      color: MUTED_TEXT,
    });
  }

  for (const b of geo.grGrid.bubbles) {
    const cPt = a4MmToPdfPoint(b.cxMm, b.cyMm);
    page.drawCircle({
      x: cPt.x,
      y: cPt.y,
      size: mmToPt(b.radiusMm),
      color: WHITE,
      borderColor: DARK_SLATE,
      borderWidth: 0.7,
    });
    page.drawText(String(b.digit), {
      ...a4MmToPdfPoint(b.cxMm - 0.65, b.cyMm + 0.75),
      size: 5.2,
      font: fonts.sansRegular,
      color: FAINT_BUBBLE_LETTER,
    });
  }
}

export function drawOmrPage(
  page: PDFPage,
  geo: OmrGridGeometry,
  options: OmrPageDrawConfig,
  student: OmrStudentPrintTarget | null,
  fonts: { sansBold: any; sansRegular: any; monoBold: any }
): void {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mmToPt(A4_WIDTH_MM),
    height: mmToPt(A4_HEIGHT_MM),
    color: WHITE,
  });

  // 1. Corner 10x10mm solid black fiducials
  for (const f of [geo.fiducials.tl, geo.fiducials.tr, geo.fiducials.bl, geo.fiducials.br]) {
    const topLeftPt = a4MmToPdfPoint(f.cxMm - f.sizeMm / 2, f.cyMm - f.sizeMm / 2);
    const sizePt = mmToPt(f.sizeMm);
    page.drawRectangle({
      x: topLeftPt.x,
      y: topLeftPt.y - sizePt,
      width: sizePt,
      height: sizePt,
      color: BLACK,
    });
  }

  // 2. Institutional Header & Classroom Test Info
  const schoolTitle = sanitizePdfText(
    options.schoolName || 'Peoples Higher Secondary School Jamshoro'
  );
  const examLabel = options.testFrequency
    ? formatTestFrequencyBadge(options.testFrequency)
    : options.examType === 'mock'
      ? 'MOCK TEST'
      : options.examType === 'preboard'
        ? 'PRE-BOARD EXAM'
        : 'WEEKLY TEST';

  page.drawText(schoolTitle, {
    ...a4MmToPdfPoint(24, 16),
    size: 11.5,
    font: fonts.sansBold,
    color: DARK_SLATE,
  });
  page.drawText(
    sanitizePdfText(`OMR ANSWER SHEET  |  ${examLabel}  |  ${options.subject} (${options.classLevel})`),
    {
      ...a4MmToPdfPoint(24, 22),
      size: 8.8,
      font: fonts.sansBold,
      color: BLACK,
    }
  );
  const testMetaParts = [
    options.title ? sanitizePdfText(options.title).slice(0, 44) : '',
    options.testNumber ? sanitizePdfText(options.testNumber) : '',
    options.testDate ? `Date: ${sanitizePdfText(options.testDate)}` : '',
    `Code: ${sanitizePdfText(options.paperId)}`,
  ].filter(Boolean);
  page.drawText(testMetaParts.join('  |  ').slice(0, 88), {
    ...a4MmToPdfPoint(24, 27.5),
    size: 7.8,
    font: fonts.monoBold,
    color: DARK_SLATE,
  });
  page.drawText(
    'INSTRUCTIONS: Use dark blue/black pen. Shade circles completely. Avoid stray marks.',
    {
      ...a4MmToPdfPoint(24, 34),
      size: 7.4,
      font: fonts.sansRegular,
      color: MUTED_TEXT,
    }
  );

  // 3. Embedded Paper / Answer Key / Student GR QR Code
  const qrPayload: OmrQrPayload = {
    v: 1,
    pid: options.paperId,
    cls: options.classLevel,
    sub: options.subject,
    n: geo.questionCount,
    key: normalizeAnswerKeyString(options.answerKey, geo.questionCount),
    tf: options.testFrequency === 'monthly' ? 'monthly' : 'weekly',
    ...(student?.grNo ? { gr: student.grNo } : {}),
    ...(options.examType ? { ex: options.examType } : {}),
    ...(options.title ? { ttl: options.title } : {}),
  };
  drawQrVectorOnPage(
    page,
    encodeOmrQrPayload(qrPayload),
    geo.qrBox.xMm,
    geo.qrBox.yMm,
    geo.qrBox.sizeMm
  );

  // 4. Student Metadata & Optional 4-Digit GR Grid
  const metaRightMm = geo.hasGrGrid ? 124 : 186;
  const metaTopPt = a4MmToPdfPoint(24, 42);
  const metaHeightMm = geo.hasGrGrid ? 52 : 26;
  page.drawRectangle({
    x: metaTopPt.x,
    y: metaTopPt.y - mmToPt(metaHeightMm),
    width: mmToPt(metaRightMm - 24),
    height: mmToPt(metaHeightMm),
    color: WHITE,
    borderColor: SUBTLE_BORDER,
    borderWidth: 0.75,
  });

  if (geo.hasGrGrid) {
    drawFieldRow(page, fonts, 'Student Name:', student?.studentName || '', 27, 50, 93);
    drawFieldRow(page, fonts, "Father's Name:", student?.fatherName || '', 27, 61, 93);
    drawFieldRow(page, fonts, 'Class / Sec:', student?.currentClass || options.classLevel, 27, 72, 93);
    drawFieldRow(page, fonts, 'GR Number:', student?.grNo || '', 27, 83, 93);
    drawGrBubbleSection(page, geo, fonts);
  } else {
    drawFieldRow(page, fonts, 'Student Name:', student?.studentName || '', 27, 50, 102);
    drawFieldRow(page, fonts, "Father's Name:", student?.fatherName || '', 27, 60, 102);
    drawFieldRow(
      page,
      fonts,
      'Class / Sec:',
      `${student?.currentClass || options.classLevel}${student?.section ? ` (${student.section})` : ''}`,
      134,
      50,
      48
    );
    drawFieldRow(page, fonts, 'GR Number:', student?.grNo || '', 134, 60, 48);
  }

  // 5. MCQ Grid Columns & Bubbles
  const colWidthMm = (186 - 24) / geo.columns;
  for (const colHdr of geo.columnHeaders) {
    const hdrTopPt = a4MmToPdfPoint(colHdr.xStartMm + 1, colHdr.yMm - 1.5);
    page.drawRectangle({
      x: hdrTopPt.x,
      y: hdrTopPt.y - mmToPt(5.5),
      width: mmToPt(colWidthMm - 2),
      height: mmToPt(5.5),
      color: STRIPE_BG,
      borderColor: SUBTLE_BORDER,
      borderWidth: 0.55,
    });
    page.drawText('Q#', {
      ...a4MmToPdfPoint(colHdr.xStartMm + 3.2, colHdr.yMm + 2.3),
      size: 7.4,
      font: fonts.sansBold,
      color: DARK_SLATE,
    });
    colHdr.optionXsMm.forEach((ox, optIdx) => {
      page.drawText(OMR_ANSWER_LETTERS[optIdx], {
        ...a4MmToPdfPoint(ox - 1.1, colHdr.yMm + 2.3),
        size: 7.5,
        font: fonts.sansBold,
        color: DARK_SLATE,
      });
    });
  }

  const byQuestion = new Map<number, typeof geo.bubbles>();
  for (const b of geo.bubbles) {
    const arr = byQuestion.get(b.questionIndex);
    if (arr) arr.push(b);
    else byQuestion.set(b.questionIndex, [b]);
  }

  for (let qIdx = 0; qIdx < geo.questionCount; qIdx++) {
    const rowBubbles = byQuestion.get(qIdx);
    if (!rowBubbles || rowBubbles.length === 0) continue;
    const colHdr = geo.columnHeaders[Math.floor(qIdx / geo.rowsPerColumn)];
    const rowY = rowBubbles[0].cyMm;

    page.drawText(String(qIdx + 1).padStart(2, '0'), {
      ...a4MmToPdfPoint(colHdr.xStartMm + 2.6, rowY + 1.0),
      size: 8.0,
      font: fonts.monoBold,
      color: DARK_SLATE,
    });

    for (const b of rowBubbles) {
      const cPt = a4MmToPdfPoint(b.cxMm, b.cyMm);
      page.drawCircle({
        x: cPt.x,
        y: cPt.y,
        size: mmToPt(b.radiusMm),
        color: WHITE,
        borderColor: DARK_SLATE,
        borderWidth: 0.85,
      });
      page.drawText(b.option, {
        ...a4MmToPdfPoint(b.cxMm - 0.85, b.cyMm + 0.85),
        size: 5.8,
        font: fonts.sansRegular,
        color: FAINT_BUBBLE_LETTER,
      });
    }
  }

  // 6. Footer line between bottom fiducials
  page.drawText(
    sanitizePdfText(
      `PHSSJ OMR  |  Q: ${geo.questionCount}  |  Code: ${options.paperId}${options.testNumber ? `  |  ${options.testNumber}` : ''}${options.testDate ? ` (${options.testDate})` : ''}${student?.grNo ? `  |  GR: ${student.grNo}` : ''}`
    ),
    {
      ...a4MmToPdfPoint(24, 282.5),
      size: 7.0,
      font: fonts.sansRegular,
      color: MUTED_TEXT,
    }
  );
}
