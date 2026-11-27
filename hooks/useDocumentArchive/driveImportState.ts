/**
 * Pure State Machine & Folder Parsers for Google Drive Ingestion.
 *
 * Kept completely free of React, DOM, and Node built-ins so both browser hooks
 * and `node:test` unit tests can run against the exact same state transitions.
 */

export const DEFAULT_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1wfb76a2vKjXy-CaKm70N2ugY0ue_h7zd?usp=sharing';
export const DEFAULT_DRIVE_FOLDER_ID = '1wfb76a2vKjXy-CaKm70N2ugY0ue_h7zd';

export type DriveImportStatus =
  | 'idle'
  | 'discovering'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'error';

export interface DriveQueueItem {
  fileId: string;
  name: string;
  mimeType: string;
  folderId: string;
  folderName: string;
  packetId: string;
  parsedFolderGrNo: string;
  sizeBytes?: number;
}

export interface DriveImportState {
  folderInput: string;
  folderId: string;
  status: DriveImportStatus;
  jobId: string | null;
  queue: DriveQueueItem[];
  nextIndex: number;
  totalDiscovered: number;
  packetsCount: number;
  processed: number;
  queued: number;
  flagged: number;
  skipped: number;
  duplicates: number;
  currentFileName: string;
  currentFolderName: string;
  errorMessage: string | null;
}

/**
 * Extracts a Google Drive folder ID from a sharing URL or raw folder ID.
 */
export function extractDriveFolderId(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';

  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderMatch) return folderMatch[1];

  const queryMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryMatch) return queryMatch[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes('http')) {
    return raw;
  }
  return '';
}

const GENERIC_FOLDER_WORDS = new Set([
  'images', 'image', 'docs', 'doc', 'documents', 'document',
  'scans', 'scan', 'files', 'student', 'students', 'photos',
  'photo', 'class', 'batch', 'drive', 'archive', 'upload',
]);

function isPlausibleGrDigits(digits: string): boolean {
  if (!digits || digits.length > 5) return false;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (digits.length === 4 && n >= 1950 && n <= 2035) return false;
  return true;
}

/**
 * Browser-safe parser matching server `parseFolderGrInfo`:
 * extracts GR numbers from `"1299_images"`, `"13 Mansoor Lashari"`, `"GR-1299"`, `"06"`.
 */
export function parseClientFolderGr(nameOrSegment: string): string {
  const clean = (nameOrSegment || '').trim();
  if (!clean || GENERIC_FOLDER_WORDS.has(clean.toLowerCase())) return '';

  const explicit = clean.match(/(?:^|[\s_-])gr(?:no)?[\s_#.:-]*(\d{1,5})(?:\b|_)/i);
  if (explicit && isPlausibleGrDigits(explicit[1])) return explicit[1];

  const leadingDigits = clean.match(/^(\d{1,5})(?:[\s_-]|$)/);
  if (leadingDigits && isPlausibleGrDigits(leadingDigits[1])) return leadingDigits[1];

  return '';
}

export function createInitialDriveImportState(
  folderInput: string = DEFAULT_DRIVE_FOLDER_URL
): DriveImportState {
  return {
    folderInput,
    folderId: extractDriveFolderId(folderInput),
    status: 'idle',
    jobId: null,
    queue: [],
    nextIndex: 0,
    totalDiscovered: 0,
    packetsCount: 0,
    processed: 0,
    queued: 0,
    flagged: 0,
    skipped: 0,
    duplicates: 0,
    currentFileName: '',
    currentFolderName: '',
    errorMessage: null,
  };
}

export function setDriveFolderInput(
  state: DriveImportState,
  folderInput: string
): DriveImportState {
  return {
    ...state,
    folderInput,
    folderId: extractDriveFolderId(folderInput),
    errorMessage: state.status === 'error' ? null : state.errorMessage,
    status: state.status === 'error' ? 'idle' : state.status,
  };
}

export function beginDriveDiscovery(
  state: DriveImportState,
  folderId: string
): DriveImportState {
  return {
    ...state,
    folderId,
    status: 'discovering',
    jobId: null,
    queue: [],
    nextIndex: 0,
    totalDiscovered: 0,
    packetsCount: 0,
    processed: 0,
    queued: 0,
    flagged: 0,
    skipped: 0,
    duplicates: 0,
    currentFileName: '',
    currentFolderName: '',
    errorMessage: null,
  };
}

export function seedDriveQueue(
  state: DriveImportState,
  items: DriveQueueItem[],
  packetsCount: number,
  jobId: string
): DriveImportState {
  return {
    ...state,
    status: items.length === 0 ? 'completed' : 'running',
    jobId,
    queue: items,
    nextIndex: 0,
    totalDiscovered: items.length,
    packetsCount,
    queued: items.length,
    errorMessage: null,
  };
}

export function setDriveCurrentItem(
  state: DriveImportState,
  item: DriveQueueItem
): DriveImportState {
  return {
    ...state,
    currentFileName: item.name,
    currentFolderName: item.folderName,
  };
}

export function recordDriveFileOutcome(
  state: DriveImportState,
  outcome: {
    processedDelta?: number;
    skippedDelta?: number;
    flaggedDelta?: number;
    duplicateDelta?: number;
  }
): DriveImportState {
  const nextIndex = Math.min(state.queue.length, state.nextIndex + 1);
  return {
    ...state,
    nextIndex,
    processed: state.processed + (outcome.processedDelta ?? 1),
    queued: Math.max(0, state.queue.length - nextIndex),
    skipped: state.skipped + (outcome.skippedDelta ?? 0),
    flagged: state.flagged + (outcome.flaggedDelta ?? 0),
    duplicates: state.duplicates + (outcome.duplicateDelta ?? 0),
  };
}

export function markDrivePaused(state: DriveImportState): DriveImportState {
  if (state.status !== 'running' && state.status !== 'discovering') return state;
  return {
    ...state,
    status: 'paused',
  };
}

export function resumeDriveRun(state: DriveImportState): DriveImportState {
  if (state.status !== 'paused') return state;
  return {
    ...state,
    status: 'running',
    errorMessage: null,
  };
}

export function markDriveStopped(state: DriveImportState): DriveImportState {
  return {
    ...state,
    status: 'stopped',
    queued: 0,
    currentFileName: '',
    currentFolderName: '',
  };
}

export function completeDriveRun(
  state: DriveImportState,
  finalStats?: { processed?: number; flagged?: number; skipped?: number; duplicates?: number }
): DriveImportState {
  return {
    ...state,
    status: 'completed',
    queued: 0,
    currentFileName: '',
    currentFolderName: '',
    processed: finalStats?.processed ?? state.processed,
    flagged: finalStats?.flagged ?? state.flagged,
    skipped: finalStats?.skipped ?? state.skipped,
    duplicates: finalStats?.duplicates ?? state.duplicates,
  };
}

export function failDriveRun(
  state: DriveImportState,
  errorMessage: string
): DriveImportState {
  return {
    ...state,
    status: 'error',
    errorMessage,
  };
}
