import { doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { MarksheetConfig, MarksheetExamType, StudentMarkEntry } from './types';

const MARKSHEETS_CACHE_COLLECTION = 'marksheets_cache';
const EXAM_TYPES: MarksheetExamType[] = ['midterm', 'mock', 'preboard'];

export interface MarksheetCacheSnapshot {
  hasCache: boolean;
  spreadsheetId: string;
  contentHash: string | null;
  syncedAt: string | null;
  count: number;
  configPatch: Partial<MarksheetConfig> | null;
  entriesByKey: Record<string, StudentMarkEntry>;
}

function safeIdSegment(spreadsheetId: string): string {
  const cleaned = String(spreadsheetId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.slice(0, 100) || 'default';
}

export function metaDocId(spreadsheetId: string): string {
  return `meta_${safeIdSegment(spreadsheetId)}`;
}

export function examDocId(spreadsheetId: string, examType: MarksheetExamType): string {
  return `exam_${examType}_${safeIdSegment(spreadsheetId)}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export async function saveMarksheetCacheSnapshot(params: {
  spreadsheetId: string;
  contentHash: string;
  syncedAt: string;
  count: number;
  configPatch: Partial<MarksheetConfig> | null;
  entriesByKey: Record<string, StudentMarkEntry>;
  updatedBy?: string | null;
}): Promise<void> {
  const { spreadsheetId, contentHash, syncedAt, count, configPatch, entriesByKey, updatedBy } =
    params;
  const nowInt = Math.floor(Date.now());
  const byExam: Record<MarksheetExamType, Record<string, StudentMarkEntry>> = {
    midterm: {},
    mock: {},
    preboard: {},
  };

  for (const [key, entry] of Object.entries(entriesByKey || {})) {
    const exam = entry.examType || 'midterm';
    if (byExam[exam]) {
      byExam[exam][key] = stripUndefinedDeep({ ...entry, examType: exam });
    }
  }

  const batch = writeBatch(db);
  const metaRef = doc(db, MARKSHEETS_CACHE_COLLECTION, metaDocId(spreadsheetId));
  const metaPayload: Record<string, unknown> = {
    docType: 'meta',
    spreadsheetId: safeIdSegment(spreadsheetId),
    contentHash: String(contentHash || '').slice(0, 128),
    syncedAt: String(syncedAt || new Date().toISOString()).slice(0, 64),
    updatedAt: nowInt,
    count: Math.max(0, Math.floor(count || 0)),
    configPatch: configPatch ? stripUndefinedDeep(configPatch) : null,
  };
  if (updatedBy) {
    metaPayload.updatedBy = String(updatedBy).slice(0, 160);
  }
  batch.set(metaRef, metaPayload);

  for (const examType of EXAM_TYPES) {
    const examEntries = byExam[examType];
    const examRef = doc(db, MARKSHEETS_CACHE_COLLECTION, examDocId(spreadsheetId, examType));
    const examPayload: Record<string, unknown> = {
      docType: 'exam',
      spreadsheetId: safeIdSegment(spreadsheetId),
      examType,
      contentHash: String(contentHash || '').slice(0, 128),
      syncedAt: String(syncedAt || new Date().toISOString()).slice(0, 64),
      updatedAt: nowInt,
      count: Object.keys(examEntries).length,
      entriesByKey: examEntries,
    };
    if (updatedBy) {
      examPayload.updatedBy = String(updatedBy).slice(0, 160);
    }
    batch.set(examRef, examPayload);
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, MARKSHEETS_CACHE_COLLECTION);
  }
}

export function subscribeMarksheetCache(
  spreadsheetId: string,
  onData: (snapshot: MarksheetCacheSnapshot) => void,
  onError?: (err: unknown) => void
): () => void {
  let metaData: Record<string, unknown> | null = null;
  let metaLoaded = false;
  const examMaps: Record<MarksheetExamType, Record<string, StudentMarkEntry>> = {
    midterm: {},
    mock: {},
    preboard: {},
  };
  const examLoaded: Record<MarksheetExamType, boolean> = {
    midterm: false,
    mock: false,
    preboard: false,
  };

  const emit = () => {
    if (!metaLoaded || !EXAM_TYPES.every((t) => examLoaded[t])) {
      return;
    }
    const mergedEntries: Record<string, StudentMarkEntry> = {
      ...examMaps.midterm,
      ...examMaps.mock,
      ...examMaps.preboard,
    };
    const hasMeta = Boolean(metaData && typeof metaData.contentHash === 'string');
    const hasEntries = Object.keys(mergedEntries).length > 0;
    onData({
      hasCache: hasMeta || hasEntries,
      spreadsheetId,
      contentHash: typeof metaData?.contentHash === 'string' ? metaData.contentHash : null,
      syncedAt: typeof metaData?.syncedAt === 'string' ? metaData.syncedAt : null,
      count: typeof metaData?.count === 'number' ? metaData.count : Object.keys(mergedEntries).length,
      configPatch:
        metaData?.configPatch && typeof metaData.configPatch === 'object'
          ? (metaData.configPatch as Partial<MarksheetConfig>)
          : null,
      entriesByKey: mergedEntries,
    });
  };

  const handleSnapError = (path: string, err: unknown) => {
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch (wrapped) {
      onError?.(wrapped);
    }
  };

  const unsubs: Array<() => void> = [];
  const metaId = metaDocId(spreadsheetId);
  unsubs.push(
    onSnapshot(
      doc(db, MARKSHEETS_CACHE_COLLECTION, metaId),
      (snap) => {
        metaLoaded = true;
        metaData = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        emit();
      },
      (err) => handleSnapError(`${MARKSHEETS_CACHE_COLLECTION}/${metaId}`, err)
    )
  );

  for (const examType of EXAM_TYPES) {
    const id = examDocId(spreadsheetId, examType);
    unsubs.push(
      onSnapshot(
        doc(db, MARKSHEETS_CACHE_COLLECTION, id),
        (snap) => {
          examLoaded[examType] = true;
          const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
          examMaps[examType] =
            data?.entriesByKey && typeof data.entriesByKey === 'object'
              ? (data.entriesByKey as Record<string, StudentMarkEntry>)
              : {};
          emit();
        },
        (err) => handleSnapError(`${MARKSHEETS_CACHE_COLLECTION}/${id}`, err)
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}
