/**
 * buildInspector.ts — Builds the actual Word (.docx) and PDF files for an exam
 * paper, extracts real OOXML (word/document.xml + media) and PDF definition /
 * binary PDF bytes, checks PNG pixel & dimension health in both formats,
 * renders visual Word preview pages with embedded equation images, and maps any
 * rendering/layout/script defects back to exact question positions.
 */
import { Packer } from 'docx';
import { GeneratedPaper, TeacherInfo } from '../../types';
import { buildExamPaperDocx, EXAM_DOCX_LAYOUT } from '../export/docxExamPaper';
import { buildExamPaperPdfDefinition } from '../export/pdfExport';
import { ensurePdfMakeLoaded, registerPdfMakeLayouts } from '../export/externalLibs';
import {
  clearEquationRenderFailures,
  getEquationRenderFailures,
  inspectPngDataUrlHealth,
} from '../equationRenderer';
import {
  decodeBase64ToUint8Array,
  DocxParagraphSummary,
  DocxXmlInspection,
  extractDocxEntries,
  inspectDocumentXml,
  parseDocxRels,
  readPngDimensions,
} from './docxZipReader';
import { scanTextQuality } from './paperQualityRules';

declare const pdfMake: any;

export interface BuildQuestionFailureTarget {
  sectionIndex: number;
  questionIndex: number;
  reason: string;
}

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
  failedQuestionTargets: BuildQuestionFailureTarget[];
}

const DOUBLE_Q_NUM_RE = /^Q\d+\.\s*(?:Q\.?\s*\d+[:.)]\s*|\d+\s*(?:\.\s+|\)\s+|:\s+))/i;
const DOUBLE_OPT_PREFIX_RE = /○\s*[a-d]\)\s*(?:[a-dA-D1-4]\s*\)|[a-dA-D1-4]\s*[:.]\s+|\([a-dA-D1-4]\)|○)/i;

function scanRenderedLine(label: string, text: string, subject: string | undefined, out: string[]): void {
  if (!text) return;
  const qualityIssues = scanTextQuality(text, subject);
  for (const issue of qualityIssues) {
    out.push(`${label}: ${issue.message}`);
  }
  if (text.includes('$') && !qualityIssues.some((i) => i.message.includes('"$"'))) {
    out.push(`${label}: Unconverted math delimiter detected ("${text.slice(0, 75)}").`);
  }
  if (DOUBLE_Q_NUM_RE.test(text)) {
    out.push(`${label}: Duplicate question numbering ("${text.slice(0, 50)}").`);
  }
  if (DOUBLE_OPT_PREFIX_RE.test(text)) {
    out.push(`${label}: Duplicate option label ("${text.slice(0, 50)}").`);
  }
}

export function findQuestionLocationForFormula(
  paper: GeneratedPaper,
  formula: string
): { sectionIndex: number; questionIndex: number } | null {
  const needle = formula.replace(/\s+/g, '');
  if (!needle) return null;
  for (let sIdx = 0; sIdx < (paper.sections || []).length; sIdx++) {
    const questions = paper.sections[sIdx]?.questions || [];
    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx];
      const haystacks = [q.question || '', ...(q.options || [])];
      if (haystacks.some((h) => h.replace(/\s+/g, '').includes(needle))) {
        return { sectionIndex: sIdx, questionIndex: qIdx };
      }
    }
  }
  return null;
}

/** Collect text summary + PDF image nodes from a pdfMake docDefinition. */
function collectPdfNodesSummary(
  node: any,
  lines: string[],
  findings: string[],
  subject: string | undefined,
  pdfImages: { base64: string; width?: number }[]
): void {
  if (!node) return;
  if (typeof node === 'string') {
    const clean = node.trim();
    if (clean) {
      scanRenderedLine('PDF', clean, subject, findings);
      lines.push(clean);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectPdfNodesSummary(child, lines, findings, subject, pdfImages);
    return;
  }
  if (typeof node === 'object') {
    if (typeof node.image === 'string') {
      const base64 = node.image.includes(',') ? node.image.split(',')[1] || '' : node.image;
      pdfImages.push({ base64, width: typeof node.width === 'number' ? node.width : undefined });
      lines.push(`[PDF_EQUATION_IMG width:${node.width ?? 'auto'}pt]`);
      return;
    }
    if (Array.isArray(node.columns)) {
      const colTexts: string[] = [];
      for (const col of node.columns) {
        const sub: string[] = [];
        collectPdfNodesSummary(col, sub, findings, subject, pdfImages);
        if (sub.length > 0) colTexts.push(sub.join(' '));
      }
      if (colTexts.length > 0) {
        lines.push(`[COLS w=${node.columns.map((c: any) => c.width ?? '*').join(',')}] ${colTexts.join('   |   ')}`);
      }
      return;
    }
    if (Array.isArray(node.stack)) {
      for (const s of node.stack) collectPdfNodesSummary(s, lines, findings, subject, pdfImages);
      return;
    }
    if (node.text !== undefined) {
      if (typeof node.text === 'string') {
        const clean = node.text.trim();
        if (clean) {
          scanRenderedLine('PDF', clean, subject, findings);
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
          scanRenderedLine('PDF', clean, subject, findings);
          lines.push(clean);
        }
      }
    }
    if (Array.isArray(node.content)) {
      collectPdfNodesSummary(node.content, lines, findings, subject, pdfImages);
    }
  }
}

async function loadMediaImagesForPreview(
  entries: Map<string, Uint8Array>
): Promise<Map<string, HTMLImageElement>> {
  const loaded = new Map<string, HTMLImageElement>();
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return loaded;

  const jobs: Promise<void>[] = [];
  for (const [path, bytes] of entries.entries()) {
    if (!path.startsWith('word/media/') || !/\.(png|jpg|jpeg)$/i.test(path)) continue;
    jobs.push(
      new Promise<void>((resolve) => {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' }));
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          loaded.set(path, img);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        img.src = url;
        setTimeout(() => resolve(), 1500);
      })
    );
  }
  await Promise.all(jobs);
  return loaded;
}

/**
 * Render parsed word/document.xml paragraphs + actual word/media/*.png equations
 * onto A4 JPEGs (browser only) so the multimodal reviewer sees real equations and layout.
 */
async function renderDocxPreviewPages(
  paragraphs: DocxParagraphSummary[],
  entries: Map<string, Uint8Array>
): Promise<string[]> {
  if (typeof document === 'undefined' || paragraphs.length === 0) return [];
  try {
    const mediaImages = await loadMediaImagesForPreview(entries);
    const PAGE_W = 720;
    const PAGE_H = 1018;
    const MARGIN_X = 34;
    const TOP_Y = 34;
    const MAX_Y = PAGE_H - 34;
    const RIGHT_COL_X = MARGIN_X + Math.round((EXAM_DOCX_LAYOUT.RIGHT_COL_TAB_TWIPS / 1440) * 65);
    const MAX_PAGES = 4;

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

    const drawRichSegment = (
      c: CanvasRenderingContext2D,
      segmentText: string,
      p: DocxParagraphSummary,
      startX: number,
      y: number,
      maxWidth: number,
      lineHeight: number
    ): number => {
      const tokens = segmentText.split(/(\[\[IMG:\d+\]\])/g).filter(Boolean);
      let curX = startX;
      let curY = y;
      let maxRowH = lineHeight;

      for (const tok of tokens) {
        const imgMatch = tok.match(/^\[\[IMG:(\d+)\]\]$/);
        if (imgMatch) {
          const ref = p.mediaRefs[Number(imgMatch[1])];
          const img = ref ? mediaImages.get(ref.mediaPath) : undefined;
          const drawW = Math.min(maxWidth, ref?.widthPx || img?.naturalWidth || 40);
          const drawH = ref?.heightPx || img?.naturalHeight || 16;
          if (curX > startX && curX + drawW > startX + maxWidth) {
            curY += maxRowH;
            curX = startX;
            maxRowH = lineHeight;
          }
          if (img) {
            c.drawImage(img, curX, curY - Math.min(lineHeight * 0.85, drawH * 0.75), drawW, drawH);
          } else {
            c.fillText('[EQ]', curX, curY);
          }
          curX += drawW + 4;
          maxRowH = Math.max(maxRowH, drawH + 4);
          continue;
        }

        const words = tok.split(/\s+/).filter(Boolean);
        for (const word of words) {
          const wPx = c.measureText(`${word} `).width;
          if (curX > startX && curX + wPx > startX + maxWidth) {
            curY += maxRowH;
            curX = startX;
            maxRowH = lineHeight;
          }
          c.fillText(word, curX, curY);
          curX += wPx;
        }
      }
      return curY + maxRowH;
    };

    resetPage();
    let y = TOP_Y;

    for (const p of paragraphs) {
      if (y > MAX_Y - 28) {
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
      const bodyText = p.textWithMedia || p.text;

      if (p.alignment === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(p.text.slice(0, 110), PAGE_W / 2, y);
        ctx.textAlign = 'left';
        y += lineHeight + 2;
      } else if (p.hasTabChar && bodyText.includes('[TAB]')) {
        const [leftPart, rightPart] = bodyText.split('[TAB]').map((s) => s.trim());
        const startX = MARGIN_X + indentPx;
        const yLeft = drawRichSegment(ctx, leftPart || '', p, startX, y, Math.max(120, RIGHT_COL_X - startX - 10), lineHeight);
        const yRight = drawRichSegment(ctx, rightPart || '', p, RIGHT_COL_X, y, PAGE_W - MARGIN_X - RIGHT_COL_X, lineHeight);
        y = Math.max(yLeft, yRight) + 2;
      } else {
        const startX = MARGIN_X + indentPx;
        y = drawRichSegment(ctx, bodyText, p, startX, y, PAGE_W - MARGIN_X - startX, lineHeight) + 2;
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
  await ensurePdfMakeLoaded();
  registerPdfMakeLayouts();
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

/** Build BOTH the .docx archive and PDF definition/file, then inspect text & images in both. */
export async function inspectPaperBuilds(
  paper: GeneratedPaper,
  teacherInfo?: TeacherInfo,
  mathScale: number = 85
): Promise<PaperBuildInspection> {
  const buildFindings: string[] = [];
  const failedQuestionTargets: BuildQuestionFailureTarget[] = [];

  clearEquationRenderFailures();

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
      const relsBytes = entries.get('word/_rels/document.xml.rels');
      const relsMap = relsBytes ? parseDocxRels(new TextDecoder('utf-8').decode(relsBytes)) : undefined;
      const mediaFiles = Array.from(entries.keys()).filter((k) => k.startsWith('word/media/'));
      docxInspection = inspectDocumentXml(xmlText, mediaFiles, relsMap);

      for (const para of docxInspection.paragraphs) {
        scanRenderedLine(`Word P${para.index + 1}`, para.text, paper.subject, buildFindings);
      }

      // Inspect every embedded Word media PNG for zero dimensions or solid-black/blank corruption
      for (const mediaPath of mediaFiles) {
        const bytes = entries.get(mediaPath);
        if (!bytes) continue;
        const dims = readPngDimensions(bytes);
        if (!dims || dims.width === 0 || dims.height === 0) {
          buildFindings.push(`Word formula image "${mediaPath}" has invalid dimensions.`);
          continue;
        }
        if (typeof document !== 'undefined') {
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          const checked = await inspectPngDataUrlHealth(btoa(bin));
          if (checked && (checked.health.isSolidDark || checked.health.isBlank)) {
            buildFindings.push(
              `Word formula image "${mediaPath}" rendered as a ${checked.health.isSolidDark ? 'solid black block' : 'blank image'}.`
            );
          }
        }
      }

      if (!docxInspection.pageWidthTwips || !docxInspection.pageHeightTwips) {
        buildFindings.push('Word (.docx) build is missing A4 page dimensions.');
      }
      docxPageImagesBase64 = await renderDocxPreviewPages(docxInspection.paragraphs, entries);
    }
  } catch (docxErr) {
    buildFindings.push(`Word (.docx) build failed: ${docxErr instanceof Error ? docxErr.message : String(docxErr)}`);
  }

  // 2. Build PDF docDefinition + binary PDF (when pdfMake is present)
  let pdfBuilt = false;
  let pdfBase64: string | null = null;
  const pdfLines: string[] = [];
  const pdfImages: { base64: string; width?: number }[] = [];

  try {
    const pdfDef = await buildExamPaperPdfDefinition(paper, teacherInfo, mathScale);
    collectPdfNodesSummary(pdfDef?.content, pdfLines, buildFindings, paper.subject, pdfImages);

    for (let i = 0; i < pdfImages.length; i++) {
      const checked = await inspectPngDataUrlHealth(pdfImages[i].base64);
      if (checked && (checked.health.isSolidDark || checked.health.isBlank)) {
        buildFindings.push(
          `PDF formula image #${i + 1} rendered as a ${checked.health.isSolidDark ? 'solid black block' : 'blank image'}.`
        );
      }
    }

    pdfBuilt = true;
    const binaryBase64 = await generatePdfBase64InBrowser(pdfDef);
    if (binaryBase64) {
      pdfBase64 = binaryBase64;
    }
  } catch (pdfErr) {
    buildFindings.push(`PDF build failed: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
  }

  // 3. Map any rejected equation renders (such as MathJax merror / solid-black SVGs) to question indices
  const eqFailures = getEquationRenderFailures();
  for (const eqFail of eqFailures) {
    const loc = findQuestionLocationForFormula(paper, eqFail.latex);
    const label = loc ? `Section ${loc.sectionIndex + 1} Q${loc.questionIndex + 1}` : 'Formula render';
    const message = `${label}: ${eqFail.reason}`;
    buildFindings.push(message);
    if (loc) {
      failedQuestionTargets.push({
        sectionIndex: loc.sectionIndex,
        questionIndex: loc.questionIndex,
        reason: eqFail.reason,
      });
    }
  }
  clearEquationRenderFailures();

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
    failedQuestionTargets,
  };
}
