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