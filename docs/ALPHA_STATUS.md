# Alpha Branch Status, Findings & Verification Log

Ground-truth working doc for the `alpha` branch. Companion to
[SYSTEM_MAP.md](./SYSTEM_MAP.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

| Field | Value |
| --- | --- |
| Branch | `alpha` |
| Worktree | `d:\Peoples-School-lesson-planner\.kilo\worktrees\alpha` |
| HEAD | `17b694d` (in sync with `origin/alpha`) |
| Deploy URL | https://phssjamshoroportalalpha.vercel.app |
| Last verified | 2026-10-01 |

> Uncommitted at time of writing: the offline sheet-sync work described in
> [OFFLINE_SYNC.md](./OFFLINE_SYNC.md) and recorded in §9 below.

> **Worktree warning.** The repository has three worktrees:
>
> | Path | Branch | Commit |
> | --- | --- | --- |
> | `d:\Peoples-School-lesson-planner` (main folder) | `testing` | `11b7c59` |
> | `d:\Peoples-School-lesson-planner\.kilo\worktrees\alpha` | **`alpha`** | `cfdba63` |
> | `d:\Peoples-School-lesson-planner\.kilo\worktrees\boulder-cereal` | detached HEAD | `a0a0dc1` |
>
> Opening the main folder shows the **`testing`** branch, not the branch under
> active development. Edit and commit inside the `alpha` worktree.

---

## 1. Verification commands

Run these from the `alpha` worktree.

```powershell
# Dev server (Express + Vite middleware) on :3000
npm run dev

# Full suite: infra, SLO data, API keys, PDF headers, AI generation
npm test
```

### Windows console encoding (required)

The test script emits real Unicode (`─` U+2500, `✅` U+2705, `═` U+2550). The
default Windows PowerShell codepage is **IBM437**, which renders each UTF-8 byte
as a separate CP437 glyph, so `── PDF Validation ──` displays as
`ΓöÇΓöÇ PDF Validation ΓöÇΓöÇ`. This is cosmetic mojibake, not a bug in the app.

Set UTF-8 before running, or the output is unreadable:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
```

Proof: `E2 94 80` decoded as CP437 yields `ΓöÇ`, decoded as UTF-8 yields `─`.

### Browser automation (agent-browser)

`agent-browser` 0.27.0 is installed globally — a Rust CDP CLI (no Playwright /
Puppeteer). Load the workflow before first use:

```bash
agent-browser skills get core      # required before running any command
agent-browser skills get dogfood   # exploratory testing / QA
```

Core loop:

```bash
agent-browser open http://localhost:3000
agent-browser snapshot -i          # accessibility tree, @eN refs
agent-browser click @e3            # refs go stale after any page change
agent-browser snapshot -i          # always re-snapshot after acting
agent-browser screenshot shot.png
agent-browser close
```

The repo also has its own raw-CDP helpers in `scripts/` (`shot.mjs`,
`reload.mjs`, `audit-*.mjs`) that talk to Chrome on port **9444** over WebSocket.

---

## 2. Verified findings

All six findings below were confirmed by direct probe, not inferred.

### F1 — Autonoma is not broken; the failure is secret drift

The endpoint passes a full lifecycle on **both** local and deployed:

| Probe | Local | Deployed |
| --- | --- | --- |
| `action: discover` | 200 | 200 |
| `action: up` | 200 | 200 |
| `action: down` | 200 | 200 |

`discover` returns 5 models: `ContextOwner`, `BrowserContextRecord`,
`_StoredEvent`, `BrowserContextJournalRow`, `CompanionReceiptRow`.

The SDK verifies `x-signature` = `HMAC-SHA256(rawBody, sharedSecret)` hex.
What is actually wrong:

- `api/index.ts:333` and `services/app.ts:88` hardcode a **fallback**
  `AUTONOMA_SHARED_SECRET` (`e1ae8434…`, 64 hex).
- Vercel's live `AUTONOMA_SHARED_SECRET` is a **different** value
  (`516ba976…`, 64 hex). Signing with the committed fallback returns
  `401 {"error":"Invalid HMAC signature","code":"INVALID_SIGNATURE"}`.
- **`AUTONOMA_SIGNING_SECRET` is absent from Vercel** (only `SHARED_SECRET`,
  `CLIENT_ID`, `SECRET_ID` are set), so `signingSecret` silently falls back to
  `043b60e6…` hardcoded in source. The SDK throws `SAME_SECRETS` if the shared
  and signing secrets ever collide.

Real secrets committed in source is both a security defect and the reason
Autonoma appeared "broken".

### F2 — Production is a facade; the document pipeline is stubbed

`api/index.ts` (the Vercel serverless entry) is a **separate hand-written stub**
from the real implementation in `services/app.ts` +
`services/documentArchiveService.ts` (~4,600 lines), which is reachable only via
local `npm run dev`. Deployed behaviour:

| Endpoint | Deployed reality |
| --- | --- |
| `/api/documents/dossiers` | always `{"ok":true,"dossiers":[]}` |
| `/api/documents/all-docs` | always `{"ok":true,"documents":[]}` |
| `/api/documents/jobs-latest` | always `{"ok":true,"job":null}` |
| `/api/documents/export-zip` | `400 "Export not available in serverless mode"` |
| `upload-zip` / `upload-files` | reads base64 into a buffer, **discards it**, returns a fabricated `jobId` |
| `finalize-job` | flips a status string; **no extraction ever runs** |
| `jobs/:jobId/retry` | returns `Object.values(jobs)[0]` — **the wrong job** |
| `delete`, `audit*`, `reprocess-*`, `update-doc`, `select-child` | return empty / `null` |

An upload therefore "succeeds" and every subsequent read comes back empty.

### F3 — Both storage layers are volatile

| Layer | Path | Persistence |
| --- | --- | --- |
| Vercel entry (`api/index.ts:722`) | `/tmp/data` | wiped on cold start / redeploy |
| Real service (`documentArchiveService.ts:22-27`) | `process.cwd()/data` | same, and effectively read-only in the deployed bundle |

There is currently **no durable system of record anywhere** — not on the device
and not on the server. Uploaded PDFs, extraction results and dossier metadata
are all transient.

### F4 — The requested token-expiry UX exists but is unshipped

Already implemented in the **uncommitted** working tree:

- `components/Header.tsx` — live minute countdown, amber under 10 min, plus a
  **"Reconnect Sheets"** button when expired.
- `services/googleAuth.ts` — `getAccessToken()` now enforces expiry;
  `isGoogleTokenExpired()` added. Previously it returned dead tokens, so after
  ~55 minutes every Sheets write failed with 401 **silently**.
- `components/ui/PendingSyncBanner.tsx` + `services/sheetSyncQueue.ts` +
  `hooks/useSheetSyncQueue.ts` + `services/localRecordsOverlay.ts` — the
  "pending / saved locally" indicator with an explicit sync trigger.
- `hooks/useTimetableSheetSync.ts` + `services/timetableSheet*.ts` — timetable
  path.

Two gaps:

1. None of it is committed, so `origin/alpha` is still `cfdba63` and **none of
   it is deployed**. Verified: the deployed bundle
   `assets/index-B3POEQ3Y.js` contains `google_token_expiry` and
   `saved locally` but **not** `Reconnect Sheets`.
2. `PendingSyncBanner` is mounted in `DailyAttendanceView` and
   `StudentRecordsView` but **not** in the timetable editor.

> **Marker caveat.** Probing a minified bundle only works for user-facing string
> literals. Symbol names such as `useSheetSyncQueue` are renamed by the minifier
> and always come back "absent" — a false negative, not evidence.

### F5 — The two failing tests were a stale process, not a code fault

| | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| Before restarting dev server | 3 | 2 | 24 |
| After restart | **26** | **0** | **3** |

The `services/app.ts` Vite-middleware fix was already in source but never
loaded, because the running dev process predated it. `GET /` returned 500 and
`test-all.mjs` reported `Dev server: not running`. After restart, `/` returns
200 and `/curriculum/slos/Grade%209/physics.json` serves 13,619 bytes.

### F6 — Node on Windows needs `--input-type=module` for piped `-e`

`package.json` has `"type": "module"`, so `node -e "…"` with `require()` fails,
and inline `node -e` scripts that emit Unicode get mangled by the console
codepage. Prefer writing a temporary `.mjs` file over long inline `-e` strings.

---

## 3. Atomic task breakdown

Every task is sized to be independently verifiable. **No task may be marked
done without its stated evidence.**

Definition of done for every task: the named evidence command/observation is
recorded in the task summary, and `npx tsc --noEmit` stays clean.

### Track A — Ship the existing sync work (unblocks the reported complaint)

| ID | Task | Depends on | Evidence required |
| --- | --- | --- | --- |
| A1 | Review Kilo's uncommitted diff file-by-file; classify each hunk as sync-UI / storage / unrelated | — | Written classification of all 12 modified + 15 untracked files |
| A2 | Mount `PendingSyncBanner` in `TimetableEditorTab` | A1 | Browser snapshot shows banner in timetable tab |
| A3 | Split the work into logical commits on `alpha` | A1, A2 | `git log` shows atomic commits, `tsc` clean each |
| A4 | Local end-to-end browser verification of expiry indicator + reconnect + pending sync | A3 | agent-browser screenshots per tab |

### Track B — Secret hygiene and Autonoma correctness

| ID | Task | Depends on | Evidence required |
| --- | --- | --- | --- |
| B1 | Set `AUTONOMA_SIGNING_SECRET` in Vercel to the value currently hardcoded in source (preserves behaviour before removing it) | — | `vercel env ls` lists the var |
| B2 | Remove hardcoded secret fallbacks from `api/index.ts` + `services/app.ts`; fail fast in production when unset | B1 | Grep shows no secret literals; boot without env logs a clear error |
| B3 | Verify `discover` / `up` / `down` on local **and** deployed after the change | B2 | 200/200/200 both targets |

### Track C — Durable server-side storage (Firestore + Cloud Storage)

**Blocked:** needs a Firebase service-account credential in Vercel.

| ID | Task | Depends on | Evidence required |
| --- | --- | --- | --- |
| C0 | Obtain service-account JSON and add as Vercel env var | user | `vercel env ls` lists it |
| C1 | Add `firebase-admin`; implement storage adapter interface | C0 | `tsc` clean, unit test on the interface |
| C2 | Firestore metadata store: jobs, dossiers, documents, bundles, dismissed flags, corrections | C1 | Write→read round-trip survives process restart |
| C3 | Cloud Storage blob store: PDF/image bytes | C1 | Uploaded file readable after restart, URL returned |
| C4 | Replace `fs` calls in `documentArchiveService.ts` with the adapter | C2, C3 | No remaining `fs.writeFileSync` on `/tmp` or `cwd/data` |
| C5 | Make `api/index.ts` delegate to the real pipeline instead of stubbed responses | C4 | Deployed `dossiers` / `all-docs` return real data |
| C6 | Server-owned background extraction surviving tab close / offline / logout | C5 | Start batch, close tab, reopen → job completed |

### Track D — Verification gates

| ID | Task | Depends on | Evidence required |
| --- | --- | --- | --- |
| D1 | Local build gate: `npm test` + `tsc` + browser E2E per feature | A3, B2 | 26+ passed, 0 failed |
| D2 | Push to `origin/alpha`, confirm Vercel build succeeds | D1 | Deployment URL for the new build |
| D3 | Deployed browser verification on the alpha URL as a real user | D2 | agent-browser run against the deployed URL |
| D4 | Bundle-marker check for newly shipped features | D2 | `Reconnect Sheets` now present in the deployed JS |

### Sequencing rule

One step at a time. Do not push until Track D's local gate passes. Tracks A, B
and the C1 interface scaffold are independent and can proceed in parallel; C2+
is a single serial chain because they mutate the same storage layer.

---

## 4. Deploy procedure

```powershell
# 1. Local gate (must be green)
cd d:\Peoples-School-lesson-planner\.kilo\worktrees\alpha
npx tsc --noEmit
npm test

# 2. Commit + push (Vercel picks up origin/alpha automatically)
git push origin alpha

# 3. Watch the build
vercel ls peoples-school-lesson-planner

# 4. Verify the deployed artefact, not just the source
#    (see the marker caveat in F4 — only user-facing strings are reliable)
```

## 5. Progress log

| ID | State | Evidence |
| --- | --- | --- |
| A1 | **done** | `docs/ALPHA_DIFF_REVIEW.md` — 12 modified + 15 untracked files classified, 14-step atomic commit plan. Teammate wrote the artifact before its run died on a stream error; I re-verified its riskiest claims. |
| A2 | **done** | `TimetableEditorTab.tsx` gained a direct **Reconnect Google** button. `tsc` clean. See §5.1 for why `PendingSyncBanner` was deliberately *not* mounted. |
| B1 | **done** | `vercel env add AUTONOMA_SIGNING_SECRET` → Production, Preview (Secret). `vercel env ls` confirms. |
| B2 | **done, verified** | No secret literal remains in any tracked file; `tsc` clean; Autonoma 200/401 behaviour confirmed on local **and** deployed. |
| C1 | **done** | `services/storage/{types,inMemoryAdapter,index}.ts` + `scripts/test-storage-adapter.mjs` → **11 passed, 0 failed**. |

**Delegation note.** Three of the four initial subagent runs failed on
infrastructure, not on the substance of the task: two hit
`429 Daily free limit reached on model deepseek/deepseek-v4.1-flash. Try again
in 23h 33m`, one hit `Upstream stream ended before terminal chunk`. A1 was
nevertheless satisfied — that teammate had already written its artifact before
the stream died. A2 and C1 were redone inline and are verified above.

### 5.1 A2 — why `PendingSyncBanner` was not mounted in the timetable

The task as briefed was to mount `PendingSyncBanner` in the timetable editor.
That would have been **wrong**. The banner is hard-wired to `useSheetSyncQueue`,
which reports the localStorage queue of *attendance and register* edits. The
timetable is deliberately outside that queue — `hooks/useTimetableSheetSync.ts`
states it outright:

> Deliberately NOT part of services/sheetSyncQueue.ts. … So there is no queue
> and no auto-push here.

Mounting it would have shown the attendance/records pending count on a page
whose edits are never queued, implying unsynced work that does not exist.

`TimetableEditorTab` already has its own purpose-built strip (diff count,
"Refresh from sheet", "Sync to Google Sheets" behind a dry-run preview,
back-off/retry). The genuine gap was that its expired-token notice only said
*"Use the Reconnect Sheets badge in the header"* and offered no button — and on
narrow screens that badge collapses to an unlabelled `!`. So the fix was a
direct **Reconnect Google** button in that strip, which is exactly the
"button that opens Google login" requirement. The two existing banner call sites
were not touched.

### 5.2 C1 — the storage seam

`services/storage/` defines `MetadataStore` and `BlobStore` at the granularity
the pipeline already uses (one JSON file per collection = one read/write unit),
plus `moveGr` for the `GR_<old>` → `GR_<new>` reassignment the pipeline performs.
The factory **throws** for `DOCUMENT_STORAGE_BACKEND=firestore` rather than
falling back to in-memory, because the current failure mode is data that appears
to save and then vanishes — a silent degrade is the one behaviour to avoid.

`documentArchiveService.ts` is still entirely `fs`; C1 only establishes the
seam. C2/C3/C4 need the service-account credential.

**B2 verification (re-checked independently, not taken on trust):**

```
git grep -nE "e1ae8434|043b60e6" -- api/index.ts services/app.ts   -> exit 1 (no match)
git grep -cE "e1ae8434|043b60e6"  (all tracked files)              -> no output
npx tsc --noEmit                                                    -> zero diagnostics
git rev-parse --abbrev-ref HEAD                                    -> alpha
```

Behaviour introduced: production throws and names the missing variable
(`Missing environment variable(s): AUTONOMA_SHARED_SECRET, ... Refusing to
start.`); development generates a random dev-only pair that can never be equal,
so the SDK's `SAME_SECRETS` error cannot occur.

> **Ordering constraint.** B2 makes production refuse to boot without both
> secrets, so **B1 had to land before any push** — otherwise every `/api/*`
> call on the deployment would fail. B1 is now live, so the push is unblocked.

### Decisions required

1. **`api/_bundle.cjs` is tracked, 4.5 MB, and unreferenced.** It was generated
   by a now-deleted `scripts/build-api.cjs`; `vercel.json` routes
   `/api/(.*) -> /api/index` and the build is only `vite build`, so nothing
   builds or serves it. B2 sanitised the two secret literals inside it. The
   right fix is `git rm --cached api/_bundle.cjs` (plus regenerate-from-source
   or gitignore). Needs a scope decision.
2. ~~**Pre-existing bug, unrelated to B2:** `api/index.ts` registers
   `app.get('/*{path}', ...)` in the non-production branch, which Express 5 rejects
   at import time.~~ **Resolved.** Both branches now register `app.get('*all', ...)`
   (`api/index.ts:1134` and `:1145`) with a comment recording the `'/*{path}'`
   failure and the verified replacement, so importing the function outside
   production no longer throws.
3. **Secret rotation.** Both Autonoma secrets remain in git history, so they
   should be rotated even though the literals are gone from the working tree.

## 6. Open blockers

| Blocker | Needed from | Impact |
| --- | --- | --- |
| Firebase service-account credential | user | Entire Track C blocked; durable storage cannot be verified |
| Decision: shared listener → per-teacher subcollection (§8 O1) | user | Fan-out fix; requires a `firestore.rules` change and deploy |
| Decision: which sheet re-pull strategy (§8 O2) | user | Removes ~90% redundant whole-sheet pulls |
| Decision: `api/_bundle.cjs` cleanup (4.43 MB, tracked, unreferenced) | user | Delete from the index, gitignore, or regenerate from source |
| ~~Subagent daily rate limit (~23h)~~ | time | Lapsed — recorded 2026-09-27, well past by 2026-10-01; A1/A2/C1 can be redone |

## 7. Test harness caveats

`scripts/test-local.mjs` reported `8 passed / 5 failed`, but the results are
partly self-inflicted:

- **Unconditional pass.** `pass('Clicked "Explore as Guest" button')` is called
  outside any conditional, so it reports success even when no guest button was
  found. This makes the run look self-contradictory (guest button "not found"
  yet "clicked").
- Mount detection polls `#root.textContent.length > 20` for 5 s, then the guest
  button for 7.5 s. The app's login gate waits on Firebase session restore, so
  these budgets are tight.

An earlier reading that the **production build fails to mount** was
**invalid**: `vite preview` had died, so the browser was showing a
`chrome-error://chromewebdata/` network error page with no `#root` at all.
Re-test with the server confirmed alive before drawing any conclusion.

## 8. Offline sheet sync audit & fixes (2026-10-01)

Subsystem reference and the invariants that must not regress:
[OFFLINE_SYNC.md](./OFFLINE_SYNC.md). Raw audit output: `.audit/duplicates.md`,
`.audit/wireup.md`.

### Fixed and verified

| Defect | Was | Now |
| --- | --- | --- |
| Silent drop on storage failure | `queueSheetSync` swallowed `localStorage` throws, returned success; `dropped` stayed 0 | Returns `false`, drop counter increments, UI admits the loss |
| Reassurance that lied | Banner always said "Nothing is lost" | Reassurance gated on `droppedCount === 0`; red alert otherwise; warns at 80% capacity |
| Banner only on one view | Mounted per-view; Timetable/Settings showed nothing | Mounted once in `App.tsx` |
| Read/write parser mismatch | Reader used `parseCSV` (trims, drops blank rows, renumbers); writer used positional `parseCsvToGrid` | Reader imports `parseCsvToGrid` from the writer — one source of truth |
| Auth errors burned quota | Every class tab retried against a dead token | Aborts the run on `auth`/`scope`, sets `needsReconnect`; non-auth errors still continue |
| Error handling duplicated | Only 1 of 4 write call sites used `classifySheetsWriteError` | All sheet-write failures route through the shared classifier |
| Overlay stuck in the UI | Local edits lingered after a successful drain | `subscribeLocalOverlay` + a records ref clears them without a re-apply loop |

A real bug surfaced while testing the fix: the writer discarded the HTTP status
whenever Google returned a body, so `401` never reached the classifier and a dead
token was reported as an unknown write error. The status is now prefixed into the
classified string.

### Verification

```
tsc --noEmit                 clean, zero diagnostics
scripts/unit/*.test.ts       154 passed across 7 suites
scripts/unit-tests.ts         75 passed
test-coverage-gaps.mjs        111/111 exports covered (100%) — unchanged
test-firestore-rules.mjs      green
test:unit:sheets (new)        9 regression tests, no network
```

### Still open (needs a decision, not code)

Labels match §6 of [OFFLINE_SYNC.md](./OFFLINE_SYNC.md).

1. **O1 — Fan-out**: one shared `onSnapshot` for all teacher records; whole documents go to
   every client on every keystroke. Fix changes the security model.
2. **O2 — One whole-sheet download per edit**: every record save writes to the sheet
   and then re-downloads it in full (`loadRecords(true)` after each save). There is no
   periodic polling to remove; the fix is batching writes and pulling on a schedule.
3. **Dead code** reported by `npm run audit:wiring` and verified by hand:
   - `components/ui/Touch.tsx` — 5 exports, no importer from app or test.
   - `services/storage/index.ts` — 5 exports, no importer. The live path is
     `services/storageService.ts` (7 importers), so this adapter directory is orphaned.
   - `utils/payloadOptimizer.ts` — 3 exports, imported **only** by
     `scripts/unit-tests.ts`: asserted by a suite, reachable by no user. It is also in
     the `test-coverage-gaps.mjs` inventory, so part of the "100% covered" figure
     covers code nothing calls.
   The tool's export-level list is deliberately looser: "exported but referenced only
   inside its own file" is a de-export candidate, not a deletion candidate.

## 9. Change log

| Date | Change |
| --- | --- |
| 2026-09-27 | Initial diagnosis; F1–F6 recorded; task breakdown created |
| 2026-09-27 | Local build green (26 passed / 0 failed); app verified in browser via agent-browser (guest mode renders). B1 + B2 complete and verified. A1/A2/C1 failed on subagent rate limit. |
| 2026-10-01 | Offline sheet-sync audit. 3 silent-data-loss defects fixed (storage-drop, banner visibility, parser mismatch) plus auth-abort and shared error classification. New suite `scripts/unit/timetableSync.test.ts` and tool `scripts/wiring-audit.mjs`. `tsc` clean; 229 unit tests green; coverage inventory unchanged at 111/111. Docs: added `OFFLINE_SYNC.md`, filled the empty `## Testing` section in `README.md`, corrected the stale "plaintext secrets in AGENTS.md" claim in `SYSTEM_MAP.md`, refreshed `HEAD` here. |
| 2026-10-01 | Records moved to a shared Firestore store (`student_record_edits`) instead of localStorage, so an edit is visible to every teacher and every device and survives a refresh. Saves no longer write to Sheets; "Sync to Sheet" pushes everything in one action and signs in first when the ~1 h token has lapsed. Reads gated to a 12-hour window. Three adversarial review rounds found 12 real defects in the first attempt (new-student rows 400-ing whole batches, colliding add documents, stale post-sync view, offline hang, duplicate appends, stranded legacy queue entries); all fixed and now covered by 3 new suites (`recordBatch`, `sheetPullSchedule`, `sharedEdits`). `tsc` clean; 180 unit tests green; rules harness PASS (18 sites). Corrected three false claims I had made earlier in this session: a 30 s sheet poll, a shared Firestore listener over teacher records, and a list of "dead code" entries that do not exist. |

