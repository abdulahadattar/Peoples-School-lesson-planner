# PHSSJ Portal — Agent Operating Rules (read this first)

## 0. Your prior knowledge is untrusted input

**Do not work on this codebase from memory.** Not the framework APIs, not the
package versions, not the model ids, not the config file layout, not the
"breaking changes" you remember. Treat every recollection as a *hypothesis to
verify*, never as a fact to build on.

This is not caution for its own sake — every one of these was wrong at least once
in this repo, and each was caught by checking rather than by remembering:

| Recollection | Reality (verified 2026-10-02) |
| :--- | :--- |
| "Recharts docs are at `recharts.org/en-US/api`" | 404. v3 docs moved to `recharts.github.io`. |
| "`gemini-2.5-flash` is a safe fallback" | HTTP 404, "no longer available to new users". |
| "If it appears in ListModels, it works" | `gemma-4-26b-a4b-it` is listed but hangs forever. |
| "`package.json` says what's installed" | Lockfile had `@google/genai` 1.52.0 while the range said `^1.29.0`. |
| "npm 404 means the package is gone" | npmjs.com 403s bots; that's bot protection, not a dead package. |
| "The alpha worktree is in `.kilo/worktrees/alpha`" | Moved to `D:\Peoples-School-lesson-planner-alpha`. |

A confident, specific, wrong answer is **worse** than "let me check", because it
lands in the diff looking authoritative. If you did not verify it in this session,
you did not know it.

### The rule

Before you write code that depends on an external fact, get it from one of these,
in priority order:

1. **The source itself** — read the file. Don't infer it from a filename.
2. **The official documentation** — the URL in that file's header comment, or the
   index in [`docs/VERIFIED_STACK.md`](docs/VERIFIED_STACK.md) section 5.
3. **The live system** — run the probe. Do not reason about what it would return.
4. **A repo skill** — see below.

Then **cite what you used** (the URL, the command, the version) in the code
comment or the commit message, so the next agent can re-verify instead of
re-deriving. If you could verify nothing, say so explicitly rather than
guessing quietly.

---

## 1. Use the skills — do not improvise

Load and follow an existing skill before improvising a process.

- Canonical skills: `skills/` in the `testing` worktree (`D:\Peoples-School-lesson-planner\skills`)
- Cursor mirror: `.cursor/skills/` (same content)
- Start with `skills/README.md` for the vetted list and provenance.

| Task | Skill |
| :--- | :--- |
| Writing a new feature | `spec-driven-development` (PRD before code) |
| Fixing a bug | `debugging-and-error-recovery`, `test-driven-development` |
| Reviewing a diff | `code-review-and-quality`, `code-review-excellence` |
| Auth, injection, XSS, rules | `security-and-hardening`, `frontend-security-coder` |
| Accessibility | `fixing-accessibility`, `accessibility-compliance-accessibility-audit` |
| Animations | `fixing-motion-performance` |
| Firestore / auth | `firebase` |
| Browser-driven checks | `browser-automation`, `e2e-testing-patterns` |

A skill that exists is a decision already made. Deviating from it needs a reason,
not a preference.

---

## 2. Verify with the probes, then update the record

[`docs/VERIFIED_STACK.md`](docs/VERIFIED_STACK.md) is the source of truth for
installed versions, the live Gemini model chain, and official documentation
URLs. Keep it true:

```bash
npm run verify:docs   # assert every cited doc URL still resolves
npm run probe:models  # assert each Gemini model id really answers
npm run test:keys     # key pool health + chain resolution
```

Every key source file (`services/geminiService.ts`, `services/firebase.ts`,
`services/exportService.ts`, `vite.config.ts`, `firestore.rules`,
`scripts/lib/gemini-keys.mjs`) carries a header comment with the official doc
links for its subsystem. Read it before editing that file.

Hard rules that follow:
- Never add a model id not observed returning 200 by `npm run probe:models`.
- Never bump a major dependency on a version diff alone — read the upstream
  migration guide linked in `VERIFIED_STACK.md` section 3.
- Update `VERIFIED_STACK.md` in the same commit as any dependency/model change,
  with the real probe output and a new "Last verified" date.

---

## 3. Modular Architecture & File Size Limit (200–350 LOC)

**Hard Constraint: Every file must maintain a single, well-defined concern.**
- **Target Size**: 200–350 lines of code maximum per file.
- **Trigger**: When any component, hook, or service approaches or exceeds ~300-350 lines of code, you MUST automatically decompose and split it into dedicated sub-components, custom hooks, or utility modules.
- **Organization**:
  - Split large views into domain sub-folders (e.g. `components/attendance/`, `components/records/`, `components/settings/`, `components/documents/`, `components/substitution/`, `components/paper/`).
  - Extract reusable design system primitives to `components/ui/`.
  - Extract pure calculations to `services/` or `utils/`.
  - Never allow bloated monolithic files to accumulate.

---

# Autonoma SDK Integration & Deployment - Maintenance Notes

## CRITICAL: You are in the ALPHA worktree

This folder (`D:\Peoples-School-lesson-planner-alpha`) is a linked git worktree
checked out on branch `alpha`. All work here belongs to `alpha` only.

- The sibling folder `D:\Peoples-School-lesson-planner` is the `testing`
  branch. Do NOT edit files there for alpha work.
- Verify before editing: `git -C D:\Peoples-School-lesson-planner-alpha rev-parse --abbrev-ref HEAD` → must print `alpha`.
- Same repo, same remote: `origin` = `https://github.com/abdulahadattar/Peoples-School-lesson-planner`, branch `alpha`.

## Branch/URL Mapping
| Branch | URL | Environment | Status |
|--------|-----|-------------|--------|
| `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Testing only | Active |
| `testing` | `https://phssjamshoroportalb.vercel.app` | Partial public access | Active |
| `main` | `https://phssjamshoroportal.vercel.app` | Production for public | Active |

## Deployment Workflow
1. Push changes to `alpha` branch - GitHub integration auto-deploys to `phssjamshoroportalalpha.vercel.app`
2. After alpha verification: cherry-pick relevant commits to `testing` branch
3. After testing verification: merge to `main` branch
4. **Do NOT use `vercel --prod` or `vercel deploy`** - use `git push origin <branch>`
5. Delete the accidental "dist" project in Vercel dashboard if present

## GitHub Actions
Auto-deploys via GitHub integration (not manual Vercel CLI deployments)

## Autonoma SDK Endpoint
- **Path**: `/api/autonoma`
- **Method**: POST only
- **Authentication**: HMAC-SHA256 with shared secret
- **Deployed URL**: `https://phssjamshoroportalalpha.vercel.app/api/autonoma`
- **Validation**: ✅ All passing (discover, up, down)

## API Endpoints
- **Health**: `/api/health` → `{"status":"ok"}`
- **Autonoma**: `/api/autonoma` → Environment factory for test data seeding
- **PDF Proxy**: `/pdf-proxy?path=<github-path>` → Proxies GitHub raw content (replaces Vite dev proxy in production)

## Secrets
- **Shared Secret**: Provided via environment variable `AUTONOMA_SHARED_SECRET`
- **Signing Secret**: Provided via environment variable `AUTONOMA_SIGNING_SECRET`
*(Do not commit plaintext secrets to the repository. Configure these in Vercel project environment variables and local `.env` files).*


## Factories Registered
1. **ContextOwner** - Root entity (scope field: `turn_id`)
2. **BrowserContextRecord** - Browser context records
3. **_StoredEvent** - Diagnostic events
4. **BrowserContextJournalRow** - Journal rows
5. **CompanionReceiptRow** - Tool receipts

## Scenarios
- **standard** - Realistic browser companion state with active chat session, stored page context, and tool activity history.

## Version Tracking
- Version: `1.0.0-alpha.24`
- Branch: `alpha`
- Config file: `version.json` (root)
- Displays in app footer with colored badge (yellow=testing, blue=partial-public, green=production)

## Maintenance Requirements
When modifying any factory's `create` or `teardown` logic:
1. Update the corresponding factory in `api/index.ts` (self-contained serverless function)
2. Re-run the validation cycle: up → down
3. Ensure the recipe.json at `C:\Users\hp\.autonoma\c-users-hp\recipe.json` stays in sync
4. The completion marker is at `C:\Users\hp\.autonoma\c-users-hp\.sdk-integration-complete`

## Testing
```bash
# E2E tests (npm test)
TEST_BASE_URL=https://phssjamshoroportalalpha.vercel.app npm test

# Autonoma discover
curl -X POST https://phssjamshoroportalalpha.vercel.app/api/autonoma \
  -H "Content-Type: application/json" \
  -H "x-signature: <HMAC-SHA256 of body with shared secret>" \
  -d '{"action":"discover"}'

# Full lifecycle test (up + down)
# Use Node.js script with HMAC signing (see scripts/test-all.mjs pattern)
```

### Unit, type and wiring checks

These need no server, no browser and no network, and are the ones to run before
touching attendance, records or timetable sheet sync.

```bash
npm run lint              # tsc --noEmit over the whole project
npm run test:unit         # aggregate pure-logic suite
npm run test:unit:sheets  # offline sheet-sync invariants (docs/OFFLINE_SYNC.md)
npm run test:coverage     # exports with no test at all
npm run audit:wiring      # hooks/features that exist but nothing calls
```

`audit:wiring` reports code written but never connected. Treat its output as a
decision list, not a delete list — some entries are deliberate seams kept for a
planned feature, and a few are asserted by tests that pass against a function no
user can currently reach.

## Files
- `api/index.ts` - Self-contained serverless function with all 5 factories and handler
- `server.ts` - Local dev server with all routes
- `C:\Users\hp\.autonoma\c-users-hp\recipe.json` - Scenario definitions (standard scenario)
- `C:\Users\hp\.autonoma\c-users-hp\.sdk-integration-complete` - Completion marker
- `version.json` - Version tracking configuration
- `scripts/test-all.mjs` - E2E test suite (26 tests: dev server, PDF proxy, SLO data, API keys, PDF validation, AI generation)

## Deployment Notes
- **Framework**: Vite + Express, build: `npm run build`, output: `dist`
- **Serverless functions**: `api/index.ts` deployed as Vercel Node.js function
- **Persistence**: `/tmp/data/autonoma` for JSON file persistence (Vercel read-only filesystem)
- **Inlined dependencies**: zod, @autonoma-ai/sdk, @autonoma-ai/server-express, crypto, fs, path
- **GitHub Actions**: Auto-deploys alpha branch → `phssjamshoroportalalpha.vercel.app`, testing → `phssjamshoroportalb.vercel.app`, main → `phssjamshoroportal.vercel.app`
- **Do NOT deploy via Vercel CLI** - push to GitHub and let GitHub integration handle deployment