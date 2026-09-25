import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import compression from 'compression';
import { z } from 'zod';
import { defineFactory } from '@autonoma-ai/sdk';
import { createExpressHandler } from '@autonoma-ai/server-express';

const app = express();

app.use(
  compression({
    level: 6,
    threshold: 256,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  })
);

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use((req, _res, next) => {
  console.log('[api] Request:', req.method, req.path);
  next();
});

// ===== Autonoma Integration (self-contained) =====
const DATA_DIR_AUTO = path.join('/tmp', 'data', 'autonoma');
if (!fs.existsSync(DATA_DIR_AUTO)) {
  fs.mkdirSync(DATA_DIR_AUTO, { recursive: true });
}

const CONTEXT_OWNER_FILE = path.join(DATA_DIR_AUTO, 'context_owners.json');
const BROWSER_CONTEXT_RECORD_FILE = path.join(DATA_DIR_AUTO, 'browser_context_records.json');
const STORED_EVENT_FILE = path.join(DATA_DIR_AUTO, 'stored_events.json');
const JOURNAL_ROW_FILE = path.join(DATA_DIR_AUTO, 'journal_rows.json');
const RECEIPT_ROW_FILE = path.join(DATA_DIR_AUTO, 'receipt_rows.json');

function loadJsonAut<T>(file: string): T {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
}

function saveJsonAut<T>(file: string, data: T) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

interface ContextOwnerRecord {
  principal_id: string;
  session_id: string;
  turn_id: string;
  task_id: string;
}

interface BrowserContextRecordRecord {
  context_id: string;
  owner_turn_id: string;
  scope: string;
  payload_hash: string;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
  browser_control: Record<string, any>;
}

interface StoredEventRecord {
  id: string;
  name: string;
  owner_turn_id: string;
  ts: number;
  data: Record<string, any>;
}

interface JournalRowRecord {
  id: string;
  context_id: string;
  owner_turn_id: string;
  ts: number;
  scope: string;
  delivery: string;
  lease_owned: boolean;
  tab_id: number;
  controller_id: string;
}

interface ReceiptRowRecord {
  id: string;
  tool_name: string;
  owner_turn_id: string;
  ok: boolean;
  duration_ms: number;
  observed_at: number;
  tab_id: number;
  controller_id: string;
}

function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateContextId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function getNow(): number {
  return Date.now() / 1000;
}

const ContextOwnerInput = z.object({
  principal_id: z.string(),
  session_id: z.string(),
  turn_id: z.string(),
  task_id: z.string(),
});

const ContextOwnerRef = z.object({ id: z.string() });

const BrowserContextRecordInput = z.object({
  context_id: z.string().optional(),
  owner_turn_id: z.string(),
  scope: z.string(),
  payload_hash: z.string(),
  created_at: z.number().optional(),
  expires_at: z.number().optional(),
  consumed_at: z.number().nullable().optional(),
  browser_control: z.record(z.string(), z.any()).optional(),
});

const BrowserContextRecordRef = z.object({ id: z.string() });

const StoredEventInput = z.object({
  name: z.string(),
  owner_turn_id: z.string(),
  ts: z.number().optional(),
  data: z.record(z.string(), z.any()).optional(),
});

const StoredEventRef = z.object({ id: z.string() });

const JournalRowInput = z.object({
  context_id: z.string(),
  owner_turn_id: z.string(),
  ts: z.number().optional(),
  scope: z.string(),
  delivery: z.string(),
  lease_owned: z.boolean(),
  tab_id: z.number(),
  controller_id: z.string(),
});

const JournalRowRef = z.object({ id: z.string() });

const ReceiptRowInput = z.object({
  tool_name: z.string(),
  owner_turn_id: z.string(),
  ok: z.boolean(),
  duration_ms: z.number(),
  observed_at: z.number().optional(),
  tab_id: z.number(),
  controller_id: z.string(),
});

const ReceiptRowRef = z.object({ id: z.string() });

const contextOwnerFactory = defineFactory({
  inputSchema: ContextOwnerInput,
  refSchema: ContextOwnerRef,
  create: async (data, _ctx) => {
    const owners = loadJsonAut<Record<string, ContextOwnerRecord>>(CONTEXT_OWNER_FILE);
    const record: ContextOwnerRecord = {
      principal_id: data.principal_id,
      session_id: data.session_id,
      turn_id: data.turn_id,
      task_id: data.task_id,
    };
    owners[data.turn_id] = record;
    saveJsonAut(CONTEXT_OWNER_FILE, owners);
    return { id: data.turn_id, principal_id: data.principal_id, session_id: data.session_id, turn_id: data.turn_id, task_id: data.task_id };
  },
  teardown: async (record, _ctx) => {
    const owners = loadJsonAut<Record<string, ContextOwnerRecord>>(CONTEXT_OWNER_FILE);
    delete owners[record.id];
    saveJsonAut(CONTEXT_OWNER_FILE, owners);
  },
});

const browserContextRecordFactory = defineFactory({
  inputSchema: BrowserContextRecordInput,
  refSchema: BrowserContextRecordRef,
  create: async (data, _ctx) => {
    try {
      const records = loadJsonAut<Record<string, BrowserContextRecordRecord>>(BROWSER_CONTEXT_RECORD_FILE);
      const contextId = data.context_id || generateContextId();
      const now = getNow();
      const record: BrowserContextRecordRecord = {
        context_id: contextId,
        owner_turn_id: data.owner_turn_id,
        scope: data.scope,
        payload_hash: data.payload_hash,
        created_at: data.created_at || now,
        expires_at: data.expires_at || now + 300,
        consumed_at: data.consumed_at ?? null,
        browser_control: data.browser_control || {
          availability: 'available',
          lease_owned: false,
          tab_id: 402,
          controller_id: `ctrl-${generateId().slice(0, 8)}`,
        },
      };
      records[contextId] = record;
      saveJsonAut(BROWSER_CONTEXT_RECORD_FILE, records);
      return { id: contextId };
    } catch (err) {
      console.error('[browserContextRecordFactory] Error:', err);
      throw err;
    }
  },
  teardown: async (record, _ctx) => {
    const records = loadJsonAut<Record<string, BrowserContextRecordRecord>>(BROWSER_CONTEXT_RECORD_FILE);
    delete records[record.id];
    saveJsonAut(BROWSER_CONTEXT_RECORD_FILE, records);
  },
});

const storedEventFactory = defineFactory({
  inputSchema: StoredEventInput,
  refSchema: StoredEventRef,
  create: async (data, _ctx) => {
    const events = loadJsonAut<Record<string, StoredEventRecord>>(STORED_EVENT_FILE);
    const id = generateId();
    const record: StoredEventRecord = {
      id,
      name: data.name,
      owner_turn_id: data.owner_turn_id,
      ts: data.ts || getNow(),
      data: data.data || {},
    };
    events[id] = record;
    saveJsonAut(STORED_EVENT_FILE, events);
    return { id };
  },
  teardown: async (record, _ctx) => {
    const events = loadJsonAut<Record<string, StoredEventRecord>>(STORED_EVENT_FILE);
    delete events[record.id];
    saveJsonAut(STORED_EVENT_FILE, events);
  },
});

const journalRowFactory = defineFactory({
  inputSchema: JournalRowInput,
  refSchema: JournalRowRef,
  create: async (data, _ctx) => {
    const rows = loadJsonAut<Record<string, JournalRowRecord>>(JOURNAL_ROW_FILE);
    const id = generateId();
    const record: JournalRowRecord = {
      id,
      context_id: data.context_id,
      owner_turn_id: data.owner_turn_id,
      ts: data.ts || getNow(),
      scope: data.scope,
      delivery: data.delivery,
      lease_owned: data.lease_owned,
      tab_id: data.tab_id,
      controller_id: data.controller_id,
    };
    rows[id] = record;
    saveJsonAut(JOURNAL_ROW_FILE, rows);
    return { id };
  },
  teardown: async (record, _ctx) => {
    const rows = loadJsonAut<Record<string, JournalRowRecord>>(JOURNAL_ROW_FILE);
    delete rows[record.id];
    saveJsonAut(JOURNAL_ROW_FILE, rows);
  },
});

const receiptRowFactory = defineFactory({
  inputSchema: ReceiptRowInput,
  refSchema: ReceiptRowRef,
  create: async (data, _ctx) => {
    const rows = loadJsonAut<Record<string, ReceiptRowRecord>>(RECEIPT_ROW_FILE);
    const id = generateId();
    const record: ReceiptRowRecord = {
      id,
      tool_name: data.tool_name,
      owner_turn_id: data.owner_turn_id,
      ok: data.ok,
      duration_ms: data.duration_ms,
      observed_at: data.observed_at || getNow(),
      tab_id: data.tab_id,
      controller_id: data.controller_id,
    };
    rows[id] = record;
    saveJsonAut(RECEIPT_ROW_FILE, rows);
    return { id };
  },
  teardown: async (record, _ctx) => {
    const rows = loadJsonAut<Record<string, ReceiptRowRecord>>(RECEIPT_ROW_FILE);
    delete rows[record.id];
    saveJsonAut(RECEIPT_ROW_FILE, rows);
  },
});

function createAutonomaHandler(sharedSecret: string, signingSecret: string) {
  return createExpressHandler({
    scopeField: 'turn_id',
    sharedSecret,
    signingSecret,
    factories: {
      ContextOwner: contextOwnerFactory,
      BrowserContextRecord: browserContextRecordFactory,
      _StoredEvent: storedEventFactory,
      BrowserContextJournalRow: journalRowFactory,
      CompanionReceiptRow: receiptRowFactory,
    },
    auth: async (user) => {
      console.log('[autonoma] auth callback user:', user);
      return { headers: { Authorization: `Bearer test-token-${user?.id || 'unknown'}` } };
    },
  });
}

const sharedSecret = process.env.AUTONOMA_SHARED_SECRET || 'e1ae84345a120f3f25ce10158da374307faadfeb1a091b997299ae55777d166a';
const signingSecret = process.env.AUTONOMA_SIGNING_SECRET || '043b60e656b726705d559a6489a73ccaf57c234f5e01b384f5f62936c1a0aaaa';
const autonomaHandler = createAutonomaHandler(sharedSecret, signingSecret);

// ===== API Routes =====
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/autonoma', async (req, res) => {
  const sig = req.headers['x-signature'];
  const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  console.log('[autonoma-debug] body:', bodyStr);
  console.log('[autonoma-debug] signature:', sig);
  console.log('[autonoma-debug] sharedSecret prefix:', sharedSecret.slice(0, 8));
  const computed = crypto.createHmac('sha256', sharedSecret).update(bodyStr).digest('hex');
  console.log('[autonoma-debug] computed:', computed);
  console.log('[autonoma-debug] match:', sig === computed);
  await autonomaHandler(req, res);
});

// PDF Proxy
app.get('/pdf-proxy', async (req, res) => {
  try {
    const githubPath = req.query.path || req.originalUrl.replace('/pdf-proxy', '').replace(/^\//, '');
    const url = `https://raw.githubusercontent.com/${githubPath}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PHSSJ-Lesson-Planner/1.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `GitHub returned ${response.status}` });
      return;
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('[api] pdf-proxy error:', error);
    res.status(500).json({ error: 'PDF proxy failed' });
  }
});

// Gemini endpoint
app.post('/api/gemini', async (req, res) => {
  try {
    const { model = 'gemini-3.5-flash-lite', systemInstruction, userPrompt, schema, temperature, contextParts } = req.body || {};
    const rawKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
    if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
    if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
    if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));
    const serverKeys = Array.from(new Set(rawKeys.map(k => k.trim()).filter(Boolean)));
    if (serverKeys.length === 0) {
      res.status(401).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }
    const parts: any[] = [];
    if (contextParts && Array.isArray(contextParts)) {
      for (const part of contextParts) parts.push(part);
    }
    if (userPrompt) parts.push({ text: userPrompt });
    const requestBody = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: temperature ?? 0.2, responseMimeType: 'application/json', responseSchema: schema },
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    });
    const modelsToTry = Array.from(new Set([model, 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-it']));
    let lastErrText = '';
    let lastStatus = 500;
    for (const currentModel of modelsToTry) {
      for (const key of serverKeys) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: requestBody,
          });
          if (response.ok) {
            const data = (await response.json()) as any;
            res.json({ text: data?.candidates?.[0]?.content?.parts?.[0]?.text });
            return;
          }
          lastStatus = response.status;
          lastErrText = await response.text();
        } catch (fetchErr) {
          lastErrText = (fetchErr as Error).message;
        }
      }
    }
    res.status(lastStatus).json({ error: lastErrText || 'Failed across all models and keys.' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Google Sheets data
const sheetCache: Record<string, any> = {};
const SHEET_CACHE_TTL_MS = 5 * 60 * 1000;

app.get('/api/sheets/data', async (req, res) => {
  try {
    const spreadsheetId = (req.query.spreadsheetId as string) || '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0';
    const gid = (req.query.gid as string) || '1397470354';
    const authHeader = req.headers.authorization;
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
        res.json({ ok: true, spreadsheetId, gid, count: 0, records: [] });
        return;
      }
      const csvText = await response.text();
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentCell = '';
      let inQuotes = false;
      for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        if (char === '"') {
          if (inQuotes && nextChar === '"') { currentCell += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
          if (char === '\r' && nextChar === '\n') i++;
          currentRow.push(currentCell.trim());
          if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) rows.push(currentRow);
      }
      let schoolMetadata: string[] = [];
      if (rows.length > 1) schoolMetadata = rows[1].slice(0, 17);
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
            grNo, studentName,
            bFormNo: cols[19] || '',
            fatherName: cols[20] || '',
            gender: cols[21] || '',
            dobDay: cols[22] || '', dobMonth: cols[23] || '', dobYear: cols[24] || '',
            classAdmitted: cols[25] || '',
            currentClass: cols[26] || '',
            parentCnic: cols[27] || '',
            religion: cols[28] || '',
            address: cols[29] || '',
            parentContact: cols[30] || '',
            emergencyContact: cols[31] || '',
            admissionDay: cols[32] || '', admissionMonth: cols[33] || '', admissionYear: cols[34] || '',
            section: cols[35] || '',
            partnerContact: cols[36] || '',
            shift: cols[37] || '',
            medium: cols[38] || '',
            picture: cols[39] || '',
            status: cols[40] || '',
          });
        }
      }
      const hash = crypto.createHash('md5').update(JSON.stringify({ count: rawRecords.length, first: rawRecords[0], last: rawRecords[rawRecords.length - 1] })).digest('hex');
      const etag = `W/"phssj-${hash}"`;
      cached = { timestamp: now, etag, spreadsheetId, gid, sheetTitle: (req.query.sheetTitle as string) || 'Jamshoro South Final SPD (2)', records: rawRecords, schoolMetadata };
      sheetCache[cacheKey] = cached;
    }

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

    if (!isForceRefresh && ifNoneMatch && ifNoneMatch === cached.etag && !filterSearch && !filterClass && !filterSection && !filterStatus && !filterGender && !summaryOnly && limit === 0) {
      res.status(304).end();
      return;
    }

    if (summaryOnly) {
      const classCounts: Record<string, { boys: number; girls: number; total: number }> = {};
      let totalEnrolled = 0, totalBoys = 0, totalGirls = 0;
      cached.records.forEach((s: any) => {
        const cls = (s.currentClass || 'Unassigned').trim();
        const g = (s.gender || '').toUpperCase();
        const isBoy = g.startsWith('M') || g.startsWith('B') || g === 'BOY';
        const isGirl = g.startsWith('F') || g.startsWith('G') || g === 'GIRL';
        if (!classCounts[cls]) classCounts[cls] = { boys: 0, girls: 0, total: 0 };
        if (isBoy) { classCounts[cls].boys++; totalBoys++; }
        else if (isGirl) { classCounts[cls].girls++; totalGirls++; }
        classCounts[cls].total++; totalEnrolled++;
      });
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.json({ ok: true, totalEnrolled, totalBoys, totalGirls, classCounts, count: cached.records.length });
      return;
    }

    let filtered = cached.records;
    if (filterClass && filterClass !== 'all') filtered = filtered.filter((r: any) => (r.currentClass || '').toLowerCase() === filterClass.toLowerCase());
    if (filterSection && filterSection !== 'all') filtered = filtered.filter((r: any) => (r.section || '').toLowerCase() === filterSection.toLowerCase());
    if (filterStatus && filterStatus !== 'all') filtered = filtered.filter((r: any) => (r.status || '').toLowerCase().includes(filterStatus.toLowerCase()));
    if (filterGender && filterGender !== 'all') {
      filtered = filtered.filter((r: any) => {
        const g = (r.gender || '').toUpperCase();
        if (filterGender === 'M') return g.startsWith('M') || g.startsWith('B');
        if (filterGender === 'F') return g.startsWith('F') || g.startsWith('G');
        return true;
      });
    }
    if (filterSearch) {
      filtered = filtered.filter((r: any) =>
        (r.studentName || '').toLowerCase().includes(filterSearch) ||
        (r.fatherName || '').toLowerCase().includes(filterSearch) ||
        (r.grNo || '').toLowerCase().includes(filterSearch) ||
        (r.parentContact || '').includes(filterSearch) ||
        (r.emergencyContact || '').includes(filterSearch) ||
        (r.bFormNo || '').includes(filterSearch)
      );
    }

    const totalMatching = filtered.length;
    if (offset > 0 || limit > 0) {
      const start = Math.max(0, offset);
      const end = limit > 0 ? start + limit : filtered.length;
      filtered = filtered.slice(start, end);
    }

    const recordsToSend = compact ? filtered.map(({ rawMetadata, ...rest }: any) => rest) : filtered;
    res.setHeader('ETag', cached.etag);
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.json({ ok: true, etag: cached.etag, spreadsheetId, gid, sheetTitle: cached.sheetTitle, count: totalMatching, schoolMetadata: cached.schoolMetadata, records: recordsToSend });
  } catch (error) {
    res.json({ ok: true, spreadsheetId: req.query.spreadsheetId || '1J5eEmFnpqzgrNCZkV0e3bYOdTBE2B-pjczeBq_OYfbA', gid: req.query.gid || '0', sheetTitle: 'Sheet1', count: 0, records: [] });
  }
});

app.put('/api/sheets/update', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) { res.status(401).json({ error: 'Authorization header is required.' }); return; }
    const { spreadsheetId = '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0', sheetTitle = 'Jamshoro South Final SPD (2)', rowNumber, rowValues } = req.body || {};
    if (!rowNumber || !Array.isArray(rowValues)) { res.status(400).json({ error: 'Missing rowNumber or rowValues' }); return; }
    const range = `'${sheetTitle}'!A${rowNumber}:AO${rowNumber}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const gRes = await fetch(url, { method: 'PUT', headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ range, majorDimension: 'ROWS', values: [rowValues] }) });
    if (!gRes.ok) { const errText = await gRes.text(); res.status(gRes.status).json({ error: errText }); return; }
    Object.keys(sheetCache).forEach((k) => delete sheetCache[k]);
    const data = await gRes.json();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/sheets/add', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) { res.status(401).json({ error: 'Authorization header is required.' }); return; }
    const { spreadsheetId = '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0', sheetTitle = 'Jamshoro South Final SPD (2)', rowValues } = req.body || {};
    if (!Array.isArray(rowValues)) { res.status(400).json({ error: 'Missing rowValues' }); return; }
    const range = `'${sheetTitle}'!A:AO`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const gRes = await fetch(url, { method: 'POST', headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ range, majorDimension: 'ROWS', values: [rowValues] }) });
    if (!gRes.ok) { const errText = await gRes.text(); res.status(gRes.status).json({ error: errText }); return; }
    Object.keys(sheetCache).forEach((k) => delete sheetCache[k]);
    const data = await gRes.json();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Attendance
const ATTENDANCE_FILE = '/tmp/data/daily_attendance.json';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const getAttendanceStore = (): Record<string, any> => {
  try {
    if (fs.existsSync(ATTENDANCE_FILE)) return JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf-8'));
  } catch (e) { console.warn('[server.ts] Error reading attendance file:', e); }
  return {};
};

const saveAttendanceStore = (store: Record<string, any>) => {
  try {
    const dir = path.dirname(ATTENDANCE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) { console.error('[server.ts] Error writing attendance file:', e); }
};

app.get('/api/attendance', (req, res) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    if (!DATE_REGEX.test(date)) { res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' }); return; }
    const store = getAttendanceStore();
    const record = store[date] || null;
    res.json({ ok: true, date, record });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/attendance', (req, res) => {
  try {
    const { date, classes, notes, recordedBy } = req.body || {};
    if (!date || !classes) { res.status(400).json({ error: 'Missing date or classes data in body' }); return; }
    if (!DATE_REGEX.test(date)) { res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' }); return; }
    const store = getAttendanceStore();
    store[date] = { date, classes, notes: notes || '', recordedBy: recordedBy || 'Miss Shahida', updatedAt: Date.now() };
    saveAttendanceStore(store);
    res.json({ ok: true, message: 'Attendance saved successfully', record: store[date] });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/attendance/sync-sheet', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { spreadsheetId = '1J5eEmFnpqzgrNCZkV0e3bYOdTBE2B-pjczeBq_OYfbA', sheetTitle = 'Sheet1', rowValues } = req.body || {};
    if (!Array.isArray(rowValues)) { res.status(400).json({ error: 'Missing rowValues array' }); return; }
    const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) reqHeaders['Authorization'] = authHeader;

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
          await fetch(updateUrl, { method: 'PUT', headers: reqHeaders, body: JSON.stringify({ range: `'${sheetTitle}'!A1:M1`, majorDimension: 'ROWS', values: [headerValues] }) });
        }
      }
    } catch (headerErr) { console.warn('Header initialization check warning:', headerErr); }

    const range = `'${sheetTitle}'!A:A`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const is2D = Array.isArray(rowValues[0]);
    const valuesToAppend = is2D ? rowValues : [rowValues];
    const gRes = await fetch(url, { method: 'POST', headers: reqHeaders, body: JSON.stringify({ range, majorDimension: 'ROWS', values: valuesToAppend }) });
    if (!gRes.ok) { const errText = await gRes.text(); res.status(gRes.status).json({ error: errText || 'Failed to sync attendance to Google Sheet' }); return; }
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
    const history = Object.keys(store).sort((a, b) => b.localeCompare(a)).map(date => {
      const rec = store[date];
      let totalPresent = 0, totalEnrolled = 0;
      Object.values(rec.classes || {}).forEach((c: any) => {
        totalPresent += (c.presentBoys || 0) + (c.presentGirls || 0);
        const classTot = typeof c.totalEnrollment === 'number' && c.totalEnrollment > 0 ? c.totalEnrollment : ((c.enrolledBoys || 0) + (c.enrolledGirls || 0));
        totalEnrolled += classTot;
      });
      const enrolled = totalEnrolled > 0 ? totalEnrolled : 868;
      return { date, totalPresent, totalEnrolled: enrolled, percentage: Math.round((totalPresent / enrolled) * 100), updatedAt: rec.updatedAt };
    });
    res.json({ ok: true, history });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// Document storage
const DATA_DIR = '/tmp/data';
const DOCS_DIR = path.join(DATA_DIR, 'student_documents');
const JOBS_FILE = path.join(DATA_DIR, 'processing_jobs.json');
const DOSSIERS_FILE = path.join(DATA_DIR, 'student_dossiers.json');
const DOCS_INDEX_FILE = path.join(DATA_DIR, 'document_index.json');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
}

function loadJobs(): Record<string, any> {
  ensureDirs();
  try { if (fs.existsSync(JOBS_FILE)) return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8')); } catch (e) { console.warn('[api] Error loading jobs:', e); }
  return {};
}

function saveJobs(jobs: Record<string, any>) {
  ensureDirs();
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

function loadDossiers(): Record<string, any> {
  ensureDirs();
  try { if (fs.existsSync(DOSSIERS_FILE)) return JSON.parse(fs.readFileSync(DOSSIERS_FILE, 'utf-8')); } catch (e) { console.warn('[api] Error loading dossiers:', e); }
  return {};
}

function saveDossiers(dossiers: Record<string, any>) {
  ensureDirs();
  fs.writeFileSync(DOSSIERS_FILE, JSON.stringify(dossiers, null, 2), 'utf-8');
}

function loadDocIndex(): Record<string, any> {
  ensureDirs();
  try { if (fs.existsSync(DOCS_INDEX_FILE)) return JSON.parse(fs.readFileSync(DOCS_INDEX_FILE, 'utf-8')); } catch (e) { console.warn('[api] Error loading doc index:', e); }
  return {};
}

function saveDocIndex(docs: Record<string, any>) {
  ensureDirs();
  fs.writeFileSync(DOCS_INDEX_FILE, JSON.stringify(docs, null, 2), 'utf-8');
}

const getDocumentApiKeys = () => {
  const rawKeys: string[] = [];
  if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
  if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
  if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));
  return Array.from(new Set(rawKeys.map((k) => k.trim()).filter(Boolean)));
};

// Document API routes
app.post('/api/documents/create-job', (req, res) => {
  try {
    const { expectedCount = 0 } = req.body || {};
    const jobs = loadJobs();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { jobId, expectedCount: Number(expectedCount) || 0, receivedCount: 0, processedCount: 0, errorCount: 0, pendingCount: Number(expectedCount) || 0, status: 'pending', createdAt: Date.now(), updatedAt: Date.now(), files: [], aiModel: null, error: null };
    jobs[jobId] = job;
    saveJobs(jobs);
    res.json({ ok: true, job });
  } catch (err) {
    console.error('[server.ts] create-job error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/documents/upload-single', async (req, res) => {
  try {
    const { jobId, filename, base64Data, grNo } = req.body || {};
    if (!jobId || !base64Data || !filename) { res.status(400).json({ error: 'jobId, filename, and base64Data are required' }); return; }
    const buffer = Buffer.from(base64Data, 'base64');
    const jobs = loadJobs();
    const job = jobs[jobId];
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    job.files.push({ filename, size: buffer.length, grNo: grNo || null, type: path.extname(filename), uploadedAt: Date.now() });
    job.receivedCount++;
    job.status = 'uploading';
    job.updatedAt = Date.now();
    saveJobs(jobs);
    res.json({ ok: true, jobId, filename, size: buffer.length });
  } catch (err) {
    console.error('[server.ts] upload-single error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/documents/finalize-job', (req, res) => {
  try {
    const { jobId } = req.body || {};
    if (!jobId) { res.status(400).json({ error: 'jobId is required' }); return; }
    const jobs = loadJobs();
    const job = jobs[jobId];
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    job.status = 'processing';
    job.updatedAt = Date.now();
    saveJobs(jobs);
    res.json({ ok: true, job });
  } catch (err) {
    console.error('[server.ts] finalize-job error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/documents/upload-chunk', async (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks, chunkBase64, filename, grNo, isZip } = req.body || {};
    if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkBase64 || !filename) { res.status(400).json({ error: 'Missing required chunk parameters' }); return; }
    res.json({ ok: true, uploadId, chunkIndex, totalChunks });
  } catch (err) {
    console.error('[server.ts] upload-chunk error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/documents/upload-zip', async (req, res) => {
  try {
    const { base64Data, filename = 'upload.zip' } = req.body || {};
    if (!base64Data) { res.status(400).json({ error: 'base64Data is required' }); return; }
    const buffer = Buffer.from(base64Data, 'base64');
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    res.json({ ok: true, jobId, status: 'pending' });
  } catch (err) {
    console.error('[server.ts] upload-zip error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/documents/upload-files', async (req, res) => {
  try {
    const { files } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) { res.status(400).json({ error: 'files array is required' }); return; }
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    res.json({ ok: true, jobId, status: 'pending' });
  } catch (err) {
    console.error('[server.ts] upload-files error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/documents/jobs/:jobId', (req, res) => {
  const jobs = loadJobs();
  const job = jobs[req.params.jobId];
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ ok: true, job });
});

app.get('/api/documents/jobs-latest', (_req, res) => {
  const jobs = loadJobs();
  const jobIds = Object.keys(jobs).sort((a, b) => jobs[b].createdAt - jobs[a].createdAt);
  const job = jobIds.length > 0 ? jobs[jobIds[0]] : null;
  res.json({ ok: true, job });
});

app.post('/api/documents/jobs/:jobId/retry', (_req, res) => {
  const jobs = loadJobs();
  res.json({ ok: true, job: Object.values(jobs)[0] || null });
});

app.get('/api/documents/dossiers', (_req, res) => {
  const dossiers = loadDossiers();
  res.json({ ok: true, dossiers: Object.values(dossiers) });
});

app.get('/api/documents/all-docs', (_req, res) => {
  const docs = loadDocIndex();
  res.json({ ok: true, documents: Object.values(docs) });
});

app.post('/api/documents/audit-all', (req, res) => {
  const { records = [] } = req.body || {};
  res.json({ ok: true, discrepancies: [], dossiers: Object.values(loadDossiers()) });
});

app.get('/api/documents/dossiers/:grNo', (req, res) => {
  const dossiers = loadDossiers();
  const dossier = dossiers[req.params.grNo];
  if (!dossier) { res.status(404).json({ error: 'Dossier not found for this GR' }); return; }
  res.json({ ok: true, dossier });
});

app.post('/api/documents/audit/:grNo', (_req, res) => {
  res.json({ ok: true, discrepancies: [] });
});

app.post('/api/documents/auto-link', (req, res) => {
  const { records = [] } = req.body || {};
  res.json({ ok: true, linked: 0, unlinked: 0 });
});

app.post('/api/documents/assign', (req, res) => {
  const { docId, targetGrNo } = req.body || {};
  if (!docId || !targetGrNo) { res.status(400).json({ error: 'docId and targetGrNo are required' }); return; }
  res.json({ ok: true, document: null, dossier: null });
});

app.post('/api/documents/discrepancies/dismiss', (req, res) => {
  const { flagId } = req.body || {};
  if (!flagId) { res.status(400).json({ error: 'flagId is required' }); return; }
  res.json({ ok: true, success: true });
});

app.post('/api/documents/discrepancies/apply-correction', async (req, res) => {
  const { grNo, correction } = req.body || {};
  if (!grNo || !correction) { res.status(400).json({ error: 'grNo and correction are required' }); return; }
  res.json({ ok: true, updated: false });
});

app.post('/api/documents/discrepancies/batch-apply', async (_req, res) => {
  res.json({ ok: true, updated: 0 });
});

app.post('/api/documents/candidate-matches', (_req, res) => {
  res.json({ ok: true, matches: [] });
});

app.post('/api/documents/discrepancies/undismiss', (req, res) => {
  const { flagId } = req.body || {};
  if (!flagId) { res.status(400).json({ error: 'flagId is required' }); return; }
  res.json({ ok: true, success: true });
});

app.get('/api/documents/dismissed-flags', (_req, res) => {
  res.json({ ok: true, flags: {} });
});

app.post('/api/documents/select-child', (req, res) => {
  const { docId, entryNoOrIndex } = req.body || {};
  if (!docId || entryNoOrIndex === undefined) { res.status(400).json({ error: 'docId and entryNoOrIndex are required' }); return; }
  res.json({ ok: true, document: null });
});

app.post('/api/documents/reprocess-doc', async (_req, res) => {
  res.json({ ok: true, document: null });
});

app.post('/api/documents/reprocess-dossier', async (_req, res) => {
  res.json({ ok: true, dossier: null });
});

app.post('/api/documents/update-doc', async (req, res) => {
  const { docId } = req.body || {};
  if (!docId) { res.status(400).json({ error: 'docId is required' }); return; }
  res.json({ ok: true, document: null, dossier: null });
});

app.post('/api/documents/delete', (_req, res) => {
  res.json({ ok: true, deletedCount: 0, dossiers: [], documents: [] });
});

app.post('/api/documents/jobs/:jobId/stop', (_req, res) => {
  res.json({ ok: true, success: true, job: null });
});

app.post('/api/documents/rescan', async (_req, res) => {
  res.json({ ok: true, document: null, dossiers: [], documents: [] });
});

app.get('/api/documents/file/:grNo/:filename', (_req, res) => {
  res.status(404).send('File not found');
});

app.get('/api/documents/export-zip', (_req, res) => {
  res.status(400).json({ error: 'Export not available in serverless mode' });
});

// SPA fallback
if (process.env.NODE_ENV !== 'production') {
  app.get('/*{path}', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
  });
} else {
  app.use(express.static(path.join(process.cwd(), 'dist')));
  app.get('*all', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
  });
}

// Error handling
app.use((err: any, _req: any, res: any, next: any) => {
  console.error('[api] Error:', err);
  if (res.headersSent) { return next(err); }
  res.status(500).json({ error: err.message });
});

export default app;
