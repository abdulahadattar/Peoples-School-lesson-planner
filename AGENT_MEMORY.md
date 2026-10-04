# Agent Memory & Architectural Invariants

## Core Principles & Design Invariants

1. **Local-First Data Architecture**:
   - All critical domain records (attendance records, saved exam papers, custom substitutions, school config overrides) are persisted in **IndexedDB** (`idb-keyval`) first, then synchronized to Firebase Firestore or Google Sheets.
   - Offline mutation queues in `services/sheetSyncQueue.ts` ensure zero data loss during network interruptions.

2. **Google Sheets Integration & Safety**:
   - Google Sheets operates with atomic batch updates (`RECORD_BATCH_SIZE = 50`) and client-side caching.
   - Master edit safeguard: When `sheetEditingEnabled` is `false` in `SchoolConfig`, non-admin users cannot mutate student records.
   - `localRecordsOverlay.ts` tracks pending and local-only sheet modifications, ensuring optimistic UI updates without corrupting remote rows.

3. **Timetable & Live Resolution Engine**:
   - Standard school day is divided into 8 periods Mon-Thu and 5 periods on Friday.
   - `locatePeriod()` identifies current period, breaks, and off-hours using local Pakistan Standard Time (`Asia/Karachi`).
   - `computeStaff()` accounts for every faculty member across busy and free states.
   - Faculty substitution equity: `computeTeacherProxyStats()` calculates this week's and lifetime proxy loads to recommend the least burdened specialist.

4. **Gemini AI Integration & Multi-Key Pool**:
   - Uses `@google/genai` TypeScript SDK.
   - Multiple API keys are rotated automatically via `services/geminiService.ts` to prevent rate-limit bottlenecks.
   - Raw model responses are sanitized via `services/jsonHelpers.ts` and `services/latexSanitizer.ts`.
   - Math equations are rendered via `components/KaTeXText.tsx`.

5. **Common Pitfalls to Avoid**:
   - **Do not invent missing packages**: Always check `package.json` before writing imports.
   - **Do not bypass `NumberField` / `SelectField` primitives**: Use design system components in `components/ui/`.
   - **Date format standard**: Use `getTodayDateString()` and `formatSchoolDate()` from `utils/dateHelpers.ts`.
   - **Authentication hydration**: In `App.tsx`, `authResolved` must be awaited before deciding login gate visibility; `auth.currentUser` is initially `null` on first render.

6. **File Size & Modularity Discipline (Mandatory for all Agents)**:
   - **Target File Size**: 200–350 lines of code maximum per file.
   - **Single Concern Principle**: One well-defined responsibility per module (separate views, modal controllers, data tables, filter toolbars, and domain calculations).
   - **Automatic Refactoring Trigger**: Whenever any component or service file approaches or exceeds ~300-350 lines of code, immediately decompose it into dedicated sub-components, custom hooks, or specialized helper modules. Never leave monolithic >400-line files in place.

