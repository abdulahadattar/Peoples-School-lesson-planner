# PHSSJ Portal — Agent Standards

Canonical rules live in `AGENTS.md`, architectural invariants in `AGENT_MEMORY.md`, and verified versions/models in `docs/VERIFIED_STACK.md`.

1. **Verify First**: Read source files before editing; never guess versions or Gemini model IDs.
2. **Modular & Anti-Bloat**: Keep files 200–350 LOC max; reuse `components/ui/`, hooks, and shared services; keep comments brief ("why" only).
3. **Complete Wiring & Edge Cases**: Connect changes end-to-end across modules, auth, and stores; handle empty data, timeouts, 429/quotas, expired/cancelled tokens, permissions, duplicates, and partial batch failures.
4. **UI Copy & UX Rules (Permanent)**:
   - Zero technical/AI jargon in UI (`ingestion`, `batching`, `key rotation`, `OCR pipeline`, `tokens`, `dossier`, `discrepancy audit`, `A2UI`, `inference`, `payload`, `schema`, `compiler`, `telemetry`, `IndexedDB`, `Cloud Firestore`).
   - Short 1–4 word titles; no multi-sentence subtitle bloat.
   - Use plain school words (`Student Folders`, `Documents`, `Mismatches`, `Google Drive Import`, `Skip Already Imported`, `Reset Data`, `Student Records`, `Marksheets`, `Daily Attendance`, `Lesson Plans`, `Exams & Papers`).
   - Sanitize user error toasts via `toUserErrorMessage` (`utils/userMessage.ts`).
5. **Verify Before Finishing**: Run `npm run lint`, `npm run build`, and `npm run test:unit`.
