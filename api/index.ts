import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import compression from 'compression';
import { z } from 'zod';
import { defineFactory } from '@autonoma-ai/sdk';
import { createExpressHandler } from '@autonoma-ai/server-express';
// C5: real document pipeline routes (services/documentArchive/*) for the
// Vercel entrypoint. Kept OUTSIDE api/ because Vercel compiles every source
// file there as its own function; shared modules are bundled by Node File
// Trace from the import graph (vercel.com/docs/functions/quickstart).
import { createServerlessDocumentRoutes } from '../services/serverless/documentsRoutes.js';

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

// ===== Autonoma secrets: environment only, no literal fallback =====
// There is deliberately NO committed default here. A stale literal signs every
// request with the wrong key and the only symptom is a bare
// 401 {"error":"Invalid HMAC signature","code":"INVALID_SIGNATURE"}, which reads
// as an Autonoma outage instead of a misconfiguration (see finding F1 in
// docs/ALPHA_STATUS.md). Keep this block in sync with services/app.ts.
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

function missingAutonomaSecrets(sharedSecret: string, signingSecret: string): string[] {
  const missing: string[] = [];
  if (!sharedSecret) missing.push('AUTONOMA_SHARED_SECRET');
  if (!signingSecret) missing.push('AUTONOMA_SIGNING_SECRET');
  return missing;
}

// @autonoma-ai/sdk rejects sharedSecret === signingSecret with SAME_SECRETS on
// every request, so the dev-only pair must always be two distinct values.
function generateDevAutonomaSecrets(): { sharedSecret: string; signingSecret: string } {
  const sharedSecret = crypto.randomBytes(32).toString('hex');
  let signingSecret = crypto.randomBytes(32).toString('hex');
  while (signingSecret === sharedSecret) {
    signingSecret = crypto.randomBytes(32).toString('hex');
  }
  return { sharedSecret, signingSecret };
}

function resolveAutonomaSecrets(): { sharedSecret: string; signingSecret: string } {
  const sharedSecret = (process.env.AUTONOMA_SHARED_SECRET || '').trim();
  const signingSecret = (process.env.AUTONOMA_SIGNING_SECRET || '').trim();

  if (sharedSecret && sharedSecret === signingSecret) {
    const message =
      '[autonoma] AUTONOMA_SHARED_SECRET and AUTONOMA_SIGNING_SECRET must be different: ' +
      '@autonoma-ai/sdk rejects identical secrets with SAME_SECRETS.';
    if (IS_PRODUCTION) {
      console.error(message);
      throw new Error(message);
    }
    console.warn(`${message} Using a generated dev-only pair for this boot.`);
    return generateDevAutonomaSecrets();
  }

  const missing = missingAutonomaSecrets(sharedSecret, signingSecret);
  if (missing.length > 0) {
    const message =
      `[autonoma] Missing environment variable(s): ${missing.join(', ')}. ` +
      'Set them in Vercel project settings (deployed) or in .env locally (see .env.example). ' +
      'An empty or stale value answers every signed request with 401 INVALID_SIGNATURE.';
    if (IS_PRODUCTION) {
      // Fail fast: a production deployment without Autonoma credentials must not
      // start, otherwise the failure only shows up as an unexplained 401.
      console.error(`${message} Refusing to start.`);
      throw new Error(`${message} Refusing to start.`);
    }
    // Local dev stays bootable, but the generated pair is dev-only: an external
    // Autonoma caller cannot sign a request this process will accept.
    console.warn(
      `${message} Continuing with a generated, dev-only secret pair; ` +
        'Autonoma signing will NOT match an external caller.'
    );
    return generateDevAutonomaSecrets();
  }

  return { sharedSecret, signingSecret };
}

const { sharedSecret: AUTONOMA_SHARED_SECRET, signingSecret: AUTONOMA_SIGNING_SECRET } =
  resolveAutonomaSecrets();

const autonomaHandler = createAutonomaHandler(AUTONOMA_SHARED_SECRET, AUTONOMA_SIGNING_SECRET);

// ===== API Routes =====
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// The handler is always constructed: production throws at boot when a secret is
// missing (fail fast) and local dev generates a dev-only pair, so the previous
// "not configured -> 503 AUTONOMA_NOT_CONFIGURED" branch is now unreachable.
app.post('/api/autonoma', (req, res) => {
  autonomaHandler(req, res);
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
    const modelsToTry = Array.from(new Set([model, 'gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']));
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
    store[date] = { date, classes, notes: notes || '', recordedBy: recordedBy || 'Unassigned', updatedAt: Date.now() };
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

// Document pipeline (C5): the real documentArchive services, with serverless
// semantics — every mutating request runs the queue to completion and the
// sync persistence mode (VERCEL default) keeps /tmp/data durable before the
// response returns. Mounted under '/api' with the same relative paths as the
// live server (services/routes/documentUploadRouter.ts).
app.use('/api', createServerlessDocumentRoutes());

// SPA fallback
// Express 5 rejects a bare absolute path in res.sendFile (NotFoundError, which
// the error handler below turns into a 500 for every page load), so the
// filename must be passed together with a `root`.
if (process.env.NODE_ENV !== 'production') {
  // Must be the SAME pattern as the production branch below. The previous
  // value here was '/*{path}', which Express 5 (path-to-regexp v8) rejects at
  // registration time with
  //   TypeError: Missing parameter name at index 2: /*{path}
  // so importing this module outside production threw before any route could
  // be reached, breaking `vercel dev` and any local test of the function.
  // Verified against Express 5: '*{name}' registers cleanly and matches '/',
  // '/records/123' and '/a/b/c'. Bare '*' and '/*{path}' both throw.
  app.get('*all', (_req, res) => {
    res.sendFile('index.html', { root: process.cwd() }, (err) => {
      if (err) {
        console.error('[api] SPA fallback failed:', err);
        if (!res.headersSent) res.status(500).send('Failed to serve index.html');
      }
    });
  });
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (_req, res) => {
    res.sendFile('index.html', { root: distPath }, (err) => {
      if (err) {
        console.error('[api] SPA fallback failed:', err);
        if (!res.headersSent) res.status(500).send('Failed to serve index.html');
      }
    });
  });
}

// Error handling
app.use((err: any, _req: any, res: any, next: any) => {
  console.error('[api] Error:', err);
  if (res.headersSent) { return next(err); }
  res.status(500).json({ error: err.message });
});

export default app;
