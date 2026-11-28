# System Map

Runtime topology for the PHSSJ Portal (`alpha` branch).

## 1. Topology
- **Client (React 19 + Vite)**: Lesson Planner, Exam Paper Maker, OMR Scanner, Daily Attendance, Student Records, Marksheets, Live Monitor, School Admin, Student Document Database.
- **Direct Client Integrations**: Firebase Auth + Firestore (`services/firebase.ts`), Google Sheets REST API v4 (`services/googleSheetsService.ts`), Google Drive import (`hooks/useDocumentArchive/useDriveImport.ts`), IndexedDB (`services/storageService.ts`).
- **Backend (`services/app.ts` / `api/index.ts`)**: Express server handling `/api/health`, `/api/autonoma`, `/pdf-proxy`, OAuth/Sheets helpers, and `/api/documents/*`.

## 2. Key Subsystems
- **Gemini AI (`services/geminiService.ts`, `services/gemini/`)**: Multi-key round-robin rotation with cooldowns and active fallback chain in `services/gemini/types.ts`.
- **Offline Sheet Sync (`docs/OFFLINE_SYNC.md`)**: Shared Firestore `student_record_edits` (`services/sharedRecordEdits.ts`), atomic Sheets batch writes (`RECORD_BATCH_SIZE = 50`), 12h read gate (`services/sheetPullSchedule.ts`), and attendance queue (`services/sheetSyncQueue.ts`).
- **Student Documents (`services/documentArchive/`, `services/documentClient/`)**: Client upload/Drive import -> OCR classification & matching -> Firestore or local/tmp store (`constants.ts`, `firestoreStore.ts`).
- **OMR & Marksheets (`services/omr/`, `services/marksheet/`)**: Shared A4 layout geometry -> PDF generation -> homography & bubble grading -> conflict-checked commit to marksheets (`marksheetBridge.ts`).
- **School Configuration (`services/schoolConfig/`, `hooks/useSchoolConfig.ts`, `components/settings/`)**: Shared reactive `SchoolConfig` store (`store.ts`), class/section/room structure (`classStructure.ts`), bell/timetable seed resolver (`timetableSeed.ts`), cross-module propagation (`propagation.ts`), and 3-pillar School Admin workspace (`adminNavigation.ts`, letterhead preview, elevated clash auditor, backup/restore) backing all portal views and exports.
- **Timetable & Substitutions (`services/timetable*`, `services/substitutionService.ts`)**: `Asia/Karachi` live period resolution from unified `SchoolConfig`, clash audit, and proxy equity tracking.

## 3. Active Risks
1. **Firestore Rules**: `daily_attendance`, `attendanceRecords`, and `substitutions` still allow unauthenticated regex-matched writes pending auth tightening.
2. **Shared Listener Fan-Out (`O1`)**: `student_record_edits` uses a single shared `onSnapshot`; see `docs/OFFLINE_SYNC.md`.
3. **Serverless Ephemeral Disk**: Without `FIREBASE_SERVICE_ACCOUNT`, Vercel falls back to `/tmp/data` which resets on cold starts.
