# Verified Stack & Official Documentation

**Last verified: 2026-10-17** — Re-verify via probes before changing dependencies or model IDs:
- `npm run verify:docs` (asserts official doc URLs resolve)
- `npm run probe:models` (tests live Gemini model IDs)
- `npm run test:keys` (key pool & chain health)

## 1. Installed Versions (Lockfile)
Always verify resolved versions from `package-lock.json` rather than `package.json` `^` ranges.

| Package | Installed | Range | Notes |
| :--- | :--- | :--- | :--- |
| `react` / `react-dom` | `19.3.0` | `^19.2.0` | React 19 |
| `vite` / `@vitejs/plugin-react` | `6.4.3` / `5.2.0` | `^6.2.0` / `^5.0.0` | ESM bundler |
| `tailwindcss` + `@tailwindcss/vite` | `4.3.3` | `^4.3.3` | v4 CSS-first config (`index.css`) |
| `typescript` | `5.8.3` | `~5.8.2` | Pinned `~5.8.x` |
| `firebase` / `firebase-admin` | `12.19.0` / `14.5.0` | `^12.18.0` / `^14.5.0` | `firebase-admin` dynamically imported for serverless archive |
| `@google/genai` | `1.52.0` | `^1.29.0` | Uses `generateContent` in `services/geminiService.ts` |
| `motion` / `lucide-react` / `recharts` | `13.4.2` / `1.47.0` / `3.10.1` | `^13.3` / `^1.43` / `^3.10.1` | Recharts v3 docs are at `recharts.github.io` |
| `express` / `zod` | `5.2.1` / `4.6.5` | `^5.2.1` / `^4.6.5` | Express 5 (`*all` fallback in `api/index.ts`) |
| `docx` / `pdf-lib` / `sharp` / `idb-keyval` | `8.5.0` / `1.17.1` / `0.35.4` / `6.3.0` | matching | Export, PDF, image & IndexedDB layers |
| `xlsx` | `0.18.5` | `^0.18.5` | Frozen on npm; `0.20.3` lives on `cdn.sheetjs.com` |

## 2. Gemini Model Chain (Probed 2026-10-17)
Authoritative chain lives in `services/gemini/types.ts` (`MODEL_CHAIN`) and `scripts/lib/gemini-keys.mjs` (`APP_MODEL_CHAIN`).

- **Working (200 OK)**: `gemini-3.5-flash-lite` (primary), `gemma-4-26b-a4b-it`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-flash-lite-latest`.
- **Dead / Broken (DO NOT USE)**: `gemini-2.5-flash` (404), `gemini-2.5-flash-lite` (404), `gemini-3.1-flash-lite-preview` (shut down), `gemma-4-31b-it` (500 / hang), `gemma-4-26b-it` (404).
- **Rules**: Remove permanent 404 model IDs; keep transient 503s behind fallback rotation.

## 3. Official Documentation Index (Checked by `npm run verify:docs`)
- **Core & Build**: [React 19](https://react.dev/reference/react) · [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks) · [TypeScript](https://typescriptlang.org/docs/handbook/intro.html) · [Vite](https://vite.dev/guide/) · [Tailwind v4](https://www.tailwindcss.com/docs/theme) · [Motion](https://motion.dev/docs/react-quick-start)
- **Gemini**: [Models](https://ai.google.dev/gemini-api/docs/models) · [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) · [Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [API Errors](https://ai.google.dev/gemini-api/docs/api-errors) · [Structured Output](https://ai.google.dev/gemini-api/docs/structured-output) · [Image Input](https://ai.google.dev/gemini-api/docs/image-understanding) · [js-genai](https://github.com/googleapis/js-genai)
- **Firebase & Server**: [Firebase Web](https://firebase.google.com/docs/web/setup) · [Auth](https://firebase.google.com/docs/auth) · [Firestore Rules](https://firebase.google.com/docs/firestore/security/rules-structure) · [Admin SDK](https://firebase.google.com/docs/admin/setup) · [Express 5](https://expressjs.com/en/guide/migrating-5.html) · [Vercel Functions](https://vercel.com/docs/functions)
- **Data & Rendering**: [docx.js](https://docx.js.org/) · [Recharts v3](https://recharts.github.io/en-US/api/) · [SheetJS](https://docs.sheetjs.com/) · [zod](https://zod.dev/) · [pdf-lib](https://github.com/Hopding/pdf-lib) · [sharp](https://sharp.pixelplumbing.com/) · [idb-keyval](https://github.com/jakearchibald/idb-keyval) · [KaTeX](https://katex.org/docs/) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
