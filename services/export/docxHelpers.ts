import {
  AlignmentType,
  ImageRun,
  Paragraph,
  TextRun,
} from 'docx';
import { parseTextWithEquations, dataUrlToBase64 } from '../equationRenderer';

export const formatFileName = (title: string, sloId?: string): string => {
  const baseName = sloId ? `${sloId}_${title}` : title;
  return baseName.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 100);
};

export const parseMarkdownRuns = (text: string): TextRun[] => {
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

export const parseTextForDocx = async (text: string, mathScale: number = 100): Promise<(TextRun | any)[]> => {
  const runs: (TextRun | any)[] = [];
  const baseFontSize = Math.round(14 * (mathScale / 100));
  const segments = await parseTextWithEquations(text, baseFontSize);
  for (const seg of segments) {
    if (seg.type === 'equation' && seg.image) {
      const base64 = dataUrlToBase64(seg.image);
      const scaleMultiplier = mathScale / 100;
      runs.push(new ImageRun({
        data: base64,
        transformation: {
          width: Math.min(Math.round((seg.width || 120) * scaleMultiplier), 480),
          height: Math.min(Math.round((seg.height || 24) * scaleMultiplier), 140),
        },
        type: 'png',
      }));
    } else {
      runs.push(...parseMarkdownRuns(seg.value));
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
export const DOCX_PAGE_MARGINS = { top: 432, right: 1080, bottom: 720, left: 1080 };
export const PDF_A4_WIDTH = 595.28;
export const PDF_A4_HEIGHT = 841.89;
export const PDF_PAGE_MARGINS: [number, number, number, number] = [54, 21.6, 54, 36];
