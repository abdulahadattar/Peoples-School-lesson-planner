# Autonoma SDK Integration - Maintenance Notes

## Endpoint
- **Path**: `/api/autonoma`
- **Method**: POST only
- **Authentication**: HMAC-SHA256 with shared secret

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
1. Update the corresponding factory in `services/autonomaIntegration.ts`
2. Re-run the validation cycle: up → down
3. Ensure the recipe.json at `C:\Users\hp\.autonoma\c-users-hp\recipe.json` stays in sync
4. The completion marker is at `C:\Users\hp\.autonoma\c-users-hp\.sdk-integration-complete`

## Testing
```bash
# Discover factories
curl -X POST http://localhost:3000/api/autonoma \
  -H "Content-Type: application/json" \
  -H "x-signature: $(echo -n '{"action":"discover"}' | openssl dgst -sha256 -hmac "$SHARED_SECRET" | cut -d' ' -f2)" \
  -d '{"action":"discover"}'

# Validate scenario (requires recipe.json)
# sdk check --url http://localhost:3000/api/autonoma --shared-secret $SHARED_SECRET
```

## Files
- `services/autonomaIntegration.ts` - Factory definitions and handler creation
- `server.ts` - Endpoint registration at `/api/autonoma`
- `C:\Users\hp\.autonoma\c-users-hp\recipe.json` - Scenario definitions
- `C:\Users\hp\.autonoma\c-users-hp\.sdk-integration-complete` - Completion marker