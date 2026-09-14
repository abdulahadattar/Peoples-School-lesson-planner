import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';

// Server-side in-memory cache for Google Sheet data to prevent redundant network round-trips
interface ServerSheetCacheEntry {
  timestamp: number;
  etag: string;
  spreadsheetId: string;
  gid: string;
  sheetTitle: string;
  records: any[];
  schoolMetadata: string[];
}

const sheetCache: Record<string, ServerSheetCacheEntry> = {};
const SHEET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Compression middleware - Compresses all responses (Gzip/Deflate) down by 80-90%
  app.use(
    compression({
      level: 6,
      threshold: 256, // Compress any response > 256 bytes
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  // Middleware
  app.use(express.json({ limit: '20mb' }));

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Unified endpoint for Gemini to keep API keys secure on server with key rotation and model fallback
  app.post('/api/gemini', async (req, res) => {
    try {
      const {
        model = 'gemini-3.5-flash-lite',
        systemInstruction,
        userPrompt,
        schema,
        temperature,
        contextParts,
      } = req.body || {};

      // Collect all configured server-side keys
      const rawKeys: string[] = [];
      if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
      if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
      if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
      if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));

      const serverKeys = Array.from(new Set(rawKeys.map(k => k.trim()).filter(Boolean)));

      if (serverKeys.length === 0) {
        res.status(401).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please provide an API key in your environment.',
        });
        return;
      }

      const parts: any[] = [];
      if (contextParts && Array.isArray(contextParts)) {
        for (const part of contextParts) {
          parts.push(part);
        }
      }
      if (userPrompt) {
        parts.push({ text: userPrompt });
      }

      const requestBody = JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: temperature ?? 0.2,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
      });

      // Try all fallback models and all keys
      const modelsToTry = Array.from(new Set([model, 'gemini-3.5-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro']));
      let lastErrText = '';
      let lastStatus = 500;

      for (const currentModel of modelsToTry) {
        for (const key of serverKeys) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;
            const response = await fetch(geminiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key,
              },
              body: requestBody,
            });

            if (response.ok) {
              const data = (await response.json()) as any;
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              res.json({ text });
              return;
            }

            lastStatus = response.status;
            lastErrText = await response.text();
            console.warn(`[server.ts] Model ${currentModel} failed with key (status ${lastStatus}): ${lastErrText.slice(0, 100)}`);
            // If quota exhausted (429), immediately try next model/key
          } catch (fetchErr) {
            lastErrText = (fetchErr as Error).message;
            console.warn(`[server.ts] Network error on model ${currentModel}: ${lastErrText}`);
          }
        }
      }

      res.status(lastStatus).json({ error: lastErrText || `Failed across all models and available API keys.` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Google Sheets Proxy Endpoints with Server-Side Caching & Payload Optimization
  app.get('/api/sheets/data', async (req, res) => {
    try {
      const spreadsheetId = (req.query.spreadsheetId as string) || '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0';
      const gid = (req.query.gid as string) || '1397470354';
      const authHeader = req.headers.authorization;
      const sheetTitle = (req.query.sheetTitle as string) || 'Jamshoro South Final SPD (2)';
      const ifNoneMatch = req.headers['if-none-match'];

      // Query filters
      const filterClass = (req.query.class as string)?.trim();
      const filterSection = (req.query.section as string)?.trim();
      const filterStatus = (req.query.status as string)?.trim();
      const filterGender = (req.query.gender as string)?.trim();
      const filterSearch = (req.query.search as string)?.trim()?.toLowerCase();
      const summaryOnly = req.query.summaryOnly === 'true';
      const compact = req.query.compact !== 'false'; // Default to compact mode to save payload size
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const isForceRefresh =
        req.query.refresh === 'true' ||
        req.query.forceRefresh === 'true' ||
        req.headers['cache-control']?.includes('no-cache');
      const cacheKey = `${spreadsheetId}_${gid}_${authHeader ? 'auth' : 'public'}`;
      let cached = sheetCache[cacheKey];

      // Check if server cache is still valid
      const now = Date.now();
      const isCacheFresh = !isForceRefresh && cached && now - cached.timestamp < SHEET_CACHE_TTL_MS;

      if (!isCacheFresh) {
        // Fetch public CSV export or authenticated
        const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
        const headers: Record<string, string> = {};
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }

        const response = await fetch(exportUrl, { headers });
        if (!response.ok) {
          res.json({ ok: true, spreadsheetId, gid, sheetTitle, count: 0, records: [] });
          return;
        }
        const csvText = await response.text();

        // Parse CSV
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentCell = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
          const char = csvText[i];
          const nextChar = csvText[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentCell += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
          } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
              i++;
            }
            currentRow.push(currentCell.trim());
            if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
              rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
          } else {
            currentCell += char;
          }
        }
        if (currentCell.length > 0 || currentRow.length > 0) {
          currentRow.push(currentCell.trim());
          if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
            rows.push(currentRow);
          }
        }

        // Extract Common School Metadata from row 1 (columns 0..16)
        let schoolMetadata: string[] = [];
        if (rows.length > 1) {
          schoolMetadata = rows[1].slice(0, 17);
        }

        // Convert rows to StudentRecord objects
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

        // Generate strong ETag hash from content
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

      // Check client If-None-Match ETag header
      // If client already has latest version, return 304 (0 bytes transferred)
      if (!isForceRefresh && ifNoneMatch && ifNoneMatch === cached.etag && !filterSearch && !filterClass && !filterSection && !filterStatus && !filterGender && !summaryOnly && limit === 0) {
        res.status(304).end();
        return;
      }

      // If summaryOnly is requested, calculate compact class breakdown (~300 bytes total!)
      if (summaryOnly) {
        const classCounts: Record<string, { boys: number; girls: number; total: number }> = {};
        let totalEnrolled = 0;
        let totalBoys = 0;
        let totalGirls = 0;

        cached.records.forEach((s) => {
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

        res.setHeader('ETag', cached.etag);
        res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
        res.json({
          ok: true,
          totalEnrolled,
          totalBoys,
          totalGirls,
          classCounts,
          count: cached.records.length,
        });
        return;
      }

      // Apply server-side selective filtering
      let filtered = cached.records;

      if (filterClass && filterClass !== 'all') {
        filtered = filtered.filter((r) => (r.currentClass || '').toLowerCase() === filterClass.toLowerCase());
      }
      if (filterSection && filterSection !== 'all') {
        filtered = filtered.filter((r) => (r.section || '').toLowerCase() === filterSection.toLowerCase());
      }
      if (filterStatus && filterStatus !== 'all') {
        filtered = filtered.filter((r) => (r.status || '').toLowerCase().includes(filterStatus.toLowerCase()));
      }
      if (filterGender && filterGender !== 'all') {
        filtered = filtered.filter((r) => {
          const g = (r.gender || '').toUpperCase();
          if (filterGender === 'M') return g.startsWith('M') || g.startsWith('B');
          if (filterGender === 'F') return g.startsWith('F') || g.startsWith('G');
          return true;
        });
      }
      if (filterSearch) {
        filtered = filtered.filter((r) => {
          return (
            (r.studentName || '').toLowerCase().includes(filterSearch) ||
            (r.fatherName || '').toLowerCase().includes(filterSearch) ||
            (r.grNo || '').toLowerCase().includes(filterSearch) ||
            (r.parentContact || '').includes(filterSearch) ||
            (r.emergencyContact || '').includes(filterSearch) ||
            (r.bFormNo || '').includes(filterSearch)
          );
        });
      }

      const totalMatching = filtered.length;

      // Apply pagination if requested
      if (offset > 0 || limit > 0) {
        const start = Math.max(0, offset);
        const end = limit > 0 ? start + limit : filtered.length;
        filtered = filtered.slice(start, end);
      }

      // In compact mode, strip redundant rawMetadata array from each record
      // and provide schoolMetadata once at the root to cut payload size in half
      const recordsToSend = compact
        ? filtered.map(({ rawMetadata, ...rest }) => rest)
        : filtered;

      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.json({
        ok: true,
        etag: cached.etag,
        spreadsheetId,
        gid,
        sheetTitle,
        count: totalMatching,
        schoolMetadata: cached.schoolMetadata,
        records: recordsToSend,
      });
    } catch (error) {
      console.warn('[server.ts] Error fetching sheet data, returning empty records:', error);
      res.json({ ok: true, spreadsheetId: req.query.spreadsheetId || '1J5eEmFnpqzgrNCZkV0e3bYOdTBE2B-pjczeBq_OYfbA', gid: req.query.gid || '0', sheetTitle: 'Sheet1', count: 0, records: [] });
    }
  });

  app.put('/api/sheets/update', async (req, res) => {
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
      } = req.body || {};

      if (!rowNumber || !Array.isArray(rowValues)) {
        res.status(400).json({ error: 'Missing rowNumber or rowValues' });
        return;
      }

      const range = `'${sheetTitle}'!A${rowNumber}:AO${rowNumber}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}?valueInputOption=USER_ENTERED`;

      const gRes = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values: [rowValues],
        }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText });
        return;
      }

      // Invalidate server cache on student update
      Object.keys(sheetCache).forEach((k) => delete sheetCache[k]);

      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Daily Student Attendance Endpoints
  const ATTENDANCE_FILE = path.join(process.cwd(), 'data', 'daily_attendance.json');

  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  const getAttendanceStore = (): Record<string, any> => {
    try {
      if (fs.existsSync(ATTENDANCE_FILE)) {
        const raw = fs.readFileSync(ATTENDANCE_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[server.ts] Error reading attendance file:', e);
    }
    return {};
  };

  const saveAttendanceStore = (store: Record<string, any>) => {
    try {
      const dir = path.dirname(ATTENDANCE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
      console.error('[server.ts] Error writing attendance file:', e);
    }
  };

  app.get('/api/attendance', (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      if (!DATE_REGEX.test(date)) {
        res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
        return;
      }
      const store = getAttendanceStore();
      const record = store[date] || null;
      res.json({ ok: true, date, record });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/attendance', (req, res) => {
    try {
      const { date, classes, notes, recordedBy } = req.body || {};
      if (!date || !classes) {
        res.status(400).json({ error: 'Missing date or classes data in body' });
        return;
      }
      if (!DATE_REGEX.test(date)) {
        res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
        return;
      }

      const store = getAttendanceStore();
      store[date] = {
        date,
        classes,
        notes: notes || '',
        recordedBy: recordedBy || 'Miss Shahida',
        updatedAt: Date.now(),
      };
      saveAttendanceStore(store);

      res.json({ ok: true, message: 'Attendance saved successfully', record: store[date] });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/attendance/sync-sheet', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const { spreadsheetId = '1J5eEmFnpqzgrNCZkV0e3bYOdTBE2B-pjczeBq_OYfbA', sheetTitle = 'Sheet1', rowValues } = req.body || {};

      if (!Array.isArray(rowValues)) {
        res.status(400).json({ error: 'Missing rowValues array' });
        return;
      }

      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authHeader) {
        reqHeaders['Authorization'] = authHeader;
      }

      // Check if sheet is empty / needs headers
      try {
        const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A1:M1`)}`;
        const getRes = await fetch(getUrl, { headers: reqHeaders });
        if (getRes.ok) {
          const getData = await getRes.json();
          const firstHeader = getData.values?.[0]?.[2];
          const sixthHeader = getData.values?.[0]?.[5];
          if (!getData.values || getData.values.length === 0 || getData.values[0].length === 0 || firstHeader !== 'Class' || sixthHeader !== 'Attendance %') {
            const headerValues = ['Date', 'Recorded By', 'Class', 'Enrolled Boys', 'Enrolled Girls', 'Attendance %', 'Total Enrolled', 'Present Boys', 'Present Girls', 'Total Present', 'Total Absent', 'Notes', 'Timestamp'];
            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetTitle}'!A1:M1`)}?valueInputOption=USER_ENTERED`;
            await fetch(updateUrl, {
              method: 'PUT',
              headers: reqHeaders,
              body: JSON.stringify({ range: `'${sheetTitle}'!A1:M1`, majorDimension: 'ROWS', values: [headerValues] }),
            });
          }
        }
      } catch (headerErr) {
        console.warn('Header initialization check warning:', headerErr);
      }

      const range = `'${sheetTitle}'!A:A`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

      // Handle both 1D and 2D arrays gracefully
      const is2D = Array.isArray(rowValues[0]);
      const valuesToAppend = is2D ? rowValues : [rowValues];

      const gRes = await fetch(url, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values: valuesToAppend,
        }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText || 'Failed to sync attendance to Google Sheet' });
        return;
      }

      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      console.error('[server.ts] Error syncing attendance sheet:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/attendance/history', (_req, res) => {
    try {
      const store = getAttendanceStore();
      const history = Object.keys(store)
        .sort((a, b) => b.localeCompare(a))
        .map(date => {
          const rec = store[date];
          let totalPresent = 0;
          Object.values(rec.classes || {}).forEach((c: any) => {
            totalPresent += (c.presentBoys || 0) + (c.presentGirls || 0);
          });
          return {
            date,
            totalPresent,
            percentage: Math.round((totalPresent / 866) * 100),
            updatedAt: rec.updatedAt,
          };
        });
      res.json({ ok: true, history });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/sheets/add', async (req, res) => {
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
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values: [rowValues],
        }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText });
        return;
      }

      // Invalidate server cache on new student addition
      Object.keys(sheetCache).forEach((k) => delete sheetCache[k]);

      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
