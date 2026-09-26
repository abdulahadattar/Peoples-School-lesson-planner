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
| **`firestore.rules`** | Firestore security rules. Current vulnerability: allows unauthenticated writes to `daily_attendance`, `attendanceRecords`, and `substitutions` if `id` matches string regex. |

---

## 4. Known Bugs & Fragile Areas

1. **Firestore Permissive Security Rules**:
   - `daily_attendance`, `attendanceRecords`, and `substitutions` allow unrestricted write access (`allow create, update: if isValidId(...)`) without verifying Firebase Auth credentials.
2. **Plaintext Secrets in Repo**:
   - `AGENTS.md` currently lists HMAC shared secrets and signing keys in plain text.
3. **Large File Monoliths**:
   - `DocumentArchiveCenterView.tsx` (111 KB) and `documentArchiveService.ts` (202 KB) are fragile and prone to partial AI code truncations.
4. **Vercel vs Local Execution Inconsistency**:
   - Because `api/index.ts` was made standalone to satisfy Vercel bundling, any changes to document processing in `services/documentArchiveService.ts` will **not** automatically execute in Vercel production unless synchronized.
