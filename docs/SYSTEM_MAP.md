# System Architecture & Codebase Map (Alpha Branch)

This document is continuously updated to serve as a ground-truth technical guide for the Alpha branch of the Peoples Higher Secondary School Jamshoro portal.

---

## 1. High-Level Topology

```
                  +----------------------------------------------+
                  |                 Client (Vite)                |
                  |  - Lesson Planner & Exam Paper Generator     |
                  |  - Daily Attendance & Student Records        |
                  |  - Live Timetable Monitor & Substitutions    |
                  |  - Document Archive Center & OCR Audits      |
                  +-----------------------+----------------------+
                                          |
                +-------------------------+-------------------------+
                |                                                   |
      HTTP / Browser API                                  Direct Client Calls
                |                                                   |
                v                                                   v
+-------------------------------+                       +-----------------------+
| Vercel Serverless / Express   |                       | Firebase Client SDK   |
| (api/index.ts & services/     |                       | - Auth (Google Sign-In|
|  app.ts)                      |                       | - Firestore DB        |
| - Gemini REST Reverse Proxy   |                       +-----------------------+
| - Google Sheets Sync & Proxy  |
| - Document Archive & Ingestion|
| - Autonoma Seed & Test SDK    |
+-------------------------------+
```

---

## 2. Server Runtime Divergence Warning (Crucial Context)

There are **two different server architectures** present in the codebase due to iterative AI-driven development:

1. **`api/index.ts` (Vercel Production Serverless Endpoint)**:
   - Self-contained, single-file serverless handler bundle.
   - Deployed on Vercel at `/api/*`.
   - Uses `/tmp/data/` for ephemeral disk storage on serverless instances.
   - Contains inlined endpoints for Sheets proxy, Autonoma SDK, and Document Uploads.
   - **Crucial Limitation**: The AI document OCR processing loops (`processSingleDocument`, multi-step B-Form family table parsing) are **not present in `api/index.ts`**. It only handles the intake jobs and stores them in `/tmp`.

2. **`services/app.ts` & `server.ts` (Local Node.js Development Engine)**:
   - Full monolithic Express server running via `tsx server.ts`.

---

## 5. External Integrations & Tooling Reference

### Google MCP Servers (`https://github.com/google/mcp`)
When expanding assistant tools, background tasks, or multi-agent workflows, consider official Google Model Context Protocol (MCP) servers:
- **Firebase MCP**: Managing and querying Firestore collections, remote configurations, and security audits directly.
- **Google Workspace MCP**: Sheets, Docs, Drive automation (for school reports, marks sheet exports, Google Sheets synchronization).
- **Google Cloud Storage MCP**: Offloading student document scans/dossier images rather than keeping them on ephemeral local disk or `/tmp`.
- **Developer Knowledge & Gemini CLI extensions**: Grounding models on official Google Cloud and Gemini documentation.

   - Wired directly to `services/documentArchiveService.ts` (over 4,900 lines of comprehensive prompt engineering, image handling, CNIC/B-Form OCR validation, and child matching).
   - Uses `path.join(process.cwd(), 'data', 'student_documents')` for persistence.

---

## 3. Directory & File Breakdown

| Directory / File | Description & State |
| :--- | :--- |
| **`api/index.ts`** | Standalone Vercel function. Contains Autonoma endpoints, Google Sheets proxies, and document job intake stubs. |
| **`services/documentArchiveService.ts`** | The comprehensive OCR/Gemini engine (4,992 lines). Performs document type classification, Sindhi/Urdu/English OCR parsing, family table matching for B-Forms, and discrepancy flagging. |
| **`services/documentClientService.ts`** | Frontend client SDK for chunked file uploads, job polling, auto-linking dossiers, and discrepancy corrections. |
| **`components/DocumentArchiveCenterView.tsx`** | Massive single-file UI (111 KB) orchestrating archive search, dossier cards, document upload queues, and discrepancy resolution. |
| **`services/geminiService.ts`** | Production Gemini integration featuring: 1) Round-robin key rotation with cooldowns; 2) `MODEL_CHAIN` fallback (`gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-2.5-flash`); 3) PDF context fetching. |
| **`services/schoolConfigService.ts`** | Central authority for timetable bells, period definitions, class sections, and teacher assignments. Syncs in real time with Firestore `settings/school_config`. |
| **`services/timetableConflictEngine.ts`** | Graph-like schedule checker resolving overlapping teacher assignments and period splits. |
| **Offline sheet sync** | Local-first queue and overlay. Reference and invariants: [OFFLINE_SYNC.md](./OFFLINE_SYNC.md). |
| ↳ **`services/sheetSyncQueue.ts`** | localStorage queue capped at 200 entries, one per scope. A storage failure counts as a dropped edit and returns `false`. |
| ↳ **`services/localRecordsOverlay.ts`** | Local values that shadow sheet data until the write lands. |
| ↳ **`hooks/useSheetSyncQueue.ts`** | Drain loop, token state, and health (`droppedCount`, `capacity`, `queueNearlyFull`) for the UI. |
| ↳ **`components/ui/PendingSyncBanner.tsx`** | Mounted once in `App.tsx`. The only surface allowed to promise "nothing is lost", and only when `droppedCount === 0`. |
| ↳ **`services/timetableSheetWriter.ts`** | Timetable grid writes with row/column guards. Owns `parseCsvToGrid`; aborts the run on auth/scope errors. |
| ↳ **`services/timetableSheetService.ts`** | Timetable grid reads. Imports `parseCsvToGrid` **from the writer** so both sides agree on row numbers. |
| **`firestore.rules`** | Firestore security rules. Current vulnerability: allows unauthenticated writes to `daily_attendance`, `attendanceRecords`, and `substitutions` if `id` matches string regex. |

---

## 4. Known Bugs & Fragile Areas

1. **Firestore Permissive Security Rules**:
   - `daily_attendance`, `attendanceRecords`, and `substitutions` allow unrestricted write access (`allow create, update: if isValidId(...)`) without verifying Firebase Auth credentials.
2. **Secrets in git history**:
   - The hardcoded Autonoma secret literals were removed from `api/index.ts`,
     `services/app.ts` and `AGENTS.md` on 2026-09-27 (production now refuses to boot
     without both environment variables). They **remain in git history**, so rotation
     is still outstanding — this is a rotation task, not a working-tree task.
3. **Large File Monoliths**:
   - `DocumentArchiveCenterView.tsx` (111 KB) and `documentArchiveService.ts` (202 KB) are fragile and prone to partial AI code truncations.
4. **Vercel vs Local Execution Inconsistency**:
   - Because `api/index.ts` was made standalone to satisfy Vercel bundling, any changes to document processing in `services/documentArchiveService.ts` will **not** automatically execute in Vercel production unless synchronized.
5. **Attendance/records fan-out (open, architectural)**:
   - One shared `onSnapshot` covering all teacher records pushes every edit to every
     open client; traffic scales with the square of active teachers. Fix needs a
     per-teacher subcollection plus a `firestore.rules` change. See
     [OFFLINE_SYNC.md](./OFFLINE_SYNC.md) §6 O1.
6. **One whole-sheet download per edit (open)**:
   - Each record save performs a Sheets write and then a full `loadRecords(true)`
     re-download of the entire sheet. There is **no** periodic polling — the 30 s
     intervals are local token-expiry checks only. See
     [OFFLINE_SYNC.md](./OFFLINE_SYNC.md) §6 O2.

### Fixed 2026-10-01 (offline sheet sync)

Three silent-data-loss defects, all confirmed and covered by `npm run test:unit:sheets`:

- **Silent drop on storage failure** — `queueSheetSync` swallowed `localStorage`
  throws and returned success, so quota errors discarded edits while the banner said
  nothing was lost. Now returns `false` and increments the drop counter.
- **Banner invisible outside the roster view** — it was mounted per-view, so Timetable
  and Settings never showed sync failures. Now mounted once in `App.tsx`.
- **Read/write parser mismatch** — the timetable reader used the trimming,
  blank-row-dropping `parseCSV` while the writer used positional `parseCsvToGrid`, so
  a blank row in a sheet shifted every subsequent write into a neighbour's cell.
  Both sides now share one parser.

Also: auth and scope errors now abort the remaining write batches instead of
attempting every class tab against a dead token (the Sheets quota is
60 writes/minute/user), and the reconnect prompt moved onto the banner itself.
