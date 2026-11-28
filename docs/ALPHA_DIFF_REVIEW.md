# Alpha Uncommitted Diff — File Classification & Atomic Commit Plan

Read-only review of the uncommitted changes in the `alpha` worktree
(`d:\Peoples-School-lesson-planner\.kilo\worktrees\alpha`), produced to split them into
atomic, independently-compilable commits.

| Field | Value |
| --- | --- |
| Reviewer | diff-reviewer (team teammate, READ-ONLY) |
| Date / time of review | 2026-09-27, 16:24 – 16:45 (local, UTC+05:00) |
| Worktree | `d:\Peoples-School-lesson-planner\.kilo\worktrees\alpha` (branch `alpha`) |
| HEAD | `cfdba636782031b939cfc61eda588106eb225c74` — "test: poll for the guest button instead of asserting immediately" (2026-09-27 10:42:31 +0500) |
| Source of truth for **modified** files | Frozen patch `d:\Peoples-School-lesson-planner\.git\alpha-diff.patch`, 47,277 bytes, 1,019 lines, sha256 `96DA55A6050F4ADAB070D511AB570D937ABA2B8594634D55F7D122D1C88C16DB`, mtime 2026-09-27 16:24:29, `package-lock.json` excluded |
| Source of truth for **untracked** files | Files read directly from the worktree (hashes/mtimes recorded in §2) |
| Scope counts | 12 modified files (incl. `package-lock.json`), 15 untracked files, 27 change-set entries — matches the task's expected 27 |

## 1. Method, evidence, and what was NOT verified

Commands actually run (all read-only; no `npm test`, no dev server, no port 3000 usage,
no staging, no commit):

| Check | Command | Result |
| --- | --- | --- |
| Change set | `git --no-pager status --porcelain` (worktree) | 12 ` M` + 15 `??` — matches §2 table |
| Stat | `git --no-pager diff --stat` | `.env.example` +8, `.gitignore` +5, `api/index.ts` 53±, `components/Header.tsx` 72±, `DailyAttendanceView.tsx` 31±, `StudentRecordsView.tsx` 93±, `TimetableEditorTab.tsx` +314, `package-lock.json` +1462/-9, `package.json` +1, `server.ts` 19±, `services/app.ts` 56±, `services/googleAuth.ts` +111 |
| Type check (live worktree) | `node .\node_modules\typescript\bin\tsc --noEmit`, stdout+stderr redirected to `%TEMP%\tsc.log` / `%TEMP%\tsc3.log` | **No diagnostics** (both streams empty, no `TSC_FAILED` marker). Ran 16:32–16:36, i.e. against the live tree *including* the 16:28 Autonoma rework described in §5. |
| Timetable layout detector | `node --import tsx scripts/test-timetable-layout.mjs` (background, log `%TEMP%\tt-layout.log`) | `ALL PASS — 331 passed, 0 failed` against the **live** public CSV export of all 12 tabs |
| Live sheet sanity | `curl.exe "…/spreadsheets/d/1u2JTgmxgOClmOUqA0nERRAt6FiPLikjeGsZnWp8yjDo/export?format=csv&gid=738313611"` | Returns `"Time Table IV-A / Miss Daniya"`, header `S.no.,Time,Monday..Saturday` — the sheet id + gids in `services/timetableSheetConfig.ts` are real |
| Secret literals | `Select-String -Pattern 'e1ae8434\|043b60e6'` over `api/index.ts`, `services/app.ts`, `server.ts`, `package.json`, `.env.example`, `.gitignore` | **No matches** — the HEAD secret literals are gone in the worktree |
| New debug leftovers | `Select-String 'console\.(log\|debug\|warn\|error)'` and `'debugger\|TODO\|FIXME\|ya29\.\|AIza…\|-----BEGIN'` across all new/changed sources | Only intentional `console.warn`/`console.error` diagnostics (details in §4) |

Explicitly **not** done, per instructions: `npm test`, `npm run test:local`, any dev server
(port 3000), any browser/CDP run, `git add`, `git commit`, `git push`.

Honest limits of this review:

1. **I did not build each proposed commit.** "Independently compilable" below is justified by
   the import graph (§1.1, obtained by grepping every importer of every new module) plus the
   fact that the HEAD versions of the touched files already export everything the new code
   needs — not by checking out and compiling each commit.
2. Three files changed **while I was reviewing** (`api/index.ts` 16:28:03, `services/app.ts`
   16:28:11 — both after the 16:24:29 frozen patch). See §5. The frozen patch remains the source
   of truth for the classification, but commits C1/C2 in §3 must be re-derived from the live
   files for those two paths.
3. `services/app.ts` / `api/index.ts` behaviour after the 16:28 edit is verified by reading only;
   I never booted the server.

### 1.1 Import-graph evidence for the "compiles alone" claims

Every importer of every new module (grep over `*.ts`/`*.tsx`, `node_modules` excluded):

```
components\attendance\DailyAttendanceView.tsx:41  import { queueSheetSync } from '../../services/sheetSyncQueue';
components\attendance\DailyAttendanceView.tsx:42  import { PendingSyncBanner } from '../ui/PendingSyncBanner';
components\records\StudentRecordsView.tsx:57      import { applyLocalOverlay, saveLocalRecord } from '../../services/localRecordsOverlay';
components\records\StudentRecordsView.tsx:58      import { queueSheetSync } from '../../services/sheetSyncQueue';
components\records\StudentRecordsView.tsx:59      import { PendingSyncBanner } from '../ui/PendingSyncBanner';
components\settings\TimetableEditorTab.tsx:34     ... from '../../hooks/useTimetableSheetSync';
components\settings\TimetableEditorTab.tsx:38     ... from '../../services/timetableSheetService';
components\ui\PendingSyncBanner.tsx:3             import { useSheetSyncQueue } from '../../hooks/useSheetSyncQueue';
hooks\useSheetSyncQueue.ts:10,14                  ../services/sheetSyncQueue, ../services/localRecordsOverlay
hooks\useTimetableSheetSync.ts:21,27,28           ../services/timetableSheetConfig, timetableSheetService, timetableSheetWriter
services\timetableSheetService.ts:29,31           ./timetableSheetConfig, ./timetableSheetLayout
services\timetableSheetWriter.ts:36-39            ./timetableSheetConfig, ./timetableSheetLayout
```

Two consequences used throughout §3:

* **no pre-existing file imports any of the new modules**, so adding the new files in this order
  can never break the current build; and
* `services/sheetSyncQueue.ts` imports nothing at all, and `services/localRecordsOverlay.ts`
  imports only a **type** from `googleSheetsService`, so the storage pair is fully standalone.

Confirmed against `git show HEAD:services/googleAuth.ts`: `googleSignIn` (line 66),
`getAccessToken` (119) and `isGoogleTokenExpired` (147) all exist at HEAD, so
`components/Header.tsx` needs nothing from the `services/googleAuth.ts` changes to compile.

## 2. File classification (28 rows: 12 modified + 15 untracked + this review doc)

Categories are the six allowed values. "Commit" refers to the plan in §3.


| Path | Category | One-line description | Suggested commit |
| --- | --- | --- | --- |
| `.env.example` | config | Adds empty `AUTONOMA_SHARED_SECRET` / `AUTONOMA_SIGNING_SECRET` with the "401 INVALID_SIGNATURE" rationale | C1 |
| `.gitignore` | config | Ignores `data/autonoma/`, the runtime mirror tables written by `services/autonomaIntegration.ts` | C1 |
| `api/index.ts` | config | Vercel entry: env-only Autonoma secrets (+ 503 `AUTONOMA_NOT_CONFIGURED` in the frozen patch) **and** the Express-5 `res.sendFile(root)` SPA-fallback fix — two unrelated concerns in one file | C1 (Autonoma hunks) + C2 (SPA hunks) — **hunk split required** |
| `components/Header.tsx` | sync-UI | Google-Sheets badge: minutes-left countdown (amber at ≤10 min) plus a "Reconnect Sheets" button calling `googleSignIn()` | C7 |
| `components/attendance/DailyAttendanceView.tsx` | sync-UI | On sheet-write failure, queues the day's attendance instead of losing it; toast downgraded to 'info'; mounts `<PendingSyncBanner />` | C5 |
| `components/records/StudentRecordsView.tsx` | sync-UI | Silent Google re-sign-in retry, then local overlay + queue instead of discarding the edit; permission errors unchanged; mounts `<PendingSyncBanner />` | C6 |
| `components/settings/TimetableEditorTab.tsx` | timetable | Sheet status strip, "Refresh from sheet", merge-on-poll, dry-run preview and the single confirmed "Write to sheet" path (+314 lines) | C11 |
| `package.json` | unrelated | Adds `firebase-admin ^14.5.0` to `dependencies` — **nothing in the repo imports it** (§4 F5) | C13 (recommend dropping) |
| `package-lock.json` | unrelated | +1462/−9 lines, entirely the `firebase-admin` tree (`@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `@grpc/grpc-js`, `jsonwebtoken`, `jwks-rsa`, …) | C13 (recommend dropping) |
| `server.ts` | config | Loads `.env` via `process.loadEnvFile` before importing `./services/app` (dynamic `await import`, because static imports hoist above the env load) | C1 |
| `services/app.ts` | config | Env-only Autonoma secrets **and** mounts `public/`, mounts the Vite dev middleware, fixes the SPA fallback — two unrelated concerns in one file | C1 (secret hunks) + C2 (server/Vite hunks) — **hunk split required** |
| `services/googleAuth.ts` | sync-UI | Google-Identity-Services silent-token helpers (`googleClientId`, `loadGis`, `getGisTokenClient`, `storeAccessToken`, `refreshAccessTokenSilently`) + `firebase-applet-config.json` import; **the refresh helper has no caller** (§4 F4) | C7 |
| `components/ui/PendingSyncBanner.tsx` | sync-UI | New banner: pending count, "Reconnect Google" and "Sync" actions, `role="status"` / `aria-live`; for an expired token it is the only recoverable UI path | C4 |
| `hooks/useSheetSyncQueue.ts` | sync-UI | Drains the pending queue through `googleSheetsService`; exposes `pendingCount/sheetsConnected/syncing/lastResult/syncAll`; auto-syncs when a token reappears | C4 |
| `hooks/useTimetableSheetSync.ts` | timetable | 15-minute poll of the timetable CSV export, cache-aware snapshot identity, diff count, `refreshNow`/`previewPush`/`pushToSheet`, 3-strike back-off, 60 s read timeout | C11 |
| `services/sheetSyncQueue.ts` | storage | localStorage queue (`phssj_pending_sheet_sync_v1`): `queueSheetSync`, one live entry per target+scope, attempts/lastError bookkeeping, change notification | C3 |
| `services/localRecordsOverlay.ts` | storage | localStorage overlay (`phssj_local_record_overlay_v1`) of unsynced register rows, layered over sheet reads by `applyLocalOverlay` | C3 |
| `services/timetableSheetConfig.ts` | timetable | Hardcoded 12-tab table (name/gid/class/teacher/quirks), `TIMETABLE_SHEET_ID`, CSV URL builder, 15-minute cache/poll constants | C8 |
| `services/timetableSheetLayout.ts` | timetable | Pure layout detector: header discovery, day-column mapping, break-row detection, `colLetter`/`cellRef`/`readCell`, explicit warnings instead of guesses | C8 |
| `services/timetableSheetService.ts` | timetable | READ path: per-tab CSV fetch → `detectLayout` → `SheetClassEntry`, per-tab status isolation, in-memory snapshot cache, `diffTimetableAgainstSheet`, `loadTimetableWithSheetMerge` | C9 |
| `services/timetableSheetWriter.ts` | timetable | WRITE path: pure `planTimetableWrites`, `groupWritesIntoRanges`, `applyTimetableWrites` (RAW, value-only, per-tab isolation), `syncTimetableToSheet` with `dryRun` default | C10 |

| `scripts/test-timetable-layout.mjs` | test-infra | RFC4180 parser + 331 assertions over the **live** 12-tab CSV export; I ran it: `ALL PASS — 331 passed, 0 failed` | C8 |
| `scripts/test-hooks/raf-shim.js` | test-infra | Test-only rAF/visibility shim so framer-motion `AnimatePresence` completes in an occluded automation window | C12 |
| `scripts/audit-desktop-parity.mjs` | test-infra | CDP audit measuring desktop (1440×900) vs mobile (390×844) overflow / oversized controls / tiny text across 7 views | C12 |
| `scripts/inspect-register.mjs` | test-infra | Prints one GR#'s live register row (`node scripts/inspect-register.mjs <grNo>`); read-only probe, hardcodes the register CSV gid | C12 |
| `scripts/probe-save.mjs` | test-infra | CDP probe that drives a **real** edit → "Confirm & Update Sheet" and dumps the network/console log; hardcodes a student name and appends ` ZZTEST` (§4 F6) | C12 **only after rework — recommend leaving uncommitted** |
| `docs/ALPHA_STATUS.md` | unrelated | New ground-truth working doc: branch table, verification commands, findings F1–F4, change log; referenced by the task board | C14 |
| `docs/ALPHA_DIFF_REVIEW.md` | unrelated | This review artifact (created by this task) | C14 (or keep local) |

Untracked files were read at these revisions (sha256 prefix / mtime) so the review is reproducible:

| File | sha256 (first 16) | mtime |
| --- | --- | --- |
| `components/ui/PendingSyncBanner.tsx` | `D5EE1D1115505D29` | 2026-09-27 14:57:35 |
| `hooks/useSheetSyncQueue.ts` | `79F52FBC4958CACA` | 2026-09-27 11:35:09 |
| `hooks/useTimetableSheetSync.ts` | `50AD87A6545F7BA5` | 2026-09-27 11:50:43 |
| `services/localRecordsOverlay.ts` | `83AA6917707BBB5B` | 2026-09-27 11:33:56 |
| `services/sheetSyncQueue.ts` | `CEC4FE93E3A1DC2F` | 2026-09-27 11:18:50 |

**Concurrent-edit note (ui-sync / task_0004).** `components/ui/PendingSyncBanner.tsx` was
unchanged from 14:57:35 through my last check at 16:35:42 (re-hashed: still `D5EE1D11…29334C6`).
The version I reviewed accepts a single optional prop (`className?: string`) and hard-wires
`useSheetSyncQueue()` — i.e. **no timetable-aware props yet**. If ui-sync later adds
`pendingCount`/`syncing`/`lastResult`/`syncAll` props, the banner's row above still holds, but
the C4/C11 boundary in §3 should be re-checked.


---

## 5. Coordinator addendum (independent re-check)

Added after the review above, by the lead, to record findings it did not cover.

### 5.1 `firebase-admin` is installed but imported by nothing

`package.json` adds `"firebase-admin": "^14.5.0"`. Verified unused:

```
Select-String -Path services\*.ts,services\**\*.ts,api\*.ts,*.ts,*.tsx -Pattern "firebase-admin"
  -> no matches
Test-Path node_modules\firebase-admin  -> True
```

It is installed and present in the lockfile (~1,462 added lines) while no module
imports it. It is presumably staged for the durable-storage work (Track C), but
as committed today it is dead weight that also drags the whole `@google-cloud/*`
tree into the Vercel build. Decide deliberately: keep it only in the commit that
actually uses it, or drop it until then.

### 5.2 The frozen patch is stale for the two secret files

`d:\Peoples-School-lesson-planner\.git\alpha-diff.patch` still shows Kilo's
original `503 AUTONOMA_NOT_CONFIGURED` design for `api/index.ts` and
`services/app.ts`. That design has since been replaced by the fail-fast
resolver, which drops the 503 branch entirely. Review the **live files** for
those two paths; the C-6 entry in §4 still holds as a file list.

### 5.3 `api/_bundle.cjs` — tracked, ~4.5 MB, unreferenced, previously held secrets

B2 sanitised the two secret literals inside it, but the file itself is still
tracked. Nothing builds it (the `scripts/build-api.cjs` generator is gone) and
nothing serves it (`vercel.json` routes `/api/(.*)` to `/api/index`; the build is
only `vite build`). It also duplicates the pipeline as a stale snapshot, which is
exactly the kind of file that gets edited by mistake. Recommend
`git rm --cached api/_bundle.cjs` plus a gitignore entry.

### 5.4 Confirmed: `probe-save.mjs` writes to live data

The §4 F6 concern is real. `scripts/probe-save.mjs:96`:

```js
setter.call(addr, addr.value + ' ZZTEST');
```

Run against the real register this commits a `ZZTEST` string into a student's
address cell in Google Sheets. It should stay uncommitted until it takes the
target sheet id from an env var and defaults to a dry run.

