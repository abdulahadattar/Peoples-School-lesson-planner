import { normalizeGrKey } from '../identityNormalization';
import { makeMarkEntryKey } from './storage';
import type {
  MarksheetExamType,
  MarksheetGradeLevel,
  OptionalElective,
  OptionalLanguage,
  StudentMarkEntry,
  SubjectKey,
} from './types';

const LOCAL_PENDING_EDITS_KEY = 'phssj_marksheet_local_pending_edits_v1';

export interface MarksheetPendingFieldAuthor {
  name: string;
  email?: string;
  updatedAt: number;
}

export interface MarksheetPendingEdit {
  docId: string;
  grNo: string;
  studentName?: string;
  gradeLevel: MarksheetGradeLevel;
  examType: MarksheetExamType;
  scores: Partial<Record<SubjectKey, number | 'A' | null>>;
  previousScores?: Partial<Record<SubjectKey, number | 'A' | null>>;
  fieldAuthors?: Partial<Record<SubjectKey, MarksheetPendingFieldAuthor>>;
  optionalLanguage?: OptionalLanguage;
  optionalElective?: OptionalElective;
  updatedAt: number;
  updatedByUid: string;
  updatedByEmail?: string;
  updatedByName?: string;
}

export function makePendingEditDocId(examType: MarksheetExamType, grNo: string): string {
  const safeGr =
    String(grNo || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
  return `${examType}__${safeGr}`.slice(0, 128);
}

export function sanitizeScoreMap(
  scores?: Partial<Record<SubjectKey, number | 'A' | null>>
): Partial<Record<SubjectKey, number | 'A' | null>> {
  const out: Partial<Record<SubjectKey, number | 'A' | null>> = {};
  let count = 0;
  for (const [k, v] of Object.entries(scores || {})) {
    if (count >= 16) break;
    if (v === 'A' || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
      out[k as SubjectKey] = v;
      count++;
    }
  }
  return out;
}

export function sanitizeFieldAuthors(
  authors?: Partial<Record<SubjectKey, MarksheetPendingFieldAuthor>>
): Partial<Record<SubjectKey, MarksheetPendingFieldAuthor>> | undefined {
  if (!authors) return undefined;
  const out: Partial<Record<SubjectKey, MarksheetPendingFieldAuthor>> = {};
  let count = 0;
  for (const [k, v] of Object.entries(authors)) {
    if (count >= 16 || !v) break;
    const entry: MarksheetPendingFieldAuthor = {
      name: String(v.name || 'Teacher').slice(0, 120),
      updatedAt: Math.floor(Number(v.updatedAt || Date.now())),
    };
    if (v.email) {
      entry.email = String(v.email).slice(0, 160);
    }
    out[k as SubjectKey] = entry;
    count++;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function mergePendingEditDelta(
  existing: MarksheetPendingEdit | undefined,
  patch: {
    grNo: string;
    studentName?: string;
    gradeLevel: MarksheetGradeLevel;
    examType: MarksheetExamType;
    changedScores?: Partial<Record<SubjectKey, number | 'A' | null>>;
    baseScores?: Partial<Record<SubjectKey, number | 'A' | null>>;
    optionalLanguage?: OptionalLanguage;
    optionalElective?: OptionalElective;
    author: { uid: string; name?: string | null; email?: string | null };
    nowMs?: number;
  }
): MarksheetPendingEdit {
  const nowInt = Math.floor(patch.nowMs ?? Date.now());
  const docId = makePendingEditDocId(patch.examType, patch.grNo);
  const scores: Partial<Record<SubjectKey, number | 'A' | null>> = {
    ...(existing?.scores || {}),
  };
  const previousScores: Partial<Record<SubjectKey, number | 'A' | null>> = {
    ...(existing?.previousScores || {}),
  };
  const fieldAuthors: Partial<Record<SubjectKey, MarksheetPendingFieldAuthor>> = {
    ...(existing?.fieldAuthors || {}),
  };

  const authorLabel =
    (patch.author.name || '').trim() ||
    (patch.author.email || '').trim() ||
    'Teacher';

  for (const [rawKey, rawVal] of Object.entries(patch.changedScores || {})) {
    const subj = rawKey as SubjectKey;
    if (!(subj in previousScores)) {
      const baseVal = patch.baseScores?.[subj];
      previousScores[subj] =
        baseVal === 'A' || (typeof baseVal === 'number' && Number.isFinite(baseVal))
          ? baseVal
          : null;
    }
    scores[subj] = rawVal === undefined ? null : rawVal;
    const fa: MarksheetPendingFieldAuthor = {
      name: authorLabel.slice(0, 120),
      updatedAt: nowInt,
    };
    if (patch.author.email) {
      fa.email = patch.author.email.slice(0, 160);
    }
    fieldAuthors[subj] = fa;
  }

  const out: MarksheetPendingEdit = {
    docId,
    grNo: String(patch.grNo).trim().slice(0, 32),
    gradeLevel: patch.gradeLevel,
    examType: patch.examType,
    scores: sanitizeScoreMap(scores),
    updatedAt: nowInt,
    updatedByUid: patch.author.uid || 'local',
  };

  const name = (patch.studentName || existing?.studentName || '').trim();
  if (name) {
    out.studentName = name.slice(0, 120);
  }
  if (Object.keys(previousScores).length > 0) {
    out.previousScores = sanitizeScoreMap(previousScores);
  }
  const cleanAuthors = sanitizeFieldAuthors(fieldAuthors);
  if (cleanAuthors) {
    out.fieldAuthors = cleanAuthors;
  }

  const optLang = patch.optionalLanguage || existing?.optionalLanguage;
  if (optLang === 'Sindhi' || optLang === 'Urdu') {
    out.optionalLanguage = optLang;
  }
  const optElec = patch.optionalElective || existing?.optionalElective;
  if (optElec === 'Biology' || optElec === 'ICT' || optElec === 'Mathematics') {
    out.optionalElective = optElec;
  }
  if (patch.author.email) {
    out.updatedByEmail = patch.author.email.slice(0, 160);
  }
  if (patch.author.name) {
    out.updatedByName = patch.author.name.slice(0, 120);
  }

  return out;
}

export function loadLocalPendingEdits(): MarksheetPendingEdit[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_PENDING_EDITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalPendingEdits(edits: MarksheetPendingEdit[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_PENDING_EDITS_KEY, JSON.stringify(edits));
  } catch (err) {
    console.warn('[marksheet] Could not save local pending edits:', err);
  }
}

export function upsertLocalPendingEdit(edit: MarksheetPendingEdit): MarksheetPendingEdit[] {
  const current = loadLocalPendingEdits();
  const next = current.filter((e) => e.docId !== edit.docId);
  next.unshift(edit);
  saveLocalPendingEdits(next);
  return next;
}

export function removeLocalPendingEdits(docIds: string[]): MarksheetPendingEdit[] {
  const drop = new Set(docIds);
  const next = loadLocalPendingEdits().filter((e) => !drop.has(e.docId));
  saveLocalPendingEdits(next);
  return next;
}

export function combinePendingEditLists(
  remoteEdits: MarksheetPendingEdit[],
  localEdits: MarksheetPendingEdit[]
): MarksheetPendingEdit[] {
  const byId = new Map<string, MarksheetPendingEdit>();
  for (const r of remoteEdits) {
    byId.set(r.docId, r);
  }
  for (const l of localEdits) {
    const r = byId.get(l.docId);
    if (!r) {
      byId.set(l.docId, l);
      continue;
    }
    const newer = Number(l.updatedAt || 0) >= Number(r.updatedAt || 0) ? l : r;
    const older = newer === l ? r : l;
    byId.set(l.docId, {
      ...older,
      ...newer,
      scores: { ...(older.scores || {}), ...(newer.scores || {}) },
      previousScores: { ...(older.previousScores || {}), ...(newer.previousScores || {}) },
      fieldAuthors: { ...(older.fieldAuthors || {}), ...(newer.fieldAuthors || {}) },
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
  );
}

export function applyPendingEditsToEntries(
  baseEntries: Record<string, StudentMarkEntry>,
  pendingEdits: MarksheetPendingEdit[]
): Record<string, StudentMarkEntry> {
  if (!pendingEdits.length) return baseEntries;
  const merged: Record<string, StudentMarkEntry> = { ...baseEntries };

  for (const edit of pendingEdits) {
    const targetGrNorm = normalizeGrKey(edit.grNo);
    const existingKey =
      Object.keys(merged).find(
        (k) =>
          merged[k]?.examType === edit.examType &&
          normalizeGrKey(merged[k]?.grNo) === targetGrNorm
      ) || makeMarkEntryKey(edit.grNo, edit.examType);

    const existing = merged[existingKey];
    const nextEntry: StudentMarkEntry = {
      ...(existing || {
        grNo: edit.grNo,
        studentName: edit.studentName || `Student ${edit.grNo}`,
        currentClass: edit.gradeLevel,
        scores: {},
        examType: edit.examType,
      }),
      scores: {
        ...(existing?.scores || {}),
        ...(edit.scores || {}),
      },
      updatedAt: Math.max(Number(existing?.updatedAt || 0), Number(edit.updatedAt || 0)),
    };

    if (edit.studentName && !existing?.studentName) {
      nextEntry.studentName = edit.studentName;
    }
    if (edit.optionalLanguage) {
      nextEntry.optionalLanguage = edit.optionalLanguage;
    }
    if (edit.optionalElective) {
      nextEntry.optionalElective = edit.optionalElective;
    }

    merged[existingKey] = nextEntry;
  }

  return merged;
}
