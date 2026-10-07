import { getCachedStudentRecords, setCachedStudentRecords, clearCachedStudentRecords } from '../storageService';
import {
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_GID,
  DEFAULT_SHEET_TITLE,
  StudentRecord,
  FetchSheetResult,
  EnrollmentSummaryResult,
} from './types';
import { parseCSV, rowToStudentRecord } from './rowMapping';

let inMemorySheetCache: Record<string, { timestamp: number; etag?: string; data: FetchSheetResult }> = {};
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;

export async function clearClientSheetCache(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  gid: string = DEFAULT_GID
): Promise<void> {
  const cacheKeySuffix = `${spreadsheetId}_${gid}`;
  inMemorySheetCache = {};
  await clearCachedStudentRecords(cacheKeySuffix);
}

export async function fetchSheetData(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  gid: string = DEFAULT_GID,
  accessToken?: string | null,
  forceRefresh: boolean = false,
  cacheMaxAgeMs: number = CLIENT_CACHE_TTL_MS
): Promise<FetchSheetResult> {
  const cacheKeySuffix = `${spreadsheetId}_${gid}`;
  const memoryKey = `${spreadsheetId}-${gid}-${accessToken ? 'auth' : 'public'}`;

  if (!forceRefresh && inMemorySheetCache[memoryKey] && Date.now() - inMemorySheetCache[memoryKey].timestamp < cacheMaxAgeMs) {
    return { ...inMemorySheetCache[memoryKey].data, fromCache: true };
  }

  const idbCached = await getCachedStudentRecords(cacheKeySuffix);
  if (!forceRefresh && idbCached && Date.now() - idbCached.timestamp < cacheMaxAgeMs && idbCached.records.length > 0) {
    const cachedResult: FetchSheetResult = {
      records: idbCached.records,
      spreadsheetId: idbCached.spreadsheetId || spreadsheetId,
      gid: idbCached.gid || gid,
      sheetTitle: idbCached.sheetTitle || DEFAULT_SHEET_TITLE,
      lastSynced: new Date(idbCached.timestamp),
      isLive: true,
      fromCache: true,
    };
    inMemorySheetCache[memoryKey] = { timestamp: idbCached.timestamp, etag: idbCached.etag, data: cachedResult };
    return cachedResult;
  }

  try {
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const existingEtag = idbCached?.etag || inMemorySheetCache[memoryKey]?.etag;
    if (existingEtag && !forceRefresh) {
      headers['If-None-Match'] = existingEtag;
    }
    if (forceRefresh) {
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma'] = 'no-cache';
    }

    const refreshQuery = forceRefresh ? '&refresh=true' : '';
    const res = await fetch(
      `/api/sheets/data?spreadsheetId=${encodeURIComponent(spreadsheetId)}&gid=${encodeURIComponent(gid)}&compact=true${refreshQuery}`,
      { headers }
    );

    if (res.status === 304 && idbCached && idbCached.records.length > 0) {
      await setCachedStudentRecords(
        {
          records: idbCached.records,
          etag: existingEtag,
          sheetTitle: idbCached.sheetTitle,
          spreadsheetId,
          gid,
        },
        cacheKeySuffix
      );
      const cachedResult: FetchSheetResult = {
        records: idbCached.records,
        spreadsheetId,
        gid,
        sheetTitle: idbCached.sheetTitle || DEFAULT_SHEET_TITLE,
        lastSynced: new Date(),
        isLive: true,
        fromCache: true,
      };
      inMemorySheetCache[memoryKey] = { timestamp: Date.now(), etag: existingEtag, data: cachedResult };
      return cachedResult;
    }

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.records)) {
        const responseEtag = res.headers.get('ETag') || data.etag;
        const schoolMetadata = data.schoolMetadata || [];

        const normalizedRecords: StudentRecord[] = data.records.map((r: any) => ({
          ...r,
          rawMetadata: r.rawMetadata || schoolMetadata,
        }));

        const result: FetchSheetResult = {
          records: normalizedRecords,
          spreadsheetId,
          gid,
          sheetTitle: data.sheetTitle || DEFAULT_SHEET_TITLE,
          lastSynced: new Date(),
          isLive: true,
          schoolMetadata,
        };

        await setCachedStudentRecords(
          {
            records: normalizedRecords,
            etag: responseEtag,
            sheetTitle: data.sheetTitle || DEFAULT_SHEET_TITLE,
            spreadsheetId,
            gid,
          },
          cacheKeySuffix
        );

        inMemorySheetCache[memoryKey] = { timestamp: Date.now(), etag: responseEtag, data: result };
        return result;
      }
    }
  } catch (err) {
    console.warn('Server proxy fetch failed, falling back to local cache or direct export:', err);
  }

  if (idbCached && idbCached.records.length > 0) {
    const fallbackResult: FetchSheetResult = {
      records: idbCached.records,
      spreadsheetId,
      gid,
      sheetTitle: idbCached.sheetTitle || DEFAULT_SHEET_TITLE,
      lastSynced: new Date(idbCached.timestamp),
      isLive: false,
      fromCache: true,
    };
    return fallbackResult;
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) {
      throw new Error(`Failed to fetch spreadsheet CSV: HTTP ${csvRes.status}`);
    }
    const csvText = await csvRes.text();
    const rows = parseCSV(csvText);

    if (rows.length <= 1) {
      return {
        records: [],
        spreadsheetId,
        gid,
        sheetTitle: DEFAULT_SHEET_TITLE,
        lastSynced: new Date(),
        isLive: true,
      };
    }

    const records: StudentRecord[] = [];
    for (let i = 1; i < rows.length; i++) {
      const student = rowToStudentRecord(rows[i], i + 1);
      if (student.grNo || student.studentName) {
        records.push(student);
      }
    }

    const result: FetchSheetResult = {
      records,
      spreadsheetId,
      gid,
      sheetTitle: DEFAULT_SHEET_TITLE,
      lastSynced: new Date(),
      isLive: true,
    };

    await setCachedStudentRecords(
      {
        records,
        sheetTitle: DEFAULT_SHEET_TITLE,
        spreadsheetId,
        gid,
      },
      cacheKeySuffix
    );

    inMemorySheetCache[memoryKey] = { timestamp: Date.now(), data: result };
    return result;
  } catch (fallbackErr) {
    console.warn('All sheet fetch methods failed, returning empty records:', fallbackErr);
    return {
      records: [],
      spreadsheetId,
      gid,
      sheetTitle: DEFAULT_SHEET_TITLE,
      lastSynced: new Date(),
      isLive: true,
    };
  }
}

export async function fetchEnrollmentSummary(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  gid: string = DEFAULT_GID,
  accessToken?: string | null,
  forceRefresh: boolean = false
): Promise<EnrollmentSummaryResult | null> {
  const cacheKeySuffix = `${spreadsheetId}_${gid}`;
  const idbCached = await getCachedStudentRecords(cacheKeySuffix);
  if (!forceRefresh && idbCached && idbCached.records.length > 0) {
    const classCounts: Record<string, { boys: number; girls: number; total: number }> = {};
    let totalEnrolled = 0;
    let totalBoys = 0;
    let totalGirls = 0;

    idbCached.records.forEach((s: any) => {
      const cls = (s.currentClass || 'Unassigned').trim();
      const g = (s.gender || '').toUpperCase();
      const isBoy = g.startsWith('M') || g.startsWith('B') || g === 'BOY';
      const isGirl = g.startsWith('F') || g.startsWith('G') || g === 'GIRL';

      if (!classCounts[cls]) {
        classCounts[cls] = { boys: 0, girls: 0, total: 0 };
      }
      if (isBoy) {
        classCounts[cls].boys++;
        totalBoys++;
      } else if (isGirl) {
        classCounts[cls].girls++;
        totalGirls++;
      }
      classCounts[cls].total++;
      totalEnrolled++;
    });

    return {
      totalEnrolled,
      totalBoys,
      totalGirls,
      classCounts,
      count: idbCached.records.length,
    };
  }

  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const res = await fetch(
      `/api/sheets/data?spreadsheetId=${encodeURIComponent(spreadsheetId)}&gid=${encodeURIComponent(gid)}&summaryOnly=true`,
      { headers }
    );

    if (res.ok) {
      const data = await res.json();
      return {
        totalEnrolled: data.totalEnrolled || 0,
        totalBoys: data.totalBoys || 0,
        totalGirls: data.totalGirls || 0,
        classCounts: data.classCounts || {},
        count: data.count || 0,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch enrollment summary:', err);
  }
  return null;
}
