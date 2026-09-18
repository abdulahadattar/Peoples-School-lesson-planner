import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { ZipArchive, Archiver } from 'archiver';
import { PDFDocument } from 'pdf-lib';
import { cleanAndParseJson } from './jsonHelpers';
import {
  StudentDocumentRecord,
  StudentDossier,
  BatchProcessingJob,
  ExtractedStudentInfo,
  DocumentDiscrepancy,
  DocumentClassificationType,
  DocumentBundle,
  JobLogEntry,
  JobFileItem,
} from '../types/documentArchive';

const DATA_DIR = path.join(process.cwd(), 'data', 'student_documents');
const JOBS_FILE = path.join(process.cwd(), 'data', 'document_jobs.json');
const DOSSIERS_FILE = path.join(process.cwd(), 'data', 'student_dossiers.json');
const DOCUMENTS_FILE = path.join(process.cwd(), 'data', 'student_documents_meta.json');
const BUNDLES_FILE = path.join(process.cwd(), 'data', 'document_bundles.json');
const DISMISSED_FLAGS_FILE = path.join(process.cwd(), 'data', 'dismissed_flags.json');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory caches persisted to JSON files
let jobsStore: Record<string, BatchProcessingJob> = {};
let dossiersStore: Record<string, StudentDossier> = {};
let documentsStore: Record<string, StudentDocumentRecord> = {};
let bundlesStore: Record<string, DocumentBundle> = {};
let dismissedFlagsStore: Record<string, boolean> = {};

// In-memory reference to live Google Sheet records
let globalCachedSheetRecords: any[] = [];

export function setCachedSheetRecords(records: any[]) {
  if (Array.isArray(records)) {
    globalCachedSheetRecords = records;
  }
}

export function getCachedSheetRecords(): any[] {
  return globalCachedSheetRecords;
}

// Load persisted state if exists
try {
  if (fs.existsSync(JOBS_FILE)) {
    jobsStore = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
  }
  if (fs.existsSync(DOSSIERS_FILE)) {
    dossiersStore = JSON.parse(fs.readFileSync(DOSSIERS_FILE, 'utf-8'));
  }
  if (fs.existsSync(DOCUMENTS_FILE)) {
    documentsStore = JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf-8'));
  }
  if (fs.existsSync(BUNDLES_FILE)) {
    bundlesStore = JSON.parse(fs.readFileSync(BUNDLES_FILE, 'utf-8'));
  }
  if (fs.existsSync(DISMISSED_FLAGS_FILE)) {
    dismissedFlagsStore = JSON.parse(fs.readFileSync(DISMISSED_FLAGS_FILE, 'utf-8'));
  }

  // Purge any existing IGNORED_NOISE or CamScanner watermark documents from storage
  let cleanedAny = false;
  for (const [id, doc] of Object.entries(documentsStore)) {
    if (doc.classification === 'IGNORED_NOISE' || doc.filename.includes('CS') || doc.originalFilename?.toLowerCase().includes('camscanner')) {
      delete documentsStore[id];
      cleanedAny = true;
    }
  }
  for (const dossier of Object.values(dossiersStore)) {
    const beforeLen = dossier.documents.length;
    dossier.documents = dossier.documents.filter(
      (d) => d.classification !== 'IGNORED_NOISE' && !d.filename.includes('CS') && !d.originalFilename?.toLowerCase().includes('camscanner')
    );
    if (dossier.documents.length !== beforeLen) {
      cleanedAny = true;
    }
  }
  if (cleanedAny) {
    fs.writeFileSync(DOSSIERS_FILE, JSON.stringify(dossiersStore, null, 2));
    fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documentsStore, null, 2));
    console.log('[documentArchiveService] Purged legacy CamScanner / IGNORED_NOISE documents from storage.');
  }
} catch (e) {
  console.warn('[documentArchiveService] Failed loading local files, initializing clean stores:', e);
}

function saveStores() {
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobsStore, null, 2));
    fs.writeFileSync(DOSSIERS_FILE, JSON.stringify(dossiersStore, null, 2));
    fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documentsStore, null, 2));
    fs.writeFileSync(BUNDLES_FILE, JSON.stringify(bundlesStore, null, 2));
    fs.writeFileSync(DISMISSED_FLAGS_FILE, JSON.stringify(dismissedFlagsStore, null, 2));
  } catch (err) {
    console.error('[documentArchiveService] Error saving stores to disk:', err);
  }
}

/**
 * Add a transparent diagnostic log entry to a background job
 */
export function addJobLog(
  jobId: string,
  level: 'info' | 'warn' | 'error' | 'success',
  stage: 'UPLOAD' | 'PDF_EXTRACT' | 'IMAGE_OPTIMIZE' | 'AI_VISION' | 'NADRA_PARSE' | 'DOSSIER_SYNC' | 'COMPLETE' | 'ERROR',
  message: string,
  meta?: {
    filename?: string;
    grNo?: string;
    details?: string;
    executionTimeMs?: number;
  }
): JobLogEntry | null {
  const job = jobsStore[jobId];
  if (!job) return null;
  if (!job.logs) job.logs = [];

  const entry: JobLogEntry = {
    id: crypto.randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    level,
    stage,
    filename: meta?.filename,
    grNo: meta?.grNo,
    message,
    details: meta?.details,
    executionTimeMs: meta?.executionTimeMs,
  };

  // Keep up to 300 detailed logs per job
  if (job.logs.length >= 300) {
    job.logs.shift();
  }
  job.logs.push(entry);
  saveStores();
  return entry;
}

/**
 * Update or register a file's detailed progress inside a job
 */
export function updateJobFileItem(
  jobId: string,
  filename: string,
  grNo: string,
  update: Partial<JobFileItem>
): JobFileItem | null {
  const job = jobsStore[jobId];
  if (!job) return null;
  if (!job.files) job.files = [];

  let fileItem = job.files.find((f) => f.originalFilename === filename && f.grNo === grNo);
  if (!fileItem) {
    fileItem = {
      id: crypto.randomUUID().slice(0, 8),
      originalFilename: filename,
      grNo,
      fileSizeBytes: 0,
      stage: 'queued',
      status: 'pending',
      progressPercent: 0,
      ...update,
    };
    job.files.push(fileItem);
  } else {
    Object.assign(fileItem, update);
  }
  saveStores();
  return fileItem;
}

// Queue for sequential background processing
export interface QueueItem {
  id: string;
  jobId: string;
  grNo: string;
  originalFilename: string;
  sourceBuffer: Buffer;
  mimeType: string;
  bundleId?: string;
  sourceFilename?: string;
  pageNumber?: number;
  totalPages?: number;
}

const processingQueue: QueueItem[] = [];
let isQueueRunning = false;

/**
 * Standardize Pakistani NADRA 13-digit numbers to XXXXX-XXXXXXX-X
 */
export function normalizeNadraNumber(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 12)}-${cleaned.slice(12)}`;
  }
  return raw.trim();
}

/**
 * Format string to Title Case in English
 */
export function toEnglishTitleCase(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract GR Number from folder path or filename (e.g., "GR_1042", "GR 1042", "1042")
 */
export function extractGrFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  for (const part of parts) {
    const match = part.match(/(?:GR|G\.R|G_R)[\s_-]*(\d{2,6})/i);
    if (match) return match[1];
    if (/^\d{3,6}$/.test(part.trim())) {
      return part.trim();
    }
  }
  const fileMatch = path.basename(filePath).match(/(?:GR|G\.R)[\s_-]*(\d{2,6})/i);
  if (fileMatch) return fileMatch[1];
  return 'UNASSIGNED';
}

/**
 * Pakistani / Sindh Name Normalizer:
 * Removes titles, standardizes prefixes, and normalizes common phonetic transliteration variants.
 */
export function normalizePakistaniName(name?: string): string {
  if (!name) return '';
  let clean = name.toLowerCase().trim();

  // Strip common honorifics and titles
  clean = clean.replace(/\b(syed|syyed|sayed|hafiz|hafeez|mst|mst\.|bibi|miss|master|mr|mrs|dr|al-haj|haji)\b/gi, ' ');

  // Standardize common Pakistani / Muslim prefixes
  clean = clean.replace(/\b(muhammad|mohammad|mohammed|mohd|md|md\.|m\.)\b/gi, 'muhammad');

  // Normalize common Sindh / Pakistani surname and phonetic variations
  const replacements: Array<[RegExp, string]> = [
    [/\bahmad\b/g, 'ahmed'],
    [/\brahman\b/g, 'rehman'],
    [/\b(husain|hussan|hasan|hassan)\b/g, 'hussain'],
    [/\baly\b/g, 'ali'],
    [/\btarique\b/g, 'tariq'],
    [/\bfarooque\b/g, 'farooq'],
    [/\b(shoib|shuaib)\b/g, 'shoaib'],
    [/\bbarohi\b/g, 'brohi'],
    [/\bchannar\b/g, 'channa'],
    [/\blashary\b/g, 'lashari'],
    [/\brindo\b/g, 'rind'],
    [/\bpanwhar\b/g, 'panhwar'],
    [/\bsumro\b/g, 'soomro'],
    [/\bchandeo\b/g, 'chandio'],
    [/\bsial\b/g, 'siyal'],
    [/\bmagasi\b/g, 'magsi'],
    [/\bbhati\b/g, 'bhatti'],
    [/\bsolangy\b/g, 'solangi'],
    [/\bmalah\b/g, 'mallah'],
    [/\bzardary\b/g, 'zardari'],
    [/\bkhosa\b/g, 'khoso'],
    [/\bjatoy\b/g, 'jatoi'],
    [/\bsarwer\b/g, 'sarwar'],
    [/\bnadim\b/g, 'nadeem'],
    [/\bshahh\b/g, 'shah'],
  ];

  for (const [pattern, rep] of replacements) {
    clean = clean.replace(pattern, rep);
  }

  return clean.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Fuzzy Name Similarity: combines Levenshtein and token overlap (0.0 to 1.0)
 */
export function calculateNameSimilarity(
  nameA?: string,
  nameB?: string
): { similarity: number; tokenMatch: boolean; details: string } {
  if (!nameA || !nameB) return { similarity: 0, tokenMatch: false, details: 'Empty name' };

  const rawA = nameA.toLowerCase().trim();
  const rawB = nameB.toLowerCase().trim();
  if (rawA === rawB) return { similarity: 1.0, tokenMatch: true, details: 'Exact match' };

  const normA = normalizePakistaniName(nameA);
  const normB = normalizePakistaniName(nameB);
  if (normA === normB && normA.length > 0) {
    return { similarity: 0.98, tokenMatch: true, details: 'Normalized match' };
  }

  const tokensA = normA.split(' ').filter((t) => t.length > 1);
  const tokensB = normB.split(' ').filter((t) => t.length > 1);

  // Token containment check (e.g. "Abdul Ahad" inside "Abdul Ahad Memon")
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = tokensA.filter((t) => setB.has(t));
  const union = new Set([...tokensA, ...tokensB]);

  const jaccard = union.size > 0 ? intersection.length / union.size : 0;
  const isSubset = tokensA.every((t) => setB.has(t)) || tokensB.every((t) => setA.has(t));

  // Levenshtein character distance
  const charSim = calculateStringSimilarity(normA, normB);

  // If one name is a subset of the other (e.g. "Ali Raza" vs "Syed Ali Raza Shah"), give high score
  let finalSim = 0;
  if (isSubset && intersection.length >= 1) {
    finalSim = Math.max(0.85, (intersection.length / Math.min(tokensA.length, tokensB.length)) * 0.95);
  } else {
    finalSim = Math.max(charSim, jaccard * 0.7 + charSim * 0.3);
  }

  return {
    similarity: Number(finalSim.toFixed(2)),
    tokenMatch: intersection.length > 0,
    details: `Tokens: ${intersection.join(', ') || 'none'} | Sim: ${Math.round(finalSim * 100)}%`,
  };
}

/**
 * Standard Levenshtein string similarity (0.0 to 1.0)
 */
export function calculateStringSimilarity(str1?: string, str2?: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;

  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
  }

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  const distance = track[s2.length][s1.length];
  const maxLen = Math.max(s1.length, s2.length);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Error-tolerant 13-digit NADRA B-Form and CNIC comparison:
 * Handles exact matches, 1-2 digit OCR typos (0/8, 1/7, 6/5, etc.), and matching serial numbers.
 */
export function compareNadraNumberWithOcrTolerance(
  numA?: string,
  numB?: string
): { score: number; exact: boolean; diffCount: number; reason: string } {
  if (!numA || !numB) return { score: 0, exact: false, diffCount: 99, reason: 'Empty NADRA value' };

  const dA = numA.replace(/\D/g, '');
  const dB = numB.replace(/\D/g, '');

  if (!dA || !dB) return { score: 0, exact: false, diffCount: 99, reason: 'No digits' };

  if (dA === dB && dA.length === 13) {
    return { score: 1.0, exact: true, diffCount: 0, reason: 'Exact 13-digit match' };
  }

  if (dA.length === 13 && dB.length === 13) {
    // Hamming distance (differing positions)
    let diffs = 0;
    for (let i = 0; i < 13; i++) {
      if (dA[i] !== dB[i]) diffs++;
    }

    if (diffs === 1) {
      return {
        score: 0.90,
        exact: false,
        diffCount: 1,
        reason: '12 of 13 digits matched (1-digit OCR variance)',
      };
    }
    if (diffs === 2) {
      return {
        score: 0.70,
        exact: false,
        diffCount: 2,
        reason: '11 of 13 digits matched (2-digit OCR variance)',
      };
    }

    // Check if the unique personal 7-digit serial number matches (middle digits 5-12)
    const serialA = dA.slice(5, 12);
    const serialB = dB.slice(5, 12);
    if (serialA === serialB && serialA.length === 7) {
      return {
        score: 0.88,
        exact: false,
        diffCount: diffs,
        reason: 'NADRA 7-digit serial block matched',
      };
    }
  }

  // Handle missed or extra digit during OCR (12 vs 13 digits)
  if (Math.abs(dA.length - dB.length) <= 1 && (dA.length >= 11 || dB.length >= 11)) {
    const sim = calculateStringSimilarity(dA, dB);
    if (sim >= 0.85) {
      return {
        score: 0.80,
        exact: false,
        diffCount: 1,
        reason: `High digit sequence overlap (${Math.round(sim * 100)}%)`,
      };
    }
  }

  return { score: 0, exact: false, diffCount: 99, reason: 'Mismatch' };
}

/**
 * Error-tolerant Date of Birth comparison:
 * Handles DD-MM-YYYY, YYYY-MM-DD, day/month swaps, and 1-digit OCR errors.
 */
export function compareDobWithTolerance(
  dobA?: string,
  dobB?: string
): { score: number; matchType: string; matched: boolean } {
  if (!dobA || !dobB) return { score: 0, matchType: 'Empty', matched: false };

  const parseDobParts = (raw: string): { day?: number; month?: number; year?: number } => {
    const clean = raw.trim().replace(/[./\\]/g, '-');
    const parts = clean.split('-').map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));

    if (parts.length === 3) {
      // If first part is 4 digits -> YYYY-MM-DD
      if (parts[0] > 1900 && parts[0] < 2050) {
        return { year: parts[0], month: parts[1], day: parts[2] };
      }
      // Else -> DD-MM-YYYY or MM-DD-YYYY
      if (parts[2] > 1900 && parts[2] < 2050) {
        return { day: parts[0], month: parts[1], year: parts[2] };
      }
    }
    return {};
  };

  const pA = parseDobParts(dobA);
  const pB = parseDobParts(dobB);

  if (pA.year && pB.year) {
    if (pA.year === pB.year && pA.month === pB.month && pA.day === pB.day) {
      return { score: 1.0, matchType: 'Exact Date of Birth', matched: true };
    }

    // Swapped day and month (e.g. 05-08 vs 08-05)
    if (pA.year === pB.year && pA.month === pB.day && pA.day === pB.month) {
      return { score: 0.92, matchType: 'Swapped Day/Month Format', matched: true };
    }

    // Year and Month match, day differs slightly (OCR misread like 12 vs 17 or 01 vs 10)
    if (pA.year === pB.year && pA.month === pB.month) {
      return { score: 0.85, matchType: 'Year & Month Match', matched: true };
    }

    // Year matches and either day or month matches
    if (pA.year === pB.year && (pA.month === pB.month || pA.day === pB.day)) {
      return { score: 0.75, matchType: 'Year & Partial Date Match', matched: true };
    }

    // Day & Month match, year differs by 1 (e.g. 2008 vs 2009)
    if (Math.abs(pA.year - pB.year) === 1 && pA.month === pB.month && pA.day === pB.day) {
      return { score: 0.80, matchType: 'Day & Month Match (+/-1 year)', matched: true };
    }

    // Only birth year matches
    if (pA.year === pB.year) {
      return { score: 0.50, matchType: 'Birth Year Match', matched: true };
    }
  }

  // Raw string digit similarity
  const digitsA = dobA.replace(/\D/g, '');
  const digitsB = dobB.replace(/\D/g, '');
  if (digitsA && digitsB && digitsA === digitsB) {
    return { score: 0.95, matchType: 'Digit sequence match', matched: true };
  }

  return { score: 0, matchType: 'Mismatch', matched: false };
}

/**
 * Aggregated Multi-Factor Error-Tolerant Student Record Matcher:
 * Combines evidence across all documents (B-Form, Father CNIC, Student Name, Father Name, DOB, GR)
 * to locate the student's record with high confidence.
 */
export function matchAggregatedProfileToStudentRecords(
  ext: ExtractedStudentInfo,
  records: any[]
): {
  student: any;
  matchScore: number;
  matchReason: string;
  evidence: string[];
} | null {
  if (!records || records.length === 0 || !ext) return null;

  let bestCandidate: any = null;
  let highestScore = 0;
  let bestEvidence: string[] = [];
  let bestReason = '';

  const extStudentName = ext.studentName || '';
  const extFatherName = ext.fatherName || '';
  const extBForm = ext.bFormNo || '';
  const extCnic = ext.fatherCnic || '';
  const extDob = ext.dob || '';
  const extGr = (ext.grNo || '').trim();

  for (const r of records) {
    const sheetGr = String(r.grNo || r['G.R.NO'] || '').trim();
    const sheetStudentName = r.studentName || r['STUDENTNAME'] || '';
    const sheetFatherName = r.fatherName || r['FATHERNAME'] || '';
    const sheetBForm = r.bFormNo || r['B.FORMNO'] || '';
    const sheetCnic = r.parentCnic || r['PARENT/GUARDIANCNICNO'] || '';
    const sheetDob = (r.dobDay && r.dobMonth && r.dobYear)
      ? `${r.dobDay}/${r.dobMonth}/${r.dobYear}`
      : (r.dob || r['DATEOFBIRTH'] || '');
    const sheetClass = r.currentClass || r['CURRENTCLASS'] || '';

    let totalPoints = 0;
    const evidenceList: string[] = [];

    // 1. Explicit GR Number Match (+45 pts)
    if (extGr && extGr !== 'UNASSIGNED' && extGr === sheetGr) {
      totalPoints += 45;
      evidenceList.push(`Direct GR #${sheetGr} Match`);
    }

    // 2. B-Form / CRC Match (+45 max pts)
    if (extBForm && sheetBForm) {
      const bComp = compareNadraNumberWithOcrTolerance(extBForm, sheetBForm);
      if (bComp.score > 0) {
        const pts = Math.round(bComp.score * 45);
        totalPoints += pts;
        evidenceList.push(`B-Form ${Math.round(bComp.score * 100)}% (${bComp.reason})`);
      }
    }

    // 3. Parent CNIC Match (+35 max pts)
    if (extCnic && sheetCnic) {
      const cComp = compareNadraNumberWithOcrTolerance(extCnic, sheetCnic);
      if (cComp.score > 0) {
        const pts = Math.round(cComp.score * 35);
        totalPoints += pts;
        evidenceList.push(`Parent CNIC ${Math.round(cComp.score * 100)}% (${cComp.reason})`);
      }
    }

    // 4. Student Name Match (+35 max pts)
    if (extStudentName && sheetStudentName) {
      const nameComp = calculateNameSimilarity(extStudentName, sheetStudentName);
      if (nameComp.similarity >= 0.40) {
        const pts = Math.round(nameComp.similarity * 35);
        totalPoints += pts;
        evidenceList.push(`Student Name ${Math.round(nameComp.similarity * 100)}% ("${extStudentName}" ~ "${sheetStudentName}")`);
      }
    }

    // 5. Father Name Match (+25 max pts)
    if (extFatherName && sheetFatherName) {
      const fComp = calculateNameSimilarity(extFatherName, sheetFatherName);
      if (fComp.similarity >= 0.40) {
        const pts = Math.round(fComp.similarity * 25);
        totalPoints += pts;
        evidenceList.push(`Father Name ${Math.round(fComp.similarity * 100)}% ("${extFatherName}" ~ "${sheetFatherName}")`);
      }
    }

    // 6. Date of Birth Match (+20 max pts)
    if (extDob && sheetDob) {
      const dobComp = compareDobWithTolerance(extDob, sheetDob);
      if (dobComp.matched && dobComp.score > 0) {
        const pts = Math.round(dobComp.score * 20);
        totalPoints += pts;
        evidenceList.push(`DOB Match (${dobComp.matchType}: "${extDob}" vs "${sheetDob}")`);
      }
    }

    // 7. Class Admitted Match (+10 max pts)
    if (ext.classAdmitted && sheetClass) {
      const c1 = ext.classAdmitted.toLowerCase().replace(/[^a-z0-9]/g, '');
      const c2 = sheetClass.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (c1 === c2 || c1.includes(c2) || c2.includes(c1)) {
        totalPoints += 10;
        evidenceList.push(`Class Match (${sheetClass})`);
      }
    }

    // Determine candidate eligibility
    if (totalPoints > highestScore) {
      highestScore = totalPoints;
      bestCandidate = r;
      bestEvidence = evidenceList;
      bestReason = evidenceList.join(' + ');
    }
  }

  // Thresholds:
  // - >= 45 points (e.g. Exact B-Form, or Exact CNIC + Student Name, or Student Name + Father Name + DOB)
  if (bestCandidate && highestScore >= 40) {
    const normScore = Math.min(1.0, Number((highestScore / 100).toFixed(2)));
    return {
      student: bestCandidate,
      matchScore: normScore,
      matchReason: `Matched GR #${bestCandidate.grNo || bestCandidate['G.R.NO']}: ${bestReason}`,
      evidence: bestEvidence,
    };
  }

  return null;
}

/**
 * Backward compatible document matcher (delegates to multi-factor engine)
 */
export function matchDocumentToStudentRecords(
  doc: StudentDocumentRecord,
  records: any[]
): { student: any; matchScore: number; matchReason: string } | null {
  return matchAggregatedProfileToStudentRecords(doc.extractedData, records);
}

/**
 * Extract embedded images from a PDF file buffer using pdf-lib and sharp
 */
export async function extractImagesFromPdf(
  pdfBuffer: Buffer
): Promise<Array<{ pageNumber: number; buffer: Buffer }>> {
  const images: Array<{ pageNumber: number; buffer: Buffer }> = [];

  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const context = pdfDoc.context;
    let pageNum = 1;

    for (const [_, obj] of context.enumerateIndirectObjects()) {
      if (!obj || !(obj as any).dict || !(obj as any).dict.get) continue;
      const dict = (obj as any).dict;
      const subtype = dict.get(context.obj('Subtype'))?.toString();
      if (subtype !== '/Image') continue;

      try {
        const raw = Buffer.from((obj as any).getContents());

        // 1. Direct decode with sharp
        try {
          const jpg = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
          images.push({ pageNumber: pageNum++, buffer: jpg });
          continue;
        } catch (_) {
          // fallback to Flate
        }

        // 2. Handle raw FlateDecode bitstreams
        const widthVal = dict.lookup ? dict.lookup(context.obj('Width')) : dict.get(context.obj('Width'));
        const heightVal = dict.lookup ? dict.lookup(context.obj('Height')) : dict.get(context.obj('Height'));
        const width = Number(
          typeof widthVal?.value === 'function'
            ? widthVal.value()
            : typeof widthVal?.asNumber === 'function'
            ? widthVal.asNumber()
            : 0
        );
        const height = Number(
          typeof heightVal?.value === 'function'
            ? heightVal.value()
            : typeof heightVal?.asNumber === 'function'
            ? heightVal.asNumber()
            : 0
        );

        if (width > 50 && height > 50) {
          const channels = 3;
          let decompressed = raw;
          try {
            const zlib = await import('zlib');
            decompressed = zlib.inflateSync(raw);
          } catch {
            // keep raw
          }

          if (decompressed.length >= width * height * channels) {
            const rawJpg = await sharp(decompressed.slice(0, width * height * channels), {
              raw: { width, height, channels },
            })
              .jpeg({ quality: 90 })
              .toBuffer();
            images.push({ pageNumber: pageNum++, buffer: rawJpg });
          }
        }
      } catch (innerErr) {
        console.warn('[documentArchiveService] Failed decoding indirect PDF image object:', innerErr);
      }
    }
  } catch (err) {
    console.warn('[documentArchiveService] PDF image extraction error:', err);
  }

  return images;
}

/**
 * Image normalization & optimization
 */
export async function optimizeAndPrepareImage(
  inputBuffer: Buffer,
  isPhoto: boolean = false,
  rotateClockwise: 0 | 90 | 180 | 270 = 0
): Promise<{ buffer: Buffer; isBw: boolean; width: number; height: number }> {
  let pipeline = sharp(inputBuffer);

  if (rotateClockwise > 0) {
    pipeline = pipeline.rotate(rotateClockwise);
  } else {
    pipeline = pipeline.rotate(); // Auto-orient based on EXIF
  }

  pipeline = pipeline.resize({
    width: isPhoto ? 600 : 1600,
    height: isPhoto ? 800 : 2200,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const meta = await sharp(inputBuffer).metadata();
  const isBw = !isPhoto && meta.channels === 1;

  if (isPhoto) {
    pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
  } else {
    pipeline = pipeline.grayscale().normalize().jpeg({ quality: 85, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  const outMeta = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    isBw,
    width: outMeta.width || 0,
    height: outMeta.height || 0,
  };
}

/**
 * Document extraction JSON schema
 */
const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    classification: {
      type: 'STRING',
      enum: [
        'STUDENT_PHOTO',
        'B_FORM',
        'FATHER_CNIC_FRONT',
        'FATHER_CNIC_BACK',
        'STUDENT_PROFILE_FORM',
        'MARKS_CERTIFICATE',
        'BIRTH_CERTIFICATE',
        'SCHOOL_LEAVING_CERTIFICATE',
        'ADMISSION_FORM',
        'IGNORED_NOISE',
        'OTHER_UNCLASSIFIED',
      ],
      description: 'The type of educational or civil document.',
    },
    suggestedRotation: {
      type: 'INTEGER',
      description: '0 if upright. If sideways or upside down, specify clockwise rotation (90, 180, 270).',
    },
    confidence: { type: 'NUMBER', description: 'Confidence between 0.0 and 1.0' },
    studentNameEnglish: { type: 'STRING', description: 'Student name in clean English title case' },
    studentNameUrdu: { type: 'STRING', description: 'Student name in Urdu if present' },
    fatherNameEnglish: { type: 'STRING', description: 'Father name in clean English title case' },
    fatherNameUrdu: { type: 'STRING', description: 'Father name in Urdu if present' },
    bFormNo: { type: 'STRING', description: '13-digit NADRA B-Form or Child Registration number' },
    fatherCnic: { type: 'STRING', description: '13-digit NADRA CNIC of Father or Guardian' },
    dob: { type: 'STRING', description: 'Date of birth DD-MM-YYYY' },
    gender: { type: 'STRING', enum: ['Male', 'Female', 'Unknown'] },
    grNo: { type: 'STRING', description: 'G.R. / Admission number if written on the document' },
    classAdmitted: { type: 'STRING', description: 'Class admitted (e.g. IX, X, XI, XII)' },
    previousSchool: { type: 'STRING', description: 'Name of previous school' },
  },
  required: ['classification', 'confidence', 'suggestedRotation'],
};

/**
 * Call Gemini Vision with prioritized model hierarchy and comprehensive debug logging
 */
async function callGeminiVision(
  imageBuffer: Buffer,
  prompt: string,
  schema: any,
  serverKeys: string[],
  jobId?: string,
  filename?: string,
  grNo?: string
): Promise<{
  result: any;
  modelUsed: string;
  keyAttempts: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const base64Data = imageBuffer.toString('base64');
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-1.5-flash',
  ];

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
    systemInstruction: {
      parts: [
        {
          text: 'You are an expert Pakistani educational document archivist for Peoples Higher Secondary School Jamshoro (Sindh). Accurately classify documents, detect orientation (suggest 90, 180, 270 deg clockwise if not upright), and extract student info (names in clean English Latin letters, 13-digit NADRA B-Form / CRC and Parent CNICs, DOB).',
        },
      ],
    },
  });

  let lastError = '';
  let keyAttempts = 0;

  for (const model of modelsToTry) {
    for (let i = 0; i < serverKeys.length; i++) {
      const key = serverKeys[i];
      keyAttempts++;
      const maskedKey = `${key.slice(0, 6)}...${key.slice(-4)}`;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: requestBody,
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            let parsed;
            try {
              parsed = cleanAndParseJson(text);
            } catch (e) {
              parsed = { classification: 'OTHER_UNCLASSIFIED', confidence: 0 };
            }
            const durationMs = Date.now() - startTime;
            if (jobId) {
              addJobLog(
                jobId,
                'success',
                'AI_VISION',
                `AI Classification: ${parsed.classification || 'UNKNOWN'} (${Math.round((parsed.confidence || 0.8) * 100)}% conf) using ${model}`,
                {
                  filename,
                  grNo,
                  details: `Model: ${model} | Key #${i + 1} (${maskedKey}) | Rotation: ${parsed.suggestedRotation || 0}° | Time: ${durationMs}ms`,
                  executionTimeMs: durationMs,
                }
              );
            }
            return { result: parsed, modelUsed: model, keyAttempts, durationMs };
          }
        } else {
          const errBody = await res.text();
          lastError = `[${model}] Key #${i + 1} (${maskedKey}) HTTP ${res.status}: ${errBody.slice(0, 180)}`;
          if (jobId && (res.status === 429 || res.status >= 500)) {
            addJobLog(
              jobId,
              'warn',
              'AI_VISION',
              `API rate limit / status ${res.status} on ${model}, rotating key...`,
              { filename, grNo, details: lastError }
            );
          }
        }
      } catch (err: any) {
        lastError = `[${model}] Key #${i + 1} network error: ${err.message}`;
      }
    }
  }

  const durationMs = Date.now() - startTime;
  if (jobId) {
    addJobLog(
      jobId,
      'error',
      'AI_VISION',
      `All ${modelsToTry.length} AI models exhausted across ${keyAttempts} key attempts for ${filename}`,
      { filename, grNo, details: lastError, executionTimeMs: durationMs }
    );
  }

  throw new Error(`Gemini Vision processing failed after ${keyAttempts} attempts: ${lastError.slice(0, 180)}`);
}

/**
 * Process a single document image with transparent progress tracking & bundle synthesis
 */
async function processSingleDocument(
  item: QueueItem,
  serverKeys: string[]
): Promise<StudentDocumentRecord | null> {
  const fileStart = Date.now();
  const jobId = item.jobId;

  updateJobFileItem(jobId, item.originalFilename, item.grNo, {
    stage: 'optimizing',
    status: 'in_progress',
    progressPercent: 20,
    fileSizeBytes: item.sourceBuffer.length,
  });

  try {
    const fileHash = crypto.createHash('sha256').update(item.sourceBuffer).digest('hex');

    // 1. Deduplication Check
    const existingDoc = Object.values(documentsStore).find(
      (d) => d.fileHash === fileHash && d.grNo === item.grNo
    );
    if (existingDoc) {
      addJobLog(
        jobId,
        'info',
        'IMAGE_OPTIMIZE',
        `Duplicate scan detected (SHA-256 matched existing doc ${existingDoc.filename})`,
        { filename: item.originalFilename, grNo: item.grNo }
      );
      if (jobsStore[jobId]) {
        jobsStore[jobId].duplicateCount = (jobsStore[jobId].duplicateCount || 0) + 1;
      }
      updateJobFileItem(jobId, item.originalFilename, item.grNo, {
        stage: 'duplicate',
        status: 'duplicate',
        progressPercent: 100,
        classification: existingDoc.classification,
      });
      return existingDoc;
    }

    // 2. Pre-process into standardized buffer
    let optimized = await optimizeAndPrepareImage(item.sourceBuffer, false, 0);

    addJobLog(
      jobId,
      'info',
      'IMAGE_OPTIMIZE',
      `Optimized image scan (${Math.round(item.sourceBuffer.length / 1024)}KB → ${Math.round(optimized.buffer.length / 1024)}KB, ${optimized.width}x${optimized.height}px)`,
      { filename: item.originalFilename, grNo: item.grNo }
    );

    updateJobFileItem(jobId, item.originalFilename, item.grNo, {
      stage: 'ai_vision',
      status: 'in_progress',
      progressPercent: 50,
    });

    // 3. AI Document Tagging & Field Extraction
    const prompt = `Analyze this Pakistani school document scan.
1. Classify the document (STUDENT_PHOTO, B_FORM, FATHER_CNIC_FRONT, FATHER_CNIC_BACK, STUDENT_PROFILE_FORM, MARKS_CERTIFICATE, BIRTH_CERTIFICATE, SCHOOL_LEAVING_CERTIFICATE, ADMISSION_FORM, IGNORED_NOISE, OTHER_UNCLASSIFIED).
2. Check orientation: if text or card is sideways or upside down, indicate suggested clockwise rotation (90, 180, 270 degrees) to orient it upright.
3. Extract data intelligently based on document type:
   - If the image is just a blank page with a CamScanner logo, a scanner watermark, or contains no usable student data, classify it STRICTLY as IGNORED_NOISE. Return empty data.
   - If FATHER_CNIC_FRONT or FATHER_CNIC_BACK: The main cardholder's name is the FATHER'S NAME. The 13-digit number is the FATHER CNIC. CRITICAL: The "Father Name" printed ON the CNIC card is actually the student's grandfather, so DO NOT extract it as the father name. Leave student name and B-Form empty.
   - If B_FORM or BIRTH_CERTIFICATE: Extract the Child's Name as Student Name, Child's ID as B-Form, Father's Name as Father Name, and Father's ID as Father CNIC.
   - If STUDENT_PROFILE_FORM or ADMISSION_FORM or MARKS_CERTIFICATE: Extract Student Name, Father Name, B-Form, Father CNIC, DOB, Gender, and GR Number (if present).
   - Normalize names to standard English Latin title case. Format DOB as DD-MM-YYYY.`;

    let aiResult: any = {
      classification: 'OTHER_UNCLASSIFIED',
      confidence: 0.5,
      suggestedRotation: 0,
    };
    let modelUsed = 'none';

    if (serverKeys.length > 0) {
      try {
        const aiResponse = await callGeminiVision(
          optimized.buffer,
          prompt,
          EXTRACTION_SCHEMA,
          serverKeys,
          jobId,
          item.originalFilename,
          item.grNo
        );
        aiResult = aiResponse.result;
        modelUsed = aiResponse.modelUsed;
      } catch (err: any) {
        addJobLog(
          jobId,
          'warn',
          'AI_VISION',
          `AI extraction failed for ${item.originalFilename}: ${err.message}. Archiving as unclassified doc.`,
          { filename: item.originalFilename, grNo: item.grNo, details: err.stack }
        );
      }
    } else {
      addJobLog(
        jobId,
        'warn',
        'AI_VISION',
        `No Gemini API keys configured. Saving document as unclassified.`,
        { filename: item.originalFilename, grNo: item.grNo }
      );
    }

    const classification: DocumentClassificationType =
      aiResult.classification || 'OTHER_UNCLASSIFIED';

    if (classification === 'IGNORED_NOISE') {
      addJobLog(
        jobId,
        'info',
        'AI_VISION',
        `Ignored noise/scanner watermark scan: ${item.originalFilename}`,
        { filename: item.originalFilename, grNo: item.grNo }
      );
      updateJobFileItem(jobId, item.originalFilename, item.grNo, {
        stage: 'complete',
        status: 'success',
        progressPercent: 100,
        classification: 'IGNORED_NOISE',
      });
      return null;
    }

    const isPhoto = classification === 'STUDENT_PHOTO';
    const suggestedRot = (aiResult.suggestedRotation || 0) as 0 | 90 | 180 | 270;

    // If suggested rotation is non-zero, re-run image pipeline with correct color/rotation
    if (suggestedRot !== 0 || isPhoto) {
      optimized = await optimizeAndPrepareImage(item.sourceBuffer, isPhoto, suggestedRot);
      addJobLog(
        jobId,
        'info',
        'IMAGE_OPTIMIZE',
        `Applied suggested rotation ${suggestedRot}° to orient document upright`,
        { filename: item.originalFilename, grNo: item.grNo }
      );
    }

    // 4. Save to Disk: /data/student_documents/GR_<grNo>/<tag>_<originalName>.jpg
    let currentGr = item.grNo;
    const grFolder = path.join(DATA_DIR, `GR_${currentGr}`);
    if (!fs.existsSync(grFolder)) {
      fs.mkdirSync(grFolder, { recursive: true });
    }

    const safeBaseName = path
      .basename(item.originalFilename, path.extname(item.originalFilename))
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFilename = `${classification}_${safeBaseName}.jpg`;
    const finalFilePath = path.join(grFolder, finalFilename);

    fs.writeFileSync(finalFilePath, optimized.buffer);

    // 5. Structure extracted student data for this page
    if (classification === 'FATHER_CNIC_FRONT' || classification === 'FATHER_CNIC_BACK') {
      // A parent CNIC card contains the Father's name as primary name, NOT the student name
      if (!aiResult.fatherNameEnglish && aiResult.studentNameEnglish) {
        aiResult.fatherNameEnglish = aiResult.studentNameEnglish;
      }
      aiResult.studentNameEnglish = undefined;
      aiResult.studentNameUrdu = undefined;
      aiResult.bFormNo = undefined;
    }

    const extractedData: ExtractedStudentInfo = {
      grNo: currentGr !== 'UNASSIGNED' ? currentGr : aiResult.grNo,
      studentName: toEnglishTitleCase(aiResult.studentNameEnglish),
      studentNameUrdu: aiResult.studentNameUrdu,
      fatherName: toEnglishTitleCase(aiResult.fatherNameEnglish),
      fatherNameUrdu: aiResult.fatherNameUrdu,
      bFormNo: normalizeNadraNumber(aiResult.bFormNo),
      fatherCnic: normalizeNadraNumber(aiResult.fatherCnic),
      dob: aiResult.dob,
      gender: aiResult.gender === 'Female' ? 'Female' : 'Male',
      classAdmitted: aiResult.classAdmitted,
      previousSchool: aiResult.previousSchool,
    };

    const extractedFields = Object.entries(extractedData).filter(([_, v]) => Boolean(v)).length;

    if (extractedFields > 0) {
      addJobLog(
        jobId,
        'success',
        'NADRA_PARSE',
        `Extracted fields: ${[
          extractedData.studentName && `Name: ${extractedData.studentName}`,
          extractedData.fatherName && `Father: ${extractedData.fatherName}`,
          extractedData.bFormNo && `B-Form: ${extractedData.bFormNo}`,
          extractedData.fatherCnic && `CNIC: ${extractedData.fatherCnic}`,
          extractedData.dob && `DOB: ${extractedData.dob}`,
        ]
          .filter(Boolean)
          .join(' | ')}`,
        { filename: item.originalFilename, grNo: currentGr }
      );
    }

    const docRecord: StudentDocumentRecord = {
      id: crypto.randomUUID(),
      jobId: item.jobId,
      grNo: currentGr,
      bundleId: item.bundleId,
      sourceFilename: item.sourceFilename,
      pageNumber: item.pageNumber,
      originalFilename: item.originalFilename,
      filename: finalFilename,
      url: `/api/documents/file/${currentGr}/${encodeURIComponent(finalFilename)}`,
      fileHash,
      fileSizeBytes: optimized.buffer.length,
      width: optimized.width,
      height: optimized.height,
      rotationApplied: suggestedRot,
      isBlackAndWhite: optimized.isBw,
      classification,
      classificationConfidence: aiResult.confidence || 0.8,
      extractedData,
      discrepancies: [],
      status: 'verified',
      processedAt: new Date().toISOString(),
    };

    documentsStore[docRecord.id] = docRecord;

    // 6. Multi-Page Bundle Synthesis & Live Multi-Factor Auto-Assignment
    let bundle = item.bundleId ? bundlesStore[item.bundleId] : null;
    if (!bundle && item.bundleId) {
      bundle = {
        bundleId: item.bundleId,
        jobId: item.jobId,
        sourceFilename: item.sourceFilename || item.originalFilename,
        pageCount: item.totalPages || 1,
        pagesProcessed: 0,
        initialGrNo: item.grNo,
        documentIds: [],
        combinedExtractedData: {},
      };
      bundlesStore[item.bundleId] = bundle;
    }

    if (bundle) {
      bundle.documentIds.push(docRecord.id);
      bundle.pagesProcessed += 1;

      // Merge data across pages
      const comb = bundle.combinedExtractedData;
      if (extractedData.studentName && (!comb.studentName || classification === 'B_FORM' || classification === 'STUDENT_PROFILE_FORM')) {
        comb.studentName = extractedData.studentName;
      }
      if (extractedData.fatherName && (!comb.fatherName || classification === 'B_FORM' || classification.includes('CNIC'))) {
        comb.fatherName = extractedData.fatherName;
      }
      if (extractedData.bFormNo) comb.bFormNo = extractedData.bFormNo;
      if (extractedData.fatherCnic) comb.fatherCnic = extractedData.fatherCnic;
      if (extractedData.dob) comb.dob = extractedData.dob;
      if (extractedData.grNo && extractedData.grNo !== 'UNASSIGNED') comb.grNo = extractedData.grNo;
      if (extractedData.classAdmitted) comb.classAdmitted = extractedData.classAdmitted;

      // If bundle was UNASSIGNED, try matching combined multi-page data against Google Sheet records
      if (currentGr === 'UNASSIGNED' && globalCachedSheetRecords.length > 0) {
        const matchResult = matchAggregatedProfileToStudentRecords(comb, globalCachedSheetRecords);
        if (matchResult && matchResult.student) {
          const targetGr = String(matchResult.student.grNo || matchResult.student['G.R.NO'] || '').trim();
          if (targetGr && targetGr !== 'UNASSIGNED') {
            addJobLog(
              jobId,
              'success',
              'DOSSIER_SYNC',
              `Auto-Linked multi-page document bundle to GR #${targetGr} (${matchResult.student.studentName}) via Combined Data: ${matchResult.matchReason}`,
              { filename: item.originalFilename, grNo: targetGr }
            );

            bundle.resolvedGrNo = targetGr;
            bundle.matchScore = matchResult.matchScore;
            bundle.matchReason = matchResult.matchReason;
            bundle.matchedStudent = matchResult.student;

            // Reassign all pages of this bundle to target GR
            const targetFolder = path.join(DATA_DIR, `GR_${targetGr}`);
            if (!fs.existsSync(targetFolder)) {
              fs.mkdirSync(targetFolder, { recursive: true });
            }

            for (const docId of bundle.documentIds) {
              const bDoc = documentsStore[docId];
              if (bDoc && bDoc.grNo !== targetGr) {
                const oldFolder = path.join(DATA_DIR, `GR_${bDoc.grNo}`);
                const oldPath = path.join(oldFolder, bDoc.filename);
                const newPath = path.join(targetFolder, bDoc.filename);

                if (fs.existsSync(oldPath)) {
                  try {
                    fs.renameSync(oldPath, newPath);
                  } catch (mvErr) {
                    console.warn(`[documentArchiveService] Failed moving bundled file ${bDoc.filename}:`, mvErr);
                  }
                }

                bDoc.grNo = targetGr;
                bDoc.url = `/api/documents/file/${targetGr}/${encodeURIComponent(bDoc.filename)}`;
                updateStudentDossier(targetGr, bDoc);
              }
            }

            // Also audit newly linked dossier against the sheet
            auditDossierAgainstSheet(targetGr, matchResult.student);
            currentGr = targetGr;
          }
        }
      }
    }

    if (currentGr !== 'UNASSIGNED') {
      updateStudentDossier(currentGr, docRecord);
    }

    const totalTimeMs = Date.now() - fileStart;

    updateJobFileItem(jobId, item.originalFilename, currentGr, {
      savedFilename: finalFilename,
      stage: 'completed',
      status: 'success',
      progressPercent: 100,
      classification,
      classificationConfidence: docRecord.classificationConfidence,
      rotationApplied: suggestedRot,
      extractedFieldsCount: extractedFields,
      extractedData: docRecord.extractedData,
      discrepancies: docRecord.discrepancies,
      url: docRecord.url,
      aiModelUsed: modelUsed,
      processedAt: docRecord.processedAt,
      executionTimeMs: totalTimeMs,
    });

    addJobLog(
      jobId,
      'success',
      'COMPLETE',
      `Archived to GR #${currentGr} (${finalFilename}) in ${totalTimeMs}ms`,
      { filename: item.originalFilename, grNo: currentGr, executionTimeMs: totalTimeMs }
    );

    saveStores();
    return docRecord;
  } catch (error: any) {
    console.error(`[documentArchiveService] Failed processing ${item.originalFilename}:`, error);

    addJobLog(
      jobId,
      'error',
      'ERROR',
      `Fatal error processing file: ${error.message}`,
      { filename: item.originalFilename, grNo: item.grNo, details: error.stack }
    );

    updateJobFileItem(jobId, item.originalFilename, item.grNo, {
      stage: 'failed',
      status: 'failed',
      progressPercent: 100,
      error: error.message,
    });

    if (jobsStore[jobId]) {
      jobsStore[jobId].failedCount = (jobsStore[jobId].failedCount || 0) + 1;
    }

    return null;
  }
}

/**
 * Merge scattered documents into a unified Student Dossier for that GR
 */
function updateStudentDossier(grNo: string, doc: StudentDocumentRecord) {
  if (!grNo || grNo === 'UNASSIGNED') return;

  let dossier = dossiersStore[grNo];
  if (!dossier) {
    dossier = {
      grNo,
      studentName: '',
      fatherName: '',
      currentClass: '',
      section: '',
      bFormNo: '',
      parentCnic: '',
      dob: '',
      avatarUrl: undefined,
      documents: [],
      allFlags: [],
      hasMissingDocuments: true,
      missingTypes: ['STUDENT_PHOTO', 'B_FORM', 'FATHER_CNIC_FRONT'],
      lastUpdated: new Date().toISOString(),
    };
    dossiersStore[grNo] = dossier;
  }

  // Add document to list (replace if same filename or id)
  dossier.documents = dossier.documents.filter((d) => d.id !== doc.id && d.filename !== doc.filename);
  dossier.documents.push(doc);

  // Consolidate scattered data: priority given to official NADRA B-Form and CNICs
  const ext = doc.extractedData;
  if (doc.classification === 'STUDENT_PHOTO' && !dossier.avatarUrl) {
    dossier.avatarUrl = doc.url;
  }
  if (doc.classification === 'B_FORM') {
    if (ext.studentName) dossier.studentName = ext.studentName;
    if (ext.fatherName && !dossier.fatherName) dossier.fatherName = ext.fatherName;
    if (ext.bFormNo) dossier.bFormNo = ext.bFormNo;
    if (ext.dob) dossier.dob = ext.dob;
  }
  if (doc.classification === 'FATHER_CNIC_FRONT' || doc.classification === 'FATHER_CNIC_BACK') {
    if (ext.fatherName) dossier.fatherName = ext.fatherName;
    if (ext.fatherCnic) dossier.parentCnic = ext.fatherCnic;
  }
  if (doc.classification === 'STUDENT_PROFILE_FORM' || doc.classification === 'ADMISSION_FORM') {
    if (ext.studentName && !dossier.studentName) dossier.studentName = ext.studentName;
    if (ext.fatherName && !dossier.fatherName) dossier.fatherName = ext.fatherName;
    if (ext.bFormNo && !dossier.bFormNo) dossier.bFormNo = ext.bFormNo;
    if (ext.dob && !dossier.dob) dossier.dob = ext.dob;
    if (ext.classAdmitted && !dossier.currentClass) dossier.currentClass = ext.classAdmitted;
  }
  if (!dossier.studentName && ext.studentName) dossier.studentName = ext.studentName;
  if (!dossier.fatherName && ext.fatherName) dossier.fatherName = ext.fatherName;
  if (!dossier.bFormNo && ext.bFormNo) dossier.bFormNo = ext.bFormNo;
  if (!dossier.parentCnic && ext.fatherCnic) dossier.parentCnic = ext.fatherCnic;
  if (!dossier.dob && ext.dob) dossier.dob = ext.dob;

  // Check missing mandatory documents
  const presentTypes = new Set(dossier.documents.map((d) => d.classification));
  const requiredTypes: DocumentClassificationType[] = ['STUDENT_PHOTO', 'B_FORM', 'FATHER_CNIC_FRONT'];
  dossier.missingTypes = requiredTypes.filter((t) => !presentTypes.has(t));
  dossier.hasMissingDocuments = dossier.missingTypes.length > 0;
  dossier.lastUpdated = new Date().toISOString();

  saveStores();
}

/**
 * Cross-reference student dossier with Google Sheet student records and generate rich discrepancy flags
 */
export function auditDossierAgainstSheet(grNo: string, sheetRecord?: any): DocumentDiscrepancy[] {
  const dossier = dossiersStore[grNo];
  if (!dossier) return [];

  const discrepancies: DocumentDiscrepancy[] = [];
  const studentName = dossier.studentName || (sheetRecord && (sheetRecord.studentName || sheetRecord['STUDENTNAME'])) || 'Student';
  const fatherName = dossier.fatherName || (sheetRecord && (sheetRecord.fatherName || sheetRecord['FATHERNAME'])) || '';
  const currentClass = dossier.currentClass || (sheetRecord && (sheetRecord.currentClass || sheetRecord['CURRENTCLASS'])) || '';

  // Find document references for each type
  const bFormDoc = dossier.documents.find((d) => d.classification === 'B_FORM');
  const cnicDoc = dossier.documents.find((d) => d.classification === 'FATHER_CNIC_FRONT' || d.classification === 'FATHER_CNIC_BACK');
  const photoDoc = dossier.documents.find((d) => d.classification === 'STUDENT_PHOTO');
  const primaryDoc = bFormDoc || cnicDoc || photoDoc || dossier.documents[0];

  if (sheetRecord) {
    const sheetBForm = normalizeNadraNumber(sheetRecord.bFormNo || sheetRecord['B.FORMNO']);
    const sheetCnic = normalizeNadraNumber(sheetRecord.parentCnic || sheetRecord['PARENT/GUARDIANCNICNO']);
    const sheetStudentName = (sheetRecord.studentName || sheetRecord['STUDENTNAME'] || '').trim();
    const sheetFatherName = (sheetRecord.fatherName || sheetRecord['FATHERNAME'] || '').trim();
    const sheetDob = (sheetRecord.dobDay && sheetRecord.dobMonth && sheetRecord.dobYear)
      ? `${sheetRecord.dobDay}/${sheetRecord.dobMonth}/${sheetRecord.dobYear}`
      : (sheetRecord.dob || sheetRecord['DATEOFBIRTH'] || '');

    // 1. Check B-Form discrepancy with OCR tolerance
    if (dossier.bFormNo && sheetBForm) {
      const bComp = compareNadraNumberWithOcrTolerance(dossier.bFormNo, sheetBForm);
      if (!bComp.exact) {
        // Intelligence check: Is this actually the Father's CNIC mis-extracted as a B-Form?
        const isActuallyFatherCnic = sheetCnic && compareNadraNumberWithOcrTolerance(dossier.bFormNo, sheetCnic).score >= 0.85;
        
        if (!isActuallyFatherCnic) {
          const id = `flag_bform_${grNo}`;
          const sev = bComp.score >= 0.85 ? 'medium' : 'high';
          discrepancies.push({
            id,
            grNo,
            studentName,
            fatherName,
            currentClass,
            field: 'bFormNo',
            fieldName: 'NADRA B-Form / CRC Number',
            sheetValue: sheetBForm,
            extractedValue: dossier.bFormNo,
            severity: sev,
            message: `B-Form Mismatch: Document has ${dossier.bFormNo} but Sheet has ${sheetBForm} (${bComp.reason})`,
            documentId: bFormDoc?.id || primaryDoc?.id,
            documentUrl: bFormDoc?.url || primaryDoc?.url,
            documentFilename: bFormDoc?.originalFilename || primaryDoc?.originalFilename,
            documentClassification: bFormDoc?.classification || primaryDoc?.classification,
            isDismissed: Boolean(dismissedFlagsStore[id]),
          });
        }
      }
    }

    // 2. Check Parent CNIC discrepancy with OCR tolerance
    if (dossier.parentCnic && sheetCnic) {
      const cComp = compareNadraNumberWithOcrTolerance(dossier.parentCnic, sheetCnic);
      if (!cComp.exact) {
        // Intelligence check: Is this actually the Student's B-Form mis-extracted as a Father CNIC?
        const isActuallyStudentBForm = sheetBForm && compareNadraNumberWithOcrTolerance(dossier.parentCnic, sheetBForm).score >= 0.85;

        if (!isActuallyStudentBForm) {
          const id = `flag_cnic_${grNo}`;
          const sev = cComp.score >= 0.85 ? 'medium' : 'high';
          discrepancies.push({
            id,
            grNo,
            studentName,
            fatherName,
            currentClass,
            field: 'parentCnic',
            fieldName: 'Father / Guardian CNIC',
            sheetValue: sheetCnic,
            extractedValue: dossier.parentCnic,
            severity: sev,
            message: `CNIC Mismatch: Document has ${dossier.parentCnic} but Sheet has ${sheetCnic} (${cComp.reason})`,
            documentId: cnicDoc?.id || primaryDoc?.id,
            documentUrl: cnicDoc?.url || primaryDoc?.url,
            documentFilename: cnicDoc?.originalFilename || primaryDoc?.originalFilename,
            documentClassification: cnicDoc?.classification || primaryDoc?.classification,
            isDismissed: Boolean(dismissedFlagsStore[id]),
          });
        }
      }
    }

    // 3. Check Student Name spelling discrepancy with Pakistani name normalizer
    if (dossier.studentName && sheetStudentName) {
      const nameComp = calculateNameSimilarity(dossier.studentName, sheetStudentName);
      if (nameComp.similarity < 0.95 && dossier.studentName.toLowerCase().trim() !== sheetStudentName.toLowerCase().trim()) {
        const id = `flag_studentname_${grNo}`;
        discrepancies.push({
          id,
          grNo,
          studentName,
          fatherName,
          currentClass,
          field: 'studentName',
          fieldName: 'Student Name Spelling',
          sheetValue: sheetStudentName,
          extractedValue: dossier.studentName,
          severity: nameComp.similarity < 0.7 ? 'high' : 'medium',
          message: `Name Spelling difference: Sheet has "${sheetStudentName}" while Document extracted "${dossier.studentName}" (${nameComp.details})`,
          documentId: bFormDoc?.id || primaryDoc?.id,
          documentUrl: bFormDoc?.url || primaryDoc?.url,
          documentFilename: bFormDoc?.originalFilename || primaryDoc?.originalFilename,
          documentClassification: bFormDoc?.classification || primaryDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }

    // 4. Check Father Name spelling discrepancy
    if (dossier.fatherName && sheetFatherName) {
      const fComp = calculateNameSimilarity(dossier.fatherName, sheetFatherName);
      if (fComp.similarity < 0.95 && dossier.fatherName.toLowerCase().trim() !== sheetFatherName.toLowerCase().trim()) {
        const id = `flag_fathername_${grNo}`;
        discrepancies.push({
          id,
          grNo,
          studentName,
          fatherName,
          currentClass,
          field: 'fatherName',
          fieldName: 'Father Name Spelling',
          sheetValue: sheetFatherName,
          extractedValue: dossier.fatherName,
          severity: fComp.similarity < 0.7 ? 'high' : 'medium',
          message: `Father Name difference: Sheet has "${sheetFatherName}" while Document extracted "${dossier.fatherName}" (${fComp.details})`,
          documentId: cnicDoc?.id || bFormDoc?.id || primaryDoc?.id,
          documentUrl: cnicDoc?.url || bFormDoc?.url || primaryDoc?.url,
          documentFilename: cnicDoc?.originalFilename || bFormDoc?.originalFilename,
          documentClassification: cnicDoc?.classification || bFormDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }

    // 5. Check DOB discrepancy
    if (dossier.dob && sheetDob) {
      const dobComp = compareDobWithTolerance(dossier.dob, sheetDob);
      if (!dobComp.matched || dobComp.score < 0.95) {
        const id = `flag_dob_${grNo}`;
        discrepancies.push({
          id,
          grNo,
          studentName,
          fatherName,
          currentClass,
          field: 'dob',
          fieldName: 'Date of Birth (DOB)',
          sheetValue: sheetDob,
          extractedValue: dossier.dob,
          severity: 'medium',
          message: `DOB Comparison: Document has "${dossier.dob}" while Sheet has "${sheetDob}" (${dobComp.matchType})`,
          documentId: bFormDoc?.id || primaryDoc?.id,
          documentUrl: bFormDoc?.url || primaryDoc?.url,
          documentFilename: bFormDoc?.originalFilename || primaryDoc?.originalFilename,
          documentClassification: bFormDoc?.classification || primaryDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }

    if (!dossier.currentClass && (sheetRecord.currentClass || sheetRecord['CURRENTCLASS'])) {
      dossier.currentClass = sheetRecord.currentClass || sheetRecord['CURRENTCLASS'];
      dossier.section = sheetRecord.section || sheetRecord['SECTION'] || '';
    }
  }

  // Check missing mandatory documents
  if (dossier.missingTypes.length > 0) {
    const id = `flag_missing_${grNo}`;
    discrepancies.push({
      id,
      grNo,
      studentName,
      fatherName,
      currentClass,
      field: 'missing',
      fieldName: 'Mandatory Documents',
      sheetValue: 'Complete Archive File',
      extractedValue: `Missing: ${dossier.missingTypes.map((t) => t.replace(/_/g, ' ')).join(', ')}`,
      severity: 'low',
      message: `Missing mandatory file(s): ${dossier.missingTypes.map((t) => t.replace(/_/g, ' ')).join(', ')}`,
      documentId: primaryDoc?.id,
      documentUrl: primaryDoc?.url,
      documentFilename: primaryDoc?.originalFilename,
      documentClassification: primaryDoc?.classification,
      isDismissed: Boolean(dismissedFlagsStore[id]),
    });
  }

  dossier.allFlags = discrepancies;
  saveStores();
  return discrepancies;
}

/**
 * Background Queue Worker Loop (1 image per request, key rotation, paced delay)
 */
async function runBackgroundQueue(serverKeys: string[]) {
  if (isQueueRunning) return;
  isQueueRunning = true;

  console.log(`[documentArchiveService] Starting background queue with ${processingQueue.length} files...`);

  while (processingQueue.length > 0) {
    const item = processingQueue.shift();
    if (!item) break;

    const job = jobsStore[item.jobId];
    if (job) {
      job.status = 'processing';
      job.currentFile = item.originalFilename;
      job.currentStage = 'AI_VISION';
      job.currentStageDescription = `Analyzing scan: ${item.originalFilename} (GR #${item.grNo})`;
      saveStores();
    }

    try {
      const doc = await processSingleDocument(item, serverKeys);
      if (doc && doc.discrepancies.length > 0 && job) {
        job.flaggedCount = (job.flaggedCount || 0) + 1;
      }
      if (doc && job) {
        job.successCount = (job.successCount || 0) + 1;
      }
    } catch (err: any) {
      console.error(`[documentArchiveService] Error processing queue item:`, err);
      if (job) {
        job.failedCount = (job.failedCount || 0) + 1;
      }
    }

    if (job) {
      job.processedFiles += 1;
      job.remainingFiles = Math.max(0, job.totalFiles - job.processedFiles);
      if (job.remainingFiles === 0 && processingQueue.filter((q) => q.jobId === job.id).length === 0) {
        job.status = (job.failedCount || 0) > 0 && (job.successCount || 0) === 0 ? 'failed' : 'completed';
        job.currentStage = 'COMPLETE';
        job.currentStageDescription = `Batch complete: ${job.processedFiles} processed, ${job.flaggedCount || 0} flagged, ${job.failedCount || 0} failed.`;
        job.completedAt = new Date().toISOString();
      }
      saveStores();
    }

    // Paced delay (4.0 seconds between AI calls to strictly preserve 15 RPM Free Tier quota)
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  isQueueRunning = false;
  console.log('[documentArchiveService] Background queue completed.');
}

/**
 * Ingest ZIP archive or direct files (automatically unpacks and splits PDFs into high-res images)
 */
export async function ingestUploadedArchive(
  archiveBuffer: Buffer,
  originalFilename: string,
  serverKeys: string[]
): Promise<BatchProcessingJob> {
  const jobId = crypto.randomUUID().slice(0, 8);
  const zip = new AdmZip(archiveBuffer);
  const zipEntries = zip.getEntries();

  const validEntries = zipEntries.filter((entry) => {
    if (entry.isDirectory) return false;
    const name = entry.entryName.toLowerCase();
    if (name.includes('__macosx') || name.startsWith('.')) return false;
    return /\.(jpe?g|png|webp|pdf)$/i.test(name);
  });

  const job: BatchProcessingJob = {
    id: jobId,
    totalFiles: 0,
    processedFiles: 0,
    remainingFiles: 0,
    flaggedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    successCount: 0,
    status: 'uploading',
    currentStage: 'PDF_EXTRACT',
    currentStageDescription: `Unpacking archive ${originalFilename}...`,
    logs: [],
    files: [],
    startedAt: new Date().toISOString(),
  };

  jobsStore[jobId] = job;
  saveStores();

  addJobLog(
    jobId,
    'info',
    'UPLOAD',
    `Received ZIP archive: ${originalFilename} (${Math.round(archiveBuffer.length / (1024 * 1024))}MB, ${validEntries.length} valid entries)`
  );

  let enqueuedCount = 0;

  for (const entry of validEntries) {
    const entryName = entry.entryName;
    const buffer = entry.getData();
    const grNo = extractGrFromPath(entryName);
    const isPdf = entryName.toLowerCase().endsWith('.pdf');
    const bundleId = `bundle_${jobId}_${crypto.createHash('md5').update(entryName).digest('hex').slice(0, 8)}`;

    if (isPdf) {
      addJobLog(jobId, 'info', 'PDF_EXTRACT', `Parsing multi-page PDF stream: ${entryName}`, {
        filename: entryName,
        grNo,
      });

      try {
        const extractedImages = await extractImagesFromPdf(buffer);
        if (extractedImages.length > 0) {
          addJobLog(
            jobId,
            'success',
            'PDF_EXTRACT',
            `Successfully unpacked ${extractedImages.length} page scan(s) from PDF ${entryName}`,
            { filename: entryName, grNo }
          );

          // Register multi-page bundle
          bundlesStore[bundleId] = {
            bundleId,
            jobId,
            sourceFilename: entryName,
            pageCount: extractedImages.length,
            pagesProcessed: 0,
            initialGrNo: grNo,
            documentIds: [],
            combinedExtractedData: {},
          };

          for (const img of extractedImages) {
            const pageSuffix = extractedImages.length > 1 ? `_p${img.pageNumber}` : '';
            const baseName = path.basename(entryName, path.extname(entryName));
            const subFilename = `${baseName}${pageSuffix}.jpg`;

            updateJobFileItem(jobId, subFilename, grNo, {
              fileSizeBytes: img.buffer.length,
              stage: 'queued',
              status: 'pending',
              progressPercent: 0,
            });

            processingQueue.push({
              id: crypto.randomUUID().slice(0, 8),
              jobId,
              grNo,
              bundleId,
              sourceFilename: entryName,
              pageNumber: img.pageNumber,
              totalPages: extractedImages.length,
              originalFilename: subFilename,
              sourceBuffer: img.buffer,
              mimeType: 'image/jpeg',
            });
            enqueuedCount++;
          }
          continue;
        }
      } catch (pdfErr: any) {
        addJobLog(
          jobId,
          'warn',
          'PDF_EXTRACT',
          `Direct PDF rasterization fallback for ${entryName}: ${pdfErr.message}`,
          { filename: entryName, grNo }
        );
      }
    }

    const cleanFilename = path.basename(entryName);
    updateJobFileItem(jobId, cleanFilename, grNo, {
      fileSizeBytes: buffer.length,
      stage: 'queued',
      status: 'pending',
      progressPercent: 0,
    });

    processingQueue.push({
      id: crypto.randomUUID().slice(0, 8),
      jobId,
      grNo,
      bundleId,
      sourceFilename: entryName,
      pageNumber: 1,
      totalPages: 1,
      originalFilename: cleanFilename,
      sourceBuffer: buffer,
      mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
    });
    enqueuedCount++;
  }

  job.totalFiles = enqueuedCount;
  job.remainingFiles = enqueuedCount;
  job.status = 'processing';
  job.currentStage = 'AI_VISION';
  job.currentStageDescription = `Ready to process ${enqueuedCount} document scans through AI vision`;
  saveStores();

  addJobLog(
    jobId,
    'info',
    'AI_VISION',
    `Queued ${enqueuedCount} document scan(s). Commencing AI vision worker.`
  );

  runBackgroundQueue(serverKeys).catch((err) =>
    console.error('[documentArchiveService] Queue worker error:', err)
  );

  return job;
}

/**
 * Create an initialized background job
 */
export function createBatchJob(expectedFilesCount: number = 0): BatchProcessingJob {
  const jobId = crypto.randomUUID().slice(0, 8);
  const job: BatchProcessingJob = {
    id: jobId,
    totalFiles: expectedFilesCount,
    processedFiles: 0,
    remainingFiles: expectedFilesCount,
    flaggedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    successCount: 0,
    status: 'uploading',
    currentStage: 'UPLOAD',
    currentStageDescription: `Receiving ${expectedFilesCount} documents...`,
    logs: [],
    files: [],
    startedAt: new Date().toISOString(),
  };

  jobsStore[jobId] = job;
  saveStores();

  addJobLog(jobId, 'info', 'UPLOAD', `Initialized batch upload session (expected: ${expectedFilesCount} files)`);
  return job;
}

/**
 * Ingest a single file into an existing batch job
 */
export async function addSingleFileToJob(
  jobId: string,
  filename: string,
  buffer: Buffer,
  grNo?: string
): Promise<{ enqueued: number; job: BatchProcessingJob }> {
  let job = jobsStore[jobId];
  if (!job) {
    job = createBatchJob(1);
    jobsStore[jobId] = job;
  }

  const resolvedGr = grNo || extractGrFromPath(filename);
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const bundleId = `bundle_${jobId}_${crypto.createHash('md5').update(filename).digest('hex').slice(0, 8)}`;
  let enqueuedCount = 0;

  if (isPdf) {
    addJobLog(jobId, 'info', 'PDF_EXTRACT', `Splitting multi-page PDF scan: ${filename}`, {
      filename,
      grNo: resolvedGr,
    });

    try {
      const extractedImages = await extractImagesFromPdf(buffer);
      if (extractedImages.length > 0) {
        addJobLog(
          jobId,
          'success',
          'PDF_EXTRACT',
          `Extracted ${extractedImages.length} page scan(s) from PDF ${filename}`,
          { filename, grNo: resolvedGr }
        );

        bundlesStore[bundleId] = {
          bundleId,
          jobId,
          sourceFilename: filename,
          pageCount: extractedImages.length,
          pagesProcessed: 0,
          initialGrNo: resolvedGr,
          documentIds: [],
          combinedExtractedData: {},
        };

        for (const img of extractedImages) {
          const pageSuffix = extractedImages.length > 1 ? `_p${img.pageNumber}` : '';
          const baseName = path.basename(filename, path.extname(filename));
          const subFilename = `${baseName}${pageSuffix}.jpg`;

          updateJobFileItem(jobId, subFilename, resolvedGr, {
            fileSizeBytes: img.buffer.length,
            stage: 'queued',
            status: 'pending',
            progressPercent: 0,
          });

          processingQueue.push({
            id: crypto.randomUUID().slice(0, 8),
            jobId,
            grNo: resolvedGr,
            bundleId,
            sourceFilename: filename,
            pageNumber: img.pageNumber,
            totalPages: extractedImages.length,
            originalFilename: subFilename,
            sourceBuffer: img.buffer,
            mimeType: 'image/jpeg',
          });
          enqueuedCount++;
        }
      } else {
        updateJobFileItem(jobId, filename, resolvedGr, {
          fileSizeBytes: buffer.length,
          stage: 'queued',
          status: 'pending',
          progressPercent: 0,
        });
        processingQueue.push({
          id: crypto.randomUUID().slice(0, 8),
          jobId,
          grNo: resolvedGr,
          bundleId,
          sourceFilename: filename,
          pageNumber: 1,
          totalPages: 1,
          originalFilename: filename,
          sourceBuffer: buffer,
          mimeType: 'application/pdf',
        });
        enqueuedCount++;
      }
    } catch (pdfErr: any) {
      addJobLog(
        jobId,
        'warn',
        'PDF_EXTRACT',
        `PDF extraction warning for ${filename}: ${pdfErr.message}`,
        { filename, grNo: resolvedGr }
      );
      updateJobFileItem(jobId, filename, resolvedGr, {
        fileSizeBytes: buffer.length,
        stage: 'queued',
        status: 'pending',
        progressPercent: 0,
      });
      processingQueue.push({
        id: crypto.randomUUID().slice(0, 8),
        jobId,
        grNo: resolvedGr,
        bundleId,
        sourceFilename: filename,
        pageNumber: 1,
        totalPages: 1,
        originalFilename: filename,
        sourceBuffer: buffer,
        mimeType: 'application/pdf',
      });
      enqueuedCount++;
    }
  } else {
    updateJobFileItem(jobId, filename, resolvedGr, {
      fileSizeBytes: buffer.length,
      stage: 'queued',
      status: 'pending',
      progressPercent: 0,
    });
    processingQueue.push({
      id: crypto.randomUUID().slice(0, 8),
      jobId,
      grNo: resolvedGr,
      bundleId,
      sourceFilename: filename,
      pageNumber: 1,
      totalPages: 1,
      originalFilename: filename,
      sourceBuffer: buffer,
      mimeType: 'image/jpeg',
    });
    enqueuedCount++;
  }

  job.totalFiles = (job.totalFiles || 0) + (enqueuedCount > 1 ? enqueuedCount - 1 : 0);
  job.remainingFiles = Math.max(0, (job.totalFiles || 0) - (job.processedFiles || 0));
  saveStores();

  return { enqueued: enqueuedCount, job };
}

/**
 * Finalize batch job and kick off background queue
 */
export function finalizeBatchJob(jobId: string, serverKeys: string[]): BatchProcessingJob {
  const job = jobsStore[jobId];
  if (job) {
    job.status = 'processing';
    job.currentStage = 'AI_VISION';
    job.currentStageDescription = `Executing AI Vision & field extraction across ${job.totalFiles} documents`;
    job.remainingFiles = Math.max(0, (job.totalFiles || 0) - (job.processedFiles || 0));
    saveStores();
  }

  addJobLog(
    jobId,
    'info',
    'AI_VISION',
    `Finalized upload queue. Commencing AI OCR & validation loop.`
  );

  runBackgroundQueue(serverKeys).catch((err) =>
    console.error('[documentArchiveService] Queue worker error:', err)
  );

  return job || createBatchJob(0);
}

// In-memory chunk cache for large file uploads
interface ChunkSession {
  chunks: Record<number, Buffer>;
  totalChunks: number;
  filename: string;
  grNo?: string;
  isZip?: boolean;
  lastUpdated: number;
}
const chunkSessions: Record<string, ChunkSession> = {};

/**
 * Handle incoming chunk of a large file and reassemble if complete
 */
export async function handleChunkUpload(
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkBase64: string,
  filename: string,
  grNo?: string,
  isZip?: boolean,
  serverKeys: string[] = []
): Promise<{ completed: boolean; job?: BatchProcessingJob }> {
  if (!chunkSessions[uploadId]) {
    chunkSessions[uploadId] = {
      chunks: {},
      totalChunks,
      filename,
      grNo,
      isZip,
      lastUpdated: Date.now(),
    };
  }

  const session = chunkSessions[uploadId];
  session.chunks[chunkIndex] = Buffer.from(chunkBase64, 'base64');
  session.lastUpdated = Date.now();

  const receivedCount = Object.keys(session.chunks).length;
  if (receivedCount >= totalChunks) {
    const sortedBuffers: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      sortedBuffers.push(session.chunks[i] || Buffer.alloc(0));
    }
    const fullBuffer = Buffer.concat(sortedBuffers);
    delete chunkSessions[uploadId];

    if (session.isZip || filename.toLowerCase().endsWith('.zip')) {
      const job = await ingestUploadedArchive(fullBuffer, filename, serverKeys);
      return { completed: true, job };
    } else {
      const job = await ingestIndividualFiles(
        [{ filename, buffer: fullBuffer, grNo: session.grNo }],
        serverKeys
      );
      return { completed: true, job };
    }
  }

  return { completed: false };
}

/**
 * Ingest individual or multiple files directly
 */
export async function ingestIndividualFiles(
  files: Array<{ filename: string; buffer: Buffer; grNo?: string }>,
  serverKeys: string[]
): Promise<BatchProcessingJob> {
  const jobId = crypto.randomUUID().slice(0, 8);

  const job: BatchProcessingJob = {
    id: jobId,
    totalFiles: 0,
    processedFiles: 0,
    remainingFiles: 0,
    flaggedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    successCount: 0,
    status: 'processing',
    currentStage: 'AI_VISION',
    currentStageDescription: `Processing ${files.length} document scans`,
    logs: [],
    files: [],
    startedAt: new Date().toISOString(),
  };

  jobsStore[jobId] = job;
  saveStores();

  addJobLog(
    jobId,
    'info',
    'UPLOAD',
    `Ingesting ${files.length} document(s) directly into AI archive queue`
  );

  let enqueuedCount = 0;

  for (const f of files) {
    const grNo = f.grNo || extractGrFromPath(f.filename);
    const isPdf = f.filename.toLowerCase().endsWith('.pdf');
    const bundleId = `bundle_${jobId}_${crypto.createHash('md5').update(f.filename).digest('hex').slice(0, 8)}`;

    if (isPdf) {
      try {
        const extractedImages = await extractImagesFromPdf(f.buffer);
        if (extractedImages.length > 0) {
          addJobLog(
            jobId,
            'success',
            'PDF_EXTRACT',
            `Extracted ${extractedImages.length} page(s) from PDF ${f.filename}`,
            { filename: f.filename, grNo }
          );

          bundlesStore[bundleId] = {
            bundleId,
            jobId,
            sourceFilename: f.filename,
            pageCount: extractedImages.length,
            pagesProcessed: 0,
            initialGrNo: grNo,
            documentIds: [],
            combinedExtractedData: {},
          };

          for (const img of extractedImages) {
            const pageSuffix = extractedImages.length > 1 ? `_p${img.pageNumber}` : '';
            const baseName = path.basename(f.filename, path.extname(f.filename));
            const subFilename = `${baseName}${pageSuffix}.jpg`;

            updateJobFileItem(jobId, subFilename, grNo, {
              fileSizeBytes: img.buffer.length,
              stage: 'queued',
              status: 'pending',
              progressPercent: 0,
            });

            processingQueue.push({
              id: crypto.randomUUID().slice(0, 8),
              jobId,
              grNo,
              bundleId,
              sourceFilename: f.filename,
              pageNumber: img.pageNumber,
              totalPages: extractedImages.length,
              originalFilename: subFilename,
              sourceBuffer: img.buffer,
              mimeType: 'image/jpeg',
            });
            enqueuedCount++;
          }
          continue;
        }
      } catch (pdfErr: any) {
        addJobLog(
          jobId,
          'warn',
          'PDF_EXTRACT',
          `Direct PDF extraction fallback for ${f.filename}: ${pdfErr.message}`,
          { filename: f.filename, grNo }
        );
      }
    }

    updateJobFileItem(jobId, f.filename, grNo, {
      fileSizeBytes: f.buffer.length,
      stage: 'queued',
      status: 'pending',
      progressPercent: 0,
    });

    processingQueue.push({
      id: crypto.randomUUID().slice(0, 8),
      jobId,
      grNo,
      bundleId,
      sourceFilename: f.filename,
      pageNumber: 1,
      totalPages: 1,
      originalFilename: f.filename,
      sourceBuffer: f.buffer,
      mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
    });
    enqueuedCount++;
  }

  job.totalFiles = enqueuedCount;
  job.remainingFiles = enqueuedCount;
  saveStores();

  runBackgroundQueue(serverKeys).catch((err) =>
    console.error('[documentArchiveService] Queue worker error:', err)
  );

  return job;
}

/**
 * Retry failed documents in a job
 */
export async function retryFailedDocumentsInJob(
  jobId: string,
  serverKeys: string[]
): Promise<BatchProcessingJob | null> {
  const job = jobsStore[jobId];
  if (!job) return null;

  addJobLog(
    jobId,
    'info',
    'AI_VISION',
    `Retrying failed documents in job #${jobId} with fresh API key cycle...`
  );

  job.status = 'processing';
  job.currentStage = 'AI_VISION';
  job.currentStageDescription = 'Retrying failed document scans...';
  saveStores();

  runBackgroundQueue(serverKeys).catch((err) =>
    console.error('[documentArchiveService] Queue worker retry error:', err)
  );

  return job;
}

/**
 * Get public list of dossiers
 */
export function getAllDossiers(): StudentDossier[] {
  return Object.values(dossiersStore);
}

/**
 * Get specific student dossier by GR
 */
export function getDossierByGr(grNo: string): StudentDossier | null {
  return dossiersStore[grNo] || null;
}

/**
 * Get background job status
 */
export function getJobStatus(jobId: string): BatchProcessingJob | null {
  return jobsStore[jobId] || null;
}

/**
 * Get the latest active job
 */
export function getLatestJob(): BatchProcessingJob | null {
  const jobs = Object.values(jobsStore).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return jobs[0] || null;
}

/**
 * Manually update tag or rotation for a document
 */
export async function updateDocumentMetadata(
  docId: string,
  newTag?: DocumentClassificationType,
  rotateAngle?: 90 | 180 | 270
): Promise<StudentDocumentRecord | null> {
  const doc = documentsStore[docId];
  if (!doc) return null;

  if (newTag) {
    doc.classification = newTag;
  }

  if (rotateAngle) {
    const grFolder = path.join(DATA_DIR, `GR_${doc.grNo}`);
    const filePath = path.join(grFolder, doc.filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath);
      const isPhoto = doc.classification === 'STUDENT_PHOTO';
      const reoptimized = await optimizeAndPrepareImage(raw, isPhoto, rotateAngle);
      fs.writeFileSync(filePath, reoptimized.buffer);
      doc.rotationApplied = ((doc.rotationApplied + rotateAngle) % 360) as any;
      doc.width = reoptimized.width;
      doc.height = reoptimized.height;
    }
  }

  doc.status = 'verified';
  updateStudentDossier(doc.grNo, doc);
  saveStores();
  return doc;
}

/**
 * Get all individual document records
 */
export function getAllDocuments(): StudentDocumentRecord[] {
  return Object.values(documentsStore);
}

/**
 * Bulk audit all student dossiers against complete Google Sheet student roster
 */
export function auditAllDossiersAgainstSheet(records: any[]): Record<string, DocumentDiscrepancy[]> {
  const result: Record<string, DocumentDiscrepancy[]> = {};
  if (!Array.isArray(records) || records.length === 0) return result;

  const recordMap = new Map<string, any>();
  for (const r of records) {
    if (r.grNo) {
      recordMap.set(String(r.grNo).trim(), r);
    }
  }

  for (const [grNo, dossier] of Object.entries(dossiersStore)) {
    const sheetRecord = recordMap.get(String(grNo).trim());
    result[grNo] = auditDossierAgainstSheet(grNo, sheetRecord);
  }

  saveStores();
  return result;
}

/**
 * Automatically link all uploaded / unassigned documents & multi-page PDF bundles to Google Sheet student records
 * using aggregated multi-factor matching (Name, Father Name, CNIC, B-Form, DOB, with OCR error tolerance).
 */
export function autoLinkDocumentsAgainstSheet(records: any[]): {
  totalMatched: number;
  reassignedDocs: number;
  dossiers: StudentDossier[];
  documents: StudentDocumentRecord[];
  discrepancies: Record<string, DocumentDiscrepancy[]>;
} {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalMatched: 0,
      reassignedDocs: 0,
      dossiers: Object.values(dossiersStore),
      documents: Object.values(documentsStore),
      discrepancies: {},
    };
  }

  // Update server cache
  setCachedSheetRecords(records);

  let totalMatched = 0;
  let reassignedDocs = 0;

  const recordMap = new Map<string, any>();
  for (const r of records) {
    const gr = String(r.grNo || r['G.R.NO'] || '').trim();
    if (gr) {
      recordMap.set(gr, r);
    }
  }

  // Group all documents by their bundleId OR parent source file / base name
  const documentGroups: Record<string, StudentDocumentRecord[]> = {};
  const allDocs = Object.values(documentsStore);

  for (const doc of allDocs) {
    let groupKey = doc.bundleId;
    if (!groupKey) {
      // Group by base name stripping _p1, _p2
      const baseName = doc.originalFilename.replace(/_p\d+\.[^.]+$/i, '').replace(/\.[^.]+$/, '');
      groupKey = `group_${doc.jobId || 'legacy'}_${baseName}`;
    }
    if (!documentGroups[groupKey]) {
      documentGroups[groupKey] = [];
    }
    documentGroups[groupKey].push(doc);
  }

  // For each document group / bundle, consolidate all extracted data across its pages
  for (const [groupKey, groupDocs] of Object.entries(documentGroups)) {
    // If all docs in the group are already assigned to a valid numeric GR, we still refresh their data
    const currentGrs = Array.from(new Set(groupDocs.map((d) => d.grNo)));
    const isUnassigned = currentGrs.includes('UNASSIGNED') || currentGrs.length === 0;

    // Build consolidated profile across all documents in this bundle
    const consolidatedProfile: ExtractedStudentInfo = {};
    for (const doc of groupDocs) {
      const ext = doc.extractedData || {};
      if (ext.studentName && (!consolidatedProfile.studentName || doc.classification === 'B_FORM' || doc.classification === 'STUDENT_PROFILE_FORM')) {
        consolidatedProfile.studentName = ext.studentName;
      }
      if (ext.fatherName && (!consolidatedProfile.fatherName || doc.classification === 'B_FORM' || doc.classification.includes('CNIC'))) {
        consolidatedProfile.fatherName = ext.fatherName;
      }
      if (ext.bFormNo) consolidatedProfile.bFormNo = ext.bFormNo;
      if (ext.fatherCnic) consolidatedProfile.fatherCnic = ext.fatherCnic;
      if (ext.dob) consolidatedProfile.dob = ext.dob;
      if (ext.grNo && ext.grNo !== 'UNASSIGNED') consolidatedProfile.grNo = ext.grNo;
      if (ext.classAdmitted) consolidatedProfile.classAdmitted = ext.classAdmitted;
    }

    // Run the aggregated multi-factor error-tolerant matcher
    const match = matchAggregatedProfileToStudentRecords(consolidatedProfile, records);

    if (match && match.student) {
      totalMatched++;
      const targetGr = String(match.student.grNo || match.student['G.R.NO'] || '').trim();

      if (targetGr && (isUnassigned || currentGrs[0] !== targetGr)) {
        const targetFolder = path.join(DATA_DIR, `GR_${targetGr}`);
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }

        for (const doc of groupDocs) {
          const oldGr = doc.grNo;
          if (oldGr !== targetGr) {
            const oldFolder = path.join(DATA_DIR, `GR_${oldGr}`);
            const oldPath = path.join(oldFolder, doc.filename);
            const newPath = path.join(targetFolder, doc.filename);

            if (fs.existsSync(oldPath)) {
              try {
                fs.renameSync(oldPath, newPath);
              } catch (mvErr) {
                console.warn(`[documentArchiveService] Failed moving file ${doc.filename}:`, mvErr);
              }
            }

            // Clean up from old dossier
            if (oldGr !== 'UNASSIGNED' && dossiersStore[oldGr]) {
              dossiersStore[oldGr].documents = dossiersStore[oldGr].documents.filter((d) => d.id !== doc.id);
              if (dossiersStore[oldGr].documents.length === 0) {
                delete dossiersStore[oldGr];
              }
            }

            doc.grNo = targetGr;
            doc.url = `/api/documents/file/${targetGr}/${encodeURIComponent(doc.filename)}`;
            updateStudentDossier(targetGr, doc);
            reassignedDocs++;
          }
        }

        // Clean up temporary UNASSIGNED dossier if empty
        if (dossiersStore['UNASSIGNED'] && dossiersStore['UNASSIGNED'].documents.length === 0) {
          delete dossiersStore['UNASSIGNED'];
        }
      }
    }
  }

  // Sync Google sheet metadata into all student dossiers
  for (const [grNo, dossier] of Object.entries(dossiersStore)) {
    const sheetRec = recordMap.get(grNo);
    if (sheetRec) {
      if (!dossier.studentName || dossier.studentName === 'Student') {
        dossier.studentName = sheetRec.studentName || sheetRec['STUDENTNAME'] || dossier.studentName;
      }
      if (!dossier.fatherName) {
        dossier.fatherName = sheetRec.fatherName || sheetRec['FATHERNAME'] || dossier.fatherName;
      }
      dossier.currentClass = sheetRec.currentClass || sheetRec['CURRENTCLASS'] || dossier.currentClass;
      dossier.section = sheetRec.section || sheetRec['SECTION'] || dossier.section;
    }
  }

  // Audit all dossiers against sheet
  const discrepancies = auditAllDossiersAgainstSheet(records);

  saveStores();

  return {
    totalMatched,
    reassignedDocs,
    dossiers: Object.values(dossiersStore),
    documents: Object.values(documentsStore),
    discrepancies,
  };
}

/**
 * Manually assign / reassign a document to a specific student GR
 */
export function assignDocumentToGr(
  docId: string,
  targetGrNo: string,
  studentRecord?: any
): StudentDocumentRecord | null {
  const doc = documentsStore[docId];
  if (!doc) return null;

  const currentGr = doc.grNo;
  const cleanTargetGr = targetGrNo.trim();

  if (currentGr !== cleanTargetGr) {
    const oldFolder = path.join(DATA_DIR, `GR_${currentGr}`);
    const newFolder = path.join(DATA_DIR, `GR_${cleanTargetGr}`);
    if (!fs.existsSync(newFolder)) {
      fs.mkdirSync(newFolder, { recursive: true });
    }

    const oldPath = path.join(oldFolder, doc.filename);
    const newPath = path.join(newFolder, doc.filename);
    if (fs.existsSync(oldPath)) {
      try {
        fs.renameSync(oldPath, newPath);
      } catch (mvErr) {
        console.warn(`[documentArchiveService] Failed moving file ${doc.filename}:`, mvErr);
      }
    }

    if (currentGr !== 'UNASSIGNED' && dossiersStore[currentGr]) {
      dossiersStore[currentGr].documents = dossiersStore[currentGr].documents.filter(
        (d) => d.id !== doc.id
      );
      if (dossiersStore[currentGr].documents.length === 0) {
        delete dossiersStore[currentGr];
      }
    }

    doc.grNo = cleanTargetGr;
    doc.url = `/api/documents/file/${cleanTargetGr}/${encodeURIComponent(doc.filename)}`;
    updateStudentDossier(cleanTargetGr, doc);

    if (studentRecord && dossiersStore[cleanTargetGr]) {
      const d = dossiersStore[cleanTargetGr];
      d.studentName = studentRecord.studentName || studentRecord['STUDENTNAME'] || d.studentName;
      d.fatherName = studentRecord.fatherName || studentRecord['FATHERNAME'] || d.fatherName;
      d.currentClass = studentRecord.currentClass || studentRecord['CURRENTCLASS'] || d.currentClass;
      d.section = studentRecord.section || studentRecord['SECTION'] || d.section;
    }

    auditDossierAgainstSheet(cleanTargetGr, studentRecord);
    saveStores();
  }

  return doc;
}

/**
 * Mark a discrepancy flag as false flag / dismissed
 */
export function dismissDiscrepancy(flagId: string): boolean {
  if (!flagId) return false;
  dismissedFlagsStore[flagId] = true;
  saveStores();

  for (const dossier of Object.values(dossiersStore)) {
    const flag = dossier.allFlags.find((f) => f.id === flagId);
    if (flag) {
      flag.isDismissed = true;
    }
  }
  return true;
}

/**
 * Un-dismiss a discrepancy flag
 */
export function undismissDiscrepancy(flagId: string): boolean {
  if (!flagId) return false;
  delete dismissedFlagsStore[flagId];
  saveStores();

  for (const dossier of Object.values(dossiersStore)) {
    const flag = dossier.allFlags.find((f) => f.id === flagId);
    if (flag) {
      flag.isDismissed = false;
    }
  }
  return true;
}

/**
 * Get all dismissed flags map
 */
export function getDismissedFlags(): Record<string, boolean> {
  return { ...dismissedFlagsStore };
}

/**
 * Build and stream a class-wise / all-classes clean ZIP export
 */
export function createArchiveZipStream(targetClass?: string): Archiver {
  const archive = new ZipArchive({ zlib: { level: 8 } });

  let csvContent = 'GR_NO,STUDENT_NAME,FATHER_NAME,CLASS,B_FORM,PARENT_CNIC,PHOTO,B_FORM_DOC,CNIC_DOC,STATUS,FLAGS\n';

  const dossiers = Object.values(dossiersStore);

  for (const dossier of dossiers) {
    if (targetClass && targetClass !== 'ALL' && dossier.currentClass !== targetClass) {
      continue;
    }

    const safeClassName = (dossier.currentClass || 'General').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeStudentName = (dossier.studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const folderName = `${safeClassName}/GR_${dossier.grNo}_${safeStudentName}`;

    for (const doc of dossier.documents) {
      const grFolder = path.join(DATA_DIR, `GR_${dossier.grNo}`);
      const filePath = path.join(grFolder, doc.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `${folderName}/${doc.filename}` });
      }
    }

    const hasPhoto = dossier.documents.some((d) => d.classification === 'STUDENT_PHOTO') ? 'YES' : 'NO';
    const hasBForm = dossier.documents.some((d) => d.classification === 'B_FORM') ? 'YES' : 'NO';
    const hasCnic = dossier.documents.some((d) => d.classification.includes('CNIC')) ? 'YES' : 'NO';
    const flagMessages = dossier.allFlags.map((f) => f.message).join('; ');

    csvContent += `"${dossier.grNo}","${dossier.studentName}","${dossier.fatherName}","${dossier.currentClass}","${dossier.bFormNo}","${dossier.parentCnic}","${hasPhoto}","${hasBForm}","${hasCnic}","${dossier.allFlags.length > 0 ? 'FLAGGED' : 'CLEAN'}","${flagMessages.replace(/"/g, '""')}"\n`;
  }

  archive.append(csvContent, { name: 'Audit_And_Verification_Report.csv' });
  return archive;
}
