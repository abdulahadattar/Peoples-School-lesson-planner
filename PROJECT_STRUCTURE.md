# Project Structure

```
/
├── api/index.ts              # Vercel serverless Express entry
├── components/               # UI components by domain
│   ├── attendance/           # Daily attendance & enrollment
│   ├── auth/                 # Login gate & Google auth UI
│   ├── documents/            # Student document database, Drive import & review modals
│   ├── history/              # Saved plans & exam papers
│   ├── lesson/               # Lesson plan selectors
│   ├── live/                 # Live timetable monitor cards
│   ├── marksheets/           # Marksheets, sheet sync & A4 PDF export
│   ├── navigation/           # AppSidebar & AppViewRouter
│   ├── omr/                  # OMR sheet PDF generator & camera scanner
│   ├── paper/                # Exam paper configuration & sections
│   ├── records/              # Student records, analytics & document tab
│   ├── results/              # Plan & paper preview/export
│   ├── settings/             # 3-pillar School Admin (adminNavigation, Identity, Classes, Faculty, Bell/Timetable/Auditor, Access & Backup)
│   ├── substitution/         # Teacher substitutions & proxy summary
│   └── ui/                   # Shared primitives (SelectField, NumberField, BaseModal, etc.)
├── curriculum/               # STBB curriculum & SLO modules (Grades IX–XII)
├── data/                     # Initial baseline seed JSONs (teachers & timetable)
├── docs/                     # Architecture, offline sync & verified stack docs
├── hooks/                    # Shared React hooks
├── public/                   # Static assets, curriculum SLO JSONs, logos
├── scripts/                  # Unit suites, wiring/coverage audits & probes
├── services/                 # Domain services & adapters
│   ├── documentArchive/      # OCR extraction, matching, Firestore/local stores
│   ├── documentClient/       # Client upload, Drive import & archive API
│   ├── export/               # DOCX & PDF exporters
│   ├── gemini/               # Gemini client, key pool & active model chain
│   ├── marksheet/            # Marksheet parser, calculations, PDF & sync
│   ├── omr/                  # Geometry, homography, vision engine & marksheet bridge
│   ├── paper/                # Exam paper generation
│   ├── schoolConfig/         # Unified SchoolConfig store, defaults, class structure, timetable seed & propagation
│   ├── sheets/               # Google Sheets batch writer & error classifier
│   └── timetable*/           # Timetable conflict audit & Sheet sync
├── types/                    # TypeScript type definitions
├── utils/                    # Pure utilities (dateHelpers, userMessage, printHelper, etc.)
├── App.tsx                   # Root app & auth gate
├── firestore.rules           # Firestore security rules
└── server.ts                 # Local Express + Vite dev server
```
