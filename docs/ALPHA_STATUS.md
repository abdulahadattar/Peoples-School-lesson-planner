# Alpha Branch Status & Open Items

Active working status for branch `alpha` (`https://phssjamshoroportalalpha.vercel.app`).

## Current Architecture Facts
- **Autonoma Secrets**: Production no longer crashes when `AUTONOMA_SHARED_SECRET` / `AUTONOMA_SIGNING_SECRET` are unset (`00347b7`). Always configure them in Vercel env vars; rotate old historical secrets if exposed.
- **Document Archive Storage**: Supports local/tmp storage (`services/documentArchive/constants.ts`) and optional `firebase-admin` Firestore persistence (`services/documentArchive/firestoreBackend.ts`, `firestoreStore.ts`). `services/storage/index.ts` remains a minimal test seam until explicitly replaced or removed.
- **OMR Scanner**: Fully implemented under `services/omr/*` and `components/omr/*`.
- **UI Copy & Errors**: Plain school vocabulary enforced; user-facing error messages sanitized via `utils/userMessage.ts`.

## Open Architectural Items
1. **O1 — Shared Firestore listener fan-out**: `StudentRecordsView` / `useStudentRecords` listens on shared `student_record_edits`. Moving to per-teacher subcollections requires a `firestore.rules` update and deploy.
2. **O2 — Permissive Firestore rules**: `daily_attendance`, `attendanceRecords`, and `substitutions` still allow unauthenticated writes matching `isValidId(...)` pending auth tightening.
3. **O3 — Attendance localStorage queue cap**: `MAX_ENTRIES = 200` in `services/sheetSyncQueue.ts` (warns at 80%). Attendance sync has not yet been migrated to a shared Firestore store.
4. **Repository hygiene**: Check whether legacy `api/_bundle.cjs` (if present/tracked) can be removed cleanly if unreferenced by `vercel.json`.
