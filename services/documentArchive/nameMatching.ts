import path from 'path';
import { normalizePakistaniName, validateNadraNumber, NadraValidationResult } from '../identityNormalization.js';
import { SINDH_PAKISTANI_CASTES, SINDHI_NAME_DICTIONARY, SINDHI_CHAR_MAP } from './constants.js';

export { normalizePakistaniName, validateNadraNumber };
export type { NadraValidationResult };

export interface NameCasteVarianceResult {
  isMatch: boolean;
  hasEnrichment: boolean;
  direction?: 'doc_has_full_name' | 'sheet_already_has_full_name' | 'exact' | 'none';
  detectedCaste?: string;
  recommendedFullName?: string;
  baseName?: string;
  similarity: number;
  reason?: string;
}

export function normalizeNadraNumber(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 12)}-${cleaned.slice(12)}`;
  }
  return raw.trim();
}

export function toEnglishTitleCase(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function extractGrFromPath(filePath: string): string {
  if (!filePath) return 'UNASSIGNED';
  const parts = filePath.split(/[/\\]/);
  for (const part of parts) {
    const match = part.match(/(?:GR|G\.R|G_R|GR_NO|GRNO)[\s_-]*(\d{2,6})/i);
    if (match) return match[1];
    if (/^\d{2,6}$/.test(part.trim())) return part.trim();
  }
  const baseName = path.basename(filePath, path.extname(filePath));
  const grMatch = baseName.match(/(?:GR|G\.R|G_R|GR_NO|GRNO)[\s_-]*(\d{2,6})/i);
  if (grMatch) return grMatch[1];
  const prefixMatch = baseName.match(/^(\d{2,6})(?:[\s_.-]|$)/);
  if (prefixMatch) return prefixMatch[1];
  const isolatedMatch = baseName.match(/(?:^|[\s_.-])(\d{3,6})(?:[\s_.-]|$)/);
  if (isolatedMatch) return isolatedMatch[1];
  return 'UNASSIGNED';
}

export function extractCasteFromName(name?: string): { baseName: string; detectedCaste?: string } {
  if (!name) return { baseName: '' };
  const clean = name.trim();
  const tokens = clean.split(/\s+/);
  if (tokens.length <= 1) return { baseName: clean };
  const lastWord = tokens[tokens.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  for (const caste of SINDH_PAKISTANI_CASTES) {
    if (lastWord === caste.toLowerCase()) {
      const baseTokens = tokens.slice(0, tokens.length - 1);
      return { baseName: baseTokens.join(' '), detectedCaste: caste };
    }
  }
  return { baseName: clean };
}

export function transliterateSindhiToEnglish(text?: string): string {
  if (!text) return '';
  const clean = text.trim();
  if (SINDHI_NAME_DICTIONARY[clean]) return SINDHI_NAME_DICTIONARY[clean];
  const words = clean.split(/\s+/).map((w) => {
    if (SINDHI_NAME_DICTIONARY[w]) return SINDHI_NAME_DICTIONARY[w];
    let res = '';
    for (let i = 0; i < w.length; i++) {
      const pair = w.slice(i, i + 2);
      if (SINDHI_CHAR_MAP[pair]) {
        res += SINDHI_CHAR_MAP[pair];
        i++;
      } else if (SINDHI_CHAR_MAP[w[i]]) {
        res += SINDHI_CHAR_MAP[w[i]];
      }
    }
    return res ? res.charAt(0).toUpperCase() + res.slice(1) : w;
  });
  return words.join(' ');
}

export function calculateStringSimilarity(str1?: string, str2?: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
  }
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i++) track[0][i] = i;
  for (let j = 0; j <= s2.length; j++) track[j][0] = j;
  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + indicator);
    }
  }
  const distance = track[s2.length][s1.length];
  const maxLen = Math.max(s1.length, s2.length);
  return Math.max(0, 1 - distance / maxLen);
}

export function isSindhiNameMatch(sindhiName?: string, englishName?: string): boolean {
  if (!sindhiName || !englishName) return false;
  const s = sindhiName.trim();
  const e = englishName.toLowerCase().trim();
  const transliterated = transliterateSindhiToEnglish(s).toLowerCase();
  if (transliterated) {
    if (transliterated === e || transliterated.includes(e) || e.includes(transliterated)) return true;
    if (calculateStringSimilarity(transliterated, e) >= 0.65) return true;
  }
  const sTokens = s.split(/\s+/).map((t) => transliterateSindhiToEnglish(t).toLowerCase());
  const eTokens = e.split(/\s+/).map((t) => t.toLowerCase());
  for (const st of sTokens) {
    for (const et of eTokens) {
      if (st && et && (st === et || calculateStringSimilarity(st, et) >= 0.70)) return true;
    }
  }
  return false;
}

export function analyzeNameCasteOrFullNameVariance(docName?: string, sheetName?: string): NameCasteVarianceResult {
  if (!docName || !sheetName) return { isMatch: false, hasEnrichment: false, similarity: 0 };
  const rawDoc = docName.trim();
  const rawSheet = sheetName.trim();
  if (!rawDoc || !rawSheet) return { isMatch: false, hasEnrichment: false, similarity: 0 };
  if (rawDoc.toLowerCase() === rawSheet.toLowerCase()) {
    return { isMatch: true, hasEnrichment: false, direction: 'exact', recommendedFullName: rawDoc, baseName: rawDoc, similarity: 1.0, reason: 'Exact string match' };
  }
  const normDoc = normalizePakistaniName(rawDoc);
  const normSheet = normalizePakistaniName(rawSheet);
  if (normDoc === normSheet && normDoc.length > 0) {
    return { isMatch: true, hasEnrichment: false, direction: 'exact', recommendedFullName: rawDoc, baseName: rawDoc, similarity: 0.98, reason: 'Phonetically normalized match' };
  }
  const tokensDoc = normDoc.split(/\s+/).filter(Boolean);
  const tokensSheet = normSheet.split(/\s+/).filter(Boolean);
  const rawTokensDoc = rawDoc.split(/\s+/).filter(Boolean);
  const rawTokensSheet = rawSheet.split(/\s+/).filter(Boolean);

  if (tokensDoc.length > tokensSheet.length && tokensSheet.length >= 1) {
    const isPrefix = tokensSheet.every((st, idx) => tokensDoc[idx] === st);
    let matchCount = 0;
    let dIdx = 0;
    for (const st of tokensSheet) {
      while (dIdx < tokensDoc.length && tokensDoc[dIdx] !== st) dIdx++;
      if (dIdx < tokensDoc.length && tokensDoc[dIdx] === st) { matchCount++; dIdx++; }
    }
    if (isPrefix || matchCount === tokensSheet.length) {
      const extraRawTokens = isPrefix ? rawTokensDoc.slice(tokensSheet.length) : rawTokensDoc.filter((_, i) => !tokensSheet.includes(tokensDoc[i]));
      const detectedCaste = extraRawTokens.join(' ').trim() || extractCasteFromName(docName).detectedCaste || 'Caste / Surname';
      return { isMatch: true, hasEnrichment: true, direction: 'doc_has_full_name', detectedCaste, recommendedFullName: rawDoc, baseName: rawSheet, similarity: 0.96, reason: `Document verifies full name incorporating caste/surname "${detectedCaste}"` };
    }
  }

  if (tokensSheet.length > tokensDoc.length && tokensDoc.length >= 1) {
    const isPrefix = tokensDoc.every((dt, idx) => tokensSheet[idx] === dt);
    if (isPrefix) {
      const extraRawTokens = rawTokensSheet.slice(tokensDoc.length);
      const detectedCaste = extraRawTokens.join(' ').trim() || extractCasteFromName(sheetName).detectedCaste;
      return { isMatch: true, hasEnrichment: false, direction: 'sheet_already_has_full_name', detectedCaste, recommendedFullName: rawSheet, baseName: rawDoc, similarity: 0.96, reason: `Sheet already holds complete full name with caste "${detectedCaste}"` };
    }
  }

  const casteDoc = extractCasteFromName(rawDoc);
  const casteSheet = extractCasteFromName(rawSheet);
  const baseNormDoc = normalizePakistaniName(casteDoc.baseName);
  const baseNormSheet = normalizePakistaniName(casteSheet.baseName);
  if (baseNormDoc && baseNormSheet && baseNormDoc === baseNormSheet) {
    const detectedCaste = casteDoc.detectedCaste || casteSheet.detectedCaste;
    const hasEnrichment = Boolean(casteDoc.detectedCaste && !casteSheet.detectedCaste);
    return { isMatch: true, hasEnrichment, direction: hasEnrichment ? 'doc_has_full_name' : 'exact', detectedCaste, recommendedFullName: hasEnrichment ? rawDoc : (rawDoc.length >= rawSheet.length ? rawDoc : rawSheet), baseName: casteDoc.baseName, similarity: 0.95, reason: `Base name match with caste variance ("${detectedCaste || 'caste'}")` };
  }

  return { isMatch: false, hasEnrichment: false, similarity: 0 };
}

export function calculateNameSimilarity(nameA?: string, nameB?: string): { similarity: number; tokenMatch: boolean; details: string; matchedCaste?: string } {
  if (!nameA || !nameB) return { similarity: 0, tokenMatch: false, details: 'Empty name' };
  const rawA = nameA.toLowerCase().trim();
  const rawB = nameB.toLowerCase().trim();
  if (rawA === rawB) return { similarity: 1.0, tokenMatch: true, details: 'Exact match' };
  const normA = normalizePakistaniName(nameA);
  const normB = normalizePakistaniName(nameB);
  if (normA === normB && normA.length > 0) return { similarity: 0.98, tokenMatch: true, details: 'Normalized match' };
  const variance = analyzeNameCasteOrFullNameVariance(nameA, nameB);
  if (variance.isMatch) {
    return { similarity: variance.similarity, tokenMatch: true, matchedCaste: variance.detectedCaste, details: variance.reason || `Full name match incorporating caste (${variance.detectedCaste || 'caste'})` };
  }
  const casteInfoA = extractCasteFromName(nameA);
  const casteInfoB = extractCasteFromName(nameB);
  const matchedCaste = casteInfoA.detectedCaste || casteInfoB.detectedCaste;
  const baseNormA = normalizePakistaniName(casteInfoA.baseName);
  const baseNormB = normalizePakistaniName(casteInfoB.baseName);
  if (baseNormA && baseNormB && baseNormA === baseNormB) {
    return { similarity: 0.95, tokenMatch: true, matchedCaste, details: `Base name match with caste variance (${matchedCaste || 'caste'})` };
  }
  const tokensA = normA.split(' ').filter((t) => t.length > 1);
  const tokensB = normB.split(' ').filter((t) => t.length > 1);
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = tokensA.filter((t) => setB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  const jaccard = union.size > 0 ? intersection.length / union.size : 0;
  const isSubset = tokensA.every((t) => setB.has(t)) || tokensB.every((t) => setA.has(t));
  const charSim = calculateStringSimilarity(normA, normB);
  let finalSim = 0;
  if (isSubset && intersection.length >= 1) {
    finalSim = Math.max(0.85, (intersection.length / Math.min(tokensA.length, tokensB.length)) * 0.95);
  } else {
    finalSim = Math.max(charSim, jaccard * 0.7 + charSim * 0.3);
  }
  return { similarity: Number(finalSim.toFixed(2)), tokenMatch: intersection.length > 0, matchedCaste, details: `Tokens: ${intersection.join(', ') || 'none'} | Sim: ${Math.round(finalSim * 100)}%` };
}

export function compareNadraNumberWithOcrTolerance(numA?: string, numB?: string): { score: number; exact: boolean; diffCount: number; reason: string; incompleteOcr?: boolean } {
  if (!numA || !numB) return { score: 0, exact: false, diffCount: 99, reason: 'Empty NADRA value' };
  const dA = numA.replace(/\D/g, '');
  const dB = numB.replace(/\D/g, '');
  if (!dA || !dB) return { score: 0, exact: false, diffCount: 99, reason: 'No digits' };
  if (dA === dB && dA.length === 13) return { score: 1.0, exact: true, diffCount: 0, reason: 'Exact 13-digit match' };
  const minLen = Math.min(dA.length, dB.length);
  const maxLen = Math.max(dA.length, dB.length);
  if (minLen >= 6 && maxLen === 13) {
    const shortStr = dA.length < 13 ? dA : dB;
    const longStr = dA.length === 13 ? dA : dB;
    if (longStr.includes(shortStr) || longStr.startsWith(shortStr) || longStr.endsWith(shortStr)) {
      return { score: 0.95, exact: false, diffCount: 1, incompleteOcr: true, reason: `Incomplete OCR read (${shortStr.length} digits) matched valid 13-digit record` };
    }
  }
  if (dA.length === 13 && dB.length === 13) {
    let diffs = 0;
    for (let i = 0; i < 13; i++) { if (dA[i] !== dB[i]) diffs++; }
    if (diffs === 1) return { score: 0.90, exact: false, diffCount: 1, reason: '12 of 13 digits matched (1-digit OCR variance)' };
    if (diffs === 2) return { score: 0.70, exact: false, diffCount: 2, reason: '11 of 13 digits matched (2-digit OCR variance)' };
    const serialA = dA.slice(5, 12);
    const serialB = dB.slice(5, 12);
    if (serialA === serialB && serialA.length === 7) return { score: 0.88, exact: false, diffCount: diffs, reason: 'NADRA 7-digit serial block matched' };
  }
  if (Math.abs(dA.length - dB.length) <= 2 && (dA.length >= 9 || dB.length >= 9)) {
    const sim = calculateStringSimilarity(dA, dB);
    if (sim >= 0.80) return { score: 0.82, exact: false, diffCount: Math.abs(dA.length - dB.length), incompleteOcr: minLen < 13, reason: `High digit sequence overlap (${Math.round(sim * 100)}%)` };
  }
  return { score: 0, exact: false, diffCount: 99, reason: 'Mismatch' };
}

export function compareDobWithTolerance(dobA?: string, dobB?: string): { score: number; matchType: string; matched: boolean } {
  if (!dobA || !dobB) return { score: 0, matchType: 'Empty', matched: false };
  const parseDobParts = (raw: string): { day?: number; month?: number; year?: number } => {
    const clean = raw.trim().replace(/[./\\]/g, '-');
    const parts = clean.split('-').map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));
    if (parts.length === 3) {
      if (parts[0] > 1900 && parts[0] < 2050) return { year: parts[0], month: parts[1], day: parts[2] };
      if (parts[2] > 1900 && parts[2] < 2050) return { day: parts[0], month: parts[1], year: parts[2] };
    }
    return {};
  };
  const pA = parseDobParts(dobA);
  const pB = parseDobParts(dobB);
  if (pA.year && pB.year) {
    if (pA.year === pB.year && pA.month === pB.month && pA.day === pB.day) return { score: 1.0, matchType: 'Exact Date of Birth', matched: true };
    if (pA.year === pB.year && pA.month === pB.day && pA.day === pB.month) return { score: 0.92, matchType: 'Swapped Day/Month Format', matched: true };
    if (pA.year === pB.year && pA.month === pB.month) return { score: 0.85, matchType: 'Year & Month Match', matched: true };
    if (pA.year === pB.year && (pA.month === pB.month || pA.day === pB.day)) return { score: 0.75, matchType: 'Year & Partial Date Match', matched: true };
    if (Math.abs(pA.year - pB.year) === 1 && pA.month === pB.month && pA.day === pB.day) return { score: 0.80, matchType: 'Day & Month Match (+/-1 year)', matched: true };
    if (pA.year === pB.year) return { score: 0.50, matchType: 'Birth Year Match', matched: true };
  }
  const digitsA = dobA.replace(/\D/g, '');
  const digitsB = dobB.replace(/\D/g, '');
  if (digitsA && digitsB && digitsA === digitsB) return { score: 0.95, matchType: 'Digit sequence match', matched: true };
  return { score: 0, matchType: 'Mismatch', matched: false };
}

export function isInvalidPersonName(name?: string | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  if (n.length < 2) return true;
  const boilerplate = [
    'government', 'sindh', 'pakistan', 'board of intermediate', 'board of secondary', 'bise',
    'education foundation', 'peoples higher secondary', 'child registration certificate',
    'national database', 'nadra', 'birth certificate', 'school leaving', 'marks certificate',
    'admission form', 'student profile', 'head master', 'headmaster', 'principal', 'directorate',
    'signature', 'applicant', 'guardian', 'citizen number', 'unassigned', 'unknown', 'none', 'null', 'n/a',
  ];
  return boilerplate.some((b) => n.includes(b));
}
