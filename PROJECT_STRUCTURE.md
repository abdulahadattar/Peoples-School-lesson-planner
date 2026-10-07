# Project Structure

```
/
├── api/                        # Serverless API routes (Autonoma test environment factory & health endpoints)
│   └── index.ts                # Express serverless handler for /api/autonoma & /api/health
├── components/                 # UI View & Presentation Layer
│   ├── attendance/             # Attendance register, history drawer, summary cards, row views, custom hooks
│   ├── auth/                   # Authentication UI & animated login gate
│   ├── documents/              # Document archive center: scans grid, discrepancy audit, transparency modals
│   ├── history/                # History cards (SavedPlanCard, SavedPaperCard) & useHistoryData hook
│   ├── icons/                  # SVG icon library & brand icons (MiscIcons)
│   ├── lesson/                 # Lesson plan generator sub-components (TeacherMetadataPanel, SloSelectionList)
│   ├── live/                   # Live monitor cards, header, period/day selectors, school status badge
│   ├── paper/                  # Exam paper generator widgets (presets, mark summary, select toolbar, sections list, question edit form)
│   ├── records/                # Student records register, filters, stats, cards, tables, modal controllers
│   │   ├── analytics/          # Visual charts (ClassBarChart, EnrollmentStatusPieChart, KPI cards)
│   │   ├── documents/          # Student document archive tab, scans list, inspector, discrepancy review
│   │   └── form/               # Student identity & academic field form sections
│   ├── results/                # Results view displays (ExamPaperDisplay, LessonPlanDisplay, PaperRevisionModal)
│   ├── settings/               # School admin settings tabs (classes, teachers, periods, safeguards, identity, timetable)
│   │   └── timetable/          # Timetable editor subcomponents & useTimetableEditor hook
│   ├── substitution/           # Teacher substitution manager, daily board, proxy equity ledger
│   ├── ui/                     # Reusable design system primitives (BaseModal, ConfirmDialog, NumberField, SelectField, SegmentedControl, etc.)
│   ├── BreakDutiesPanel.tsx    # Ground & gate break duty monitoring
│   ├── DocumentArchiveCenterView.tsx # Student document verification & archive center
│   ├── GenerationStatusPanel.tsx     # AI lesson plan & paper generation progress monitor
│   ├── Header.tsx              # Top application navigation bar
│   ├── HistoryView.tsx         # Local archive of generated plans & exam papers
│   ├── HomeView.tsx            # Dashboard home & quick navigation
│   ├── KaTeXText.tsx           # Math equation rendering component
│   ├── LiveMonitor.tsx         # Real-time school schedule & period tracker
│   ├── Logo.tsx                # Institutional school logos & badges
│   ├── PaperPanel.tsx          # Exam paper builder configuration panel
│   ├── QuestionEditor.tsx      # Question editing & LaTeX sanitization
│   ├── ResultsView.tsx         # Generated plan & paper display / editor
│   ├── SubjectSelector.tsx     # Lesson plan subject & SLO picker
│   └── SubstitutionManager.tsx # Faculty substitution & proxy coordinator
├── curriculum/                 # Curriculum syllabus & subject definitions (Grades 9-12)
│   ├── index.ts                # Curriculum registry & grade mapping
│   └── subjects/               # Individual subject syllabus modules (biology, chemistry, physics, math, etc.)
├── data/                       # Bundled static baseline datasets (teachers.json, timetable.json)
├── docs/                       # Architectural documentation & runtime verified stack guides
├── hooks/                      # Custom React hooks (useSelection, useSchoolConfig, useToast, useClipboardCopy, useTimetableSheetSync)
├── public/                     # Public static assets, curriculum SLO JSONs, school logos
├── scripts/                    # Build, test, audit, diagnostic, and model probe suites
├── services/                   # Business logic, Firebase, Google Sheets, Gemini AI, & Timetable engines
│   ├── documentArchive/        # Server-side document processing, OCR extraction, and job queue
│   ├── documentClient/         # Client-side API layer (queries, upload chunks, corrections)
│   ├── storage/                # Local-first IndexedDB storage adapters
│   ├── timetable/              # Timetable conflict engines, cell parsers, and layout detection
│   ├── attendanceService.ts    # Attendance calculations, local persistence & CSV export
│   ├── geminiService.ts        # Gemini API client with multi-key pool rotation
│   ├── googleAuth.ts           # Google OAuth 2.0 token management
│   ├── googleSheetsService.ts  # Google Sheets API client, batch writer, & caching
│   ├── paperService.ts         # Exam paper generation and question regeneration engine
│   ├── schoolConfigService.ts  # School institutional configuration & Firestore sync
│   └── substitutionService.ts  # Teacher proxy equity engine & WhatsApp notice formatter
├── types/                      # TypeScript type definitions (documentArchive, etc.)
├── utils/                      # Core pure utility functions (clipboard, date, download, payload optimizer, print)
├── App.tsx                     # Top-level React application root & view router
├── firestore.rules             # Production Firestore security rules
├── index.html                  # HTML entry point with metadata
├── index.tsx                   # React 19 application bootstrapping
├── metadata.json               # Applet capability declarations
├── package.json                # Project dependencies & npm scripts
├── server.ts                   # Dev & full-stack Express server (Vite middleware proxy)
├── tsconfig.json               # TypeScript compiler configuration
└── version.json                # Version & branch environment metadata
```
