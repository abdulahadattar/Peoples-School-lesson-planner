# PHSSJ Portal — Peoples Higher Secondary School Jamshoro

School portal for lesson plans, exam papers, OMR scanning, daily attendance, student records, marksheets, live timetable monitoring, and student document management.

> **AI Agents:** Read `AGENTS.md`, `AGENT_MEMORY.md`, and `docs/VERIFIED_STACK.md` before editing. Verify versions and model IDs from source/probes rather than memory.

## Run Locally

```bash
npm install
# Configure .env.local from .env.example (VITE_API_KEY / VITE_API_KEYS, Firebase, etc.)
npm run dev
```

## Verification & Build

| Command | Purpose |
| :--- | :--- |
| `npm run lint` | TypeScript check (`tsc --noEmit`) |
| `npm run build` | Production Vite bundle |
| `npm run test:unit` | Pure-logic unit test suite |
| `npm run test:unit:sheets` | Offline sheet-sync invariants (`docs/OFFLINE_SYNC.md`) |
| `npm run audit:wiring` | Report unused exports / unreferenced modules |
| `npm run test:rules` | `firestore.rules` simulation |
| `npm run verify:docs` | Verify official documentation links |
| `npm run probe:models` | Probe active Gemini model chain |
| `npm run validate` | `lint` + `build` + `test:local` |

## Deployment

| Branch | URL | Environment |
| :--- | :--- | :--- |
| `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Testing |
| `testing` | `https://phssjamshoroportalb.vercel.app` | Partial public |
| `main` | `https://phssjamshoroportal.vercel.app` | Production |

Vercel deploys automatically on `git push origin <branch>`. Do not deploy manually via `vercel --prod`.
