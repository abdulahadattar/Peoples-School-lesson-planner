# Offline Sheet Sync — Subsystem Reference

Ground truth for the local-first Google Sheets sync path: what is queued, where it
lives, what the UI is allowed to promise, and the invariants that keep a write from
landing in the wrong cell.

Companion to [SYSTEM_MAP.md](./SYSTEM_MAP.md). Written after the 2026-10-01 audit
that found three silent-data-loss defects in this path.

| Field | Value |
| --- | --- |
| Branch | `alpha` |
| Last verified | 2026-10-01 |
| Tests | `npm run test:unit:sheets` |

---

## 1. What this path does

A teacher edits attendance or a student record while Google sign-in is expired,
offline, or mid-write. The change must not be lost and must eventually reach the
shared Google Sheet. Three layers cooperate:

```
 teacher edits
      |
      v
 publishSharedEdit        Firestore `student_record_edits`: the pending edit is
      |                   durable and shared from the moment it is saved, so it
      |                   survives a refresh and is visible to every signed-in
      |                   teacher on every device
      v
 subscribeSharedEdits     live onSnapshot: another teacher's edit appears here
      |                   with no reload; the sheet row is merged underneath
      v
 PendingSyncBanner        ONE action - "Sync to Sheet" - signs in if the ~1 hour
      |                   token has lapsed, then continues by itself
      v
 batchUpdateSheetRecords  every pending row in ONE values:batchUpdate request
      |                   (1 per 50 rows), then the Firestore docs are removed
      v
 Google Sheet             the official register

 Reading is separate and rare:

 Google Sheet --(every 12 h, or an explicit Refresh)--> fetchSheetData
```

`PendingSyncBanner` is the single user-visible surface for all of it.

> **Records and attendance are not the same any more.** Record edits live in
> Firestore. Attendance still uses the localStorage queue
> (`services/sheetSyncQueue.ts`), so the capped-queue and dropped-edit warnings in
> this document apply to attendance only. Migrating attendance to the same
> Firestore store is a known follow-up.

---

## 2. Files

| File | Responsibility |
| --- | --- |
| `services/sharedRecordEdits.ts` | **Pending record edits, in Firestore.** Doc id is the sheet row number, so concurrent edits to one student converge. |
| `services/sheetPullSchedule.ts` | The 12-hour pull gate. Pure and unit-testable, so it cannot drift back into "fetch every time". |
| `hooks/useSheetSyncQueue.ts` | Explicit Sync only; batches records; token state; health for the UI. |
| `components/ui/PendingSyncBanner.tsx` | The only UI that talks about pending/lost edits. One-action sign-in + sync. |
| `services/googleSheetsService.ts` | `batchUpdateSheetRecords`, attendance writes, `parseCSV`. |
| `services/sheetSyncQueue.ts` | **Attendance only now.** localStorage queue, capped at 200. |
| `services/localRecordsOverlay.ts` | No longer used for records. Retained only because its unit suite still covers it — a removal candidate. |
| `services/timetableSheetWriter.ts` | Timetable grid writes, guards, `parseCsvToGrid`. |
| `services/timetableSheetService.ts` | Timetable grid reads (imports the writer's parser). |
| `App.tsx` | Mounts the banner once, at shell level. |

---

## 3. Public API

`sheetSyncQueue.ts`

```ts
queueSheetSync(entry): PendingSyncEntry   // dedupes by (target, scope)
listPendingSync(): PendingSyncEntry[]
pendingSyncCount(): number
pendingScopes(target): string[]
markSyncAttempt(id, error?)               // increments attempts, records error
clearPendingSync(id) / clearAllPendingSync()
getQueueHealth(): { pending, dropped, capacity }
acknowledgeDroppedEdits()                 // clears the lost-edit counter
subscribeSyncQueue(fn): () => void        // queue changed
```

`useSheetSyncQueue()` returns

```ts
{ entries, pendingCount, pendingFor(target), sheetsConnected, syncing, lastResult,
  syncAll, refreshTokenState,
  droppedCount,        // edits that are gone for good
  capacity,            // 200
  queueNearlyFull,     // >= 80% of capacity
  acknowledgeDropped }
```

---

## 4. Invariants — do not break these

### I0a — Record edits live in Firestore, never localStorage

A pending student-record edit is stored **only** in `student_record_edits`. There is
deliberately no localStorage fallback for records:

- a device-local copy is invisible to every other teacher,
- it disappears when that browser's data is cleared, and
- it is pinned to one machine.

All three present as "a saved edit that everyone else, and every future session,
silently lacks" — worse than refusing the save outright. If the shared write does
not land, the teacher is told the edit was **not** saved and the dialog stays open
so they can retry.

### I0b — Sync is one action, and only ever explicit

Pressing "Sync to Sheet" signs in when the ~1 hour token has lapsed and then
continues by itself; the teacher is never left to find a second button. Nothing
pushes automatically — an earlier `useEffect` fired a sync the moment a token
became available, which published edits the teacher had not decided to send.

### I0c — The register is pulled every 12 hours, not after every edit

`shouldPullSheet()` in `services/sheetPullSchedule.ts` gates reads, and only a real
pull resets the clock. Do not put a sheet fetch back in the save path: a single
edit used to cost one write **plus a full sheet re-download**, and a lapsed token in
that path called `googleSignIn()`, so editing twenty students could prompt for
sign-in twenty times.

### I0d — A pending add is keyed by GR number, and pushed exactly once

Two failure modes here produced duplicate students in the register, so both are
load-bearing:

- **Document id.** An edit is keyed by its sheet row; a new student is keyed by
  `add-<gr-number>`. Anything random would mint a *second* pending document when
  the teacher edited the pending add, and Sync would append the student twice.
- **Write-once marker.** `markSharedEditSynced` writes `syncedAt` **before** the
  document is deleted. Without it, a cleanup failure left the document in place
  and the next Sync appended a duplicate. Edits carrying `syncedAt` skip the write
  and only retry the delete.
- **New students are appended, never written over a row.** `addSheetRecord`
  appends; `batchUpdateSheetRecords` rejects any row number that is not a positive
  integer. An illegal `R0:AO0` would fail the whole request, because
  `values:batchUpdate` is request-atomic.
- **A save that times out still counts as saved.** `setDoc` resolves from the local
  cache when offline, so the edit really is stored. Reporting "nothing was saved"
  would be a lie, and a retry would create a duplicate add.

### I1 — A storage failure is a dropped edit (attendance queue)

`queueSheetSync` returns `false` when `localStorage.setItem` throws (quota, private
mode, corrupted origin). The caller must treat `false` as **the edit is lost**.

Before this, the function swallowed the throw and returned `true`. The edit vanished,
`dropped` stayed at zero, and the banner kept telling the teacher "Nothing is lost."
An overflow drop and a storage drop are the same outcome for the user and are counted
the same way.

### I2 — The banner may only reassure when `droppedCount === 0`

`PendingSyncBanner` overrides the reassurance with a high-priority alert whenever
`droppedCount > 0`, and warns at 80% capacity (`queueNearlyFull`). Never add a
"nothing is lost" style string that is not gated on that counter.

### I3 — The banner is mounted exactly once, in `App.tsx`

It used to be mounted per-view, so Timetable and Settings showed nothing while edits
sat unsynced. Shell-level mounting is deliberate. Do not move it back into a view;
do not mount it twice (each mount runs its own drain loop).

### I4 — Sheet grids are parsed with `parseCsvToGrid`, never `parseCSV`

`parseCsvToGrid` is defined once, in `services/timetableSheetWriter.ts`, and
`services/timetableSheetService.ts` imports it **from the writer**. That direction is
deliberate: the writer computes A1 ranges from absolute row/column indices, so the
reader must agree about which row is which.

| | `parseCSV` (`googleSheetsService.ts`) | `parseCsvToGrid` (`timetableSheetWriter.ts`) |
| --- | --- | --- |
| Blank rows | dropped | preserved |
| Cell whitespace | trimmed | preserved |
| Row indexing | renumbered | true sheet row numbers |
| Correct for | flat key/value sheets | timetable grids with A1 addressing |

Swapping either side back to `parseCSV` re-introduces a real corruption bug, not a
cosmetic one: a teacher inserts one blank row into a Timetable sheet, the reader
renumbers everything below it, and the next write targets a **neighbour's cell**.
The mismatch is silent because both parses "succeed".

### I5 — Auth and scope failures abort the whole write run

`applyTimetableWrites` classifies every failure through `classifySheetsWriteError`
(the shared classifier in `googleSheetsService.ts`, not a local regex). When a range
fails as `auth` or `scope` it stops, sets `needsReconnect: true`, and does not attempt
the remaining ranges.

Two reasons: a dead token cannot succeed on range two after failing on range one, and
the Sheets quota is **60 writes/minute/user** — looping across ~30 class tabs burns it
in seconds and turns one recoverable sign-in problem into a rate-limited outage.
Non-auth failures (`500`, `429`) **do** continue, because other tabs may still succeed.

The HTTP status is prefixed into the classified string (`HTTP 401: <body>`) on
purpose. The classifier keys on the status code, and Google's body text alone is not
enough — a 401 whose body says only `Unauthorized` matches none of its phrases, so a
dead token used to be reported as an unknown write error and never triggered a
reconnect. Keep the status in that string.

### I6 — Overlay entries are cleared by subscription, not by polling

`StudentRecordsView` subscribes via `subscribeLocalOverlay` and keeps the last
sheet-derived records in a ref, so that when a background drain succeeds the local
edit disappears from the UI immediately without re-applying the overlay over the new
sheet data (which caused an apply/re-apply loop).

---

## 5. Error taxonomy

`classifySheetsWriteError` returns a kind plus a teacher-facing message:

| Kind | Typical cause | Write loop behaviour |
| --- | --- | --- |
| `auth` | Token expired / revoked (`401`) | **Abort run**, `needsReconnect` |
| `scope` | Grant missing the Sheets scope | **Abort run**, `needsReconnect` |
| `quota` | `429` / "rate limit" / "quota" | Report, continue |
| `permission` | Sheet not shared, file protected | Report, continue other tabs |
| `unknown` | Anything unrecognised | Report raw message, continue |

The exact kind names come from the `SheetsWriteErrorKind` union in
`services/googleSheetsService.ts` — that file is the source of truth, not this table.

The banner owns the reconnect action for `auth`/`scope` — it is the surface
guaranteed to be on screen when a teacher discovers a change did not land.

---

## 6. Known open issues (not yet fixed)

These are architectural and each needs a decision before code.

### O1 — One shared Firestore listener, whole-document fan-out

`StudentRecordsView` attaches a single `onSnapshot` covering all teacher records.
`onSnapshot` delivers **whole documents**, so every edit by any of ~311 teachers is
pushed to **every** open client, and each receiver re-merges and re-renders. Traffic
grows with the square of active teachers.

Candidate fix: per-teacher subcollection (needs a `firestore.rules` change and a
deploy). Not attempted here because it changes the security model.

### O2 — a full sheet download after every single edit — **FIXED**

This is **not** polling, and an earlier version of this document said it was. There is
no periodic re-pull anywhere in the codebase: the two 30 s intervals are a purely
local token-expiry check (`hooks/useSheetSyncQueue.ts`) and `Header.tsx:82`, and
`services/timetableSheetService.ts:16` explicitly documents that polling does not
belong in the service layer.

The real cost was in the save path. `components/records/StudentRecordsView.tsx`
wrote one Sheets request (`updateSheetRecord` / `addSheetRecord`) and then
immediately called `loadRecords(true)`, re-downloading the **entire** sheet — so
editing 20 students cost 20 writes plus 20 whole-sheet downloads.

Both halves are now addressed:

- **Push** is one `values:batchUpdate` per 50 rows, via `batchUpdateSheetRecords`.
- **Pull** is gated by `shouldPullSheet()` (12 hours), with an explicit Refresh
  always overriding it. Nothing fetches a sheet in the save path any more.

### O3 — Queue capacity is a fixed 200 entries

`MAX_ENTRIES` is a module constant. At 80% the banner warns. There is no persistence
of *why* an entry dropped beyond a counter — a future improvement is to keep the
payload of the last few dropped edits so a teacher could re-enter them.

---

## 7. Testing

```powershell
npm run test:unit:sheets    # regression suite for this file's invariants
npm run test:unit           # aggregate pure-logic suite
npm run audit:wiring        # code that exists but nothing calls
```

`scripts/unit/timetableSync.test.ts` covers, without network:

- auth / scope failure aborts after **one** request and sets `needsReconnect` (I5)
- a `500` continues to the remaining tabs and reports every failure (I5)
- a successful write leaves `needsReconnect` false
- contiguous cells collapse to one A1 range; gaps and tab changes split ranges
- `parseCsvToGrid` preserves blank rows so sheet row indices stay true (I4)
- quoted cells keep padding, escaped quotes, and embedded newlines (I4)

When adding a case here, note the suite injects `fetchImpl` — never let these tests
reach the real Sheets API.


