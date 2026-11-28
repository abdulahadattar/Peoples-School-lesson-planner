# Architecture & Naming Conventions

See `PROJECT_STRUCTURE.md` for the full folder tree and `docs/SYSTEM_MAP.md` for runtime topology.

## Layer Boundaries
- **`api/index.ts` & `services/app.ts`**: Express API handlers (Autonoma test fixtures, `/api/health`, `/api/documents/*`, Google Sheets/PDF proxies).
- **`components/<domain>/`**: Presentational and controller modules (`attendance/`, `auth/`, `documents/`, `history/`, `lesson/`, `live/`, `marksheets/`, `navigation/`, `omr/`, `paper/`, `records/`, `results/`, `settings/`, `substitution/`, `ui/`).
- **`hooks/`**: Cross-view and stateful React hooks (`useSchoolConfig.ts`, `useSheetSyncQueue.ts`, `useTimetableSheetSync.ts`, `useGeneralGeneration.ts`, `useDocumentArchive.ts`).
- **`services/`**: Pure domain logic, persistence, and API clients (`documentArchive/`, `documentClient/`, `export/`, `gemini/`, `marksheet/`, `omr/`, `paper/`, `schoolConfig/`, `sheets/`, `timetable*`).
- **`utils/`**: Pure stateless helpers (`dateHelpers.ts`, `userMessage.ts`, `printHelper.ts`, `payloadOptimizer.ts`).

## Naming Conventions
| Category | Convention | Example |
| :--- | :--- | :--- |
| Components | PascalCase `.tsx` | `AttendanceHeader.tsx` |
| Hooks | `use` + PascalCase `.ts` | `useSheetSyncQueue.ts` |
| Services | camelCase `.ts` | `attendanceService.ts` |
| Utilities | camelCase `.ts` | `userMessage.ts` |
| API Routes | kebab-case `/api/...` | `/api/documents/create-job` |
