/**
 * mathDetection.ts — the single source of truth for "is this math?" across
 * every renderer: the web KaTeX preview (KaTeXText), the DOCX/PDF exporters
 * (MathJax via equationRenderer), the AI-output sanitizer (latexSanitizer)
 * and the paper layout rules (paperLayout).
 *
 * Two pieces of knowledge live ONLY here:
 *   1. MATH_REGEX — how $...$ / $$...$$ delimited regions are scanned.
 *   2. isFormulaText — whether a delimited fragment is genuine math or prose
 *      that a model wrongly wrapped in delimiters.
 *
 * Previously each surface kept its own copy of the regex (and some skipped the
 * prose gate), which is exactly how "equations render on the web but not in
 * Word/PDF" and oversized-math bugs slipped in. Import from here everywhere.
 */

/** Balanced $...$ (inline) and $$...$$ (display) LaTeX regions. */
export const MATH_REGEX = /(\$\$[\s\S]*?\$\$|\$(?!\s)(?:[^$\\]|\\.)+?\$)/g;

/** LaTeX command names that unambiguously signal real math (not prose). */
export const LATEX_COMMANDS =
  'alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|' +
  'Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|' +
  'frac|dfrac|tfrac|cfrac|binom|overline|underline|sqrt|times|div|cdot|left|right|big|Big|bigg|Bigg|' +
  'sum|int|prod|oint|approx|sim|cong|rightarrow|leftarrow|Leftarrow|Rightarrow|leftrightarrow|Leftrightarrow|' +
  'neq|leq|geq|pm|mp|partial|infty|vec|bar|hat|dot|ddot|ldots|cdots|vdots|ddots|' +
  'mathrm|text|textbf|textit|log|ln|sin|cos|tan|cot|sec|csc|exp|lim|max|min|mod|' +
  'displaystyle|textstyle|qquad|quad|textsuperscript';

/** Math symbols that make a fragment "real math". */
const MATHY_SYMBOLS = /[√∑∫∏πρσαβγδθλμτωΩΔ±×÷≥≤≠≈∞→←]/;

/**
 * Decide whether a $...$-delimited fragment is genuine math or prose that a
 * model wrongly wrapped in delimiters. Conservative: whenever in doubt the
 * fragment is kept as math (rendering math as math is always safe).
 */
export function isFormulaText(fragment: string): boolean {
  if (!fragment) return false;
  const t = fragment.trim();
  if (t.length === 0) return false;
  // Whole prose sentences are never sent to a math renderer
  if (t.length > 160) return false;
  // A real LaTeX command (backslash + letters). A bare "\ " escape-space or a
  // trailing backslash is NOT math — it is usually an italic name or emphasis.
  if (/\\(?:[A-Za-z]{2,}|[{}\^_])/.test(t)) return true; // LaTeX command present
  if (/[{}\^_]/.test(t)) return true;     // sub/superscript or groups
  if (MATHY_SYMBOLS.test(t)) return true; // math operators/greek
  // A fragment with operators but no real words ("F = ma", "PV = nRT",
  // "x + y", "3/4") is formula-like. English words (≥3 lower letters)
  // veto it, so a sentence like "Water = 2 hydrogen + 1 oxygen" stays prose.
  if (/[=+\-*/]/.test(t) && !/[a-z]{3,}/.test(t)) return true;
  return false;
}

/** Split text into plain-text / math segments. Math keeps its delimiters. */
export interface MathSegment {
  text: string;
  math: string;
  display: boolean;
}

/**
 * Walk text with MATH_REGEX, yielding alternating plain-text and math chunks.
 * A delimited fragment that fails the formula gate is returned as plain text
 * (delimiters stripped), matching what the exporters do.
 */
export function splitMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let last = 0;
  MATH_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_REGEX.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), math: '', display: false });
    const token = m[0];
    const display = token.startsWith('$$');
    const inner = display ? token.slice(2, -2).trim() : token.slice(1, -1).trim();
    if (!isFormulaText(inner) && /[A-Za-z]/.test(inner)) {
      // Prose wrongly wrapped in delimiters — keep the words as plain text
      segments.push({ text: inner, math: '', display: false });
    } else {
      segments.push({ text: '', math: inner, display });
    }
    last = m.index + token.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), math: '', display: false });
  return segments;
}