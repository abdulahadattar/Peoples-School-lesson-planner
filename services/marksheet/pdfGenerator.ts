import { PDFDocument, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { getCombinedMarksheetTitle } from './calculations';
import { CLASSIC_GRADING_SCALE, ZUEB_GRADING_SCALE } from './config';
import { ComputedStudentMarksheet, MarksheetConfig } from './types';

export interface MarksheetLogoAssets {
  phssjPngBytes?: Uint8Array;
  zuebPngBytes?: Uint8Array;
  principalSigPngBytes?: Uint8Array;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 42;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

function sanitizePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

export async function fetchMarksheetLogoAssets(): Promise<MarksheetLogoAssets> {
  if (typeof fetch === 'undefined' || typeof window === 'undefined') {
    return {};
  }
  const loadPng = async (url: string): Promise<Uint8Array | undefined> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return undefined;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return undefined;
    }
  };
  const [phssjPngBytes, zuebPngBytes, principalSigPngBytes] = await Promise.all([
    loadPng('/logos/phssj.png'),
    loadPng('/logos/ziauddin-university.png'),
    loadPng('/logos/principal-signature.png'),
  ]);
  return { phssjPngBytes, zuebPngBytes, principalSigPngBytes };
}

function drawCellText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: any,
  size: number,
  align: 'left' | 'center' | 'right' = 'left'
) {
  let clean = sanitizePdfText(text);
  while (clean.length > 3 && font.widthOfTextAtSize(clean, size) > width - 8) {
    clean = clean.slice(0, -2);
  }
  const tw = font.widthOfTextAtSize(clean, size);
  let tx = x + 5;
  if (align === 'center') tx = x + (width - tw) / 2;
  else if (align === 'right') tx = x + width - tw - 5;
  page.drawText(clean, { x: tx, y, size, font, color: BLACK });
}

function drawMarksheetOnPage(
  page: PDFPage,
  ms: ComputedStudentMarksheet,
  config: MarksheetConfig,
  fonts: { sansBold: any; serifRegular: any; serifBold: any },
  imgs: { phssjImg?: PDFImage; zuebImg?: PDFImage; sigImg?: PDFImage }
) {
  // Single formal outer frame matching the sheet print area
  page.drawRectangle({
    x: 24,
    y: 28,
    width: A4_WIDTH - 48,
    height: A4_HEIGHT - 56,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 1.6,
  });

  const centerText = (str: string, y: number, size: number, font: any) => {
    const clean = sanitizePdfText(str);
    const w = font.widthOfTextAtSize(clean, size);
    page.drawText(clean, { x: (A4_WIDTH - w) / 2, y, size, font, color: BLACK });
  };

  let cursorY = A4_HEIGHT - 44;

  if (imgs.phssjImg) {
    page.drawImage(imgs.phssjImg, { x: MARGIN_X, y: cursorY - 60, width: 60, height: 60 });
  }
  if (imgs.zuebImg) {
    page.drawImage(imgs.zuebImg, {
      x: A4_WIDTH - MARGIN_X - 96,
      y: cursorY - 46,
      width: 96,
      height: 37,
    });
  }

  centerText(config.schoolName, cursorY - 14, 13.5, fonts.sansBold);
  centerText(
    getCombinedMarksheetTitle(ms.student.gradeLevel, ms.examType),
    cursorY - 38,
    11.5,
    fonts.sansBold
  );
  centerText(`Academic Year ${config.academicYear}`, cursorY - 62, 10, fonts.sansBold);

  cursorY -= 96;

  // Student Info Underlined Section (Student Name / Class / Father's Name / GR No)
  const rightColX = MARGIN_X + 325;
  const rightColW = CONTENT_WIDTH - 325;
  const drawField = (
    label: string,
    val: string,
    x: number,
    y: number,
    labelW: number,
    totalW: number,
    centerVal = false
  ) => {
    page.drawText(label, { x, y, size: 10, font: fonts.sansBold, color: BLACK });
    const lineX = x + labelW;
    const lineW = totalW - labelW;
    page.drawLine({
      start: { x: lineX, y: y - 3 },
      end: { x: lineX + lineW, y: y - 3 },
      color: BLACK,
      thickness: 0.75,
    });
    drawCellText(
      page,
      val,
      lineX,
      y,
      lineW,
      fonts.serifRegular,
      10.5,
      centerVal ? 'center' : 'left'
    );
  };

  drawField('Student Name:', ms.student.studentName, MARGIN_X, cursorY, 88, 305, false);
  drawField('Class:', ms.student.gradeLevel, rightColX, cursorY, 46, rightColW, true);

  cursorY -= 22;
  drawField("Father's Name:", ms.student.fatherName || '-', MARGIN_X, cursorY, 88, 305, false);
  drawField('GR No:', ms.student.grNo, rightColX, cursorY, 46, rightColW, true);

  cursorY -= 36;

  // Academic Marks Table
  const cols = [
    { label: '', width: 26, align: 'center' as const },
    { label: 'Subject', width: 170, align: 'left' as const },
    { label: 'Total Marks', width: 66, align: 'center' as const },
    { label: 'Obtained Marks', width: 82, align: 'center' as const },
    { label: 'Subject Grade', width: 64, align: 'center' as const },
    { label: 'Remarks', width: CONTENT_WIDTH - 408, align: 'left' as const },
  ];

  const headerH = 30;
  page.drawRectangle({
    x: MARGIN_X,
    y: cursorY - headerH,
    width: CONTENT_WIDTH,
    height: headerH,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 1.2,
  });

  let hx = MARGIN_X;
  cols.forEach((col, cIdx) => {
    if (cIdx > 0) {
      page.drawLine({
        start: { x: hx, y: cursorY - headerH },
        end: { x: hx, y: cursorY },
        color: BLACK,
        thickness: 0.7,
      });
    }
    if (cIdx === 2) {
      drawCellText(page, 'Total', hx, cursorY - 12, col.width, fonts.serifBold, 9.8, 'center');
      drawCellText(page, 'Marks', hx, cursorY - 24, col.width, fonts.serifBold, 9.8, 'center');
    } else if (cIdx === 4) {
      drawCellText(page, 'Subject', hx, cursorY - 12, col.width, fonts.serifBold, 9.8, 'center');
      drawCellText(page, 'Grade', hx, cursorY - 24, col.width, fonts.serifBold, 9.8, 'center');
    } else if (col.label) {
      drawCellText(page, col.label, hx, cursorY - 18, col.width, fonts.serifBold, 10, 'center');
    }
    hx += col.width;
  });

  cursorY -= headerH;

  const rowH = 22;
  ms.subjects.forEach((subj, idx) => {
    const ry = cursorY - rowH;
    page.drawRectangle({
      x: MARGIN_X,
      y: ry,
      width: CONTENT_WIDTH,
      height: rowH,
      color: WHITE,
      borderColor: BLACK,
      borderWidth: 0.7,
    });

    const cells = [
      String(idx + 1),
      subj.label,
      String(subj.maxMarks),
      subj.obtained === null ? '-' : String(subj.obtained),
      subj.grade,
      subj.remarks,
    ];

    let x = MARGIN_X;
    cols.forEach((col, cIdx) => {
      if (cIdx > 0) {
        page.drawLine({
          start: { x, y: ry },
          end: { x, y: ry + rowH },
          color: BLACK,
          thickness: 0.7,
        });
      }
      drawCellText(
        page,
        cells[cIdx],
        x,
        ry + 7,
        col.width,
        fonts.serifRegular,
        10,
        col.align
      );
      x += col.width;
    });

    cursorY -= rowH;
  });

  // Total Row (spans index + Subject)
  const totalH = 24;
  const totalY = cursorY - totalH;
  page.drawRectangle({
    x: MARGIN_X,
    y: totalY,
    width: CONTENT_WIDTH,
    height: totalH,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 1.2,
  });

  const labelSpanW = cols[0].width + cols[1].width;
  drawCellText(page, 'Total', MARGIN_X, totalY + 7.5, labelSpanW, fonts.serifBold, 10.5, 'center');

  let tx = MARGIN_X + labelSpanW;
  const totalVals = [
    String(ms.totalMaxMarks),
    ms.hasAnyScore ? String(ms.totalObtainedMarks) : '-',
    '',
    '',
  ];
  cols.slice(2).forEach((col, i) => {
    page.drawLine({
      start: { x: tx, y: totalY },
      end: { x: tx, y: totalY + totalH },
      color: BLACK,
      thickness: 0.7,
    });
    if (totalVals[i]) {
      drawCellText(page, totalVals[i], tx, totalY + 7.5, col.width, fonts.serifBold, 10.5, 'center');
    }
    tx += col.width;
  });

  // Re-stroke heavy outer outline around table
  const tableTopY = totalY + totalH + ms.subjects.length * rowH + headerH;
  page.drawRectangle({
    x: MARGIN_X,
    y: totalY,
    width: CONTENT_WIDTH,
    height: tableTopY - totalY,
    borderColor: BLACK,
    borderWidth: 1.3,
  });

  cursorY = totalY - 34;

  // Grade & Overall Percentage Ruled Strip
  page.drawLine({
    start: { x: MARGIN_X, y: cursorY },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: cursorY },
    color: BLACK,
    thickness: 1.1,
  });
  const stripTextY = cursorY - 17;
  page.drawText('Grade:', { x: MARGIN_X + 36, y: stripTextY, size: 10.5, font: fonts.serifBold, color: BLACK });
  page.drawText(sanitizePdfText(ms.overallGrade), {
    x: MARGIN_X + 106,
    y: stripTextY,
    size: 10.5,
    font: fonts.serifBold,
    color: BLACK,
  });
  page.drawText('Overall Percentage:', {
    x: MARGIN_X + 216,
    y: stripTextY,
    size: 10.5,
    font: fonts.serifBold,
    color: BLACK,
  });
  const pctStr = ms.overallPercentage !== null ? `${ms.overallPercentage.toFixed(2)}  %` : '-';
  page.drawText(pctStr, {
    x: MARGIN_X + 356,
    y: stripTextY,
    size: 10.5,
    font: fonts.serifBold,
    color: BLACK,
  });
  page.drawLine({
    start: { x: MARGIN_X, y: cursorY - 26 },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: cursorY - 26 },
    color: BLACK,
    thickness: 1.1,
  });

  cursorY -= 44;

  // Grading System Legend Box
  const scale = ms.gradingSystem === 'zueb' ? ZUEB_GRADING_SCALE : CLASSIC_GRADING_SCALE;
  const splitIdx = ms.gradingSystem === 'zueb' ? 5 : 4;
  const formatLine = (bands: typeof scale) =>
    bands
      .map((b) =>
        b.displayRange.toLowerCase().includes('below')
          ? `${b.grade}: ${b.displayRange}%`
          : `${b.grade}: ${b.displayRange.replace(/\s*-\s*/, '-')}%`
      )
      .join('   |   ');

  const boxRowH = 18;
  const boxH = boxRowH * 3;
  const boxY = cursorY - boxH;
  page.drawRectangle({
    x: MARGIN_X,
    y: boxY,
    width: CONTENT_WIDTH,
    height: boxH,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 0.85,
  });
  page.drawLine({
    start: { x: MARGIN_X, y: boxY + boxRowH * 2 },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: boxY + boxRowH * 2 },
    color: BLACK,
    thickness: 0.7,
  });
  page.drawLine({
    start: { x: MARGIN_X, y: boxY + boxRowH },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: boxY + boxRowH },
    color: BLACK,
    thickness: 0.7,
  });

  drawCellText(
    page,
    'Grading System',
    MARGIN_X,
    boxY + boxRowH * 2 + 5,
    CONTENT_WIDTH,
    fonts.serifBold,
    9.5,
    'center'
  );
  drawCellText(
    page,
    formatLine(scale.slice(0, splitIdx)),
    MARGIN_X,
    boxY + boxRowH + 5,
    CONTENT_WIDTH,
    fonts.serifRegular,
    8.5,
    'center'
  );
  drawCellText(
    page,
    formatLine(scale.slice(splitIdx)),
    MARGIN_X,
    boxY + 5,
    CONTENT_WIDTH,
    fonts.serifRegular,
    8.5,
    'center'
  );

  // Two-column Signature Footer matching sheet bottom
  const sigLineY = 104;
  const colW = 180;
  const leftSigX = MARGIN_X + 14;
  const rightSigX = A4_WIDTH - MARGIN_X - 14 - colW;

  page.drawLine({
    start: { x: leftSigX, y: sigLineY },
    end: { x: leftSigX + colW, y: sigLineY },
    color: BLACK,
    thickness: 0.8,
  });
  drawCellText(page, 'Class Teacher', leftSigX, sigLineY - 14, colW, fonts.serifBold, 10, 'center');
  drawCellText(page, ms.classTeacher, leftSigX, sigLineY - 28, colW, fonts.serifRegular, 10, 'center');

  if (imgs.sigImg) {
    const sigW = 46;
    const sigH = 40;
    page.drawImage(imgs.sigImg, {
      x: rightSigX + (colW - sigW) / 2,
      y: sigLineY + 4,
      width: sigW,
      height: sigH,
    });
  }
  page.drawLine({
    start: { x: rightSigX, y: sigLineY },
    end: { x: rightSigX + colW, y: sigLineY },
    color: BLACK,
    thickness: 0.8,
  });
  drawCellText(page, 'Principal', rightSigX, sigLineY - 14, colW, fonts.serifBold, 10, 'center');
  drawCellText(
    page,
    config.principalName,
    rightSigX,
    sigLineY - 28,
    colW,
    fonts.serifRegular,
    10,
    'center'
  );
}

async function embedOptionalLogos(
  pdfDoc: PDFDocument,
  logos: MarksheetLogoAssets
): Promise<{ phssjImg?: PDFImage; zuebImg?: PDFImage; sigImg?: PDFImage }> {
  const tryEmbed = async (bytes?: Uint8Array): Promise<PDFImage | undefined> => {
    if (!bytes) return undefined;
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return undefined;
    }
  };
  const [phssjImg, zuebImg, sigImg] = await Promise.all([
    tryEmbed(logos.phssjPngBytes),
    tryEmbed(logos.zuebPngBytes),
    tryEmbed(logos.principalSigPngBytes),
  ]);
  return { phssjImg, zuebImg, sigImg };
}

export async function generateSingleMarksheetPdf(
  marksheet: ComputedStudentMarksheet,
  config: MarksheetConfig,
  logos: MarksheetLogoAssets = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    serifRegular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
  };
  const imgs = await embedOptionalLogos(pdfDoc, logos);
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  drawMarksheetOnPage(page, marksheet, config, fonts, imgs);
  return pdfDoc.save();
}

export async function generateBatchMarksheetPdf(
  marksheets: ComputedStudentMarksheet[],
  config: MarksheetConfig,
  logos: MarksheetLogoAssets = {},
  onProgress?: (completed: number, total: number) => void
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    serifRegular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
  };
  const imgs = await embedOptionalLogos(pdfDoc, logos);

  const total = marksheets.length;
  for (let i = 0; i < total; i++) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawMarksheetOnPage(page, marksheets[i], config, fonts, imgs);
    onProgress?.(i + 1, total);
    if (i > 0 && i % 15 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return pdfDoc.save();
}

export function triggerPdfDownload(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
