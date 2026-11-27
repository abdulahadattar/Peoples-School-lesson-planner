# PHSSJ Portal — Agent Operating Rules

## 1. Verify From Source, Not Memory
Never guess framework APIs, package versions, Gemini model IDs, or file paths from memory. Check:
1. The source file itself
2. `docs/VERIFIED_STACK.md` and `AGENT_MEMORY.md`
3. Live probes: `npm run verify:docs`, `npm run probe:models`, `npm run test:keys`

Never add a Gemini model ID not verified working by `npm run probe:models`, and update `docs/VERIFIED_STACK.md` whenever dependencies or model chains change.

## 2. Modularity & Anti-Bloat
- **200–350 LOC target**: Keep every component, hook, and service focused on a single concern. Split files approaching ~350 lines into domain subfolders (`components/<domain>/`, `services/<domain>/`, `utils/`).
- **Reuse before creating**: Search existing components (`components/ui/`), hooks, and shared services (`services/identityNormalization.ts`, `utils/userMessage.ts`, `utils/dateHelpers.ts`) before adding helpers. Unify overlapping flows instead of writing parallel implementations.
- **Concise comments**: Keep inline comments brief and factual ("why" and invariants only).

## 3. Complete Wiring & Edge-Case Handling
- **End-to-end wiring**: Connect every feature into real app state, auth, stores, cross-module flows (Admin -> Paper Maker -> OMR Scanner -> Marksheets / Records), and offline sync queues. Never ship stubbed UIs or unstyled native `<select>` elements where `SelectField` / `NumberField` belong.
- **Handle failure modes explicitly**: Guard against empty/malformed inputs, expired or cancelled auth popups, missing permissions, network timeouts, 429 rate limits/quotas, duplicate records, and partial batch failures.

## 4. UI Copy & UX Writing Rules (Permanent)
1. **Zero technical/AI jargon in UI**: Never expose engineering terms (`ingestion`, `batching`, `key rotation`, `OCR pipeline`, `AI cost`, `tokens`, `dossier`, `discrepancy audit`, `A2UI`, `inference`, `orchestration`, `heuristic`, `payload`, `schema`, `compiler`, `telemetry`, `IndexedDB`, `Cloud Firestore`) in user-facing labels, tabs, buttons, or toasts.
2. **Concise headings, no subtitle bloat**: Use short 1–4 word titles and direct action labels; omit multi-sentence helper or marketing paragraphs under headers/cards.
3. **Plain school vocabulary**: `Student Folders`, `Documents`, `Mismatches`, `Google Drive Import`, `Skip Already Imported`, `Reset Data`, `Student Documents`, `Student Document Database`, `Student Records`, `Marksheets`, `Daily Attendance`, `Lesson Plans`, `Exams & Papers`.
4. **Clean error messages**: Sanitize user-facing errors with `toUserErrorMessage` (`utils/userMessage.ts`); keep raw stacks, HTTP codes, and API/auth internals out of normal UI alerts.

## 5. Branches, Endpoints & Commands
| Branch | URL | Environment |
| :--- | :--- | :--- |
| `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Active testing |
| `testing` | `https://phssjamshoroportalb.vercel.app` | Partial public |
| `main` | `https://phssjamshoroportal.vercel.app` | Production |

- **Deployment**: Push to GitHub (`git push origin <branch>`); Vercel auto-deploys. Never run `vercel --prod`.
- **API routes**: `/api/health`, `/api/autonoma` (HMAC-SHA256 via `AUTONOMA_SHARED_SECRET` / `AUTONOMA_SIGNING_SECRET`), `/pdf-proxy?path=<github-path>`.
- **Checks**:
```bash
npm run guard             # verifies canonical phssjportal config & zero leaked secrets
npm run lint              # tsc --noEmit
npm run build             # production Vite build
npm run test:unit         # pure-logic unit suite
npm run test:unit:sheets  # offline sheet-sync invariants (docs/OFFLINE_SYNC.md)
npm run audit:wiring      # unused exports / orphan modules report
npm run test:coverage     # export test inventory
```

## 6. Multi-Account & GitHub Sync Protection (CRITICAL)
The repository owner switches between multiple AI Studio accounts, VS Code, OpenCode, and Antigravity. Follow these rules on EVERY push:
1. **Never overwrite canonical `firebase-applet-config.json` or `metadata.json`**:
   - Production/Vercel uses Firebase project `phssjportal`, authDomain `phssjportal.firebaseapp.com`, and `oAuthClientId: "752785162701-igum5tv22cv45k4afbh2an3unkul5b0s.apps.googleusercontent.com"`.
   - Importing/remixing this repo into a new AI Studio account auto-rewrites `firebase-applet-config.json` (`gen-lang-client-*`) and `metadata.json` (`Remix ...`) and may create `metadata-1.json`, `data/autonoma/`, `data/student_documents/`, or `public/assets/aistudio/`.
   - **NEVER commit or push those AI Studio-rewritten files or runtime folders to GitHub.** Always selectively copy/push ONLY actual code changes onto `alpha`, keeping GitHub's `firebase-applet-config.json` and `metadata.json` intact.
2. **Branch lock & promotion**:
   - Work and test on `alpha` (`https://phssjamshoroportalalpha.vercel.app`). Never force-push (`--force`) or push directly to `testing` or `main` — promote via GitHub Pull Request (`alpha` -> `testing` -> `main`) after `Repo Guard & Build` passes.
   - Vercel (`vercel.json`) runs `node scripts/verify-repo-guard.mjs --strict && npm run build` so accidental broken configs abort before replacing live deployments.
3. **Canonical Integrations (Do Not Alter Unless Requested)**:
   - **Google Sheets**: `DEFAULT_SPREADSHEET_ID` & `ATTENDANCE_SPREADSHEET_ID` (`services/sheets/types.ts`), `MARKSHEET_SPREADSHEET_ID` (`services/marksheet/config.ts`).
   - **Google Drive**: `DEFAULT_DRIVE_FOLDER_ID` (`hooks/useDocumentArchive/driveImportState.ts`).
   - **Vercel Env Vars**: `VITE_API_KEYS`, `GOOGLE_CLIENT_SECRET`, and `AUTONOMA_*` secrets already live in Vercel — do not ask to recreate them or store secrets in git.