# Project Skills (`skills/`)

These are **agent skills** — markdown instruction files that an AI coding
assistant loads when a task matches their description. They are plain text;
nothing here runs on its own.

## Layout

| Path | Purpose |
| --- | --- |
| `skills/<name>/SKILL.md` | Canonical, IDE-agnostic copy. Read by any agent that reads `AGENTS.md`, and usable by tools that scan a `skills/` directory. |
| `.cursor/skills/<name>/SKILL.md` | Identical copy for Cursor. |

Both copies are kept in sync manually. If you change one, change the other.

> These are **not** the same as the pre-existing `.cursor/skills/` set from
> `addyosmani/agent-skills` (spec-driven-development, test-driven-development,
> code-review-and-quality, …). Those live alongside these in `.cursor/skills/`
> and are untouched.

## Installed skills

| Skill | Use it when |
| --- | --- |
| `e2e-testing` | Running/writing Playwright end-to-end suites, visual regression, CI wiring. |
| `e2e-testing-patterns` | Designing an E2E suite that stays fast and non-flaky. |
| `code-showcase-testing-patterns` | Jest/Vitest unit-test patterns, factories, mocking, TDD workflow. |
| `code-showcase-react-ui-patterns` | React loading/error states, async data, component patterns. |
| `browser-automation` | Driving a real browser with observed UI state and semantic locators. |
| `fixing-accessibility` | ARIA labels, keyboard nav, focus management, colour contrast. |
| `accessibility-compliance-accessibility-audit` | Running a structured WCAG audit. |
| `fixing-motion-performance` | `motion/react` / animation performance (layout thrash, blur, scroll-linked). |
| `frontend-security-coder` | XSS prevention, output sanitisation, client-side security review. |
| `code-review-excellence` | Structured, constructive code review. |
| `firebase` | Auth / Firestore work — this app uses Firebase for student records and attendance. |

## Why this app needs them

The stack is React 19 + TypeScript + Vite + Tailwind v4 + `motion/react`,
with Firebase auth/Firestore, a Gemini AI generation pipeline, and DOCX/PDF
exports. These skills cover the areas that are hardest to get right by eye:
E2E reliability, accessibility, animation cost, and client-side XSS (the app
renders model-generated HTML/Markdown).

## Provenance and vetting

- **Source:** <https://github.com/sickn33/agentic-awesome-skills> (`skills/` directory), fetched 2026-09-30.
- **Vetted before adding.** Every file was scanned for network exfiltration
  (`curl`/`wget`), destructive commands (`rm -rf`), obfuscation (`base64 -d`,
  `eval`, `EncodedCommand`), credential access (`.ssh`, `.aws`, `id_rsa`),
  and prompt-injection phrasing ("ignore previous instructions", "override the
  system prompt"). **No hits.** The only matches were defensive checklist items
  in the security/review playbooks (e.g. "Are API keys properly secured?").
- `docx-official` was **deliberately excluded**: it is © 2025 Anthropic, PBC,
  All rights reserved, so it is not safe to vendor into this repository. If you
  have a Claude agreement you can fetch it yourself into `skills/docx-official/`.
- 950 KB of OOXML XSD schemas and ~150 KB of Python from that skill were skipped
  for the same skill; this app uses the `docx` npm library, not raw OOXML.

⚠️ **Before publishing this repository, verify the upstream licence of each
skill.** They are redistributed from a third-party project and may carry
per-skill terms (MIT, Apache-2.0, or proprietary). Nothing here was copied from
your application source code.
