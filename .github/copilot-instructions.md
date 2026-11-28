# PHSSJ Portal — GitHub Copilot & IDE Agent Instructions

Read `AGENTS.md`, `AGENT_MEMORY.md`, and `docs/VERIFIED_STACK.md` before editing or pushing any code.

## Critical Multi-Account & GitHub Sync Rules
1. **Canonical Firebase Project**: Production/testing uses `firebase-applet-config.json` with `projectId: "phssjportal"`, `authDomain: "phssjportal.firebaseapp.com"`, and `oAuthClientId: "752785162701-igum5tv22cv45k4afbh2an3unkul5b0s.apps.googleusercontent.com"`.
2. **Never push AI Studio remix files to GitHub**: When imported into a new AI Studio account, AI Studio overwrites `firebase-applet-config.json` (`gen-lang-client-*`) and `metadata.json` (`Remix ...`) and may create `metadata-1.json`, `data/`, or `public/assets/aistudio/`. NEVER commit or push those to GitHub.
3. **Branch Workflow**:
   - Push tested feature changes ONLY to `alpha` (`https://phssjamshoroportalalpha.vercel.app`).
   - Never push directly to `testing` or `main`; promote via GitHub Pull Request (`alpha` -> `testing` -> `main`).
   - Run `npm run guard && npm run lint && npm run test:unit && npm run build` before pushing.
4. **Hardcoded Integrations (Do Not Change Without Request)**:
   - Google Sheets: `DEFAULT_SPREADSHEET_ID` & `ATTENDANCE_SPREADSHEET_ID` (`services/sheets/types.ts`), `MARKSHEET_SPREADSHEET_ID` (`services/marksheet/config.ts`).
   - Google Drive: `DEFAULT_DRIVE_FOLDER_ID` (`hooks/useDocumentArchive/driveImportState.ts`).
   - Vercel Env Vars: `VITE_API_KEYS` (Gemini), `GOOGLE_CLIENT_SECRET`, and Autonoma secrets are already configured on Vercel.
