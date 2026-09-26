# Architecture & Directory Structure Guide

This document defines the standard structure, naming conventions, and subsystem boundaries for the **Peoples Higher Secondary School Jamshoro Portal** codebase (`alpha` worktree).

---

## 1. Directory Structure Standard

```
.kilo/worktrees/alpha/
├── api/                     # Production Vercel Serverless Function entry points
│   └── index.ts             # Express handler served by Vercel
│
├── components/              # Modular UI Components organized by domain
│   ├── attendance/          # Daily Attendance & Enrollment dialogs
│   ├── auth/                # Login screens and Google authentication overlays
│   ├── documents/           # Student Document Archive & OCR transparency views
│   ├── icons/               # SVG / Lucide icon wrappers
│   ├── live/                # Timetable live monitor cards & headers
│   ├── records/             # Student records, dossiers, and document tabs
│   ├── settings/            # School configuration, timetable slots, periods
│   ├── ui/                  # Reusable atomic UI elements (buttons, badges)
│   ├── BreakDutiesPanel.tsx # Teacher break/recess duty scheduling panel
│   ├── DocumentArchiveCenterView.tsx # Main student OCR & document hub
│   ├── GenerationStatusPanel.tsx     # AI lesson planner & exam status bar
│   ├── Header.tsx           # Global navigation and user status header
│   ├── HistoryView.tsx      # Past generated lesson plans and papers
│   ├── HomeView.tsx         # Dashboard landing view
│   ├── KaTeXText.tsx        # LaTeX equation rendering component
│   ├── LiveMonitor.tsx      # Active timetable and classroom monitor
│   ├── Logo.tsx             # School crest and branding component
│   ├── PaperPanel.tsx       # Exam paper configuration & generation panel
│   ├── QuestionEditor.tsx   # Fine-grained question and marks editor
│   ├── ResultsView.tsx      # Lesson plan & paper preview with export
│   ├── SubjectSelector.tsx  # STBB class, subject, and chapter selector
│   └── SubstitutionManager.tsx # Daily teacher substitution dispatcher
│
├── curriculum/              # Sindh Textbook Board (STBB) Curricular Content
│   ├── subjects/            # Subject chapters, SLOs, and metadata
│   └── index.ts             # Curriculum registry and lookup helpers
│
├── docs/                    # Technical documentation & architecture specs
│   ├── ARCHITECTURE.md      # Structure and naming standards (this file)
│   └── SYSTEM_MAP.md        # Topology, deployment, and Google MCP plans
│
├── hooks/                   # Custom React stateful hooks
│   ├── useGeneralGeneration.ts # Gemini generation orchestration
│   ├── useSchoolConfig.ts   # Firestore-backed school config listener
│   └── useSelection.ts      # Class, subject, chapter select state
│
├── services/                # Backend & Frontend Business Logic Services
│   ├── adminService.ts      # Role-based admin checks
│   ├── app.ts               # Local dev Express server factory
│   ├── attendanceService.ts # Daily student attendance Firestore & cache
│   ├── autonomaIntegration.ts # E2E Autonoma seed integration
│   ├── breakDuties.ts       # Teacher recess duty rotation logic
│   ├── curriculumHelpers.ts # Filtering and traversing STBB subjects
│   ├── documentArchiveService.ts # Gemini OCR engine (Urdu/Sindhi/B-Form)
│   ├── documentClientService.ts  # Client upload chunks & job poller
│   ├── exportService.ts     # DOCX and PDF export compilation
│   ├── firebase.ts          # Firebase SDK client initialization
│   ├── geminiService.ts     # Gemini API client with rotation & fallbacks
│   ├── googleAuth.ts        # Google Sign-in & OAuth access token manager
│   ├── googleSheetsService.ts # Google Sheets proxy & data sync
│   ├── paperService.ts      # Exam paper question assembly & balancing
│   ├── schoolConfigService.ts # Class schedule, bell timing, sections
│   ├── sloData.ts           # Student Learning Objectives dictionary
│   ├── storageService.ts    # IndexedDB & local fallback storage
│   ├── substitutionService.ts # Absent teacher substitution resolver
│   ├── teacherRoster.ts     # Teacher roster list and assignments
│   ├── timetable.ts         # Master weekly timetable definitions
│   └── timetableConflictEngine.ts # Timetable overlap detector
│

---

## 2. Naming Conventions

| Category | Convention | Examples |
| :--- | :--- | :--- |
| **React Components** | PascalCase `.tsx` | `DailyAttendanceView.tsx`, `Header.tsx` |
| **Component Sub-folders** | lowercase kebab/domain | `components/attendance/`, `components/live/` |
| **Custom Hooks** | camelCase prefixed with `use` `.ts` | `useSchoolConfig.ts`, `useSelection.ts` |
| **Service Modules** | camelCase `.ts` ending in `Service` or domain | `geminiService.ts`, `attendanceService.ts` |
| **Utility Modules** | camelCase `.ts` ending in `Helper` or noun | `printHelper.ts`, `payloadOptimizer.ts` |
| **TypeScript Types** | camelCase `.ts` under `types/` or `types.ts` | `types/documentArchive.ts`, `types/index.ts` |
| **Backend Endpoints** | lowercase kebab-case REST routes | `/api/documents/create-job`, `/api/health` |

├── types/                   # TypeScript interfaces & types
│   ├── documentArchive.ts   # Dossier, document job, OCR result types
│   └── index.ts             # Unified barrel re-exporting root types
│
├── utils/                   # Shared utility helpers
│   ├── payloadOptimizer.ts  # AI context payload compression
│   └── printHelper.ts       # Print styling and printer execution
│
├── firestore.rules          # Firestore database security rules
├── server.ts                # Local development server entrypoint (`npm run dev`)
└── vite.config.ts           # Vite bundler configuration
```
