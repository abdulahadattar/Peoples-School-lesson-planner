#!/usr/bin/env node
/**
 * Checks that every official documentation URL referenced by our docs still
 * resolves, so agent-facing links do not silently rot.
 *
 *   node scripts/check-doc-links.mjs
 *
 * Read-only: prints a report and sets a non-zero exit code when a link breaks.
 * Run it after editing docs/VERIFIED_STACK.md or any doc-link block in source.
 *
 * Note on npmjs.com: it returns HTTP 403 to automated clients (bot protection),
 * which is NOT the same as a dead link. We therefore check the npm registry API
 * (registry.npmjs.org) instead, which is machine-readable and stable.
 */
const URLS = [
  ['React 19 API reference', 'https://react.dev/reference/react'],
  ['React rules of hooks', 'https://react.dev/reference/rules/rules-of-hooks'],
  ['Vite guide', 'https://vite.dev/guide/'],
  ['Vite migration (v7->v8)', 'https://vite.dev/guide/migration'],
  ['Vite env vars', 'https://vite.dev/guide/env-and-mode'],
  ['vite-plugin-react', 'https://github.com/vitejs/vite-plugin-react'],
  ['Firebase web setup', 'https://firebase.google.com/docs/web/setup'],
  ['Firestore rules structure', 'https://firebase.google.com/docs/firestore/security/rules-structure'],
  ['Firebase Auth', 'https://firebase.google.com/docs/auth'],
  ['firebase-admin Node setup', 'https://firebase.google.com/docs/admin/setup'],
  ['Gemini models', 'https://ai.google.dev/gemini-api/docs/models'],
  ['Gemini quickstart', 'https://ai.google.dev/gemini-api/docs/quickstart'],
  ['Gemini deprecations', 'https://ai.google.dev/gemini-api/docs/deprecations'],
  ['Gemini rate limits', 'https://ai.google.dev/gemini-api/docs/rate-limits'],
  ['Gemini API errors', 'https://ai.google.dev/gemini-api/docs/api-errors'],
  ['Gemini structured output', 'https://ai.google.dev/gemini-api/docs/structured-output'],
  ['Gemini image understanding', 'https://ai.google.dev/gemini-api/docs/image-understanding'],
  ['js-genai repo', 'https://github.com/googleapis/js-genai'],
  ['js-genai v2.0.0 release notes', 'https://github.com/googleapis/js-genai/releases/tag/v2.0.0'],
  ['Gemini Interactions breaking changes', 'https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026'],
  ['js-genai registry entry', 'https://registry.npmjs.org/@google/genai'],
  ['Tailwind v4 upgrade guide', 'https://www.tailwindcss.com/docs/upgrade-guide'],
  ['Tailwind theme variables', 'https://www.tailwindcss.com/docs/theme'],
  ['Motion for React', 'https://motion.dev/docs/react-quick-start'],
  ['docx.js', 'https://docx.js.org/'],
  ['Recharts API (current)', 'https://recharts.github.io/en-US/api/'],
  ['Recharts guide', 'https://recharts.github.io/en-US/guide/'],
  ['Express 5 migration', 'https://expressjs.com/en/guide/migrating-5.html'],
  ['Vercel functions', 'https://vercel.com/docs/functions'],
  ['SheetJS docs', 'https://docs.sheetjs.com/'],
  ['SheetJS Node install (CDN)', 'https://docs.sheetjs.com/docs/getting-started/installation/nodejs/'],
  ['SheetJS registry entry (community/stale)', 'https://registry.npmjs.org/xlsx'],
  ['zod', 'https://zod.dev/'],
  ['pdf-lib', 'https://github.com/Hopding/pdf-lib'],
  ['sharp', 'https://sharp.pixelplumbing.com/'],
  ['TypeScript handbook', 'https://typescriptlang.org/docs/handbook/intro.html'],
  ['idb-keyval', 'https://github.com/jakearchibald/idb-keyval'],
  ['KaTeX docs', 'https://katex.org/docs/'],
  ['MathJax docs', 'https://docs.mathjax.org/en/latest/'],
  ['MDN CSS reference', 'https://developer.mozilla.org/en-US/docs/Web/CSS'],
  ['OWASP Top 10', 'https://owasp.org/www-project-top-ten/'],
  ['WCAG 2.2', 'https://www.w3.org/TR/WCAG22/'],
];

async function check(label, url) {
  let status;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000) });
    status = res.status;
  } catch (err) {
    status = `ERR ${err.message}`;
  }
  const ok = status >= 200 && status < 400;
  return { label, url, status, ok };
}

async function main() {
  // Probed concurrently so the whole sweep finishes in seconds rather than
  // paying the round-trip latency of ~40 sequential requests.
  const results = await Promise.all(URLS.map(([label, url]) => check(label, url)));
  let broken = 0;
  for (const { label, url, status, ok } of results) {
    if (!ok) broken++;
    console.log(`  ${ok ? 'OK   ' : 'BROKEN'} ${String(status).padEnd(5)} ${label} - ${url}`);
  }
  console.log(`\n${URLS.length - broken}/${URLS.length} documentation links resolve.`);
  if (broken) {
    console.log('Fix docs/VERIFIED_STACK.md and the doc-link comments in source.');
    process.exitCode = 1;
  }
}

main();