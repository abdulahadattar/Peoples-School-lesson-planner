# Agent Memory & Architectural Invariants

1. **Persistence & Offline Sync** (details in `docs/OFFLINE_SYNC.md`):
   - Lesson plans, exam papers, substitutions, and local fallbacks use IndexedDB (`idb-keyval` via `services/storageService.ts`).
   - Pending student record edits live in shared Firestore `student_record_edits` (`services/sharedRecordEdits.ts`) and push atomically (`RECORD_BATCH_SIZE = 50`) to Google Sheets via `services/googleSheetsService.ts`; sheet pulls are 12h-gated (`services/sheetPullSchedule.ts`).
   - Attendance offline edits queue in `services/sheetSyncQueue.ts` and sync alongside Firestore (`services/attendanceService.ts`).
   - Non-admin record writes are blocked when `sheetEditingEnabled` is `false` in `SchoolConfig`.

2. **School Configuration, Timetable & Substitutions**:
   - `services/schoolConfig/` (`store.ts`, `defaults.ts`, `classStructure.ts`, `timetableSeed.ts`, `propagation.ts`) + `hooks/useSchoolConfig.ts` form the single source of truth for school identity, logos/signatures, classes/sections/rooms/capacities, faculty roster, bell periods, and master timetable.
   - `components/settings/` organizes School Admin (`SchoolSettingsView.tsx` + `adminNavigation.ts`) into 3 pillars (**Institution & Academics**, **Schedule & Operations**, **Integrations & Governance**) with live letterhead preview, elevated `TimetableAuditorView` clash resolution, contextual `UnsavedChangesBar`, and validated config backup/restore.
   - `/data/teachers.json` and `/data/timetable.json` are initial baseline seeds only; live views, auditors, OMR, marksheets, and exports read from the unified `SchoolConfig` state.
   - Standard day: 8 periods Mon–Thu, 5 periods Fri (`Asia/Karachi`).
   - `locatePeriod()`, `computeStaff()`, and `computeTeacherProxyStats()` drive live tracking and proxy equity.

3. **Gemini AI Integration**:
   - Uses `@google/genai` via `services/geminiService.ts` with multi-key rotation and the verified model chain in `services/gemini/types.ts` (never use retired `gemini-2.5-flash`).
   - Responses are cleaned via `services/jsonHelpers.ts` and `services/latexSanitizer.ts`, and rendered with `components/KaTeXText.tsx`.

4. **Non-Negotiable Code Patterns**:
   - Await `authResolved` in `App.tsx` before deciding login gate visibility (`auth.currentUser` starts `null`).
   - Always use `SelectField` / `NumberField` from `components/ui/` instead of raw `<select>`.
   - Always format dates via `getTodayDateString()` / `formatSchoolDate()` in `utils/dateHelpers.ts`.
   - Always format user error alerts via `toUserErrorMessage()` in `utils/userMessage.ts`.

5. **Canonical Infrastructure & Multi-Account Guard**:
   - Canonical Firebase project on GitHub/Vercel is `phssjportal` (`oAuthClientId: 752785162701-igum5tv22cv45k4afbh2an3unkul5b0s.apps.googleusercontent.com`).
   - AI Studio remixes rewrite `firebase-applet-config.json` (`gen-lang-client-*`) and `metadata.json` (`Remix ...`) locally — never push those overwritten files to GitHub.
   - `scripts/verify-repo-guard.mjs --strict` (enforced by `.github/workflows/repo-guard.yml` and `vercel.json`) blocks broken configs, remix artifacts, and token leaks.
   - Canonical Google Sheets (`services/sheets/types.ts`, `services/marksheet/config.ts`) and Drive folder (`hooks/useDocumentArchive/driveImportState.ts`) are hardcoded; `VITE_API_KEYS` and `GOOGLE_CLIENT_SECRET` live on Vercel.

