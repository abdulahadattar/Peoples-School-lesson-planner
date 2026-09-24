import express from 'express';
import { z } from 'zod';
import { defineFactory } from '@autonoma-ai/sdk';
import { createExpressHandler } from '@autonoma-ai/server-express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const app = express();

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const DATA_DIR = path.join(process.cwd(), 'data', 'autonoma');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONTEXT_OWNER_FILE = path.join(DATA_DIR, 'context_owners.json');
const BROWSER_CONTEXT_RECORD_FILE = path.join(DATA_DIR, 'browser_context_records.json');
const STORED_EVENT_FILE = path.join(DATA_DIR, 'stored_events.json');
const JOURNAL_ROW_FILE = path.join(DATA_DIR, 'journal_rows.json');
const RECEIPT_ROW_FILE = path.join(DATA_DIR, 'receipt_rows.json');

function loadJson<T>(file: string): T {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
}

function saveJson<T>(file: string, data: T) {
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

const ContextOwnerRef = z.object({
  id: z.string(),
});

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

const BrowserContextRecordRef = z.object({
  id: z.string(),
});

const StoredEventInput = z.object({
  name: z.string(),
  owner_turn_id: z.string(),
  ts: z.number().optional(),
  data: z.record(z.string(), z.any()).optional(),
});

const StoredEventRef = z.object({
  id: z.string(),
});

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

const JournalRowRef = z.object({
  id: z.string(),
});

const ReceiptRowInput = z.object({
  tool_name: z.string(),
  owner_turn_id: z.string(),
  ok: z.boolean(),
  duration_ms: z.number(),
  observed_at: z.number().optional(),
  tab_id: z.number(),
  controller_id: z.string(),
});

const ReceiptRowRef = z.object({
  id: z.string(),
});

const contextOwnerFactory = defineFactory({
  inputSchema: ContextOwnerInput,
  refSchema: ContextOwnerRef,
  create: async (data, _ctx) => {
    const owners = loadJson<Record<string, ContextOwnerRecord>>(CONTEXT_OWNER_FILE);
    const record: ContextOwnerRecord = {
      principal_id: data.principal_id,
      session_id: data.session_id,
      turn_id: data.turn_id,
      task_id: data.task_id,
    };
    owners[data.turn_id] = record;
    saveJson(CONTEXT_OWNER_FILE, owners);
    return { id: data.turn_id, principal_id: data.principal_id, session_id: data.session_id, turn_id: data.turn_id, task_id: data.task_id };
  },
  teardown: async (record, _ctx) => {
    const owners = loadJson<Record<string, ContextOwnerRecord>>(CONTEXT_OWNER_FILE);
    delete owners[record.id];
    saveJson(CONTEXT_OWNER_FILE, owners);
  },
});

const browserContextRecordFactory = defineFactory({
  inputSchema: BrowserContextRecordInput,
  refSchema: BrowserContextRecordRef,
  create: async (data, _ctx) => {
    try {
      const records = loadJson<Record<string, BrowserContextRecordRecord>>(BROWSER_CONTEXT_RECORD_FILE);
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
      saveJson(BROWSER_CONTEXT_RECORD_FILE, records);
      return { id: contextId };
    } catch (err) {
      console.error('[browserContextRecordFactory] Error:', err);
      throw err;
    }
  },
  teardown: async (record, _ctx) => {
    const records = loadJson<Record<string, BrowserContextRecordRecord>>(BROWSER_CONTEXT_RECORD_FILE);
    delete records[record.id];
    saveJson(BROWSER_CONTEXT_RECORD_FILE, records);
  },
});

const storedEventFactory = defineFactory({
  inputSchema: StoredEventInput,
  refSchema: StoredEventRef,
  create: async (data, _ctx) => {
    const events = loadJson<Record<string, StoredEventRecord>>(STORED_EVENT_FILE);
    const id = generateId();
    const record: StoredEventRecord = {
      id,
      name: data.name,
      owner_turn_id: data.owner_turn_id,
      ts: data.ts || getNow(),
      data: data.data || {},
    };
    events[id] = record;
    saveJson(STORED_EVENT_FILE, events);
    return { id };
  },
  teardown: async (record, _ctx) => {
    const events = loadJson<Record<string, StoredEventRecord>>(STORED_EVENT_FILE);
    delete events[record.id];
    saveJson(STORED_EVENT_FILE, events);
  },
});

const journalRowFactory = defineFactory({
  inputSchema: JournalRowInput,
  refSchema: JournalRowRef,
  create: async (data, _ctx) => {
    const rows = loadJson<Record<string, JournalRowRecord>>(JOURNAL_ROW_FILE);
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
    saveJson(JOURNAL_ROW_FILE, rows);
    return { id };
  },
  teardown: async (record, _ctx) => {
    const rows = loadJson<Record<string, JournalRowRecord>>(JOURNAL_ROW_FILE);
    delete rows[record.id];
    saveJson(JOURNAL_ROW_FILE, rows);
  },
});

const receiptRowFactory = defineFactory({
  inputSchema: ReceiptRowInput,
  refSchema: ReceiptRowRef,
  create: async (data, _ctx) => {
    const rows = loadJson<Record<string, ReceiptRowRecord>>(RECEIPT_ROW_FILE);
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
    saveJson(RECEIPT_ROW_FILE, rows);
    return { id };
  },
  teardown: async (record, _ctx) => {
    const rows = loadJson<Record<string, ReceiptRowRecord>>(RECEIPT_ROW_FILE);
    delete rows[record.id];
    saveJson(RECEIPT_ROW_FILE, rows);
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
      return {
        headers: {
          Authorization: `Bearer test-token-${user?.id || 'unknown'}`,
        },
      };
    },
  });
}

const sharedSecret = process.env.AUTONOMA_SHARED_SECRET || 'e1ae84345a120f3f25ce10158da374307faadfeb1a091b997299ae55777d166a';
const signingSecret = process.env.AUTONOMA_SIGNING_SECRET || '043b60e656b726705d559a6489a73ccaf57c234f5e01b384f5f62936c1a0aaaa';
const autonomaHandler = createAutonomaHandler(sharedSecret, signingSecret);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/autonoma', (req, res) => {
  autonomaHandler(req, res);
});

export default app;