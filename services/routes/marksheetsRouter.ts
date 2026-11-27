import { createHash } from 'node:crypto';
import { Router } from 'express';
import { MARKSHEET_SPREADSHEET_ID } from '../marksheet/config.js';
import { importMarksheetWorkbook } from '../marksheet/importer.js';
import { makeMarkEntryKey } from '../marksheet/storage.js';
import type { MarksheetConfig, StudentMarkEntry } from '../marksheet/types.js';

interface CachedLiveMarksheets {
  timestamp: number;
  spreadsheetId: string;
  contentHash: string;
  syncedAt: string;
  configPatch: Partial<MarksheetConfig> | null;
  entriesByKey: Record<string, StudentMarkEntry>;
  count: number;
}

const liveCache: Record<string, CachedLiveMarksheets> = {};
const CACHE_TTL_MS = 8 * 1000;
const SPREADSHEET_ID_RE = /^[a-zA-Z0-9-_]{10,120}$/;

function isHtmlPayload(buf: Uint8Array): boolean {
  const head = Buffer.from(buf.slice(0, 128)).toString('utf-8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortValue);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) {
        out[k] = stableSortValue(v);
      }
    }
    return out;
  }
  return value;
}

export function computeMarksheetsContentHash(
  configPatch: Partial<MarksheetConfig> | null,
  entriesByKey: Record<string, StudentMarkEntry>
): string {
  const normalizedEntries: Record<string, unknown> = {};
  for (const key of Object.keys(entriesByKey).sort()) {
    const entry = entriesByKey[key];
    const { updatedAt: _volatileTs, ...rest } = entry;
    normalizedEntries[key] = stableSortValue(rest);
  }
  const canonical = JSON.stringify({
    configPatch: stableSortValue(configPatch),
    entriesByKey: normalizedEntries,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function createMarksheetsRouter(): Router {
  const router = Router();

  router.get('/marksheets/live', async (req, res) => {
    try {
      const requestedId = String(req.query.spreadsheetId || MARKSHEET_SPREADSHEET_ID).trim();
      if (!SPREADSHEET_ID_RE.test(requestedId)) {
        res.status(400).json({ ok: false, error: 'Invalid spreadsheetId parameter.' });
        return;
      }

      const knownHash = typeof req.query.knownHash === 'string' ? req.query.knownHash.trim() : '';
      const authHeader = req.headers.authorization;
      const forceRefresh = Boolean(
        req.query.refresh === 'true' ||
          req.query.forceRefresh === 'true' ||
          req.headers['cache-control']?.includes('no-cache')
      );

      const cacheKey = `${requestedId}_${authHeader ? 'auth' : 'public'}`;
      const now = Date.now();
      const cached = liveCache[cacheKey];

      if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
        if (knownHash && knownHash === cached.contentHash) {
          res.json({
            ok: true,
            unchanged: true,
            spreadsheetId: cached.spreadsheetId,
            contentHash: cached.contentHash,
            syncedAt: cached.syncedAt,
            count: cached.count,
            fromCache: true,
          });
          return;
        }
        res.json({
          ok: true,
          unchanged: false,
          spreadsheetId: cached.spreadsheetId,
          contentHash: cached.contentHash,
          syncedAt: cached.syncedAt,
          count: cached.count,
          configPatch: cached.configPatch,
          entriesByKey: cached.entriesByKey,
          fromCache: true,
        });
        return;
      }

      const exportUrl = `https://docs.google.com/spreadsheets/d/${requestedId}/export?format=xlsx&_t=${now}`;
      const headers: Record<string, string> = {};
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const gRes = await fetch(exportUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });

      if (!gRes.ok) {
        if (gRes.status === 401 || gRes.status === 403) {
          res.status(gRes.status).json({
            ok: false,
            needsAuth: true,
            error: 'Sign in with Google or share the marksheet link with view access.',
          });
          return;
        }
        if (cached) {
          if (knownHash && knownHash === cached.contentHash) {
            res.json({
              ok: true,
              unchanged: true,
              spreadsheetId: cached.spreadsheetId,
              contentHash: cached.contentHash,
              syncedAt: cached.syncedAt,
              count: cached.count,
              fromCache: true,
              staleWarning: `Upstream returned HTTP ${gRes.status}`,
            });
            return;
          }
          res.json({
            ok: true,
            unchanged: false,
            spreadsheetId: cached.spreadsheetId,
            contentHash: cached.contentHash,
            syncedAt: cached.syncedAt,
            count: cached.count,
            configPatch: cached.configPatch,
            entriesByKey: cached.entriesByKey,
            fromCache: true,
            staleWarning: `Upstream returned HTTP ${gRes.status}`,
          });
          return;
        }
        res.status(502).json({
          ok: false,
          error: `Google Sheets returned HTTP ${gRes.status}.`,
        });
        return;
      }

      const bytes = new Uint8Array(await gRes.arrayBuffer());
      if (isHtmlPayload(bytes)) {
        res.status(401).json({
          ok: false,
          needsAuth: true,
          error: 'This Google Sheet requires sign-in permission to read live marks.',
        });
        return;
      }

      const parsed = importMarksheetWorkbook(bytes, 'midterm');
      const entriesByKey: Record<string, StudentMarkEntry> = {};
      const uniqueGrs = new Set<string>();

      for (const entry of parsed.entries) {
        const exam = entry.examType || 'midterm';
        const key = makeMarkEntryKey(entry.grNo, exam);
        entriesByKey[key] = { ...entry, examType: exam };
        uniqueGrs.add(entry.grNo);
      }

      const syncedAt = new Date().toISOString();
      const contentHash = computeMarksheetsContentHash(parsed.configPatch, entriesByKey);
      liveCache[cacheKey] = {
        timestamp: now,
        spreadsheetId: requestedId,
        contentHash,
        syncedAt,
        configPatch: parsed.configPatch,
        entriesByKey,
        count: uniqueGrs.size,
      };

      if (knownHash && knownHash === contentHash) {
        res.json({
          ok: true,
          unchanged: true,
          spreadsheetId: requestedId,
          contentHash,
          syncedAt,
          count: uniqueGrs.size,
          fromCache: false,
        });
        return;
      }

      res.json({
        ok: true,
        unchanged: false,
        spreadsheetId: requestedId,
        contentHash,
        syncedAt,
        count: uniqueGrs.size,
        configPatch: parsed.configPatch,
        entriesByKey,
        fromCache: false,
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to sync live marksheet Google Sheet.',
      });
    }
  });

  return router;
}
