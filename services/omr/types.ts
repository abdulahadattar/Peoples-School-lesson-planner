import type { MarksheetExamType } from '../marksheet/types';

export type ClassroomTestFrequency = 'weekly' | 'monthly';

export type OmrAnswerLetter = 'A' | 'B' | 'C' | 'D';
export type OmrDetectedMark = OmrAnswerLetter | 'BLANK' | 'MULTI';

export const OMR_ANSWER_LETTERS: readonly OmrAnswerLetter[] = ['A', 'B', 'C', 'D'];

export interface Point2D {
  x: number;
  y: number;
}

export interface OmrQrPayload {
  v: 1;
  pid: string;
  cls: string;
  sub: string;
  n: number;
  key: string;
  gr?: string;
  tf?: ClassroomTestFrequency;
  ex?: MarksheetExamType;
  ttl?: string;
}

export interface OmrFiducialMarker {
  id: 'tl' | 'tr' | 'bl' | 'br';
  cxMm: number;
  cyMm: number;
  sizeMm: number;
}

export interface OmrBubbleCoord {
  questionIndex: number; // 0-based
  optionIndex: number; // 0..3
  option: OmrAnswerLetter;
  cxMm: number;
  cyMm: number;
  radiusMm: number;
}

export interface OmrGrBubbleCoord {
  digitIndex: number; // 0..3 (left to right)
  digit: number; // 0..9
  cxMm: number;
  cyMm: number;
  radiusMm: number;
}

export interface OmrGridGeometry {
  pageWidthMm: 210;
  pageHeightMm: 297;
  hasGrGrid: boolean;
  questionCount: number;
  columns: number;
  rowsPerColumn: number;
  fiducials: {
    tl: OmrFiducialMarker;
    tr: OmrFiducialMarker;
    bl: OmrFiducialMarker;
    br: OmrFiducialMarker;
  };
  qrBox: {
    xMm: number;
    yMm: number;
    sizeMm: number;
  };
  grGrid: {
    enabled: boolean;
    digits: number;
    boxMm: { xMm: number; yMm: number; wMm: number; hMm: number };
    bubbles: OmrGrBubbleCoord[];
  };
  columnHeaders: Array<{
    columnIndex: number;
    xStartMm: number;
    yMm: number;
    optionXsMm: number[];
  }>;
  bubbles: OmrBubbleCoord[];
}

export interface OmrBubbleDetection {
  questionIndex: number;
  optionIndex: number;
  option: OmrAnswerLetter;
  px: number;
  py: number;
  radiusPx: number;
  darkness: number;
  filled: boolean;
}

export interface OmrScanResult {
  grNumber: string;
  studentName?: string;
  fatherName?: string;
  classLevel?: string;
  rawAnswers: OmrDetectedMark[];
  score: number;
  total: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  multiCount: number;
  confidenceMap: number[];
  flaggedQuestions: number[]; // 1-based question numbers
  qrPayload: OmrQrPayload;
  fiducialsDetected: boolean;
  fiducialPointsPx?: {
    tl: Point2D;
    tr: Point2D;
    bl: Point2D;
    br: Point2D;
  };
  qrCornersPx?: {
    tl: Point2D;
    tr: Point2D;
    bl: Point2D;
    br: Point2D;
  };
  bubbleDetections: OmrBubbleDetection[];
}

export interface OmrStudentPrintTarget {
  grNo: string;
  studentName: string;
  fatherName?: string;
  currentClass?: string;
  section?: string;
}

export function normalizeAnswerKeyString(rawKey: string, questionCount: number): string {
  const cleaned = String(rawKey || '')
    .toUpperCase()
    .replace(/[^A-D]/g, '');
  if (questionCount <= 0) return '';
  let out = cleaned.slice(0, questionCount);
  while (out.length < questionCount) {
    out += 'A';
  }
  return out;
}

function cleanField(raw: string | undefined, maxLen: number): string {
  return String(raw || '')
    .replace(/\|/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function encodeOmrQrPayload(payload: OmrQrPayload): string {
  const n = Math.max(1, Math.min(100, Math.round(Number(payload.n) || 1)));
  const pid = cleanField(payload.pid || 'paper', 48) || 'paper';
  const cls = cleanField(payload.cls || 'IX', 24) || 'IX';
  const sub = cleanField(payload.sub || 'general', 32) || 'general';
  const key = normalizeAnswerKeyString(payload.key, n);
  const gr = cleanField(payload.gr, 20);
  const tag =
    payload.tf === 'weekly' || payload.tf === 'monthly'
      ? payload.tf
      : payload.ex === 'midterm' || payload.ex === 'mock' || payload.ex === 'preboard'
        ? payload.ex
        : '';
  const ttl = cleanField(payload.ttl, 24);
  return ['PH1', pid, cls, sub, String(n), key, gr, tag, ttl].join('|');
}

export function decodeOmrQrPayload(raw: string): OmrQrPayload | null {
  try {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('PH1|')) {
      const parts = trimmed.split('|');
      if (parts.length < 6) return null;
      const [, pid, cls, sub, nRaw, keyRaw, grRaw = '', tagRaw = '', ttlRaw = ''] = parts;
      const n = Number(nRaw);
      if (!Number.isInteger(n) || n < 1 || n > 100) return null;
      if (!pid || !cls || !sub || !keyRaw) return null;
      const tf = tagRaw === 'weekly' || tagRaw === 'monthly' ? tagRaw : undefined;
      const ex =
        tagRaw === 'midterm' || tagRaw === 'mock' || tagRaw === 'preboard' ? tagRaw : undefined;
      return {
        v: 1,
        pid,
        cls,
        sub,
        n,
        key: normalizeAnswerKeyString(keyRaw, n),
        ...(grRaw.trim() ? { gr: grRaw.trim() } : {}),
        ...(tf ? { tf } : {}),
        ...(ex ? { ex } : {}),
        ...(ttlRaw.trim() ? { ttl: ttlRaw.trim() } : {}),
      };
    }

    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== 1) return null;
    const n = Number(parsed.n);
    if (!Number.isInteger(n) || n < 1 || n > 100) return null;
    if (typeof parsed.pid !== 'string' || !parsed.pid) return null;
    if (typeof parsed.cls !== 'string' || !parsed.cls) return null;
    if (typeof parsed.sub !== 'string' || !parsed.sub) return null;
    if (typeof parsed.key !== 'string' || parsed.key.length < 1) return null;

    const tf = parsed.tf === 'weekly' || parsed.tf === 'monthly' ? parsed.tf : undefined;
    const ex =
      parsed.ex === 'midterm' || parsed.ex === 'mock' || parsed.ex === 'preboard'
        ? parsed.ex
        : undefined;

    return {
      v: 1,
      pid: parsed.pid,
      cls: parsed.cls,
      sub: parsed.sub,
      n,
      key: normalizeAnswerKeyString(parsed.key, n),
      ...(typeof parsed.gr === 'string' && parsed.gr.trim() ? { gr: parsed.gr.trim() } : {}),
      ...(tf ? { tf } : {}),
      ...(ex ? { ex } : {}),
      ...(typeof parsed.ttl === 'string' && parsed.ttl.trim() ? { ttl: parsed.ttl.trim() } : {}),
    };
  } catch {
    return null;
  }
}
