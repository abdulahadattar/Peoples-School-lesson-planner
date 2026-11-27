import { normalizeGrKey } from '../identityNormalization';
import { listPendingSync } from '../sheetSyncQueue';
import { DEFAULT_MARKSHEET_CONFIG } from './config';
import {
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  StudentMarkEntry,
  SubjectKey,
} from './types';

const ENTRIES_STORAGE_KEY = 'phssj_marksheet_entries_v1';
const CONFIG_STORAGE_KEY = 'phssj_marksheet_config_v1';

export function makeMarkEntryKey(grNo: string, examType: MarksheetExamType): string {
  return `${examType}::${String(grNo || '').trim()}`;
}

export function loadMarksheetEntries(): Record<string, StudentMarkEntry> {
  try {
    const raw = localStorage.getItem(ENTRIES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMarksheetEntries(entries: Record<string, StudentMarkEntry>): void {
  try {
    localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('[marksheet] Could not save mark entries:', err);
  }
}

export function loadMarksheetConfig(): MarksheetConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_MARKSHEET_CONFIG;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_MARKSHEET_CONFIG;
    return {
      ...DEFAULT_MARKSHEET_CONFIG,
      ...parsed,
      classTeachers: {
        ...DEFAULT_MARKSHEET_CONFIG.classTeachers,
        ...(parsed.classTeachers || {}),
      },
      subjectMaxMarks: {
        ...DEFAULT_MARKSHEET_CONFIG.subjectMaxMarks,
        ...(parsed.subjectMaxMarks || {}),
      },
    };
  } catch {
    return DEFAULT_MARKSHEET_CONFIG;
  }
}

export function saveMarksheetConfig(config: MarksheetConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('[marksheet] Could not save marksheet config:', err);
  }
}

/**
 * Merges incoming sheet marksheet entries with local overrides so custom
 * GR students and newer manual/imported edits are preserved during live syncs.
 */
export function mergeMarksheetEntries(
  localMap: Record<string, StudentMarkEntry>,
  incomingMap: Record<string, StudentMarkEntry>
): Record<string, StudentMarkEntry> {
  const merged: Record<string, StudentMarkEntry> = { ...localMap };
  for (const [key, incoming] of Object.entries(incomingMap || {})) {
    const local = localMap[key];
    if (!local) {
      merged[key] = incoming;
      continue;
    }
    const localUpdatedAt = Number(local.updatedAt || 0);
    const incomingUpdatedAt = Number(incoming.updatedAt || 0);
    if (localUpdatedAt > 0 && (incomingUpdatedAt === 0 || localUpdatedAt >= incomingUpdatedAt)) {
      merged[key] = local;
    } else {
      merged[key] = incoming;
    }
  }

  // Always re-apply pending unsynced marksheet deltas (e.g. OMR scans awaiting Sheets push)
  // so background live-sheet refreshes never overwrite offline or unpushed scores.
  const pendingMarksheets = listPendingSync().filter((item) => item.target === 'marksheet');
  for (const pending of pendingMarksheets) {
    const payload = pending.payload as {
      grNo?: string;
      gradeLevel?: MarksheetGradeLevel;
      examType?: MarksheetExamType;
      subjectKey?: SubjectKey;
      score?: number;
    } | null;
    if (!payload?.grNo || !payload.examType || !payload.subjectKey || typeof payload.score !== 'number') {
      continue;
    }
    const targetGrNorm = normalizeGrKey(payload.grNo);
    const existingKey =
      Object.keys(merged).find(
        (k) =>
          merged[k].examType === payload.examType &&
          normalizeGrKey(merged[k].grNo) === targetGrNorm
      ) || makeMarkEntryKey(payload.grNo, payload.examType);
    const base = merged[existingKey] || localMap[existingKey];
    if (base) {
      merged[existingKey] = {
        ...base,
        scores: {
          ...(base.scores || {}),
          [payload.subjectKey]: payload.score,
        },
        updatedAt: Math.max(Number(base.updatedAt || 0), Number(pending.queuedAt || 0)),
      };
    }
  }

  return merged;
}

