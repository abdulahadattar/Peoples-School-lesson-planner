/**
 * buildInspector.ts — Builds the actual Word (.docx) and PDF files for an exam
 * paper, extracts real OOXML (word/document.xml + media) and PDF definition /
 * binary PDF bytes, renders lightweight visual Word preview pages in browser,
 * and reports any layout/formatting/leak defects found in either output format.
 */
import { Packer } from 'docx';
import { GeneratedPaper, TeacherInfo } from '../../types';
import { buildExamPaperDocx, EXAM_DOCX_LAYOUT } from '../export/docxExamPaper';
import { buildExamPaperPdfDefinition } from '../export/pdfExport';
import {
  decodeBase64ToUint8Array,
  DocxParagraphSummary,
  DocxXmlInspection,
  extractDocxEntries,
  inspectDocumentXml,
} from './docxZipReader';

declare const pdfMake: any;

export interface PaperBuildInspection {
  docxBuilt: boolean;
  docxBytesLength: number;
  docxMediaCount: number;
  docxParagraphCount: number;
  docxInspection: DocxXmlInspection | null;
  docxPageImagesBase64: string[];
  pdfBuilt: boolean;
  pdfBase64: string | null;
  pdfLayoutDump: string;
  buildFindings: string[];
}

const LEAKED_RENDER_TOKEN_RE = /(?:\$|\\frac\b|\\sqrt\b|\\ce\b|\\alpha\b|\\beta\b|\\times\b|\\rightarrow\b|\\implies\b|\bundefined\b|\bNaN\b|\[object Object\]|&amp;|&lt;|&gt;)/;
const DOUBLE_Q_NUM_RE = /^Q\d+\.\s*(?:Q\.?\s*\d+[:.)]\s*|\d+\s*(?:\.\s+|\)\s+|:\s+))/i;
const DOUBLE_OPT_PREFIX_RE = /○\s*[a-d]\)\s*(?:[a-dA-D1-4]\s*\)|[a-dA-D1-4]\s*[:.]\s+|\([a-dA-D1-4]\)|○)/i;

function scanRenderedLine(label: string, text: string, out: string[]): void {
  if (!text) return;
  if (LEAKED_RENDER_TOKEN_RE.test(text)) {
    out.push(`${label}: Unconverted symbol or raw token detected ("${text.slice(0, 75)}").`);
  }
  if (DOUBLE_Q_NUM_RE.test(text)) {
    out.push(`${label}: Duplicate question numbering ("${text.slice(0, 50)}").`);
  }
  if (DOUBLE_OPT_PREFIX_RE.test(text)) {
    out.push(`${label}: Duplicate option label ("${text.slice(0, 50)}").`);
  }
}

/** Recursively extract human-readable text & structure from a pdfMake docDefinition. */
function collectPdfNodesSummary(node: any, lines: string[], findings: string[]): void {
  if (!node) return;
  if (typeof node === 'string') {
    const clean = node.trim();
    if (clean) {
      scanRenderedLine('PDF', clean, findings);
      lines.push(clean);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectPdfNodesSummary(child, lines, findings);
    return;
  }
  if (typeof node === 'object') {
    if (typeof node.image === 'string') {
      lines.push(`[PDF_EQUATION_IMG width:${node.width ?? 'auto'}pt]`);
      return;
    }
    if (Array.isArray(node.columns)) {
      const colTexts: string[] = [];
      for (const col of node.columns) {
        const sub: string[] = [];
        collectPdfNodesSummary(col, sub, findings);
        if (sub.length > 0) colTexts.push(sub.join(' '));
      }
      if (colTexts.length > 0) {
        const joined = colTexts.join('   |   ');
        lines.push(`[COLS w=${node.columns.map((c: any) => c.width ?? '*').join(',')}] ${joined}`);
      }
      return;
    }
    if (Array.isArray(node.stack)) {
      for (const s of node.stack) collectPdfNodesSummary(s, lines, findings);
      return;
    }
    if (node.text !== undefined) {
      if (typeof node.text === 'string') {
        const clean = node.text.trim();
        if (clean) {
          scanRenderedLine('PDF', clean, findings);
          lines.push(clean);
        }
      } else if (Array.isArray(node.text)) {
        const runText = node.text
          .map((r: any) => {
            if (typeof r === 'string') return r;
            if (r && typeof r.text === 'string') {
              if (r.sup) return `^(${r.text})`;
              if (r.sub) return `_(${r.text})`;
              return r.text;
            }
            return '';
          })
          .join('');
        const clean = runText.trim();
        if (clean) {
          scanRenderedLine('PDF', clean, findings);
          lines.push(clean);
        }
      }
    }
    if (Array.isArray(node.content)) {
      collectPdfNodesSummary(node.content, lines, findings);
    }
  }
}

/**
 * Render parsed word/document.xml paragraphs onto lightweight A4 JPEGs (browser only)
 * so the multimodal AI Auditor can visually inspect the Word layout, alignment,
 * indentation, and 2-column MCQ spacing directly.
 */
function renderDocxPreviewPages(paragraphs: DocxParagraphSummary[]): string[] {
  if (typeof document === 'undefined' || paragraphs.length === 0) return [];
  try {
    const PAGE_W = 720;
    const PAGE_H = 1018;
    const MARGIN_X = 34;
    const TOP_Y = 34;
    const MAX_Y = PAGE_H - 34;
    const RIGHT_COL_X = MARGIN_X + Math.round((EXAM_DOCX_LAYOUT.RIGHT_COL_TAB_TWIPS / 1440) * 65);
    const MAX_PAGES = 2;

    const images: string[] = [];
    let canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    let ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const resetPage = () => {
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, PAGE_W, PAGE_H);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, PAGE_W - 1, PAGE_H - 1);
    };

    const drawWrappedText = (
      c: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      lineHeight: number
    ): number => {
      const words = text.split(/\s+/).filter(Boolean);
      let line = '';
      let curY = y;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (c.measureText(test).width > maxWidth && line) {
          c.fillText(line, x, curY);
          curY += lineHeight;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        c.fillText(line, x, curY);
        curY += lineHeight;
      }
      return curY;
    };

    resetPage();
    let y = TOP_Y;

    for (const p of paragraphs) {
      if (y > MAX_Y - 24) {
        images.push(canvas.toDataURL('image/jpeg', 0.72).split(',')[1] || '');
        if (images.length >= MAX_PAGES) break;
        canvas = document.createElement('canvas');
        canvas.width = PAGE_W;
        canvas.height = PAGE_H;
        ctx = canvas.getContext('2d');
        if (!ctx) break;
        resetPage();
        y = TOP_Y;
      }

      const fontSize = p.alignment === 'center' && p.bold ? 13 : p.bold ? 11.5 : 10.5;
      const lineHeight = fontSize + 4;
      ctx.font = `${p.italic ? 'italic ' : ''}${p.bold ? 'bold ' : ''}${fontSize}px Calibri, Arial, sans-serif`;
      ctx.fillStyle = p.bold && p.text.startsWith('Section') ? '#1F4E79' : '#0F172A';

      const indentPx = p.leftTwips ? Math.round((p.leftTwips / 1440) * 65) : 0;

      if (p.alignment === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(p.text.slice(0, 110), PAGE_W / 2, y);
        ctx.textAlign = 'left';
        y += lineHeight + 2;
      } else if (p.hasTabChar && p.text.includes('[TAB]')) {
        const [leftPart, rightPart] = p.text.split('[TAB]').map((s) => s.trim());
        const startX = MARGIN_X + indentPx;
        const yLeft = drawWrappedText(ctx, leftPart || '', startX, y, Math.max(120, RIGHT_COL_X - startX - 10), lineHeight);
        const yRight = drawWrappedText(ctx, rightPart || '', RIGHT_COL_X, y, PAGE_W - MARGIN_X - RIGHT_COL_X, lineHeight);
        y = Math.max(yLeft, yRight) + 2;
      } else {
        const startX = MARGIN_X + indentPx;
        const label = p.imageCount > 0 && !p.text ? '[EQUATION IMAGE]' : p.text + (p.imageCount > 0 ? ' [EQ]' : '');
        y = drawWrappedText(ctx, label, startX, y, PAGE_W - MARGIN_X - startX, lineHeight) + 2;
      }
    }

    if (images.length < MAX_PAGES && y > TOP_Y) {
      images.push(canvas.toDataURL('image/jpeg', 0.72).split(',')[1] || '');
    }

    return images.filter(Boolean);
  } catch {
    return [];
  }
}

async function generatePdfBase64InBrowser(docDefinition: any): Promise<string | null> {
  if (typeof pdfMake === 'undefined' || typeof pdfMake.createPdf !== 'function') {
    return null;
  }
  return new Promise<string | null>((resolve) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      if (typeof pdfDoc.getBase64 === 'function') {
        pdfDoc.getBase64((base64: string) => resolve(base64 || null));
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

/** Build BOTH the .docx archive and PDF definition/file, then audit both outputs. */
export async function inspectPaperBuilds(
  paper: GeneratedPaper,
  teacherInfo?: TeacherInfo,
  mathScale: number = 85
): Promise<PaperBuildInspection> {
  const buildFindings: string[] = [];

  // 1. Build Word (.docx) + extract real word/document.xml & word/media/*
  let docxBuilt = false;
  let docxBytesLength = 0;
  let docxInspection: DocxXmlInspection | null = null;
  let docxPageImagesBase64: string[] = [];

  try {
    const doc = await buildExamPaperDocx(paper, teacherInfo, mathScale);
    const docxBase64 = await Packer.toBase64String(doc);
    const zipBytes = decodeBase64ToUint8Array(docxBase64);
    docxBytesLength = zipBytes.length;

    const entries = await extractDocxEntries(zipBytes);
    const docXmlBytes = entries.get('word/document.xml');
    if (!docXmlBytes) {
      buildFindings.push('Word (.docx) build is missing word/document.xml.');
    } else {
      docxBuilt = true;
      const xmlText = new TextDecoder('utf-8').decode(docXmlBytes);
      const mediaFiles = Array.from(entries.keys()).filter((k) => k.startsWith('word/media/'));
      docxInspection = inspectDocumentXml(xmlText, mediaFiles);

      for (const para of docxInspection.paragraphs) {
        scanRenderedLine(`Word P${para.index + 1}`, para.text, buildFindings);
      }
      if (!docxInspection.pageWidthTwips || !docxInspection.pageHeightTwips) {
        buildFindings.push('Word (.docx) build is missing A4 page dimensions.');
      }
      docxPageImagesBase64 = renderDocxPreviewPages(docxInspection.paragraphs);
    }
  } catch (docxErr) {
    buildFindings.push(`Word (.docx) build failed: ${docxErr instanceof Error ? docxErr.message : String(docxErr)}`);
  }

  // 2. Build PDF docDefinition + binary PDF (when pdfMake is present)
  let pdfBuilt = false;
  let pdfBase64: string | null = null;
  const pdfLines: string[] = [];

  try {
    const pdfDef = await buildExamPaperPdfDefinition(paper, teacherInfo, mathScale);
    collectPdfNodesSummary(pdfDef?.content, pdfLines, buildFindings);
    pdfBuilt = true;

    const binaryBase64 = await generatePdfBase64InBrowser(pdfDef);
    if (binaryBase64) {
      pdfBase64 = binaryBase64;
    }
  } catch (pdfErr) {
    buildFindings.push(`PDF build failed: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
  }

  return {
    docxBuilt,
    docxBytesLength,
    docxMediaCount: docxInspection?.mediaFiles.length ?? 0,
    docxParagraphCount: docxInspection?.paragraphs.length ?? 0,
    docxInspection,
    docxPageImagesBase64,
    pdfBuilt,
    pdfBase64,
    pdfLayoutDump: pdfLines.join('\n'),
    buildFindings: Array.from(new Set(buildFindings)),
  };
}
