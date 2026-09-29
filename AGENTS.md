# Agent Skills — CodeBuff FreeBuff

This workspace uses addyosmani/agent-skills. Skills are in `.cursor/skills/`.

## Key Skills
- spec-driven-development — Write PRD before code
- test-driven-development — TDD loop
- code-review-and-quality — Five-axis review
- debugging-and-error-recovery — Five-step triage
- security-and-hardening — OWASP Top 10
- git-workflow-and-versioning — Trunk-based commits

## Project Skills (IDE-agnostic)

A curated, vetted set of agent skills lives in `skills/` (canonical) and is
mirrored into `.cursor/skills/` for Cursor. See `skills/README.md` for the full
list, provenance, and the security vetting that was performed.

Stack-specific skills most relevant to this app (React 19 + TS + Vite +
Tailwind v4 + `motion/react` + Firebase + Gemini AI + DOCX/PDF export):
- `e2e-testing`, `e2e-testing-patterns` — Playwright end-to-end suites
- `code-showcase-testing-patterns` — unit-test patterns
- `browser-automation` — driving a real browser
- `code-showcase-react-ui-patterns` — React async/loading/error UI
- `fixing-accessibility`, `accessibility-compliance-accessibility-audit` — a11y
- `fixing-motion-performance` — `motion/react` animation cost
- `frontend-security-coder` — XSS / sanitisation (model output is rendered)
- `firebase` — auth + Firestore
- `code-review-excellence` — review workflow

## Testing

- `npm test` — unit tests + integration + Gemini key/model probe
- `npm run test:unit` — pure-logic unit tests only (no network, no browser)
- `npm run test:e2e` — browser smoke suite (dev server must be running)
- `node scripts/gemini-probe.mjs` — verify Gemini keys and that the
  hardcoded MODEL_CHAIN names really exist before trusting any AI test result

## Rules
- Load skill when task matches its description
- Follow skill workflow strictly
- Never skip verification steps
- Never hardcode or commit API keys. `.env*` is git-ignored.
- Do not change the Gemini model names in `services/geminiService.ts` without
  first verifying them with `scripts/gemini-probe.mjs` against the live API.
