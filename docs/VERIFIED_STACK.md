# Verified Stack & Official Documentation

**Last verified: 2026-10-02** (re-verify with the commands in section 2 before trusting anything here)

This file is the single source of truth for "what is actually installed, what is
currently supported upstream, and where the authoritative docs live". It exists
because several model names, package versions and doc URLs in this repo have
drifted from reality. Everything below was checked against a live source, not
recalled. **Do not edit it from memory** — update it from a probe run.

---

## 1. Read this before touching a dependency

- Never trust `package.json` `^` ranges to tell you what is installed. Read the
  resolved version from `package-lock.json`.
- Never trust a model id or an API surface from memory. Google, Vite and the
  npm ecosystem all retire things on a schedule that is published, not guessed.
- When you change a dependency or a model name, update the table below in the
  same commit, and run `npm run verify:docs` + `npm run probe:models`.

---

## 2. How this file is verified

| Command | What it proves |
| :--- | :--- |
| `npm run verify:docs` | All official documentation URLs in this file still resolve (HTTP 2xx). |
| `npm run probe:models` | Each Gemini model id really answers `generateContent`, with measured latency. |
| `npm run test:keys` | Which API keys are alive/dead and whether the app chain still resolves. |

All three are read-only and safe to run. Never edit a model id because a doc
page said so — run `npm run probe:models` and use its output.

---

## 3. Installed vs latest (npm registry, checked 2026-10-02)

| Package | Installed (lockfile) | `package.json` range | Registry latest | Notes |
| :--- | :--- | :--- | :--- | :--- |
| react / react-dom | **19.3.0** | `^19.2.0` | 19.3.0 | Current. |
| vite | **6.4.3** | `^6.2.0` | **8.3.2** | Two majors behind. v8 replaces esbuild+Rollup with Rolldown/Oxc. |
| @vitejs/plugin-react | **5.2.0** | `^5.0.0` | 5.2.0 | Current for Vite 6/7. |
| tailwindcss + @tailwindcss/vite | **4.3.3** | `^4.3.3` | 4.3.3 | Current; already on v4 CSS-first config. |
| firebase | **12.19.0** | `^12.18.0` | 12.19.0 | Current. |
| @google/genai | **1.52.0** | `^1.29.0` | **2.26.0** | Lockfile already resolved to 1.x; v2 is a major rewrite. Read the v2 migration guide before bumping. |
| motion | **13.4.2** | `^13.3.0` | 13.5.0 | Near current. |
| docx | **8.5.0** | `^8.5.0` | **9.8.1** | One major behind; v9 split shapes/watermarks/charts into subpath exports. |
| recharts | **3.10.1** | `^3.10.1` | 3.10.1 | Current. |
| xlsx (SheetJS) | **0.18.5** | `^0.18.5` | 0.18.5 | **npm copy is stale.** SheetJS publishes newer builds on their own CDN — see docs.sheetjs.com. |
| express | **5.2.1** | `^5.2.1` | 5.2.1 | On v5; v4 breaking changes already handled in `api/index.ts`. |
| typescript | **5.8.3** | `~5.8.2` | **7.0.2** | Two majors behind. The `~` pin is deliberate; do not bump casually. |
| zod | **4.6.5** | `^4.6.5` | 4.6.5 | Current. |
| pdf-lib | **1.17.1** | `^1.17.1` | 1.17.1 | Effectively frozen upstream. |
| sharp | **0.35.4** | `^0.35.4` | 0.3x line | Native addon; used server-side for image work. |
| firebase-admin | **14.5.0** | `^14.5.0` | 14.5.0 | Current. |
| lucide-react | **1.47.0** | `^1.43.0` | 1.4x line | Icon set. |
| idb-keyval | **6.3.0** | `^6.2.1` | 6.3.0 | IndexedDB wrapper for offline sync. |

**Upgrading rule:** a version gap is not a bug report. Only upgrade when a
feature or a security fix requires it, run `npm run validate` plus the affected
`test:*` suites, and update this table in the same commit.

---

## 4. Gemini model chain — live probe results (2026-10-02)

Official docs: <https://ai.google.dev/gemini-api/docs/models> ·
<https://ai.google.dev/gemini-api/docs/deprecations>

The account currently advertises **44** `generateContent` models. Measured
against our live keys with `npm run probe:models`:

| Model id | Result | Latency | Verdict |
| :--- | :--- | :--- | :--- |
| `gemini-3.5-flash-lite` | 200 OK | 0.6s | **Chain position 1. Fastest, keep first.** |
| `gemma-4-26b-a4b-it` | **no response** | >60s, aborted | **Chain position 2 — HANGS.** See defect below. |
| `gemini-3.1-flash-lite` | 200 OK | 1.5s | Good second choice. |
| `gemini-3.5-flash` | 200 OK | 18.5s | Slow; last resort only. |
| `gemini-flash-latest` | 200 OK | 6.2s | Moving alias; acceptable fallback. |
| `gemini-2.5-flash` | **HTTP 404** | — | "no longer available to new users". Must stay out of the chain. |
| `gemini-3.6-flash` | 200 OK | 1.6s | Viable upgrade candidate. |
| `gemini-3.7-flash` | 200 OK | 22.8s | Works but slow. |
| `gemini-3.8-flash` | HTTP 503 | 1.1s | "high demand" — transient, not dead. |

### Two real defects found while verifying this

1. **`gemma-4-26b-a4b-it` sits at position 2 of `MODEL_CHAIN` but never
   responds.** Any request that falls past position 1 stalls for the full
   timeout instead of moving on. It *is* advertised in `ListModels`, which is
   exactly why "does the model appear in the list" is not a sufficient test.
2. **`scripts/lib/gemini-keys.mjs` `APP_MODEL_CHAIN` has drifted from the real
   chain.** It lists 3 models including the dead `gemini-2.5-flash`, and never
   tests `gemma-4-26b-a4b-it`, `gemini-3.5-flash` or `gemini-flash-latest`.
   `npm run test:keys` therefore reports "2/3 models answer" about a chain that
   is actually a different set of five.

### Model naming rules (from the official docs)

- `gemini-3.6-flash` style = **stable** pin. Use this in production.
- `gemini-3.1-flash-lite-preview` = **preview**; deprecation notice is given.
- `gemini-flash-latest` = **latest alias**, hot-swapped on each release with a
  2-week breaking-change notice. Fine as a fallback, risky as a primary.
- A 404 "no longer available to new users" is **permanent** for new projects —
  remove the id, do not retry it.
- A 503 "high demand" is **transient** — keep the id and let the fallback handle it.

---

## 5. Official documentation index

Every URL below is asserted live by `npm run verify:docs`.

### Core framework
| Topic | URL |
| :--- | :--- |
| React 19 API reference | <https://react.dev/reference/react> |
| React rules of hooks | <https://react.dev/reference/rules/rules-of-hooks> |
| TypeScript handbook | <https://typescriptlang.org/docs/handbook/intro.html> |

### Build & dev server
| Topic | URL |
| :--- | :--- |
| Vite guide | <https://vite.dev/guide/> |
| Vite migration (v7 → v8) | <https://vite.dev/guide/migration> |
| Vite env vars & modes | <https://vite.dev/guide/env-and-mode> |
| vite-plugin-react | <https://github.com/vitejs/vite-plugin-react> |

### Styling & animation
| Topic | URL |
| :--- | :--- |
| Tailwind v3 → v4 upgrade guide | <https://www.tailwindcss.com/docs/upgrade-guide> |
| Tailwind theme variables | <https://www.tailwindcss.com/docs/theme> |
| Motion for React | <https://motion.dev/docs/react-quick-start> |

### AI / Gemini
| Topic | URL |
| :--- | :--- |
| **Models (read this before changing a model id)** | <https://ai.google.dev/gemini-api/docs/models> |
| **Deprecations & shutdown dates** | <https://ai.google.dev/gemini-api/docs/deprecations> |
| Quickstart | <https://ai.google.dev/gemini-api/docs/quickstart> |
| Rate limits | <https://ai.google.dev/gemini-api/docs/rate-limits> |
| API errors | <https://ai.google.dev/gemini-api/docs/api-errors> |
| Structured output (`responseSchema`) | <https://ai.google.dev/gemini-api/docs/structured-output> |
| Image / document input | <https://ai.google.dev/gemini-api/docs/image-understanding> |
| js-genai source | <https://github.com/googleapis/js-genai> |

### Firebase
| Topic | URL |
| :--- | :--- |
| Web app setup | <https://firebase.google.com/docs/web/setup> |
| Auth | <https://firebase.google.com/docs/auth> |
| Security rules structure | <https://firebase.google.com/docs/firestore/security/rules-structure> |
| Admin SDK (Node) | <https://firebase.google.com/docs/admin/setup> |

### Server & deployment
| Topic | URL |
| :--- | :--- |
| Express 4 → 5 migration | <https://expressjs.com/en/guide/migrating-5.html> |
| Vercel functions | <https://vercel.com/docs/functions> |

### Export / documents / data
| Topic | URL |
| :--- | :--- |
| docx.js | <https://docx.js.org/> |
| Recharts API (v3, current host) | <https://recharts.github.io/en-US/api/> |
| Recharts guide | <https://recharts.github.io/en-US/guide/> |
| SheetJS docs (newer than npm `xlsx`) | <https://docs.sheetjs.com/> |
| zod | <https://zod.dev/> |
| pdf-lib | <https://github.com/Hopding/pdf-lib> |
| sharp | <https://sharp.pixelplumbing.com/> |
| idb-keyval | <https://github.com/jakearchibald/idb-keyval> |

### Rendering, security, accessibility
| Topic | URL |
| :--- | :--- |
| KaTeX | <https://katex.org/docs/> |
| MathJax | <https://docs.mathjax.org/en/latest/> |
| MDN CSS reference | <https://developer.mozilla.org/en-US/docs/Web/CSS> |
| OWASP Top 10 | <https://owasp.org/www-project-top-ten/> |
| WCAG 2.2 | <https://www.w3.org/TR/WCAG22/> |

<!-- SECTION-6-AND-ONWARD -->