# Autonoma SDK Integration - Maintenance Notes

## Endpoint
- **Path**: `/api/autonoma`
- **Method**: POST only
- **Authentication**: HMAC-SHA256 with shared secret
- **Deployed URL**: `https://alpha-o2v3a70og-abdulahadattars-projects.vercel.app/api/autonoma`

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

## Maintenance Requirements
When modifying any factory's `create` or `teardown` logic:
1. Update the corresponding factory in `api/index.ts` (self-contained serverless function)
2. Re-run the validation cycle: up → down
3. Ensure the recipe.json at `C:\Users\hp\.autonoma\c-users-hp\recipe.json` stays in sync
4. The completion marker is at `C:\Users\hp\.autonoma\c-users-hp\.sdk-integration-complete`

## Testing
```bash
# Discover factories
curl -X POST https://alpha-o2v3a70og-abdulahadattars-projects.vercel.app/api/autonoma \
  -H "Content-Type: application/json" \
  -H "x-signature: <HMAC-SHA256 of body with shared secret>" \
  -d '{"action":"discover"}'

# Full lifecycle test (up + down)
# Use test-up-down.cjs script with Node.js
```

## Files
- `api/index.ts` - Self-contained serverless function with all 5 factories and handler
- `C:\Users\hp\.autonoma\c-users-hp\recipe.json` - Scenario definitions (standard scenario)
- `C:\Users\hp\.autonoma\c-users-hp\.sdk-integration-complete` - Completion marker

## Deployment Notes
- Serverless function on Vercel at `/api/autonoma`
- Uses `/tmp/data/autonoma` for JSON file persistence (Vercel read-only filesystem)
- Inlined all dependencies (zod, @autonoma-ai/sdk, @autonoma-ai/server-express, crypto, fs, path)
- Framework: Vite + Express, build: `npm run build`, output: `dist`