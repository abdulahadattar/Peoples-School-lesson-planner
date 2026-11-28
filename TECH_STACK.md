# Tech Stack Summary

- **Frontend**: React 19, TypeScript (~5.8), Vite 6, Tailwind CSS v4 (`@import "tailwindcss";` in `index.css`), Motion (`motion/react`), Lucide icons, Recharts 3, KaTeX.
- **Backend & Hosting**: Express 5 (`server.ts` / `services/app.ts` locally, `api/index.ts` on Vercel), `tsx`, `@autonoma-ai/sdk`.
- **Storage & Auth**: Firebase SDK v12 (Auth + Firestore), `firebase-admin` v14 (serverless document store), `idb-keyval` (IndexedDB), Google Sheets REST API v4.
- **AI, Documents & OMR**: `@google/genai` (active chain in `services/gemini/types.ts`), `pdf-lib`, `docx`, `xlsx`, `sharp`, `adm-zip`, `archiver`, `qrcode`, `jsqr`, `zod`.

See `docs/VERIFIED_STACK.md` for exact lockfile versions and live model probes.
