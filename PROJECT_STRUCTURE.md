# Project Structure

```
/
├── api/                        # Serverless API routes (Autonoma test environment factory & health endpoints)
│   └── index.ts                # Express serverless handler for /api/autonoma & /api/health
├── components/                 # UI View & Presentation Layer
│   ├── attendance/             # Attendance register, history drawer, summary cards, row views
│   ├── auth/                   # Authentication UI & animated login gate
│   ├── documents/              # Document archive center: scans grid, discrepancy audit, dossier cards
│   ├── icons/                  # SVG icon library & brand icons
│   ├── live/                   # Live monitor cards, header, and staff room widgets
│   ├── paper/                  # Exam paper generator widgets (presets, mark blueprints)
│   ├── records/                # Student records register, filters, stats, cards, tables, detail modals
│   ├── settings/               # School admin settings tabs (classes, teachers, periods, safeguards, identity)
│   ├── substitution/           # Teacher substitution manager, daily board, proxy equity ledger
│   ├── ui/                     # Reusable design system primitives (BaseModal, ConfirmDialog, NumberField, etc.)
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
│   └── subjects/               # Individual subject syllabus modules
├── data/                       # Bundled static baseline datasets
│   ├── teachers.json           # Baseline teacher faculty roster
│   └── timetable.json          # School master timetable schedule
├── docs/                       # Architectural documentation & runtime verified stack guides
├── hooks/                      # Custom React hooks (state machines, sync queues, toast, selection)
├── public/                     # Public static assets, SLO summaries, school logos
├── scripts/                    # Build, test, audit, diagnostic, and model probe suites
├── services/                   # Business logic, Firebase, Google Sheets, Gemini AI, & Timetable engines
│   ├── storage/                # Local-first IndexedDB storage adapters
│   ├── attendanceService.ts    # Attendance calculations, local persistence & CSV export
│   ├── documentArchiveService.ts # Server-side document classification, OCR verification, & matching
│   ├── documentClientService.ts  # Client-side API caller for document archive
│   ├── geminiService.ts        # Gemini API client with multi-key pool rotation
│   ├── googleAuth.ts           # Google OAuth 2.0 token management
│   ├── googleSheetsService.ts  # Google Sheets API client, batch writer, & caching
│   ├── schoolConfigService.ts  # School institutional configuration & Firestore sync
│   ├── substitutionService.ts  # Teacher proxy equity engine & WhatsApp notice formatter
│   └── timetable.ts            # Live schedule resolution & period locator
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
