# Autonoma SDK Integration & Deployment - Maintenance Notes

## Branch/URL Mapping
| Branch | URL | Environment | Status |
|--------|-----|-------------|--------|
| `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Testing only | Active |
| `testing` | `https://phssjamshoroportalb.vercel.app` | Partial public access | Active |
| `main` | `https://phssjamshoroportal.vercel.app` | Production for public | Active |

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
- **Shared Secret** (known by Autonoma): `e1ae84345a120f3f25ce10158da374307faadfeb1a091b997299ae55777d166a`
- **Signing Secret** (private, never shared): `043b60e656b726705d559a6489a73ccaf57c234f5e01b384f5f62936c1a0aaaa`

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
- **GitHub Actions**: Auto-deploys alpha branch → `phssjamshoroportalalpha.vercel.app`