import { normalizeGrKey } from '../../services/identityNormalization';
import { normalizeGradeLevel } from '../../services/marksheet/calculations';
import type { MarksheetGradeLevel } from '../../services/marksheet/types';
import { clampClassroomMcqCount } from '../../services/omr/classroomRanking';
import { listScannedResultsByTest } from '../../services/omr/scanResultsStore';
import { renderSyntheticOmrImageData } from '../../services/omr/syntheticSheet';
import { OmrTestRecord } from '../../services/omr/testRegistry';
import {
  normalizeAnswerKeyString,
  OmrDetectedMark,
  OmrScanResult,
} from '../../services/omr/types';
import type { StudentRecord } from '../../services/sheets/types';

export interface OmrImageBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function decodeFileToImageBuffer(file: File): Promise<OmrImageBuffer | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imgEl = new Image();
      imgEl.onload = () => {
        const maxDim = 1500;
        const scale = Math.min(1, maxDim / Math.max(imgEl.width, imgEl.height));
        const w = Math.max(64, Math.round(imgEl.width * scale));
        const h = Math.max(64, Math.round(imgEl.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(imgEl, 0, 0, w, h);
        const frame = ctx.getImageData(0, 0, w, h);
        resolve({
          data: new Uint8ClampedArray(frame.data),
          width: frame.width,
          height: frame.height,
        });
      };
      imgEl.onerror = () => resolve(null);
      imgEl.src = String(reader.result || '');
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function computeScanStats(
  scanResult: OmrScanResult | null,
  effectiveAnswers: OmrDetectedMark[],
  overrideKey?: string | null
) {
  if (!scanResult) {
    return { score: 0, total: 0, correctCount: 0, wrongCount: 0, blankCount: 0, multiCount: 0 };
  }
  const key = overrideKey || scanResult.qrPayload.key;
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let multiCount = 0;

  effectiveAnswers.forEach((mark, idx) => {
    if (mark === 'BLANK') blankCount++;
    else if (mark === 'MULTI') multiCount++;
    else if (mark === key[idx]) {
      score++;
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  return {
    score,
    total: scanResult.total,
    correctCount,
    wrongCount,
    blankCount,
    multiCount,
  };
}

export function buildSampleOmrFrame(params: {
  activeReg: OmrTestRecord | undefined;
  gradeLevel: MarksheetGradeLevel;
  roster: StudentRecord[];
}): OmrImageBuffer {
  const { activeReg, gradeLevel, roster } = params;
  const targetGrade = normalizeGradeLevel(activeReg?.classLevel) || gradeLevel;
  const targetSubject = activeReg?.subject || 'Physics';
  const targetCount = clampClassroomMcqCount(activeReg?.questionCount || 30);
  const targetFreq = activeReg?.testFrequency === 'monthly' ? 'monthly' : 'weekly';
  const pid = activeReg?.testCode || `sample_${targetGrade.toLowerCase()}_phy_w01`;
  const key = normalizeAnswerKeyString(
    activeReg?.answerKey || 'ABCDABCDABCDABCDABCDABCDABCDAB',
    targetCount
  );

  const existingRows = listScannedResultsByTest(pid).map((r) => normalizeGrKey(r.grNo));
  const classStudents = roster.filter(
    (r) =>
      normalizeGradeLevel(r.currentClass) === targetGrade &&
      !(r.status || '').toLowerCase().includes('drop') &&
      !(r.status || '').toLowerCase().includes('left')
  );
  const nextUnscanned = classStudents.find(
    (s) => !existingRows.includes(normalizeGrKey(s.grNo))
  );
  const sampleGr = nextUnscanned?.grNo || String(1040 + existingRows.length + 1);

  // Vary realistic student score per scan so competition ranking demonstrates clearly
  const variant = existingRows.length % 3;
  const answers = key.split('').map((ltr, idx) => {
    const cIdx = 'ABCD'.indexOf(ltr);
    if (idx === 2) return []; // BLANK flag
    if (idx === 11 && targetCount >= 12) return [0, 2]; // MULTI flag
    if (variant === 0 && (idx === 5 || idx === 15)) return [(cIdx + 1) % 4];
    if (variant === 1 && (idx === 5 || idx === 15 || idx === 19 || idx === 22)) {
      return [(cIdx + 1) % 4];
    }
    return [cIdx];
  });

  return renderSyntheticOmrImageData({
    payload: {
      v: 1,
      pid,
      cls: targetGrade,
      sub: targetSubject,
      n: targetCount,
      key,
      gr: sampleGr,
      tf: targetFreq,
      ttl: activeReg?.title || `Sample ${targetGrade} ${targetSubject} Weekly Test`,
    },
    answers,
    tiltDeg: 4,
    perspectiveSkew: 0.02,
    brightnessGradient: 0.2,
  });
}
