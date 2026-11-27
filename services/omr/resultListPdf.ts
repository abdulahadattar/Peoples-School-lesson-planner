import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { triggerPdfDownload } from '../marksheet/pdfGenerator';
import { computeCompetitionRanks, formatTestFrequencyLabel } from './classroomRanking';
import { A4_HEIGHT_MM, A4_WIDTH_MM, a4MmToPdfPoint, mmToPt } from './layoutGeometry';
import { sanitizePdfText } from './pdfText';
import type { PrintableClassResultSummary } from './scanResultsStore';

const DARK_NAVY = rgb(0.11, 0.24, 0.45);
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.46, 0.52);
const LIGHT_BG = rgb(0.95, 0.97, 0.99);
const BORDER = rgb(0.74, 0.78, 0.84);
const GOLD_ACCENT = rgb(0.72, 0.48, 0.04);

function csvCell(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function formatResultListCsv(summary: PrintableClassResultSummary): string {
  const rankedRows = computeCompetitionRanks(summary.rows);
  const lines = [
    `Test Cadence,${csvCell(formatTestFrequencyLabel(summary.testFrequency))}`,
    `Subject,${csvCell(summary.subject)}`,
    `Class,${csvCell(summary.classLevel)}`,
    `Test Number,${csvCell(summary.testNumber)}`,
    `Test Code,${csvCell(summary.testCode)}`,
    `Test Date,${csvCell(summary.testDate)}`,
    `Total Marks,${summary.totalMarks}`,
    '',
    'Rank,GR No,Student Name,Father Name,Obtained Marks,Total Marks,Percentage',
  ];

  rankedRows.forEach((r) => {
    lines.push(
      [
        r.rank,
        csvCell(r.grNo),
        csvCell(r.studentName),
        csvCell(r.fatherName),
        r.score,
        r.total,
        `${r.percentage.toFixed(1)}%`,
      ].join(',')
    );
  });

  return lines.join('\n');
}

export async function generateTestResultListPdf(
  summary: PrintableClassResultSummary,
  schoolName = 'Peoples Higher Secondary School Jamshoro'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const sansRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const rankedRows = computeCompetitionRanks(summary.rows);
  const rowsPerPage = 28;
  const totalPages = Math.max(1, Math.ceil(rankedRows.length / rowsPerPage));

  const cols = [
    { label: 'Rank', x: 14, w: 14 },
    { label: 'GR No', x: 28, w: 20 },
    { label: 'Student Name', x: 48, w: 54 },
    { label: "Father's Name", x: 102, w: 52 },
    { label: 'Marks', x: 154, w: 24 },
    { label: '%', x: 178, w: 18 },
  ];

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const page = pdfDoc.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)]);
    const slice = rankedRows.slice(pIdx * rowsPerPage, (pIdx + 1) * rowsPerPage);

    // Notice Board Header
    page.drawText(sanitizePdfText(schoolName), {
      ...a4MmToPdfPoint(14, 16),
      size: 13,
      font: sansBold,
      color: DARK_NAVY,
    });
    page.drawText('CLASS TEST RESULT ANNOUNCEMENT (NOTICE BOARD)', {
      ...a4MmToPdfPoint(14, 22.5),
      size: 10.5,
      font: sansBold,
      color: INK,
    });
    page.drawText(`Page ${pIdx + 1} of ${totalPages}`, {
      ...a4MmToPdfPoint(174, 16),
      size: 8.5,
      font: sansRegular,
      color: MUTED,
    });

    // Metadata box
    const boxPt = a4MmToPdfPoint(14, 27);
    page.drawRectangle({
      x: boxPt.x,
      y: boxPt.y - mmToPt(21),
      width: mmToPt(182),
      height: mmToPt(21),
      color: LIGHT_BG,
      borderColor: BORDER,
      borderWidth: 0.7,
    });

    page.drawText(
      sanitizePdfText(
        `Subject: ${summary.subject}    |    Class: ${summary.classLevel}    |    ${formatTestFrequencyLabel(summary.testFrequency)}`
      ),
      {
        ...a4MmToPdfPoint(18, 33.5),
        size: 8.8,
        font: sansBold,
        color: INK,
      }
    );
    page.drawText(
      sanitizePdfText(
        `Test No: ${summary.testNumber}    |    Test Code: ${summary.testCode}    |    Date: ${summary.testDate}`
      ),
      {
        ...a4MmToPdfPoint(18, 39.5),
        size: 8.4,
        font: monoBold,
        color: DARK_NAVY,
      }
    );
    page.drawText(
      sanitizePdfText(
        `Students: ${summary.scannedCount}${summary.enrolledCount ? ` / ${summary.enrolledCount}` : ''}    |    Average: ${summary.averageScore}/${summary.totalMarks} (${summary.averagePercentage}%)    |    Highest: ${summary.highestScore}/${summary.totalMarks}    |    Pass: ${summary.passRate}%`
      ),
      {
        ...a4MmToPdfPoint(18, 45),
        size: 7.8,
        font: sansRegular,
        color: MUTED,
      }
    );

    // Table header
    const headerY = 53;
    const rowH = 7.2;
    const hdrPt = a4MmToPdfPoint(14, headerY);
    page.drawRectangle({
      x: hdrPt.x,
      y: hdrPt.y - mmToPt(rowH),
      width: mmToPt(182),
      height: mmToPt(rowH),
      color: DARK_NAVY,
    });

    for (const col of cols) {
      page.drawText(col.label, {
        ...a4MmToPdfPoint(col.x + 1.5, headerY + 4.9),
        size: 7.6,
        font: sansBold,
        color: rgb(1, 1, 1),
      });
    }

    // Ranked rows
    slice.forEach((row, idx) => {
      const ry = headerY + (idx + 1) * rowH;
      const rPt = a4MmToPdfPoint(14, ry);

      page.drawRectangle({
        x: rPt.x,
        y: rPt.y - mmToPt(rowH),
        width: mmToPt(182),
        height: mmToPt(rowH),
        color: idx % 2 === 0 ? rgb(1, 1, 1) : LIGHT_BG,
        borderColor: BORDER,
        borderWidth: 0.4,
      });

      const vals = [
        `#${row.rank}`,
        row.grNo,
        sanitizePdfText(row.studentName).slice(0, 30),
        sanitizePdfText(row.fatherName || '—').slice(0, 29),
        `${row.score} / ${row.total}`,
        `${row.percentage.toFixed(1)}%`,
      ];

      cols.forEach((col, cIdx) => {
        const isMono = cIdx === 0 || cIdx === 1 || cIdx === 4 || cIdx === 5;
        page.drawText(vals[cIdx], {
          ...a4MmToPdfPoint(col.x + 1.5, ry + 4.8),
          size: isMono ? 7.7 : 7.6,
          font: isMono ? monoBold : sansRegular,
          color: cIdx === 0 && row.rank <= 3 ? GOLD_ACCENT : INK,
        });
      });
    });

    if (rankedRows.length === 0) {
      page.drawText('No scanned OMR sheets recorded for this test yet.', {
        ...a4MmToPdfPoint(50, 72),
        size: 9.5,
        font: sansRegular,
        color: MUTED,
      });
    }

    // Signature footer on last page
    if (pIdx === totalPages - 1) {
      page.drawLine({
        start: a4MmToPdfPoint(18, 272),
        end: a4MmToPdfPoint(72, 272),
        color: BORDER,
        thickness: 0.7,
      });
      page.drawText('Subject Teacher Signature', {
        ...a4MmToPdfPoint(22, 277),
        size: 8,
        font: sansRegular,
        color: MUTED,
      });

      page.drawLine({
        start: a4MmToPdfPoint(138, 272),
        end: a4MmToPdfPoint(192, 272),
        color: BORDER,
        thickness: 0.7,
      });
      page.drawText('Principal / Notice Board Approval', {
        ...a4MmToPdfPoint(138, 277),
        size: 8,
        font: sansRegular,
        color: MUTED,
      });
    }
  }

  return pdfDoc.save();
}

export function triggerResultListPdfDownload(bytes: Uint8Array, testCode: string): void {
  const safeCode = testCode.replace(/[^a-zA-Z0-9_-]+/g, '_');
  triggerPdfDownload(bytes, `NoticeBoard_Result_${safeCode}.pdf`);
}
