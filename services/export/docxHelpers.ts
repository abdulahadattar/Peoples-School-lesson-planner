import {
  AlignmentType,
  ImageRun,
  Paragraph,
  TextRun,
} from 'docx';
import { parseTextWithEquations, dataUrlToBase64 } from '../equationRenderer';
import { InlineRichRun, parseMarkdownToRuns, parseTextToRichParts, latexToInlineRuns } from './inlineMathParser';

export const formatFileName = (title: string, sloId?: string): string => {
  const baseName = sloId ? `${sloId}_${title}` : title;
  return baseName.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 100);
};

export const inlineRunsToDocxRuns = (
  runs: InlineRichRun[],
  fontSizeHalfPt: number = 22
): TextRun[] =>
  runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        superScript: r.sup,
        subScript: r.sub,
        font: 'Calibri',
        size: fontSizeHalfPt,
      })
  );

export const parseMarkdownRuns = (text: string, fontSizeHalfPt: number = 22): TextRun[] =>
  inlineRunsToDocxRuns(parseMarkdownToRuns(text), fontSizeHalfPt);

export const parseTextForDocx = async (
  text: string,
  mathScale: number = 100,
  fontSizeHalfPt: number = 22
): Promise<(TextRun | ImageRun)[]> => {
  const runs: (TextRun | ImageRun)[] = [];
  const baseFontSize = Math.round(14 * (mathScale / 100));
  const parts = parseTextToRichParts(text, { mode: 'complex-as-equation' });

  for (const part of parts) {
    if (part.kind === 'runs') {
      runs.push(...inlineRunsToDocxRuns(part.runs, fontSizeHalfPt));
      continue;
    }

    const delimited = part.display ? `$$${part.latex}$$` : `$${part.latex}$`;
    const rendered = await parseTextWithEquations(delimited, baseFontSize);
    const eqSeg = rendered.find((s) => s.type === 'equation' && s.image);
    if (eqSeg?.image) {
      const base64 = dataUrlToBase64(eqSeg.image);
      const scaleMultiplier = mathScale / 100;
      runs.push(
        new ImageRun({
          data: base64,
          transformation: {
            width: Math.min(Math.round((eqSeg.width || 120) * scaleMultiplier), 480),
            height: Math.min(Math.round((eqSeg.height || 24) * scaleMultiplier), 140),
          },
        })
      );
    } else {
      runs.push(...inlineRunsToDocxRuns(latexToInlineRuns(part.latex), fontSizeHalfPt));
    }
  }
  return runs;
};

export const createRichParagraph = async (text: string): Promise<Paragraph> => new Paragraph({
  children: await parseTextForDocx(text),
  spacing: { after: 60 },
  alignment: AlignmentType.JUSTIFIED,
});

export const createBulletList = async (items: string[]): Promise<Paragraph[]> => {
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

export const createSectionHeading = (title: string): Paragraph => new Paragraph({
  children: [new TextRun({ text: title, bold: true, size: 24, color: "1F4E79" })],
  spacing: { before: 150, after: 60 },
  alignment: AlignmentType.LEFT,
  border: { bottom: { color: "1F4E79", space: 4, style: "single", size: 4 } }
});

export const createHeaderRun = (text: string, bold: boolean = false, size: number = 18): TextRun => new TextRun({
  text, bold, size, font: "Calibri",
});

export const A4_PAGE_WIDTH = 11906;
export const A4_PAGE_HEIGHT = 16838;
// 0.35" top/bottom (504 twips), 0.40" left/right (576 twips)
export const DOCX_PAGE_MARGINS = { top: 504, right: 576, bottom: 504, left: 576 };
export const PDF_A4_WIDTH = 595.28;
export const PDF_A4_HEIGHT = 841.89;
// [left, top, right, bottom] in pt (~0.39" horizontal/bottom, ~0.36" top)
export const PDF_PAGE_MARGINS: [number, number, number, number] = [28, 26, 28, 28];
