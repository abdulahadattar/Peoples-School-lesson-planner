# Lesson Planner - Peoples Higher Secondary School Jamshoro

An intelligent lesson plan and exam paper generator for teachers, aligned with the Sindh Textbook Board (STBB) curriculum from ECCE to Class XII.

> ### ⚠️ AI agents: read `AGENTS.md` before changing anything
>
> **Do not work on this codebase from memory.** Framework APIs, package
> versions, Gemini model ids and doc URLs here have all drifted from upstream —
> a confident answer from recall is likely to be wrong. Verify against the
> official docs and the live probes, and use the vetted skills in `skills/`.
>
> Start with [`AGENTS.md`](./AGENTS.md) (operating rules) and
> [`docs/VERIFIED_STACK.md`](./docs/VERIFIED_STACK.md) (installed versions, live
> model probe, official documentation index).

## Deployments

| Branch | URL | Environment |
|--------|-----|-------------|
| `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Testing only |
| `testing` | `https://phssjamshoroportalb.vercel.app` | Partial public access |
| `main` | `https://phssjamshoroportal.vercel.app` | Production for public |

## API Endpoints

- `/api/health` — Health check, returns `{"status":"ok"}`
- `/api/autonoma` — Autonoma SDK test data seeding (HMAC-SHA256 authenticated)
- `/pdf-proxy?path=<github-raw-path>` — Proxies GitHub raw content for PDF documents

## Features

- **General Lesson Planner** — Select any class, subject, and chapter to generate lesson plans
- **4As Template** — Lesson plans follow the Activity, Analysis, Abstraction, Application framework
- **Exam Paper Generator** — Create structured exam papers with MCQs, short, and long questions
- **Mobile-First Design** — Optimized for phones and tablets
- **PDF & DOCX Export** — Download lesson plans and papers in multiple formats
- **AI-Powered** — Uses Google Gemini for content generation
- **Autonoma SDK Integration** — Test data seeding via `/api/autonoma` endpoint

## Important Notes

- **Do not run automated batch scripts** to generate content for all chapters at once. The generation process must be done **manually, one by one**, verifying each step. Automated scripts can cause the app to freeze or hang indefinitely.
- **Priority**: Grades 10–12 are the current focus. Older Physics books (Class IX) are retained and not removed.
- Always check if generation is taking longer than expected. If it does, cancel and retry manually rather than letting it run unattended.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
    ```
    npm install
    ```
2. Create a `.env.local` file in the project root with your Gemini API key(s):
   - **Single key:** `VITE_API_KEY=your_gemini_api_key_here`
   - **Multiple keys for rotation:** `VITE_API_KEYS=key1,key2,key3,...,keyN`
3. Run the app:
    ```
    npm run dev
    ```

## Build

```
npm run build
```

## Testing

Run from the project root. On Windows PowerShell, set UTF-8 output first or the
Unicode ticks in the test output render as mojibake (see
[docs/ALPHA_STATUS.md](./docs/ALPHA_STATUS.md)).

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

| Command | Covers |
| --- | --- |
| `npm run lint` | `tsc --noEmit` across the whole project |
| `npm run test:unit` | Aggregate pure-logic suite (timetable, conflicts, roster, selectors, rendering) |
| `npm run test:unit:sheets` | Offline sheet-sync invariants — see [docs/OFFLINE_SYNC.md](./docs/OFFLINE_SYNC.md) |
| `npm run test:unit:local` | Local-first read/write behaviour |
| `npm run test:unit:roster` | Teacher roster resolution |
| `npm run test:unit:availability` | Teacher availability logic |
| `npm run test:unit:selectors` | Dropdown/select state |
| `npm run test:unit:rendering` | Rendering helpers |
| `npm run test:coverage` | Which exported symbols have no test (inventory, not line coverage) |
| `npm run test:rules` | `firestore.rules` simulation |
| `npm run test:keys` | Live Gemini key and model-chain probe |
| `npm run test:e2e` | Browser smoke suite (dev server must be running) |
| `npm run audit:wiring` | Code that exists but nothing calls — dead hooks and orphan features |
| `npm run validate` | lint + build + local suite |
| `npm test` | E2E: infra, SLO data, API keys, PDF validation, AI generation |

The unit suites run under plain Node via `tsx` — no browser, no network. Anything
that touches the Sheets or Gemini API injects a fake `fetch` instead.

## Deployment

All changes are pushed to GitHub and automatically deployed by Vercel's GitHub integration:

1. **`alpha` branch** → `https://phssjamshoroportalalpha.vercel.app` (testing)
2. **`testing` branch** → `https://phssjamshoroportalb.vercel.app` (partial public)
3. **`main` branch** → `https://phssjamshoroportal.vercel.app` (production)

**Do NOT deploy manually via Vercel CLI.** Simply push to the appropriate branch:
```bash
git push origin <branch>
```

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Google Gemini AI
- DOCX + PDF export
- Express (server-side API)
- Autonoma SDK (test data seeding)
