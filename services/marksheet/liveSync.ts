import { MARKSHEET_SPREADSHEET_ID } from './config';
import { importMarksheetWorkbook } from './importer';
import { makeMarkEntryKey } from './storage';
import type { MarksheetConfig, StudentMarkEntry } from './types';

export interface LiveMarksheetSyncResponse {
  ok: boolean;
  unchanged?: boolean;
  spreadsheetId: string;
  contentHash?: string;
  syncedAt: string;
  count?: number;
  configPatch?: Partial<MarksheetConfig> | null;
  entriesByKey?: Record<string, StudentMarkEntry>;
  fromCache?: boolean;
  needsAuth?: boolean;
  error?: string;
}

function browserFnv1aHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch ^ ((i + 1) & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
}

export async function fetchLiveMarksheetData(opts: {
  spreadsheetId?: string;
  accessToken?: string | null;
  forceRefresh?: boolean;
  knownHash?: string | null;
} = {}): Promise<LiveMarksheetSyncResponse> {
  const spreadsheetId = opts.spreadsheetId || MARKSHEET_SPREADSHEET_ID;
  const headers: Record<string, string> = {};
  if (opts.accessToken) {
    headers['Authorization'] = `Bearer ${opts.accessToken}`;
  }
  if (opts.forceRefresh) {
    headers['Cache-Control'] = 'no-cache';
  }

  const query = new URLSearchParams({
    spreadsheetId,
    ...(opts.forceRefresh ? { refresh: 'true' } : {}),
    ...(opts.knownHash ? { knownHash: opts.knownHash } : {}),
  });

  try {
    const res = await fetch(`/api/marksheets/live?${query.toString()}`, { headers });
    const data = (await res.json().catch(() => null)) as LiveMarksheetSyncResponse | null;
    if (res.ok && data?.ok && (data.unchanged || data.entriesByKey)) {
      return data;
    }
    if (res.status === 401 || res.status === 403 || data?.needsAuth) {
      throw Object.assign(new Error(data?.error || 'Google sign-in required to read this sheet.'), {
        needsAuth: true,
      });
    }
    throw new Error(data?.error || `Sync failed with HTTP ${res.status}`);
  } catch (proxyErr: any) {
    if (proxyErr?.needsAuth) {
      throw proxyErr;
    }
    // Fallback: attempt direct browser fetch in case API route is unavailable
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&_t=${Date.now()}`;
    const directRes = await fetch(url);
    if (!directRes.ok) {
      throw proxyErr;
    }
    const buf = await directRes.arrayBuffer();
    const parsed = importMarksheetWorkbook(buf, 'midterm');
    const entriesByKey: Record<string, StudentMarkEntry> = {};
    const uniqueGrs = new Set<string>();
    const hashPayload: Record<string, unknown> = {};
    for (const entry of parsed.entries) {
      const exam = entry.examType || 'midterm';
      const k = makeMarkEntryKey(entry.grNo, exam);
      entriesByKey[k] = { ...entry, examType: exam };
      const { updatedAt: _ts, ...rest } = entriesByKey[k];
      hashPayload[k] = rest;
      uniqueGrs.add(entry.grNo);
    }
    const contentHash = browserFnv1aHash(
      JSON.stringify({ configPatch: parsed.configPatch, entriesByKey: hashPayload })
    );
    const syncedAt = new Date().toISOString();
    if (opts.knownHash && opts.knownHash === contentHash) {
      return {
        ok: true,
        unchanged: true,
        spreadsheetId,
        contentHash,
        syncedAt,
        count: uniqueGrs.size,
        fromCache: false,
      };
    }
    return {
      ok: true,
      unchanged: false,
      spreadsheetId,
      contentHash,
      syncedAt,
      count: uniqueGrs.size,
      configPatch: parsed.configPatch,
      entriesByKey,
      fromCache: false,
    };
  }
}
