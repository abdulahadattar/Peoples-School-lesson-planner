import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import {
  ingestUploadedArchive,
  ingestIndividualFiles,
  createBatchJob,
  addSingleFileToJob,
  finalizeBatchJob,
  handleChunkUpload,
  getAllDossiers,
  getDossierByGr,
  getJobStatus,
  getLatestJob,
  updateDocumentMetadata,
  createArchiveZipStream,
  auditDossierAgainstSheet,
  auditAllDossiersAgainstSheet,
  getAllDocuments,
  retryFailedDocumentsInJob,
  autoLinkDocumentsAgainstSheet,
  assignDocumentToGr,
  dismissDiscrepancy,
  undismissDiscrepancy,
  getDismissedFlags,
  applyDiscrepancyCorrection,
  batchApplyDiscrepancyCorrections,
  getRankedCandidateMatches,
  setCachedSheetRecords,
  stopProcessingJob,
  deleteDocumentRecord,
  deleteMultipleDocumentRecords,
  rescanDocumentRecord,
  replaceDocumentRecord,
  selectTargetChildForDocument,
  reprocessDocumentWithAi,
  reprocessDossierDocumentsWithAi,
} from './services/documentArchiveService';


import { createAutonomaHandler } from './services/autonomaIntegration';


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

async function createApp() {
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
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Log all requests
  app.use((req, res, next) => {
    console.log('[server] Request:', req.method, req.path);
    next();
  });

  // Autonoma SDK integration
  const sharedSecret = process.env.AUTONOMA_SHARED_SECRET || 'e1ae84345a120f3f25ce10158da374307faadfeb1a091b997299ae55777d166a';
  const signingSecret = process.env.AUTONOMA_SIGNING_SECRET || '043b60e656b726705d559a6489a73ccaf57c234f5e01b384f5f62936c1a0aaaa';
  const autonomaHandler = createAutonomaHandler(sharedSecret, signingSecret);

  // API routes directly on app
  app.get('/api/health', (_req, res) => {
    console.log('[server] /api/health route hit');
    res.json({ status: 'ok' });
  });

  app.post('/api/autonoma', (req, res) => {
    console.log('[server] /api/autonoma route HIT - method:', req.method);
    console.log('[server] /api/autonoma body:', req.body);
    autonomaHandler(req, res);
  });

  app.post('/api/test-post', (req, res) => {
    console.log('[server] /api/test-post route hit');
    res.json({ ok: true, body: req.body });
  });

  app.get('/api/test-route', (req, res) => {
    console.log('[server] /api/test-route route HIT - sending JSON');
    res.json({ ok: true });
  });

  // Test route outside /api
  app.get('/test-route', (req, res) => {
    console.log('[server] /test-route route HIT');
    res.json({ ok: true });
  });

  // PDF Proxy for GitHub raw content (production replacement for Vite dev proxy)
  app.get('/pdf-proxy/*', async (req, res) => {
    try {
      const path = req.params[0] || '';
      const url = `https://raw.githubusercontent.com/${path}`;
      console.log('[server] pdf-proxy fetching:', url);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PHSSJ-Lesson-Planner/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });
      
      if (!response.ok) {
        console.warn('[server] pdf-proxy failed:', response.status, response.statusText);
        res.status(response.status).json({ error: `GitHub returned ${response.status}` });
        return;
      }
      
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error('[server] pdf-proxy error:', error);
      res.status(500).json({ error: 'PDF proxy failed' });
    }
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

      // Try all fallback models and all keys in strict prioritized order:
      // First the best model tried with all API keys, then second best with all API keys, then 3rd, and so on.
      const modelsToTry = Array.from(new Set([
        model,
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemma-4-31b-it',
        'gemma-4-26b-it',
      ]));
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

      if (cached?.records) {
        setCachedSheetRecords(cached.records);
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
          let totalEnrolled = 0;
          Object.values(rec.classes || {}).forEach((c: any) => {
            totalPresent += (c.presentBoys || 0) + (c.presentGirls || 0);
            const classTot = typeof c.totalEnrollment === 'number' && c.totalEnrollment > 0
              ? c.totalEnrollment
              : ((c.enrolledBoys || 0) + (c.enrolledGirls || 0));
            totalEnrolled += classTot;
          });
          const enrolled = totalEnrolled > 0 ? totalEnrolled : 868;
          return {
            date,
            totalPresent,
            totalEnrolled: enrolled,
            percentage: Math.round((totalPresent / enrolled) * 100),
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

  // ==========================================
  // STUDENT DOCUMENT ARCHIVE & AI ROTATION API
  // ==========================================

  // Helper to get active server keys
  const getDocumentApiKeys = () => {
    const rawKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
    if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
    if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
    if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));
    return Array.from(new Set(rawKeys.map((k) => k.trim()).filter(Boolean)));
  };

  // Initialize a new batch processing job
  app.post('/api/documents/create-job', (req, res) => {
    try {
      const { expectedCount = 0 } = req.body || {};
      const job = createBatchJob(Number(expectedCount) || 0);
      res.json({ ok: true, job });
    } catch (err) {
      console.error('[server.ts] create-job error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Upload a single file into a batch job (prevents 413 by streaming files individually)
  app.post('/api/documents/upload-single', async (req, res) => {
    try {
      const { jobId, filename, base64Data, grNo } = req.body || {};
      if (!jobId || !base64Data || !filename) {
        res.status(400).json({ error: 'jobId, filename, and base64Data are required' });
        return;
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const result = await addSingleFileToJob(jobId, filename, buffer, grNo);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[server.ts] upload-single error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Finalize batch job and kick off background AI queue
  app.post('/api/documents/finalize-job', (req, res) => {
    try {
      const { jobId } = req.body || {};
      if (!jobId) {
        res.status(400).json({ error: 'jobId is required' });
        return;
      }
      const keys = getDocumentApiKeys();
      const job = finalizeBatchJob(jobId, keys);
      res.json({ ok: true, job });
    } catch (err) {
      console.error('[server.ts] finalize-job error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Chunked upload for very large files / ZIP archives (prevents 413 Entity Too Large)
  app.post('/api/documents/upload-chunk', async (req, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks, chunkBase64, filename, grNo, isZip } = req.body || {};
      if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkBase64 || !filename) {
        res.status(400).json({ error: 'Missing required chunk parameters' });
        return;
      }
      const keys = getDocumentApiKeys();
      const result = await handleChunkUpload(
        uploadId,
        Number(chunkIndex),
        Number(totalChunks),
        chunkBase64,
        filename,
        grNo,
        Boolean(isZip),
        keys
      );
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[server.ts] upload-chunk error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Upload ZIP archive containing GR folders or multi-page documents
  app.post('/api/documents/upload-zip', async (req, res) => {
    try {
      const { base64Data, filename = 'upload.zip' } = req.body || {};
      if (!base64Data) {
        res.status(400).json({ error: 'base64Data is required' });
        return;
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const keys = getDocumentApiKeys();
      const job = await ingestUploadedArchive(buffer, filename, keys);
      res.json({ ok: true, job });
    } catch (err) {
      console.error('[server.ts] upload-zip error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Upload individual / multiple image files
  app.post('/api/documents/upload-files', async (req, res) => {
    try {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'files array is required' });
        return;
      }
      const fileBuffers = files.map((f: any) => ({
        filename: f.filename || 'doc.jpg',
        buffer: Buffer.from(f.base64Data, 'base64'),
        grNo: f.grNo,
      }));
      const keys = getDocumentApiKeys();
      const job = await ingestIndividualFiles(fileBuffers, keys);
      res.json({ ok: true, job });
    } catch (err) {
      console.error('[server.ts] upload-files error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get active background job status
  app.get('/api/documents/jobs/:jobId', (req, res) => {
    const job = getJobStatus(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ ok: true, job });
  });

  // Get latest background job
  app.get('/api/documents/jobs-latest', (_req, res) => {
    const job = getLatestJob();
    res.json({ ok: true, job });
  });

  // Retry failed documents in a job
  app.post('/api/documents/jobs/:jobId/retry', async (req, res) => {
    try {
      const keys = getDocumentApiKeys();
      const job = await retryFailedDocumentsInJob(req.params.jobId, keys);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.json({ ok: true, job });
    } catch (err) {
      console.error('[server.ts] retry job error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get all student dossiers
  app.get('/api/documents/dossiers', (_req, res) => {
    try {
      const dossiers = getAllDossiers();
      res.json({ ok: true, dossiers });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get all individual extracted documents
  app.get('/api/documents/all-docs', (_req, res) => {
    try {
      const documents = getAllDocuments();
      res.json({ ok: true, documents });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Cross-reference all dossiers with Google Sheet roster
  app.post('/api/documents/audit-all', (req, res) => {
    try {
      const { records = [] } = req.body || {};
      const discrepancies = auditAllDossiersAgainstSheet(records);
      const dossiers = getAllDossiers();
      res.json({ ok: true, discrepancies, dossiers });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get a single student dossier by GR
  app.get('/api/documents/dossiers/:grNo', (req, res) => {
    const dossier = getDossierByGr(req.params.grNo);
    if (!dossier) {
      res.status(404).json({ error: 'Dossier not found for this GR' });
      return;
    }
    res.json({ ok: true, dossier });
  });

  // Cross-reference dossier with Google Sheet data
  app.post('/api/documents/audit/:grNo', (req, res) => {
    try {
      const { sheetRecord } = req.body || {};
      const discrepancies = auditDossierAgainstSheet(req.params.grNo, sheetRecord);
      res.json({ ok: true, discrepancies });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Automatically link all unassigned & scanned documents to Google Sheet students
  app.post('/api/documents/auto-link', (req, res) => {
    try {
      const { records = [] } = req.body || {};
      const result = autoLinkDocumentsAgainstSheet(records);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[server.ts] auto-link error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Manually assign a document to a student GR
  app.post('/api/documents/assign', (req, res) => {
    try {
      const { docId, targetGrNo, studentRecord } = req.body || {};
      if (!docId || !targetGrNo) {
        res.status(400).json({ error: 'docId and targetGrNo are required' });
        return;
      }
      const doc = assignDocumentToGr(docId, String(targetGrNo).trim(), studentRecord);
      if (!doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json({ ok: true, document: doc, dossier: getDossierByGr(String(targetGrNo).trim()) });
    } catch (err) {
      console.error('[server.ts] assign error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Mark discrepancy as false flag / dismissed
  app.post('/api/documents/discrepancies/dismiss', (req, res) => {
    try {
      const { flagId } = req.body || {};
      if (!flagId) {
        res.status(400).json({ error: 'flagId is required' });
        return;
      }
      const success = dismissDiscrepancy(flagId);
      res.json({ ok: true, success });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Apply single discrepancy correction to Google Sheet and local records
  app.post('/api/documents/discrepancies/apply-correction', async (req, res) => {
    try {
      const { grNo, flagId, correction, accessToken } = req.body || {};
      if (!grNo || !correction) {
        res.status(400).json({ error: 'grNo and correction are required' });
        return;
      }
      const authHeader = req.headers.authorization;
      const token = accessToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
      const result = await applyDiscrepancyCorrection(grNo, flagId, correction, token);
      // Invalidate master sheet cache so subsequent queries fetch updated values
      Object.keys(sheetCache).forEach((k) => delete sheetCache[k]);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[server.ts] apply-correction error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Batch apply multiple discrepancy corrections
  app.post('/api/documents/discrepancies/batch-apply', async (req, res) => {
    try {
      const { corrections = [], accessToken } = req.body || {};
      const authHeader = req.headers.authorization;
      const token = accessToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
      const result = await batchApplyDiscrepancyCorrections(corrections, token);
      // Invalidate master sheet cache so subsequent queries fetch updated values
      Object.keys(sheetCache).forEach((k) => delete sheetCache[k]);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[server.ts] batch-apply error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Query ranked candidate matches for an unlinked document profile
  app.post('/api/documents/candidate-matches', (req, res) => {
    try {
      const { extractedInfo, topN = 5 } = req.body || {};
      const serverRecords = sheetCache['default']?.records || [];
      const matches = getRankedCandidateMatches(extractedInfo, serverRecords, topN);
      res.json({ ok: true, matches });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Un-dismiss a discrepancy flag
  app.post('/api/documents/discrepancies/undismiss', (req, res) => {
    try {
      const { flagId } = req.body || {};
      if (!flagId) {
        res.status(400).json({ error: 'flagId is required' });
        return;
      }
      const success = undismissDiscrepancy(flagId);
      res.json({ ok: true, success });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get dismissed flags dictionary
  app.get('/api/documents/dismissed-flags', (_req, res) => {
    try {
      const flags = getDismissedFlags();
      res.json({ ok: true, flags });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Manually select a specific child from multi-child CRC / B-Form table
  app.post('/api/documents/select-child', (req, res) => {
    try {
      const { docId, entryNoOrIndex } = req.body || {};
      if (!docId || entryNoOrIndex === undefined) {
        res.status(400).json({ error: 'docId and entryNoOrIndex are required' });
        return;
      }
      const updated = selectTargetChildForDocument(docId, Number(entryNoOrIndex));
      if (!updated) {
        res.status(404).json({ error: 'Document or child entry not found' });
        return;
      }
      res.json({ ok: true, document: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Re-process a single document with latest AI vision prompt & transliteration
  app.post('/api/documents/reprocess-doc', async (req, res) => {
    try {
      const { docId } = req.body || {};
      if (!docId) {
        res.status(400).json({ error: 'docId is required' });
        return;
      }
      const keys = getDocumentApiKeys();
      const updated = await reprocessDocumentWithAi(docId, keys);
      if (!updated) {
        res.status(404).json({ error: 'Document not found or image missing' });
        return;
      }
      res.json({ ok: true, document: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Re-process all documents in a student dossier
  app.post('/api/documents/reprocess-dossier', async (req, res) => {
    try {
      const { grNo } = req.body || {};
      if (!grNo) {
        res.status(400).json({ error: 'grNo is required' });
        return;
      }
      const keys = getDocumentApiKeys();
      const dossier = await reprocessDossierDocumentsWithAi(String(grNo).trim(), keys);
      if (!dossier) {
        res.status(404).json({ error: 'Dossier not found' });
        return;
      }
      res.json({ ok: true, dossier });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Manually update tag or rotate image
  app.post('/api/documents/update-doc', async (req, res) => {
    try {
      const { docId, newTag, rotateAngle } = req.body || {};
      if (!docId) {
        res.status(400).json({ error: 'docId is required' });
        return;
      }
      const updated = await updateDocumentMetadata(docId, newTag, rotateAngle);
      if (!updated) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json({ ok: true, document: updated, dossier: getDossierByGr(updated.grNo) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Permanently delete/remove document record(s) & file(s)
  app.post('/api/documents/delete', (req, res) => {
    try {
      const { docId, docIds } = req.body || {};
      let idsToDelete: string[] = [];
      if (Array.isArray(docIds) && docIds.length > 0) {
        idsToDelete = docIds.filter(Boolean);
      } else if (docId) {
        idsToDelete = [docId];
      }

      if (idsToDelete.length === 0) {
        res.status(400).json({ error: 'docId or docIds is required' });
        return;
      }

      const { deletedCount } = deleteMultipleDocumentRecords(idsToDelete);
      res.json({ ok: true, deletedCount, dossiers: getAllDossiers(), documents: getAllDocuments() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Stop / Cancel active background job
  app.post('/api/documents/jobs/:jobId/stop', (req, res) => {
    try {
      const { jobId } = req.params;
      const success = stopProcessingJob(jobId);
      res.json({ ok: true, success, job: getJobStatus(jobId) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Rescan / Re-analyze document using Gemini Vision model fallback chain
  app.post('/api/documents/rescan', async (req, res) => {
    try {
      const { docId } = req.body || {};
      if (!docId) {
        res.status(400).json({ error: 'docId is required' });
        return;
      }
      const serverKeys = getDocumentApiKeys();
      const updatedDoc = await rescanDocumentRecord(docId, serverKeys);
      res.json({ ok: true, document: updatedDoc, dossiers: getAllDossiers(), documents: getAllDocuments() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Serve stored document files safely
  app.get('/api/documents/file/:grNo/:filename', (req, res) => {
    try {
      const { grNo, filename } = req.params;
      const decodedFilename = decodeURIComponent(filename);
      const decodedGr = decodeURIComponent(grNo);
      const safeFilename = path.basename(decodedFilename);
      const safeGr = path.basename(decodedGr);
      const filePath = path.join(process.cwd(), 'data', 'student_documents', `GR_${safeGr}`, safeFilename);

      if (!fs.existsSync(filePath)) {
        res.status(404).send('File not found');
        return;
      }

      const ext = path.extname(safeFilename).toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.svg') mimeType = 'image/svg+xml';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.status(500).send((err as Error).message);
    }
  });

  // Download Class-wise or All-classes organized ZIP
  app.get('/api/documents/export-zip', (req, res) => {
    try {
      const targetClass = (req.query.class as string) || 'ALL';
      const zipName = targetClass === 'ALL' ? 'PHSSJ_All_Students_Documents.zip' : `PHSSJ_Class_${targetClass}_Documents.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      const zipStream = createArchiveZipStream(targetClass);
      zipStream.pipe(res);
      zipStream.finalize();
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  console.log('[server] NODE_ENV:', process.env.NODE_ENV);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[server] Skipping Vite server creation for API testing');
    // const vite = await createViteServer({
    //   server: { middlewareMode: true },
    // });
    // console.log('[server] Vite server created');
    
    // SPA fallback for everything else
    app.get('/{*path}', (req, res) => {
      console.log('[server] SPA fallback hit for:', req.method, req.path);
      res.sendFile(path.join(process.cwd(), 'index.html'));
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('[server] Error:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: err.message });
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = 3000;
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Export for Vercel
export default createApp;

// Start server if not in Vercel
if (!process.env.VERCEL) {
  startServer();
}
