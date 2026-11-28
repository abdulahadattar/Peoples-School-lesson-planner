# Offline Sheet Sync — Invariants & Reference

Tests: `npm run test:unit:sheets`

## 1. Architecture Summary
- **Student Records**: Edits save directly to shared Firestore `student_record_edits` (`services/sharedRecordEdits.ts`), merge live via `onSnapshot`, and push to Google Sheets in one explicit **Sync to Sheet** action (`batchUpdateSheetRecords`, 50 rows/request). Sheet reads are gated to 12 hours (`shouldPullSheet()` in `services/sheetPullSchedule.ts`) unless explicitly refreshed.
- **Attendance**: Uses `services/sheetSyncQueue.ts` (localStorage queue, capped at 200) alongside Firestore.
- **Timetable**: Uses its own strip in the Timetable Editor (`hooks/useTimetableSheetSync.ts`), **not** `sheetSyncQueue.ts` or `PendingSyncBanner`.

## 2. Core Files
- `services/sharedRecordEdits.ts` — Shared Firestore store for pending record edits/adds.
- `services/sheetPullSchedule.ts` — 12-hour read throttle.
- `hooks/useSheetSyncQueue.ts` & `components/ui/PendingSyncBanner.tsx` — Shell-mounted sync banner & drain loop.
- `services/sheetSyncQueue.ts` — Attendance-only localStorage queue (cap 200, tracks `dropped`).
- `services/googleSheetsService.ts` — Batch Sheets writes & `classifySheetsWriteError`.
- `services/timetableSheetWriter.ts` & `services/timetableSheetService.ts` — Timetable A1 grid writes & reads.
- `services/localRecordsOverlay.ts` — Legacy overlay kept only for existing unit tests.

## 3. Non-Negotiable Invariants
- **I0a (Records in Firestore only)**: Never fall back to localStorage for student record edits; if Firestore save fails, keep the modal open and inform the user.
- **I0b (Explicit sync only)**: Sync must be user-triggered (one action handles expired Google sign-in + batch push); never auto-push inside a `useEffect` on token change.
- **I0c (12h read gate)**: Never call `loadRecords(true)` inside a save path.
- **I0d (Idempotent new students)**: Pending edits use sheet row doc IDs; pending adds use `add-<gr-number>`. `markSharedEditSynced` writes `syncedAt` before deleting to prevent duplicate appends. `batchUpdateSheetRecords` rejects non-positive row indices. Offline `setDoc` timeouts still count as saved.
- **I1 (Storage failure = dropped edit)**: `queueSheetSync` returns `false` on `localStorage.setItem` errors and increments `dropped`.
- **I2 (Honest reassurance)**: `PendingSyncBanner` may only show reassuring copy when `droppedCount === 0` and warns at >= 80% capacity (`queueNearlyFull`).
- **I3 (Single shell mount)**: `PendingSyncBanner` is mounted once in `App.tsx`.
- **I4 (`parseCsvToGrid` for grids)**: `timetableSheetService.ts` MUST import `parseCsvToGrid` from `timetableSheetWriter.ts` (never `parseCSV`) so blank rows and true sheet row indices are preserved.
- **I5 (Abort on auth/scope errors)**: Prefix HTTP status (`HTTP 401: ...`) into write errors. `classifySheetsWriteError` aborts remaining tabs immediately on `auth` or `scope` errors (`needsReconnect: true`), while continuing other tabs on transient `429`/`500` errors.

## 4. Error Taxonomy (`SheetsWriteErrorKind`)
- `auth` (`401`) / `scope` -> Abort batch run, prompt reconnect.
- `quota` (`429`) / `permission` (`403`) / `unknown` -> Report failure, continue independent tabs.

## 5. Open Architectural Follow-Ups
- **O1**: Move `student_record_edits` from one shared collection listener to per-teacher subcollections (`firestore.rules` change required).
- **O3**: Fixed 200-entry cap on attendance `sheetSyncQueue.ts`.
