import { Router } from 'express';
import crypto from 'crypto';
import { parseCsvToGrid } from '../../utils/csv.js';

import {
  filterSheetRecords,
  summarizeSheetRecords,
  shapeSheetRecordsResponse,
  canServeNotModified,
} from './sheetsQueryHelpers.js';

interface ServerSheetCacheEntry {
  timestamp: number;
  etag: string;
  spreadsheetId: string;
  gid: string;
  sheetTitle: string;
  records: any[];
  schoolMetadata: string[];
}

export const sheetCache: Record<string, ServerSheetCacheEntry> = {};
const SHEET_CACHE_TTL_MS = 5 * 60 * 1000;

export function getAnyCachedSheetRecords(): any[] {
  for (const entry of Object.values(sheetCache)) {
    if (Array.isArray(entry?.records) && entry.records.length > 0) {
      return entry.records;
    }
  }
  return [];
}

export function createSheetsRouter(): Router {
  const router = Router();

  router.get('/sheets/data', async (req, res) => {
    try {
      const spreadsheetId = (req.query.spreadsheetId as string) || '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0';
      const gid = (req.query.gid as string) || '1397470354';
      const authHeader = req.headers.authorization;
      const sheetTitle = (req.query.sheetTitle as string) || 'Jamshoro South Final SPD (2)';
      const ifNoneMatch = req.headers['if-none-match'];

      const filters = {
        classFilter: req.query.class as string | undefined,
        section: req.query.section as string | undefined,
        status: req.query.status as string | undefined,
        gender: req.query.gender as string | undefined,
        search: req.query.search as string | undefined,
      };
      const summaryOnly = req.query.summaryOnly === 'true';
      const compact = req.query.compact !== 'false';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) || 0 : 0;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) || 0 : 0;
      const isForceRefresh = Boolean(
        req.query.refresh === 'true' ||
        req.query.forceRefresh === 'true' ||
        req.headers['cache-control']?.includes('no-cache')
      );
      const cacheKey = `${spreadsheetId}_${gid}_${authHeader ? 'auth' : 'public'}`;
      let cached = sheetCache[cacheKey];

      const now = Date.now();
      const isCacheFresh = !isForceRefresh && cached && now - cached.timestamp < SHEET_CACHE_TTL_MS;

      if (!isCacheFresh) {
        const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
        const headers: Record<string, string> = {};
        if (authHeader) headers['Authorization'] = authHeader;

        const response = await fetch(exportUrl, { headers, signal: AbortSignal.timeout(25000) });
        if (!response.ok) {
          if (cached) {
            // Serve stale cache instead of silently blanking the register on transient upstream errors
          } else {
            res.json({ ok: true, spreadsheetId, gid, sheetTitle, count: 0, records: [] });
            return;
          }
        } else {
          const csvText = await response.text();
          const rows = parseCsvToGrid(csvText);

          let schoolMetadata: string[] = [];
          if (rows.length > 1) {
            schoolMetadata = rows[1].slice(0, 17);
          }

          const rawRecords = [];
          for (let i = 1; i < rows.length; i++) {
            const cols = [...rows[i]];
            while (cols.length < 41) cols.push('');

            const grNo = cols[17] || '';
            const studentName = cols[18] || '';

            if (grNo || studentName) {
              rawRecords.push({
                rowNumber: i + 1,
                rawMetadata: cols.slice(0, 17),
                grNo,
                studentName,
                bFormNo: cols[19] || '',
                fatherName: cols[20] || '',
                gender: cols[21] || '',
                dobDay: cols[22] || '',
                dobMonth: cols[23] || '',
                dobYear: cols[24] || '',
                classAdmitted: cols[25] || '',
                currentClass: cols[26] || '',
                parentCnic: cols[27] || '',
                religion: cols[28] || '',
                address: cols[29] || '',
                parentContact: cols[30] || '',
                emergencyContact: cols[31] || '',
                admissionDay: cols[32] || '',
                admissionMonth: cols[33] || '',
                admissionYear: cols[34] || '',
                section: cols[35] || '',
                partnerContact: cols[36] || '',
                shift: cols[37] || '',
                medium: cols[38] || '',
                picture: cols[39] || '',
                status: cols[40] || '',
              });
            }
          }

          const hash = crypto
            .createHash('md5')
            .update(JSON.stringify({ count: rawRecords.length, first: rawRecords[0], last: rawRecords[rawRecords.length - 1] }))
            .digest('hex');
          const etag = `W/"phssj-${hash}"`;

          cached = {
            timestamp: now,
            etag,
            spreadsheetId,
            gid,
            sheetTitle,
            records: rawRecords,
            schoolMetadata,
          };
          sheetCache[cacheKey] = cached;
        }
      }

      if (
        canServeNotModified({
          ifNoneMatch,
          cachedEtag: cached.etag,
          isForceRefresh,
          filters,
          summaryOnly,
          limit,
          offset,
        })
      ) {
        res.status(304).end();
        return;
      }

      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

      const filtered = filterSheetRecords(cached.records, filters);

      if (summaryOnly) {
        const summary = summarizeSheetRecords(filtered);
        res.json({
          ok: true,
          ...summary,
          etag: cached.etag,
          cachedAt: cached.timestamp,
        });
        return;
      }

      const totalCount = filtered.length;
      let paginated = filtered;
      if (offset > 0 || limit > 0) {
        const start = Math.max(0, offset);
        const end = limit > 0 ? start + limit : filtered.length;
        paginated = filtered.slice(start, end);
      }

      const recordsToSend = shapeSheetRecordsResponse(paginated, compact);

      res.json({
        ok: true,
        spreadsheetId,
        gid,
        sheetTitle: cached.sheetTitle,
        count: totalCount,
        records: recordsToSend,
        schoolMetadata: cached.schoolMetadata,
        etag: cached.etag,
        cachedAt: cached.timestamp,
        compact,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.put('/sheets/update', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Authorization header is required.' });
        return;
      }

      const {
        spreadsheetId = '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0',
        sheetTitle = 'Jamshoro South Final SPD (2)',
        rowNumber,
        rowValues,
        startColumn = 'R',
        metaColumnCount = 17,
      } = req.body || {};

      if (!rowNumber || !Array.isArray(rowValues)) {
        res.status(400).json({ error: 'Missing rowNumber or rowValues' });
        return;
      }

      const range = `'${sheetTitle}'!${startColumn}${rowNumber}:AO${rowNumber}`;
      const values = rowValues.slice(metaColumnCount);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}?valueInputOption=USER_ENTERED`;

      const gRes = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ range, majorDimension: 'ROWS', values: [values] }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText });
        return;
      }

      Object.keys(sheetCache).forEach(k => delete sheetCache[k]);
      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/sheets/add', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Authorization header is required.' });
        return;
      }

      const {
        spreadsheetId = '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0',
        sheetTitle = 'Jamshoro South Final SPD (2)',
        rowValues,
      } = req.body || {};

      if (!Array.isArray(rowValues)) {
        res.status(400).json({ error: 'Missing rowValues' });
        return;
      }

      const range = `'${sheetTitle}'!A:AO`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const gRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ range, majorDimension: 'ROWS', values: [rowValues] }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText });
        return;
      }

      Object.keys(sheetCache).forEach(k => delete sheetCache[k]);
      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
