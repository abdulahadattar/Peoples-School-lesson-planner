# Tech Stack & Environment Summary

## Frontend Framework & Runtime
- **React**: `v19.2.0` (Functional components, hooks, concurrency)
- **TypeScript**: `~5.8.2` (Strict type safety, zero `any` policy where practical)
- **Vite**: `v6.2.0` (Fast ESM dev server & optimized rollup production build)
- **Tailwind CSS**: `v4.3.3` (Modern `@import "tailwindcss";` setup in `index.css`)
- **Framer Motion (`motion/react`)**: `v13.3.0` (Animations, micro-interactions, layout transitions)

## State & Storage
- **IndexedDB (`idb-keyval`)**: `v6.2.1` (Offline-first client persistence for attendance, papers, timetable)
- **Firebase SDK**: `v12.18.0` (Firestore real-time sync, Firebase Auth session management)
- **Google Sheets API**: REST v4 endpoints with token bearer authorization

## AI & Document Processing
- **Google GenAI SDK (`@google/genai`)**: `v1.29.0` (Gemini 2.5/Flash model series with rotation)
- **KaTeX**: Fast mathematical formula rendering
- **PDF-Lib & Docx**: `pdf-lib` (v1.17.1), `docx` (v8.5.0), `file-saver` (v2.0.5) for export pipelines
- **Sharp & Archiver**: Server-side image manipulation and ZIP archive ingestion

## Backend & Testing
- **Server**: Express `v5.2.1` on Node.js / `tsx` (`v4.23.13`)
- **Autonoma SDK**: `@autonoma-ai/sdk` (v0.2.9) for test factory fixtures
- **Unit & Diagnostic Test Suites**: `npm run test:unit`, `npm run validate`
