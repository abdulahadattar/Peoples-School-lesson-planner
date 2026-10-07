import { Router } from 'express';
import crypto from 'crypto';
import { parseCsvToGrid } from '../../utils/csv.js';

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

export function createSheetsRouter(): Router {
  const router = Router();

  router.get('/sheets/data', async (req, res) => {
    try {
      const spreadsheetId = (req.query.spreadsheetId as string) || '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0';
      const gid = (req.query.gid as string) || '1397470354';
      const authHeader = req.headers.authorization;
      const sheetTitle = (req.query.sheetTitle as string) || 'Jamshoro South Final SPD (2)';
      const ifNoneMatch = req.headers['if-none-match'];

      const filterClass = (req.query.class as string)?.trim();
      const filterSection = (req.query.section as string)?.trim();
      const filterStatus = (req.query.status as string)?.trim();
      const filterGender = (req.query.gender as string)?.trim();
      const filterSearch = (req.query.search as string)?.trim()?.toLowerCase();
      const summaryOnly = req.query.summaryOnly === 'true';
      const compact = req.query.compact !== 'false';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const isForceRefresh = req.query.refresh === 'true' || req.query.forceRefresh === 'true' || req.headers['cache-control']?.includes('no-cache');
      const cacheKey = `${spreadsheetId}_${gid}_${authHeader ? 'auth' : 'public'}`;
      let cached = sheetCache[cacheKey];

      const now = Date.now();
      const isCacheFresh = !isForceRefresh && cached && now - cached.timestamp < SHEET_CACHE_TTL_MS;

      if (!isCacheFresh) {
        const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
        const headers: Record<string, string> = {};
        if (authHeader) headers['Authorization'] = authHeader;

        const response = await fetch(exportUrl, { headers });
        if (!response.ok) {
          res.json({ ok: true, spreadsheetId, gid, sheetTitle, count: 0, records: [] });
          return;
        }
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

      if (ifNoneMatch && ifNoneMatch === cached.etag && !isForceRefresh) {
        res.status(304).end();
        return;
      }

      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

      let filtered = cached.records;
      if (filterClass) filtered = filtered.filter(r => r.currentClass.toLowerCase() === filterClass.toLowerCase());
      if (filterSection) filtered = filtered.filter(r => r.section.toLowerCase() === filterSection.toLowerCase());
      if (filterStatus) filtered = filtered.filter(r => r.status.toLowerCase() === filterStatus.toLowerCase());
      if (filterGender) filtered = filtered.filter(r => r.gender.toLowerCase() === filterGender.toLowerCase());
      if (filterSearch) {
        filtered = filtered.filter(r =>
          r.grNo.toLowerCase().includes(filterSearch) ||
          r.studentName.toLowerCase().includes(filterSearch) ||
          r.fatherName.toLowerCase().includes(filterSearch) ||
          r.bFormNo.toLowerCase().includes(filterSearch)
        );
      }

      if (summaryOnly) {
        const classCounts: Record<string, number> = {};
        let activeCount = 0;
        let inactiveCount = 0;

        filtered.forEach(r => {
          classCounts[r.currentClass] = (classCounts[r.currentClass] || 0) + 1;
          if (r.status.toLowerCase().includes('active')) activeCount++;
          else inactiveCount++;
        });

        res.json({
          ok: true,
          totalStudents: filtered.length,
          activeStudents: activeCount,
          inactiveStudents: inactiveCount,
          classEnrollments: classCounts,
          etag: cached.etag,
          cachedAt: cached.timestamp,
        });
        return;
      }

      const totalCount = filtered.length;
      let paginated = filtered;
      if (limit > 0) paginated = paginated.slice(offset, offset + limit);

      const recordsToSend = compact
        ? paginated.map(r => ({
            r: r.rowNumber,
            g: r.grNo,
            n: r.studentName,
            b: r.bFormNo,
            f: r.fatherName,
            s: r.gender,
            c: r.currentClass,
            sec: r.section,
            st: r.status,
            p: r.parentContact,
            d: `${r.dobYear}-${r.dobMonth}-${r.dobDay}`,
          }))
        : paginated;

      res.json({
        ok: true,
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
