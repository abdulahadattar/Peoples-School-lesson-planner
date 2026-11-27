import type { ExtractedChildRecord, ExtractedStudentInfo } from '../../types/documentArchive';
import {
  isInvalidPersonName,
  normalizeNadraNumber,
  toEnglishTitleCase,
  validateNadraNumber,
} from './nameMatching.js';
import { containsArabicScript, sanitizeScriptNameField } from '../extractedNameGuard.js';

function sanitizeEnglishPersonName(
  raw?: string | null,
  field?: string,
  onReject?: (field: string, reason: string, raw: string) => void
): string | undefined {
  const cleanScript = sanitizeScriptNameField(raw, (reason, rawVal) => {
    if (field) onReject?.(field, reason, rawVal);
  });
  if (!cleanScript) return undefined;
  if (isInvalidPersonName(cleanScript)) {
    if (field) onReject?.(field, 'matches boilerplate/invalid person name denylist', cleanScript);
    return undefined;
  }
  return toEnglishTitleCase(cleanScript);
}

function sanitizeOptionalTextField(
  raw?: string | null,
  field?: string,
  onReject?: (field: string, reason: string, raw: string) => void
): string | undefined {
  return sanitizeScriptNameField(raw, (reason, rawVal) => {
    if (field) onReject?.(field, reason, rawVal);
  });
}

function sanitizeArabicScriptField(
  raw?: string | null,
  field?: string,
  onReject?: (field: string, reason: string, raw: string) => void
): string | undefined {
  const clean = sanitizeOptionalTextField(raw, field, onReject);
  if (!clean) return undefined;
  if (!containsArabicScript(clean)) {
    if (field) onReject?.(field, 'expected Urdu/Sindhi script characters', clean);
    return undefined;
  }
  return clean;
}

function sanitizeChildrenList(
  children: unknown,
  onReject?: (field: string, reason: string, raw: string) => void
): ExtractedChildRecord[] | undefined {
  if (!Array.isArray(children) || children.length === 0) return undefined;
  const sanitized: ExtractedChildRecord[] = [];
  for (let i = 0; i < children.length; i++) {
    const ch = children[i] as Record<string, any> | null;
    if (!ch || typeof ch !== 'object') continue;
    const childNameEnglish = sanitizeEnglishPersonName(ch.childNameEnglish, `children[${i}].childNameEnglish`, onReject);
    const childNameUrdu = sanitizeArabicScriptField(ch.childNameUrdu, `children[${i}].childNameUrdu`, onReject);
    const childNameSindhi = sanitizeArabicScriptField(ch.childNameSindhi, `children[${i}].childNameSindhi`, onReject);
    const fatherNameEnglish = sanitizeEnglishPersonName(ch.fatherNameEnglish, `children[${i}].fatherNameEnglish`, onReject);
    const fatherNameSindhi = sanitizeArabicScriptField(ch.fatherNameSindhi, `children[${i}].fatherNameSindhi`, onReject);
    const bFormNo = normalizeNadraNumber(ch.bFormNo) || undefined;
    const fatherCnic = normalizeNadraNumber(ch.fatherCnic) || undefined;

    if (!childNameEnglish && !childNameUrdu && !childNameSindhi && !bFormNo) continue;

    sanitized.push({
      entryNo: typeof ch.entryNo === 'number' ? ch.entryNo : i + 1,
      childNameEnglish,
      childNameUrdu,
      childNameSindhi,
      bFormNo,
      dob: typeof ch.dob === 'string' && ch.dob.trim() ? ch.dob.trim() : undefined,
      gender: ch.gender === 'Female' ? 'Female' : ch.gender === 'Male' ? 'Male' : undefined,
      fatherNameEnglish,
      fatherNameSindhi,
      fatherCnic,
      hasTickMark: typeof ch.hasTickMark === 'boolean' ? ch.hasTickMark : undefined,
    });
  }
  return sanitized.length > 0 ? sanitized : undefined;
}

export function sanitizeExtractedStudentInfo(
  aiResult: Record<string, any> | null | undefined,
  currentGr: string,
  onReject?: (field: string, reason: string, raw: string) => void
): ExtractedStudentInfo {
  const src = aiResult && typeof aiResult === 'object' ? aiResult : {};
  const rawBForm = typeof src.bFormNo === 'string' && src.bFormNo.trim()
    ? src.bFormNo
    : typeof src.childCitizenNumber === 'string'
      ? src.childCitizenNumber
      : undefined;

  const rawFatherCnic = typeof src.fatherCnic === 'string' && src.fatherCnic.trim()
    ? src.fatherCnic
    : typeof src.applicantCnic === 'string'
      ? src.applicantCnic
      : undefined;

  return {
    grNo: currentGr !== 'UNASSIGNED' ? currentGr : (typeof src.grNo === 'string' && src.grNo.trim() ? src.grNo.trim() : undefined),
    studentName: sanitizeEnglishPersonName(src.studentNameEnglish, 'studentName', onReject),
    studentNameUrdu: sanitizeArabicScriptField(src.studentNameUrdu, 'studentNameUrdu', onReject),
    studentNameSindhi: sanitizeArabicScriptField(src.studentNameSindhi, 'studentNameSindhi', onReject),
    fatherName: sanitizeEnglishPersonName(src.fatherNameEnglish, 'fatherName', onReject),
    fatherNameUrdu: sanitizeArabicScriptField(src.fatherNameUrdu, 'fatherNameUrdu', onReject),
    fatherNameSindhi: sanitizeArabicScriptField(src.fatherNameSindhi, 'fatherNameSindhi', onReject),
    cardholderName: sanitizeEnglishPersonName(src.cardholderNameEnglish, 'cardholderName', onReject),
    cardholderFatherName: sanitizeEnglishPersonName(src.cardholderFatherNameEnglish, 'cardholderFatherName', onReject),
    applicantName: sanitizeEnglishPersonName(src.applicantName, 'applicantName', onReject),
    applicantCnic: normalizeNadraNumber(src.applicantCnic) || undefined,
    paternalGrandfatherName: sanitizeEnglishPersonName(src.paternalGrandfatherName, 'paternalGrandfatherName', onReject),
    caste: sanitizeOptionalTextField(src.caste, 'caste', onReject),
    bFormNo: normalizeNadraNumber(rawBForm) || undefined,
    bFormValidation: rawBForm ? validateNadraNumber(rawBForm) : undefined,
    fatherCnic: normalizeNadraNumber(rawFatherCnic) || undefined,
    dob: typeof src.dob === 'string' && src.dob.trim() ? src.dob.trim() : undefined,
    gender: src.gender === 'Female' ? 'Female' : src.gender === 'Male' ? 'Male' : undefined,
    hasEnglishText: typeof src.hasEnglishText === 'boolean' ? src.hasEnglishText : undefined,
    classAdmitted: typeof src.classAdmitted === 'string' && src.classAdmitted.trim() ? src.classAdmitted.trim() : undefined,
    previousSchool: typeof src.previousSchool === 'string' && src.previousSchool.trim() ? src.previousSchool.trim() : undefined,
    children: sanitizeChildrenList(src.children, onReject),
    marksheetDetails: src.marksheetDetails && typeof src.marksheetDetails === 'object' ? src.marksheetDetails : undefined,
  };
}
